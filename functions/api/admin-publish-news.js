const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sotter-sondhane-news.pages.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export async function onRequest({ request, env }) {
  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "শুধু POST অনুরোধ গ্রহণযোগ্য।" }, 405);

  try {
    const url = env.SUPABASE_URL;
    const secret = env.SUPABASE_SERVICE_ROLE_KEY;
    const anon = request.headers.get("apikey") || env.SUPABASE_ANON_KEY;
    if (!url || !secret || !anon) return reply({ error: "Cloudflare-এর Supabase ভেরিয়েবল পাওয়া যায়নি।" }, 500);

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "অ্যাডমিন লগইন করুন।" }, 401);

    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: authorization }
    });
    if (!userRes.ok) return reply({ error: "লগইন যাচাই করা যায়নি।" }, 401);
    const user = await userRes.json();

    const adminRes = await fetch(
      `${url}/rest/v1/portal_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      { headers: { apikey: secret } }
    );
    if (!adminRes.ok) return reply({ error: "অ্যাডমিন যাচাই করা যায়নি।" }, 500);
    if (!(await adminRes.json()).length) return reply({ error: "শুধু অ্যাডমিন এই কাজ করতে পারবেন।" }, 403);

    const input = await request.json();
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const author = typeof input.author === "string" ? input.author.trim() : "";
    const phone = typeof input.phone === "string" ? input.phone.trim().slice(0, 30) : "";
    let image_url = typeof input.image_url === "string" ? input.image_url.trim().slice(0, 500) : "";
    const imageBase64 = typeof input.image_base64 === "string" ? input.image_base64 : "";
    const imageType = typeof input.image_type === "string" ? input.image_type : "";
    let uploadedImagePath = "";
    const video_url = typeof input.video_url === "string" ? input.video_url.trim().slice(0, 500) : "";

    if (title.length < 5 || title.length > 180 || body.length < 20 || body.length > 12000 || author.length < 2 || author.length > 80) {
      return reply({ error: "শিরোনাম ৫–১৮০ অক্ষর, বিস্তারিত ২০–১২০০০ অক্ষর এবং প্রতিবেদকের নাম ২–৮০ অক্ষরের মধ্যে দিন।" }, 400);
    }
    if (image_url && !/^https:\/\//i.test(image_url)) return reply({ error: "ছবির লিংক https:// দিয়ে শুরু হতে হবে।" }, 400);

    if (video_url) {
      let videoId = "";
      try {
        const video = new URL(video_url);
        const host = video.hostname.replace(/^www\./, "").toLowerCase();
        if (host === "youtu.be") videoId = video.pathname.split("/").filter(Boolean)[0] || "";
        else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
          if (video.pathname === "/watch") videoId = video.searchParams.get("v") || "";
          else if (/^\/(embed|shorts)\//.test(video.pathname)) videoId = video.pathname.split("/")[2] || "";
        }
      } catch {}
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        return reply({ error: "সঠিক YouTube ভিডিও লিংক দিন।" }, 400);
      }
    }


    if (imageBase64 || imageType) {
      const imageTypes = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif"
      };
      if (!imageTypes[imageType] || imageBase64.length > 7_000_000) {
        return reply({ error: "ছবির ধরন সঠিক নয় অথবা ছবিটি ৫ MB-এর বেশি।" }, 400);
      }
      let binary;
      try {
        binary = Uint8Array.from(atob(imageBase64), ch => ch.charCodeAt(0));
      } catch {
        return reply({ error: "ছবির তথ্য পড়া যায়নি। আবার ছবি নির্বাচন করুন।" }, 400);
      }
      if (!binary.length || binary.length > 5 * 1024 * 1024) {
        return reply({ error: "ছবির আকার ৫ MB-এর বেশি।" }, 400);
      }
      uploadedImagePath = "admin-news/" + crypto.randomUUID() + "." + imageTypes[imageType];
      const storageResponse = await fetch(
        `${url}/storage/v1/object/news-images/${uploadedImagePath}`,
        {
          method: "POST",
          headers: {
            apikey: secret,
            Authorization: `Bearer ${secret}`,
            "Content-Type": imageType,
            "x-upsert": "false"
          },
          body: binary
        }
      );
      if (!storageResponse.ok) {
        const detail = await storageResponse.text();
        return reply({ error: "ছবি আপলোড হয়নি: " + detail.slice(0, 350) }, 400);
      }
      image_url = `${url}/storage/v1/object/public/news-images/${uploadedImagePath}`;
    }

    const insertRes = await fetch(`${url}/rest/v1/news`, {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ title, body, author, phone, image_url, video_url, status: "approved" })
    });
    if (!insertRes.ok) {
      const detail = await insertRes.text();
      if (uploadedImagePath) {
        await fetch(`${url}/storage/v1/object/news-images/${uploadedImagePath}`, {
          method: "DELETE",
          headers: { apikey: secret, Authorization: `Bearer ${secret}` }
        });
      }
      return reply({ error: "নিউজ প্রকাশ করা যায়নি: " + detail.slice(0, 500) }, 400);
    }
    const rows = await insertRes.json();
    return reply({ ok: true, message: "নিউজ সরাসরি প্রকাশিত হয়েছে।", news: rows[0] || null });
  } catch (error) {
    return reply({ error: error.message || "অজানা সমস্যা হয়েছে।" }, 500);
  }
}
