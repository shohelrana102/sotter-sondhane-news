
const allowedOrigins = [
  "https://shotter-sondhane-news.pages.dev",
  "https://sotter-sondhane-news.pages.dev"
];

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const requestOrigin = new URL(request.url).origin;
  const originAllowed = !origin || origin === requestOrigin || allowedOrigins.includes(origin);
  const responseOrigin = origin && originAllowed ? origin : requestOrigin;

  const corsHeaders = {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return reply({ error: "শুধু POST অনুরোধ গ্রহণযোগ্য।" }, 405);
  }

  if (!originAllowed) {
    return reply({
      error: "এই ওয়েবসাইট থেকে আবেদন গ্রহণ করা যাচ্ছে না।"
    }, 403);
  }

  let uploadedPath = "";

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://juitlxjvqzmuzumlphos.supabase.co";
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = env.RESEND_API_KEY;

    if (!supabaseUrl || !serviceKey) {
      return reply({
        error: "Cloudflare-এ Supabase সেটিংস পাওয়া যায়নি।"
      }, 500);
    }

    const body = await request.json();

    const fullName = typeof body.full_name === "string"
      ? body.full_name.trim() : "";

    const email = typeof body.email === "string"
      ? body.email.trim().toLowerCase() : "";

    const phone = typeof body.phone === "string"
      ? body.phone.trim() : "";

    const address = typeof body.address === "string"
      ? body.address.trim() : "";

    const reporterPost = typeof body.reporter_post === "string"
      ? body.reporter_post.trim() : "";

    const photoType = body.photo_type;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    const validPost = [
      "উপজেলা প্রতিনিধি",
      "জেলা প্রতিনিধি",
      "বিভাগীয় প্রতিনিধি",
      "বিশেষ প্রতিনিধি",
      "প্রবাসী প্রতিনিধি",
      "জাতীয় প্রতিনিধি",
      "আন্তর্জাতিক প্রতিনিধি"
    ].includes(reporterPost);

    if (
      !fullName ||
      fullName.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !phone ||
      phone.length > 20 ||
      !address ||
      address.length > 300 ||
      !validPost ||
      !allowedTypes.includes(photoType) ||
      typeof body.photo_base64 !== "string" ||
      body.photo_base64.length > 4_300_000
    ) {
      return reply({
        error: "সব তথ্য পূরণ করুন এবং সঠিক ছবি দিন (সর্বোচ্চ ৩ MB)।"
      }, 400);
    }

    const binary = Uint8Array.from(
      atob(body.photo_base64),
      ch => ch.charCodeAt(0)
    );

    if (!binary.length || binary.length > 3 * 1024 * 1024) {
      return reply({
        error: "ছবির আকার ৩ MB-এর বেশি।"
      }, 400);
    }

    const ext = photoType === "image/jpeg"
      ? "jpg"
      : photoType === "image/png"
        ? "png"
        : "webp";

    uploadedPath =
      "reporter-photos/" + crypto.randomUUID() + "." + ext;

    // ছবি Supabase Storage-এ আপলোড
    const storageResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/news-images/${uploadedPath}`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": photoType,
          "x-upsert": "false"
        },
        body: binary
      }
    );

    if (!storageResponse.ok) {
      const storageError = await storageResponse.text();

      return reply({
        error: "ছবি সংরক্ষণে Supabase Error: " + storageError
      }, 400);
    }

    const photoUrl =
      `${supabaseUrl}/storage/v1/object/public/news-images/${uploadedPath}`;

    // আবেদন ডাটাবেজে জমা
    const dbResponse = await fetch(
      `${supabaseUrl}/rest/v1/registration_requests`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone,
          address,
          reporter_post: reporterPost,
          photo_url: photoUrl,
          status: "pending"
        })
      }
    );

    if (!dbResponse.ok) {
      const detail = await dbResponse.text();

      // ব্যর্থ হলে আপলোড করা ছবি মুছে ফেলা
      await fetch(
        `${supabaseUrl}/storage/v1/object/news-images/${uploadedPath}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          }
        }
      );

      return reply({
        error: detail.includes("duplicate")
          ? "এই ইমেইল দিয়ে আবেদন আগে জমা হয়েছে।"
          : "Supabase Database Error: " + detail
      }, 400);
    }

    // অ্যাডমিনকে ইমেইল নোটিফিকেশন
    let notificationSent = false;

    if (resendKey) {
      const mail = await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "সত্যের সন্ধানে সব সময় <onboarding@resend.dev>",
            to: ["sottersondhanesobsomay121@gmail.com"],
            subject: "নতুন সাংবাদিক আবেদন",
            text:
              `নতুন সাংবাদিক আবেদন জমা হয়েছে।\n` +
              `নাম: ${fullName}\n` +
              `মোবাইল: ${phone}\n` +
              `ইমেইল: ${email}\n` +
              `ঠিকানা: ${address}\n` +
              `পদ: ${reporterPost}\n` +
              `ছবি: ${photoUrl}\n` +
              `অ্যাডমিন প্যানেলে আবেদন দেখুন।`
          })
        }
      );

      notificationSent = mail.ok;
    }

    return reply({
      ok: true,
      notification_sent: notificationSent
    });

  } catch (error) {
    return reply({
      error: "আবেদন জমা দেওয়ার সময় সমস্যা: " +
        (error?.message || String(error))
    }, 500);
  }
}
