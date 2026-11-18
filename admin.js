function getYouTubeVideoId(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    let id = "";
    if (host === "youtu.be") id = u.pathname.split("/").filter(Boolean)[0] || "";
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else if (/^\/(embed|shorts)\//.test(u.pathname)) id = u.pathname.split("/")[2] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}


const cfg = window.PORTAL_CONFIG || {};

const ready =
  cfg.SUPABASE_URL?.startsWith("https://") &&
  cfg.SUPABASE_ANON_KEY?.length > 30;

const db = ready && window.supabase
  ? window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    )
  : null;

const loginPanel = document.querySelector("#loginPanel");
const dash = document.querySelector("#dashboard");
const loginMsg = document.querySelector("#loginMsg");

let currentStatus = "pending";

function say(el, text, kind = "") {
  if (el) {
    el.textContent = text;
    el.className = kind;
  }
}

// অ্যাডমিন যাচাই
async function enter() {
  const { data, error } = await db.auth.getUser();

  if (error || !data.user) {
    say(loginMsg, "লগইন যাচাই করা যায়নি। আবার চেষ্টা করুন।", "error");
    return;
  }

  const { data: role, error: roleError } =
    await db.rpc("is_portal_admin");

  if (roleError) {
    say(loginMsg, "অ্যাডমিন যাচাই সমস্যা: " + roleError.message, "error");
    return;
  }

  if (role !== true) {
    say(loginMsg, "আপনি অ্যাডমিন হিসেবে অনুমোদিত নন।", "error");
    return;
  }

  loginPanel.hidden = true;
  dash.hidden = false;
  document.querySelector("#who").textContent = data.user.email;

  createRequestSection();
  setupAdminPublishForm();
  loadRequests();
  createReporterManagementSection();
  loadReporters();
  loadAdmin();
}

// লগইন অবস্থা
async function init() {
  if (!db) {
    say(loginMsg, "config.js-এর Supabase সেটিংস যাচাই করুন।", "error");
    return;
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    say(loginMsg, error.message, "error");
    return;
  }

  if (data.session) await enter();
}

// লগইন
document.querySelector("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const d = Object.fromEntries(new FormData(e.currentTarget));
  const btn = e.currentTarget.querySelector('button[type="submit"]');

  if (btn) btn.disabled = true;

  say(loginMsg, "লগইন হচ্ছে...");

  try {
    const { error } = await db.auth.signInWithPassword({
      email: d.email,
      password: d.password
    });

    if (error) throw error;

    await enter();

  } catch (error) {
    say(loginMsg, "লগইন সমস্যা: " + error.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

// লগআউট
document.querySelector("#logout").addEventListener("click", async () => {
  await db.auth.signOut();
  location.reload();
});

// রিপোর্টার আবেদন বিভাগ
function createRequestSection() {
  if (document.querySelector("#requestSection")) return;

  const section = document.createElement("section");
  section.id = "requestSection";
  section.style.cssText =
    "background:white;padding:18px;border-radius:12px;margin:20px 0;";

  const heading = document.createElement("h2");
  heading.textContent = "👥 রিপোর্টার অ্যাকাউন্টের আবেদন";

  const refresh = document.createElement("button");
  refresh.className = "button outline";
  refresh.textContent = "আবেদন রিফ্রেশ করুন";
  refresh.onclick = loadRequests;

  const list = document.createElement("div");
  list.id = "requestList";
  list.textContent = "আবেদন লোড হচ্ছে...";

  section.append(heading, refresh, list);
  dash.insertBefore(section, dash.firstChild);
}

// অনুমোদিত সাংবাদিকদের তালিকা ও অনুমোদন বাতিল
function createReporterManagementSection() {
  if (document.querySelector("#reporterManagement")) return;
  const section = document.createElement("section");
  section.id = "reporterManagement";
  section.style.cssText = "background:white;padding:18px;border-radius:12px;margin:20px 0;";
  const heading = document.createElement("h2");
  heading.textContent = "সক্রিয় সাংবাদিকদের তালিকা";
  const refresh = document.createElement("button");
  refresh.className = "button outline";
  refresh.textContent = "তালিকা রিফ্রেশ";
  refresh.onclick = loadReporters;
  const list = document.createElement("div");
  list.id = "reporterList";
  list.textContent = "লোড হচ্ছে...";
  section.append(heading, refresh, list);
  const requestSection = document.querySelector("#requestSection");
  if (requestSection) requestSection.after(section);
  else dash.insertBefore(section, dash.firstChild);
}

async function loadReporters() {
  const box = document.querySelector("#reporterList");
  if (!box) return;
  box.textContent = "সাংবাদিকদের তালিকা লোড হচ্ছে...";
  try {
    const { data } = await db.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch("/api/manage-reporters", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ action: "list" })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "তালিকা পাওয়া যায়নি।");
    box.innerHTML = "";
    const active = (result.reporters || []).filter(r => r.active !== false);
    if (!active.length) { box.textContent = "এখনো কোনো সক্রিয় সাংবাদিক নেই।"; return; }
    for (const r of active) {
      const card = document.createElement("article");
      card.className = "admin-card";
      if (r.photo_url) {
        const img = document.createElement("img");
        img.src = r.photo_url; img.alt = "সাংবাদিকের ছবি";
        img.style.cssText = "width:90px;height:90px;object-fit:cover;border-radius:50%;";
        card.appendChild(img);
      }
      const h = document.createElement("h3"); h.textContent = r.full_name || "নাম নেই";
      const detail = document.createElement("p");
      detail.textContent = "পদ: " + (r.reporter_post || "উল্লেখ নেই") +
        "\\nমোবাইল: " + (r.phone || "নেই") +
        "\\nইমেইল: " + (r.email || "নেই") +
        "\\nঠিকানা: " + (r.address || "নেই");
      const remove = document.createElement("button");
      remove.className = "button danger"; remove.textContent = "সাংবাদিক পদ বাতিল";
      remove.onclick = async () => {
        if (!confirm((r.full_name || "এই সাংবাদিক") + " -এর সাংবাদিক অনুমোদন বাতিল করবেন?")) return;
        remove.disabled = true;
        try {
          const { data } = await db.auth.getSession();
          const response = await fetch("/api/manage-reporters", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + data.session.access_token },
            body: JSON.stringify({ action: "remove", user_id: r.user_id })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "বাতিল হয়নি।");
          alert(result.message || "অনুমোদন বাতিল হয়েছে।");
          loadReporters();
        } catch (e) { alert(e.message); remove.disabled = false; }
      };
      card.append(h, detail, remove);
      box.appendChild(card);
    }
  } catch (e) { box.textContent = "সমস্যা: " + e.message; }
}

// আবেদন লোড
async function loadRequests() {
  const box = document.querySelector("#requestList");
  if (!box) return;

  box.textContent = "আবেদন লোড হচ্ছে...";

  const { data, error } = await db
    .from("registration_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    box.textContent = "আবেদন লোড করা যায়নি: " + error.message;
    return;
  }

  box.innerHTML = "";

  if (!data || data.length === 0) {
    box.textContent = "এখনো কোনো নতুন আবেদন নেই।";
    return;
  }

  for (const request of data) {
    const card = document.createElement("article");
    card.style.cssText =
      "border:1px solid #ddd;padding:15px;border-radius:10px;margin:12px 0;";

    const name = document.createElement("h3");
    name.textContent = request.full_name;

    const email = document.createElement("p");
    email.textContent = "ইমেইল: " + request.email;

    const phone = document.createElement("p");
    phone.textContent = "মোবাইল: " + (request.phone || "দেওয়া হয়নি");

    const address = document.createElement("p");
    address.textContent = "ঠিকানা: " + (request.address || "দেওয়া হয়নি");

    const post = document.createElement("p");
    post.textContent = "আবেদনকৃত পদ: " + (request.reporter_post || "উল্লেখ নেই");

    if (request.photo_url) {
      const photo = document.createElement("img");
      photo.src = request.photo_url;
      photo.alt = "আবেদনকারীর ছবি";
      photo.style.cssText = "width:120px;height:120px;object-fit:cover;border-radius:12px;";
      card.appendChild(photo);
    }

    const date = document.createElement("small");
    date.textContent =
      "আবেদনের তারিখ: " +
      new Date(request.created_at).toLocaleString("bn-BD");

    const info = document.createElement("p");
    info.textContent =
      "অনুমোদন করলে রিপোর্টার অ্যাকাউন্ট তৈরি হবে এবং ইমেইলে আমন্ত্রণ যাবে।";

    const actions = document.createElement("div");
    actions.className = "actions";

    const approve = document.createElement("button");
    approve.className = "button";
    approve.textContent = "অনুমোদন";

    approve.onclick = async () => {
      if (!confirm(
        "এই আবেদন অনুমোদন করবেন? আবেদনকারীর ইমেইলে অ্যাকাউন্ট তৈরির আমন্ত্রণ যাবে।"
      )) return;

      approve.disabled = true;
      approve.textContent = "অনুমোদন হচ্ছে...";

      await approveReporter(request.id);

      approve.disabled = false;
      approve.textContent = "অনুমোদন";
    };

    const reject = document.createElement("button");
    reject.className = "button outline";
    reject.textContent = "বাতিল";

    reject.onclick = async () => {
      if (!confirm("এই আবেদন বাতিল করবেন?")) return;

      reject.disabled = true;
      await changeRequestStatus(request.id, "rejected");
      reject.disabled = false;
    };

    actions.append(approve, reject);
    card.append(name, email, phone, address, post, date, info, actions);
    box.appendChild(card);
  }
}

// নতুন API দিয়ে রিপোর্টার অনুমোদন
async function approveReporter(requestId) {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    const session = data.session;

    if (!session?.access_token) {
      throw new Error("অ্যাডমিন লগইন করুন।");
    }

    const response = await fetch("/api/approve-reporter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token
      },
      body: JSON.stringify({
        request_id: requestId
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "অনুমোদন করা যায়নি।");
    }

    alert(
      result.message ||
      "রিপোর্টার অ্যাকাউন্ট তৈরি হয়েছে। ইমেইল পাঠানো হয়েছে।"
    );

    await loadRequests();

  } catch (error) {
    alert("অনুমোদন সমস্যা: " + error.message);
  }
}

// আবেদন বাতিল
async function changeRequestStatus(id, status) {
  const { error } = await db
    .from("registration_requests")
    .update({ status })
    .eq("id", id);

  if (error) {
    alert("পরিবর্তন করা যায়নি: " + error.message);
    return;
  }

  alert("আবেদন বাতিল করা হয়েছে।");
  loadRequests();
}

// নিউজের ট্যাব
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) =>
      x.classList.remove("active")
    );

    b.classList.add("active");
    currentStatus = b.dataset.status;
    loadAdmin();
  });
});

// নিউজ লোড
async function loadAdmin() {
  const box = document.querySelector("#adminNews");
  if (!box) return;

  box.textContent = "নিউজ লোড হচ্ছে...";

  const { data, error } = await db
    .from("news")
    .select("*")
    .eq("status", currentStatus)
    .order("created_at", { ascending: false });

  if (error) {
    box.textContent = "নিউজ লোড করা যায়নি: " + error.message;
    return;
  }

  box.innerHTML = "";

  if (!data || data.length === 0) {
    box.textContent = "এই তালিকায় কোনো নিউজ নেই।";
    return;
  }

  for (const n of data) {
    const card = document.createElement("article");
    card.className = "admin-card";

    const h = document.createElement("h3");
    h.textContent = n.title || "শিরোনাম নেই";

    card.appendChild(h);

    if (n.image_url) {
      const img = document.createElement("img");
      img.src = n.image_url;
      img.alt = n.title || "সংবাদের ছবি";
      img.loading = "lazy";
      img.style.cssText =
        "width:100%;max-height:320px;object-fit:cover;border-radius:10px;";
      card.appendChild(img);
    }

    if (n.video_url) {
      const videoId = getYouTubeVideoId(n.video_url);
      if (videoId) {
        const frame = document.createElement("iframe");
        frame.src = "https://www.youtube-nocookie.com/embed/" + videoId;
        frame.title = n.title || "সংবাদের ভিডিও";
        frame.loading = "lazy";
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        frame.allowFullscreen = true;
        frame.style.cssText = "width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:10px 0;";
        card.appendChild(frame);
      }
    }

    const p = document.createElement("p");
    p.textContent = n.body || "";

    const meta = document.createElement("small");
    meta.textContent =
      "প্রতিবেদক: " + (n.author || "নেই") +
      " · ফোন: " + (n.phone || "নেই") +
      " · " + new Date(n.created_at).toLocaleString("bn-BD");

    const actions = document.createElement("div");
    actions.className = "actions";

    if (currentStatus !== "approved") {
      const approve = document.createElement("button");
      approve.className = "button";
      approve.textContent = "অনুমোদন ও প্রকাশ";
      approve.onclick = () => updateStatus(n.id, "approved");
      actions.appendChild(approve);
    }

    if (currentStatus !== "rejected") {
      const reject = document.createElement("button");
      reject.className = "button outline";
      reject.textContent = "বাতিল";
      reject.onclick = () => updateStatus(n.id, "rejected");
      actions.appendChild(reject);
    }

    const del = document.createElement("button");
    del.className = "button danger";
    del.textContent = "স্থায়ীভাবে ডিলিট";

    del.onclick = async () => {
      if (!confirm("এই নিউজ স্থায়ীভাবে মুছে ফেলবেন?")) return;

      const { error } = await db
        .from("news")
        .delete()
        .eq("id", n.id);

      if (error) alert(error.message);
      else loadAdmin();
    };

    actions.appendChild(del);
    card.append(h, p, meta, actions);
    box.appendChild(card);
  }
}

// নিউজের অবস্থা পরিবর্তন
async function updateStatus(id, status) {
  const { error } = await db
    .from("news")
    .update({ status })
    .eq("id", id);

  if (error) {
    alert("পরিবর্তন করা যায়নি: " + error.message);
  } else {
    alert(
      status === "approved"
        ? "নিউজ প্রকাশ করা হয়েছে।"
        : "নিউজ বাতিল করা হয়েছে।"
    );
    loadAdmin();
  }
}

init();



// অ্যাডমিনের নিউজের ছবি Supabase Storage-এ আপলোড
async function uploadAdminNewsImage(file) {
  if (!file) return "";
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("শুধু JPG, PNG, WEBP অথবা GIF ছবি দিন।");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("ছবির আকার ৫ MB-এর বেশি হতে পারবে না।");
  }
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  }[file.type];
  const fileName = Date.now() + "-" +
    Math.random().toString(36).slice(2) + "." + extension;
  const { data, error } = await db.storage
    .from("news-images")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });
  if (error) throw new Error("ছবি আপলোড হয়নি: " + error.message);
  const { data: publicData } = db.storage
    .from("news-images")
    .getPublicUrl(data.path);
  return publicData.publicUrl;
}

// অ্যাডমিনের নিউজ সরাসরি প্রকাশ
function setupAdminPublishForm() {
  const form = document.querySelector("#adminNewsForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "1";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.querySelector("#adminPublishMsg");
    const btn = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    const imageFile = document.querySelector("#adminImageFile")?.files?.[0] || null;
    delete values.image_file;
    btn.disabled = true;
    say(msg, imageFile ? "ছবি আপলোড হচ্ছে..." : "নিউজ প্রকাশ হচ্ছে...");

    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error("আবার অ্যাডমিন লগইন করুন।");

      if (imageFile) {
        // ছবি আপলোড করা হলে সেটির লিংকটি ছবির URL ঘরের লিংকের পরিবর্তে ব্যবহৃত হবে।
        values.image_url = await uploadAdminNewsImage(imageFile);
      }

      const response = await fetch("/api/admin-publish-news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(values)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "নিউজ প্রকাশ করা যায়নি।");

      say(msg, result.message || "নিউজ প্রকাশিত হয়েছে।", "success");
      form.reset();
      currentStatus = "approved";
      document.querySelectorAll(".tab").forEach((x) => {
        x.classList.toggle("active", x.dataset.status === "approved");
      });
      await loadAdmin();
    } catch (error) {
      say(msg, "প্রকাশের সমস্যা: " + error.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}
