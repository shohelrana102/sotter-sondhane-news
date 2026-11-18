const corsHeaders = {
  "Access-Control-Allow-Origin": "https://shotter-sondhane-news.pages.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export async function onRequest({ request, env }) {
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

  try {
    const SUPABASE_URL = env.SUPABASE_URL;
    const secretKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !secretKey || !anonKey) {
      return reply({
        error: "Cloudflare-এর Supabase ভেরিয়েবল পাওয়া যায়নি।"
      }, 500);
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return reply({ error: "অ্যাডমিন লগইন করুন।" }, 401);
    }

    // লগইন করা ব্যবহারকারী যাচাই
    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: anonKey,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return reply({ error: "লগইন যাচাই করা যায়নি।" }, 401);
    }

    const user = await userResponse.json();

    // অ্যাডমিন যাচাই
    const adminCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/portal_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      {
        headers: {
          apikey: secretKey
        }
      }
    );

    if (!adminCheck.ok) {
      return reply({ error: "অ্যাডমিন যাচাই করা যায়নি।" }, 500);
    }

    const admins = await adminCheck.json();

    if (!admins.length) {
      return reply({
        error: "শুধু অ্যাডমিন এই কাজ করতে পারবেন।"
      }, 403);
    }

    const body = await request.json();
    const requestId = body.request_id;

    if (typeof requestId !== "string" || !requestId.trim()) {
      return reply({ error: "আবেদনের ID সঠিক নয়।" }, 400);
    }

    const adminHeaders = {
      apikey: secretKey,
      "Content-Type": "application/json"
    };

    // আবেদন খুঁজে বের করা
    const applicationResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registration_requests?id=eq.${encodeURIComponent(requestId)}&select=*`,
      { headers: adminHeaders }
    );

    if (!applicationResponse.ok) {
      return reply({ error: "আবেদন খুঁজে পাওয়া যায়নি।" }, 500);
    }

    const applications = await applicationResponse.json();
    const application = applications[0];

    if (!application) {
      return reply({ error: "আবেদন পাওয়া যায়নি।" }, 404);
    }

    if (application.status !== "pending") {
      return reply({
        error: "আবেদনটি আগেই নিষ্পত্তি হয়েছে।"
      }, 409);
    }

    // ইমেইলে আমন্ত্রণ পাঠানো
    const inviteResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/invite`,
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          email: application.email,
          data: {
            full_name: application.full_name,
            phone: application.phone || "",
            address: application.address || "",
            reporter_post: application.reporter_post || ""
          }
        })
      }
    );

    const invitedUser = await inviteResponse.json();

    if (!inviteResponse.ok || !invitedUser.id) {
      return reply({
        error:
          invitedUser.msg ||
          invitedUser.message ||
          invitedUser.error_description ||
          "অ্যাকাউন্ট তৈরি করা যায়নি।"
      }, 400);
    }

    // রিপোর্টার হিসেবে যুক্ত করা
    const reporterResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/portal_reporters`,
      {
        method: "POST",
        headers: {
          ...adminHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          user_id: invitedUser.id,
          full_name: application.full_name || "",
          email: application.email || "",
          phone: application.phone || "",
          address: application.address || "",
          reporter_post: application.reporter_post || "",
          photo_url: application.photo_url || "",
          active: true
        })
      }
    );

    if (!reporterResponse.ok) {
      // ব্যর্থ হলে তৈরি করা অ্যাকাউন্ট মুছে ফেলার চেষ্টা
      await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${invitedUser.id}`,
        {
          method: "DELETE",
          headers: adminHeaders
        }
      );

      return reply({
        error: "রিপোর্টার হিসেবে যুক্ত করা যায়নি।"
      }, 500);
    }

    // আবেদন অনুমোদিত করা
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registration_requests?id=eq.${encodeURIComponent(requestId)}`,
      {
        method: "PATCH",
        headers: {
          ...adminHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          status: "approved"
        })
      }
    );

    if (!updateResponse.ok) {
      return reply({
        error: "অ্যাকাউন্ট তৈরি হয়েছে, কিন্তু আবেদনের অবস্থা আপডেট হয়নি।"
      }, 500);
    }

    return reply({
      ok: true,
      message: "রিপোর্টার অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে আমন্ত্রণ পাঠানো হয়েছে।"
    });

  } catch (error) {
    return reply({
      error: error.message || "অজানা সমস্যা হয়েছে।"
    }, 500);
  }
}
