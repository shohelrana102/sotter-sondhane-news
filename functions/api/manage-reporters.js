export async function onRequest({ request, env }) {
  const reply = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
  if (request.method !== "POST") return reply({ error: "শুধু POST গ্রহণযোগ্য।" }, 405);
  try {
    const url = env.SUPABASE_URL, service = env.SUPABASE_SERVICE_ROLE_KEY, anon = env.SUPABASE_ANON_KEY;
    const auth = request.headers.get("Authorization") || "";
    if (!url || !service || !anon || !auth.startsWith("Bearer ")) return reply({ error: "অ্যাডমিন লগইন প্রয়োজন।" }, 401);
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    if (!who.ok) return reply({ error: "লগইন যাচাই হয়নি।" }, 401);
    const user = await who.json();
    const check = await fetch(`${url}/rest/v1/portal_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, { headers: { apikey: service } });
    if (!check.ok || !(await check.json()).length) return reply({ error: "শুধু অ্যাডমিন এই কাজ করতে পারবেন।" }, 403);
    const body = await request.json();
    const headers = { apikey: service, "Content-Type": "application/json" };
    if (body.action === "list") {
      const r = await fetch(`${url}/rest/v1/portal_reporters?select=*&order=created_at.desc`, { headers });
      if (!r.ok) return reply({ error: "সাংবাদিক তালিকা লোড হয়নি। SQL migration চালান।" }, 500);
      return reply({ ok: true, reporters: await r.json() });
    }
    if (body.action === "set_submission" && typeof body.user_id === "string" && typeof body.allowed === "boolean") {
      const r = await fetch(`${url}/rest/v1/portal_reporters?user_id=eq.${encodeURIComponent(body.user_id)}`, {
        method: "PATCH", headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ can_submit: body.allowed })
      });
      if (!r.ok) return reply({ error: "সংবাদ জমা দেওয়ার অনুমতি পরিবর্তন করা যায়নি।" }, 500);
      return reply({ ok: true, message: body.allowed ? "সংবাদ জমা দেওয়ার অনুমতি চালু হয়েছে।" : "এই সাংবাদিকের সংবাদ জমা সাময়িক বন্ধ করা হয়েছে।" });
    }
    if (body.action === "delete" && typeof body.user_id === "string") {
      if (body.user_id === user.id) return reply({ error: "নিজের অ্যাডমিন অ্যাকাউন্ট এখানে মুছতে পারবেন না।" }, 400);
      const r = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(body.user_id)}`, {
        method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` }
      });
      if (!r.ok) return reply({ error: "অ্যাকাউন্ট মুছে ফেলা যায়নি।" }, 500);
      return reply({ ok: true, message: "সাংবাদিকের অ্যাকাউন্ট মুছে ফেলা হয়েছে। আগে প্রকাশিত সংবাদ সংরক্ষিত থাকবে।" });
    }
    if (body.action === "remove" && typeof body.user_id === "string") {
      const r = await fetch(`${url}/rest/v1/portal_reporters?user_id=eq.${encodeURIComponent(body.user_id)}`, {
        method: "PATCH", headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ active: false })
      });
      if (!r.ok) return reply({ error: "সাংবাদিকের অনুমোদন বাতিল করা যায়নি।" }, 500);
      return reply({ ok: true, message: "সাংবাদিকের সক্রিয় অনুমোদন বাতিল হয়েছে।" });
    }
    return reply({ error: "অনুরোধ সঠিক নয়।" }, 400);
  } catch (e) { return reply({ error: "সার্ভারে সমস্যা হয়েছে।" }, 500); }
}
