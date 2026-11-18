const allowedOrigins = [
  "https://shotter-sondhane-news.pages.dev",
  "https://sotter-sondhane-news.pages.dev"
];

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };

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
  if (!allowedOrigins.includes(origin)) {
    return reply({ error: "এই ওয়েবসাইট থেকে আবেদন গ্রহণ করা যাচ্ছে না।" }, 403);
  }

  try {
    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = env.RESEND_API_KEY;

    if (!supabaseUrl || !serviceKey) {
      return reply({ error: "Cloudflare-এ Supabase সেটিংস পাওয়া যায়নি।" }, 500);
    }

    const body = await request.json();
    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    if (!fullName || fullName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || phone.length > 20) {
      return reply({ error: "নাম, ইমেইল বা মোবাইল নম্বর সঠিকভাবে দিন।" }, 400);
    }

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
          status: "pending"
        })
      }
    );

    if (!dbResponse.ok) {
      const detail = await dbResponse.text();
      return reply({ error: detail.includes("duplicate") ? "এই আবেদনটি আগে জমা হয়েছে।" : "আবেদন ডাটাবেজে জমা হয়নি।" }, 400);
    }

    if (!resendKey) {
      return reply({ ok: true, notification_sent: false });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "সত্যের সন্ধানে সব সময় <onboarding@resend.dev>",
        to: ["sottersondhanesobsomay121@gmail.com"],
        subject: "নতুন রিপোর্টার অ্যাকাউন্টের আবেদন",
        text: `আপনার নিউজ পোর্টালে নতুন রিপোর্টার আবেদন জমা হয়েছে।\n\nনাম: ${fullName}\nইমেইল: ${email}\nমোবাইল: ${phone || "দেওয়া হয়নি"}\n\nঅ্যাডমিন ড্যাশবোর্ডে গিয়ে আবেদনটি পর্যালোচনা করুন।`
      })
    });

    return reply({ ok: true, notification_sent: emailResponse.ok });
  } catch (error) {
    return reply({ error: "আবেদন জমা দেওয়ার সময় সমস্যা হয়েছে।" }, 500);
  }
}
