export async function onRequest({ request, env }) {
  const reply = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Pragma": "no-cache" }
  });
  if (request.method !== "POST") return reply({ error: "শুধু POST অনুরোধ গ্রহণযোগ্য।" }, 405);
  try {
    const url = env.SUPABASE_URL || "https://juitlxjvqzmuzumlphos.supabase.co";
    const service = env.SUPABASE_SERVICE_ROLE_KEY;
    const anon = request.headers.get("apikey") || env.SUPABASE_ANON_KEY;
    const authorization = request.headers.get("Authorization") || "";
    if (!url || !service || !anon || !authorization.startsWith("Bearer ")) {
      return reply({ error: "প্রথমে সাংবাদিক বা অ্যাডমিন হিসেবে লগইন করুন।" }, 401);
    }
    const authRes = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, Authorization: authorization } });
    if (!authRes.ok) return reply({ error: "লগইন যাচাই হয়নি। আবার লগইন করুন।" }, 401);
    const user = await authRes.json();
    const headers = { apikey: service, Authorization: "Bearer " + service, "Content-Type": "application/json" };
    const input = await request.json();

    if (input.action === "submit") {
      const profileRes = await fetch(url + "/rest/v1/portal_reporters?user_id=eq." + encodeURIComponent(user.id) + "&active=eq.true&select=user_id,full_name,email,phone", { headers });
      if (!profileRes.ok) return reply({ error: "সাংবাদিকের অনুমোদন যাচাই করা যায়নি।" }, 500);
      const profiles = await profileRes.json();
      if (!profiles.length) return reply({ error: "শুধু সক্রিয় অনুমোদিত সাংবাদিক এই ডেস্কে অভিযোগ জমা দিতে পারবেন।" }, 403);
      const profile = profiles[0];
      const allowed = ["নিরাপত্তা হুমকি","হামলা বা শারীরিক নিরাপত্তা","হয়রানি বা নজরদারি","আইনি সহায়তা","অন্যান্য"];
      const reportType = typeof input.report_type === "string" ? input.report_type : "";
      const description = typeof input.description === "string" ? input.description.trim() : "";
      const location = typeof input.incident_location === "string" ? input.incident_location.trim().slice(0, 300) : "";
      const requestedHelp = typeof input.requested_help === "string" ? input.requested_help.trim().slice(0, 2000) : "";
      const evidenceUrl = typeof input.evidence_url === "string" ? input.evidence_url.trim().slice(0, 500) : "";
      const incidentDate = typeof input.incident_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.incident_date) ? input.incident_date : null;
      if (!allowed.includes(reportType)) return reply({ error: "অভিযোগের ধরন নির্বাচন করুন।" }, 400);
      if (description.length < 50 || description.length > 5000) return reply({ error: "ঘটনার বিবরণ ৫০ থেকে ৫০০০ অক্ষরের মধ্যে লিখুন।" }, 400);
      if (evidenceUrl && !/^https:\/\//i.test(evidenceUrl)) return reply({ error: "প্রমাণের লিংক https:// দিয়ে শুরু হতে হবে।" }, 400);
      const payload = {
        reporter_id: user.id,
        reporter_name: profile.full_name,
        reporter_email: profile.email || user.email || "",
        reporter_phone: profile.phone || "",
        report_type: reportType,
        incident_date: incidentDate,
        incident_location: location,
        description,
        requested_help: requestedHelp,
        evidence_url: evidenceUrl,
        consent_to_contact: input.consent_to_contact === true,
        status: "new"
      };
      const insert = await fetch(url + "/rest/v1/journalist_safety_reports", {
        method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(payload)
      });
      if (!insert.ok) return reply({ error: "অভিযোগ জমা হয়নি। Supabase-এ সাংবাদিক সুরক্ষা ডেস্কের SQL migration চালানো হয়েছে কি না যাচাই করুন।" }, 500);
      return reply({ ok: true, message: "আপনার অভিযোগ নিরাপদভাবে জমা হয়েছে। অনুমোদিত অ্যাডমিন এটি পর্যালোচনা করবেন। জরুরি বিপদে স্থানীয় জরুরি সেবা বা বিশ্বস্ত সহায়তার সঙ্গে সরাসরি যোগাযোগ করুন।" });
    }

    const adminRes = await fetch(url + "/rest/v1/portal_admins?user_id=eq." + encodeURIComponent(user.id) + "&select=user_id", { headers });
    if (!adminRes.ok) return reply({ error: "অ্যাডমিন অনুমতি যাচাই করা যায়নি।" }, 500);
    if (!(await adminRes.json()).length) return reply({ error: "শুধু অ্যাডমিন সুরক্ষা ডেস্কের অভিযোগ দেখতে পারবেন।" }, 403);

    if (input.action === "admin_list") {
      const list = await fetch(url + "/rest/v1/journalist_safety_reports?select=*&order=created_at.desc&limit=200", { headers });
      if (!list.ok) return reply({ error: "অভিযোগের তালিকা লোড হয়নি। SQL migration চালানো হয়েছে কি না যাচাই করুন।" }, 500);
      return reply({ ok: true, reports: await list.json() });
    }
    if (input.action === "admin_update") {
      const id = Number(input.id);
      const status = input.status;
      const notes = typeof input.admin_notes === "string" ? input.admin_notes.trim().slice(0, 2000) : "";
      if (!Number.isSafeInteger(id) || id < 1 || !["new","reviewing","resolved"].includes(status)) {
        return reply({ error: "অভিযোগের অবস্থা সঠিক নয়।" }, 400);
      }
      const update = await fetch(url + "/rest/v1/journalist_safety_reports?id=eq." + id, {
        method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ status, admin_notes: notes, updated_at: new Date().toISOString() })
      });
      if (!update.ok) return reply({ error: "অভিযোগের অবস্থা আপডেট হয়নি।" }, 500);
      if (!(await update.json()).length) return reply({ error: "অভিযোগটি পাওয়া যায়নি।" }, 404);
      return reply({ ok: true, message: "অভিযোগের অবস্থা আপডেট হয়েছে।" });
    }
    return reply({ error: "অনুরোধ সঠিক নয়।" }, 400);
  } catch (error) {
    return reply({ error: "সার্ভারে সমস্যা হয়েছে।" }, 500);
  }
}