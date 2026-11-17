
const SUPABASE_URL = "https://juitlxjvqzmuzumlphos.supabase.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://shotter-sondhane-news.pages.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export async function onRequest({ request, env }) {
  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return reply({ error: "শুধু POST অনুরোধ গ্রহণযোগ্য।" }, 405);
  }

  try {
    const secretKey = env.SUPABASE_SECRET_KEY;
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!secretKey || !anonKey) {
      return reply({ error: "Supabase secret সেট করা হয়নি।" }, 500);
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return reply({ error: "অ্যাডমিন লগইন করুন।" }, 401);
    }

    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return reply({ error: "লগইন যাচাই করা যায়নি।" }, 401);
    }

    const user = await userResponse.json();

    const adminHeaders = {
      apikey: secretKey
    };

    const adminCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/portal_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      { headers: adminHeaders }
    );

    const admins = await adminCheck.json();

    if (!adminCheck.ok || !admins.length) {
      return reply({ error: "শুধু অ্যাডমিন এই কাজ করতে পারবেন।" }, 403);
    }

    const body = await request.json();
    const requestId = body.request_id;

    if (typeof requestId !== "string") {
      return reply({ error: "আবেদনের ID সঠিক নয়।" }, 400);
    }

    const headers = {
      apikey: secretKey,
      "Content-Type": "application/json"
    };

    const applicationResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registration_requests?id=eq.${encodeURIComponent(requestId)}&select=*`,
      { headers }
    );

    if (!applicationResponse.ok) {
      return reply({ error: "আবেদন যাচাই করা যায়নি।" }, 500);
    }

    const applications = await applicationResponse.json();
    const application = applications[0];

    if (!application) {
      return reply({ error: "আবেদন পাওয়া যায়নি।" }, 404);
    }

    if (application.status !== "pending") {
      return reply({ error: "আবেদনটি আগেই নিষ্পত্তি হয়েছে।" }, 409);
    }

    const inviteResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/invite`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: application.email,
          data: {
            full_name: application.full_name,
            phone: application.phone || ""
          }
        })
      }
    );

    const invitedUser = await inviteResponse.json();

    if (!inviteResponse.ok || !invitedUser.id) {
      return reply({
        error: invitedUser.msg || invitedUser.message ||
          invitedUser.error_description || "অ্যাকাউন্ট তৈরি করা যায়নি।"
      }, 400);
    }

    const reporterResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/portal_reporters`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ user_id: invitedUser.id })
      }
    );

    if (!reporterResponse.ok) {
      await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${invitedUser.id}`,
        {
          method: "DELETE",
          headers
        }
      );

      return reply({ error: "রিপোর্টার অনুমোদন করা যায়নি।" }, 500);
    }

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registration_requests?id=eq.${encodeURIComponent(requestId)}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ status: "approved" })
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
