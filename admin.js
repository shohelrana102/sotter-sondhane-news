
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
  if (!el) return;
  el.textContent = text;
  el.className = kind;
}


// অ্যাডমিন যাচাই
async function enter() {
  const { data: userData, error: userError } =
    await db.auth.getUser();

  if (userError) {
    say(loginMsg, "ব্যবহারকারী যাচাই করা যায়নি: " + userError.message, "error");
    return;
  }

  const user = userData.user;

  if (!user) {
    say(loginMsg, "আবার লগইন করুন।", "error");
    return;
  }

  const { data: role, error: roleError } =
    await db.rpc("is_portal_admin");

  if (roleError) {
    say(
      loginMsg,
      "অ্যাডমিন যাচাই করা যায়নি: " + roleError.message,
      "error"
    );
    return;
  }

  if (role !== true) {
    say(
      loginMsg,
      "এই ইমেইলটি অ্যাডমিন হিসেবে অনুমোদিত নয়।",
      "error"
    );
    return;
  }

  loginPanel.hidden = true;
  dash.hidden = false;

  document.querySelector("#who").textContent = user.email;

  loadAdmin();
}


// শুরুতে লগইন অবস্থা যাচাই
async function init() {
  if (!db) {
    say(
      loginMsg,
      "config.js ফাইলে Supabase URL ও Anon Key যাচাই করুন।",
      "error"
    );
    return;
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    say(loginMsg, "সেশন যাচাই করা যায়নি: " + error.message, "error");
    return;
  }

  if (data.session) {
    await enter();
  }
}


// লগইন
document.querySelector("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!db) return;

  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type="submit"]');

  if (btn) btn.disabled = true;

  say(loginMsg, "লগইন হচ্ছে...");

  try {
    const { error } = await db.auth.signInWithPassword({
      email: d.email,
      password: d.password
    });

    if (error) {
      throw new Error(error.message);
    }

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


// নিউজের তালিকা পরিবর্তন
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => {
      x.classList.remove("active");
    });

    b.classList.add("active");
    currentStatus = b.dataset.status;

    loadAdmin();
  });
});


// অ্যাডমিন নিউজ লোড
async function loadAdmin() {
  const box = document.querySelector("#adminNews");

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

    // শিরোনাম
    const h = document.createElement("h3");
    h.textContent = n.title || "শিরোনাম নেই";
    card.appendChild(h);

    // শিরোনামের নিচে সংবাদের ছবি
    if (n.image_url) {
      const img = document.createElement("img");

      img.src = n.image_url;
      img.alt = n.title || "সংবাদের ছবি";
      img.loading = "lazy";

      img.style.width = "100%";
      img.style.maxHeight = "320px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "10px";
      img.style.marginBottom = "12px";

      img.onerror = () => {
        img.alt = "ছবিটি লোড করা যায়নি";
        img.style.display = "none";
      };

      card.appendChild(img);
    }

    // নিউজের বিবরণ
    const p = document.createElement("p");
    p.textContent = n.body || "";
    card.appendChild(p);

    // প্রতিবেদকের তথ্য
    const meta = document.createElement("small");

    meta.textContent =
      "প্রতিবেদক: " + (n.author || "অজানা") +
      " · ফোন: " + (n.phone || "নেই") +
      " · " +
      new Date(n.created_at).toLocaleString("bn-BD");

    card.appendChild(meta);

    // অনুমোদন ও বাতিল
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

    // স্থায়ীভাবে ডিলিট
    const del = document.createElement("button");

    del.className = "button danger";
    del.textContent = "স্থায়ীভাবে ডিলিট";

    del.onclick = async () => {
      if (confirm("এই নিউজ স্থায়ীভাবে মুছে ফেলবেন?")) {
        const { error } = await db
          .from("news")
          .delete()
          .eq("id", n.id);

        if (error) {
          alert("ডিলিট করা যায়নি: " + error.message);
        } else {
          loadAdmin();
        }
      }
    };

    actions.appendChild(del);
    card.appendChild(actions);

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
    loadAdmin();
  }
}


// চালু
init();
