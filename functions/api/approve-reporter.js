function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);
  const allowedOrigin = origin && origin === requestUrl.origin ? origin : requestUrl.origin;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

export async function onRequest({ request, env }) {
  const corsHeaders = getCorsHeaders(request);
  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
    });

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "শুধু POST অনুরোধ গ্রহণযোগ্য।" }, 405);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://juitlxjvqzmuzumlphos.supabase.co";
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = request.headers.get("apikey") || env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return reply({ error: "Cloudflare-এর Supabase ভেরিয়েবল পাওয়া যায়নি।" }, 500);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "অ্যাডমিন লগইন করুন।" }, 401);

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization }
    });
    if (!userResponse.ok) return reply({ error: "লগইন যাচাই করা যায়নি।" }, 401);
    const user = await userResponse.json();

    const adminHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    };

    const adminCheck = await fetch(
      `${supabaseUrl}/rest/v1/portal_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      { headers: adminHeaders }
    );
    if (!adminCheck.ok) return reply({ error: "অ্যাডমিন যাচাই করা যায়নি।" }, 500);
    if (!(await adminCheck.json()).length) return reply({ error: "শুধু অ্যাডমিন এই কাজ করতে পারবেন।" }, 403);

    const body = await request.json();
    const requestId = body.request_id;
    if (typeof requestId !== "string" || !requestId.trim()) {
      return reply({ error: "আবেদনের ID সঠিক নয়।" }, 400);
    }

    const applicationResponse = await fetch(
      `${supabaseUrl}/rest/v1/registration_requests?id=eq.${encodeURIComponent(requestId)}&select=*`,
      { headers: adminHeaders }
    );
    if (!applicationResponse.ok) return reply({ error: "আবেদন খুঁজে পাওয়া যায়নি।" }, 500);
    const application = (await applicationResponse.json())[0];
    if (!application) return reply({ error: "আবেদন পাওয়া যায়নি।" }, 404);
    if (application.status !== "pending") {
      return reply({ error: "আবেদনটি আগেই নিষ্পত্তি হয়েছে।" }, 409);
    }

    const email = String(application.email || "").trim().toLowerCase();
    if (!email) return reply({ error: "আবেদনকারীর ইমেইল ঠিকানা নেই।" }, 400);

    // আগে থেকে আমন্ত্রিত/তৈরি অ্যাকাউন্ট থাকলে সেটিই ব্যবহার করুন; আবার আমন্ত্রণ পাঠাবেন না।
    const usersResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
      { headers: adminHeaders }
    );
    if (!usersResponse.ok) {
      return reply({ error: "Supabase-এর বিদ্যমান অ্যাকাউন্ট যাচাই করা যায়নি। পরে আবার চেষ্টা করুন।" }, 500);
    }
    const usersPayload = await usersResponse.json();
    const users = Array.isArray(usersPayload) ? usersPayload : (usersPayload.users || []);
    const existingUser = users.find(item => String(item.email || "").trim().toLowerCase() === email);

    let reporterUser = existingUser;
    let invitationSent = false;

    if (existingUser) {
      const existingAdminCheck = await fetch(
        `${supabaseUrl}/rest/v1/portal_admins?user_id=eq.${encodeURIComponent(existingUser.id)}&select=user_id`,
        { headers: adminHeaders }
      );
      if (!existingAdminCheck.ok) return reply({ error: "বিদ্যমান অ্যাকাউন্টের অনুমতি যাচাই করা যায়নি।" }, 500);
      if ((await existingAdminCheck.json()).length) {
        return reply({ error: "এই ইমেইলটি অ্যাডমিন অ্যাকাউন্টে ব্যবহৃত। সাংবাদিক হিসেবে যুক্ত করা যাবে না।" }, 409);
      }
    } else {
      const inviteResponse = await fetch(`${supabaseUrl}/auth/v1/invite`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          email,
          data: {
            full_name: application.full_name || "",
            phone: application.phone || "",
            address: application.address || "",
            reporter_post: application.reporter_post || "",
            citizenship_country: application.citizenship_country || "",
            is_expatriate: application.is_expatriate === true,
            current_country: application.current_country || ""
          }
        })
      });

      const inviteText = await inviteResponse.text();
      let inviteResult = {};
      try { inviteResult = inviteText ? JSON.parse(inviteText) : {}; } catch {}
      if (!inviteResponse.ok || !inviteResult.id) {
        const detail = inviteResult.msg || inviteResult.message || inviteResult.error_description || inviteResult.error || "";
        if (/rate limit/i.test(detail)) {
          return reply({ error: "Supabase ইমেইল পাঠানোর সীমা অতিক্রম করেছে। এখন আর অনুমোদন চাপবেন না; সীমা রিসেট হলে আবার চেষ্টা করুন।" }, 429);
        }
        return reply({ error: detail || "অ্যাকাউন্টের আমন্ত্রণ পাঠানো যায়নি। আবেদনটি পেন্ডিং রাখা হয়েছে।" }, 400);
      }
      reporterUser = inviteResult;
      invitationSent = true;
    }

    // user_id-ভিত্তিক upsert করলে আগের আংশিক প্রচেষ্টার পর নিরাপদে আবার চালানো যায়।
    const reporterResponse = await fetch(
      `${supabaseUrl}/rest/v1/portal_reporters?on_conflict=user_id`,
      {
        method: "POST",
        headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: reporterUser.id,
          full_name: application.full_name || "",
          email,
          phone: application.phone || "",
          address: application.address || "",
          reporter_post: application.reporter_post || "",
          citizenship_country: application.citizenship_country || "",
          is_expatriate: application.is_expatriate === true,
          current_country: application.current_country || "",
          photo_url: application.photo_url || "",
          active: true,
          can_submit: true
        })
      }
    );

    if (!reporterResponse.ok) {
      const reporterError = await reporterResponse.text();
      return reply({
        error: "অ্যাকাউন্টটি Supabase-এ আছে, কিন্তু সাংবাদিক তালিকায় যুক্ত হয়নি। আবেদন পেন্ডিং আছে; সমস্যা ঠিক করে আবার চেষ্টা করুন। বিস্তারিত: " + reporterError.slice(0, 500)
      }, 500);
    }

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/registration_requests?id=eq.${encodeURIComponent(requestId)}&status=eq.pending`,
      {
        method: "PATCH",
        headers: { ...adminHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ status: "approved" })
      }
    );

    if (!updateResponse.ok) {
      return reply({ error: "সাংবাদিক অ্যাকাউন্ট যুক্ত হয়েছে, কিন্তু আবেদনের অবস্থা আপডেট হয়নি। তালিকা রিফ্রেশ করে যাচাই করুন।" }, 500);
    }
    const updatedRows = await updateResponse.json();
    if (!updatedRows.length) {
      return reply({ error: "সাংবাদিক অ্যাকাউন্ট যুক্ত হয়েছে, তবে আবেদনটি আর পেন্ডিং নেই। অ্যাডমিন তালিকা যাচাই করুন।" }, 409);
    }

    return reply({
      ok: true,
      message: invitationSent
        ? "সাংবাদিক অ্যাকাউন্ট তৈরি হয়েছে এবং ইমেইলে আমন্ত্রণ পাঠানো হয়েছে।"
        : "আগের আমন্ত্রণ/অ্যাকাউন্ট ব্যবহার করে সাংবাদিক হিসেবে যুক্ত করা হয়েছে; নতুন ইমেইল পাঠানো হয়নি।"
    });
  } catch (error) {
    return reply({ error: error.message || "অজানা সার্ভার সমস্যা হয়েছে।" }, 500);
  }
}
