

const cfg = window.PORTAL_CONFIG || {};
const ready = cfg.SUPABASE_URL?.startsWith("https://") &&
  cfg.SUPABASE_ANON_KEY?.length > 30;

const db = ready && window.supabase
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

const form = document.querySelector("#submitForm");
const msg = document.querySelector("#formMsg");
const year = document.querySelector("#year");

if (year) year.textContent = new Date().getFullYear();

function message(el, text, kind = "") {
  if (!el) return;
  el.textContent = text;
  el.className = kind;
}

// আপনার WhatsApp যোগাযোগ বাটন
const whatsapp = document.createElement("a");
whatsapp.href = "https://wa.me/8801518739647?text=" +
  encodeURIComponent("আসসালামু আলাইকুম। সত্যের সন্ধানে সব সময় নিউজ পোর্টাল থেকে যোগাযোগ করছি।");
whatsapp.textContent = "☘ WhatsApp-এ যোগাযোগ করুন";
whatsapp.target = "_blank";
whatsapp.rel = "noopener noreferrer";
whatsapp.style.cssText =
  "position:fixed;bottom:20px;right:15px;z-index:9999;background:#25D366;color:white;padding:13px 17px;border-radius:30px;text-decoration:none;font-weight:bold;box-shadow:0 3px 12px #777;font-size:14px;";
document.body.appendChild(whatsapp);

async function loadNews() {
  const list = document.querySelector("#newsList");
  if (!list) return;

  if (!db) {
    list.textContent = "Supabase সেটিংস যাচাই করুন।";
    return;
  }

  const { data, error } = await db
    .from("news")
    .select("id,title,body,author,image_url,created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    list.textContent = "সংবাদ লোড করা যায়নি: " + error.message;
    return;
  }

  list.innerHTML = "";

  if (!data || !data.length) {
    list.textContent = "এখনো কোনো সংবাদ প্রকাশিত হয়নি।";
    return;
  }

  for (const n of data) {
    const card = document.createElement("article");
    card.className = "news-card";
    card.id = "news-" + n.id;

    if (n.image_url) {
      const im = document.createElement("img");
      im.src = n.image_url;
      im.alt = "সংবাদের ছবি";
      im.loading = "lazy";
      im.onerror = () => im.remove();
      card.appendChild(im);
    }

    const h = document.createElement("h3");
    h.textContent = n.title;

    const p = document.createElement("p");
    const body = String(n.body || "");
    p.textContent = body.length > 480
      ? body.slice(0, 480) + "…"
      : body;

    const meta = document.createElement("small");
    meta.textContent =
      "প্রতিবেদক: " + (n.author || "") + " · " +
      new Date(n.created_at).toLocaleString("bn-BD");

    const share = document.createElement("button");
    share.textContent = "শেয়ার করুন";
    share.type = "button";
    share.addEventListener("click", async () => {
      const url = location.origin + location.pathname +
        "#news-" + encodeURIComponent(n.id);

      try {
        if (navigator.share) {
          await navigator.share({
            title: n.title,
            text: n.title,
            url: url
          });
        } else {
          await navigator.clipboard.writeText(url);
          alert("সংবাদের লিংক কপি হয়েছে।");
        }
      } catch (e) {
        if (e.name !== "AbortError") {
          prompt("এই লিংকটি কপি করুন:", url);
        }
      }
    });

    card.append(h, p, meta, share);
    list.appendChild(card);
  }

  if (location.hash.startsWith("#news-")) {
    const target = document.getElementById(
      decodeURIComponent(location.hash.slice(1))
    );
    if (target) target.scrollIntoView();
  }
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!db) {
      message(msg, "সাইটের Supabase সেটিংস যাচাই করুন।", "error");
      return;
    }

    const d = Object.fromEntries(new FormData(form));
    const btn = form.querySelector("button");

    if (btn) btn.disabled = true;
    message(msg, "নিউজ জমা হচ্ছে…");

    try {
      const { data, error } = await db.rpc("submit_news", {
        p_title: d.title,
        p_body: d.body,
        p_author: d.author,
        p_phone: d.phone || "",
        p_image_url: d.image_url || ""
      });

      if (error) {
        message(msg, "নিউজ জমা হয়নি: " + error.message, "error");
        return;
      }

      message(
        msg,
        data?.message || "নিউজ জমা হয়েছে। অ্যাডমিন অনুমোদনের পর প্রকাশিত হবে।",
        "success"
      );
      form.reset();
    } catch (error) {
      message(msg, "সমস্যা হয়েছে: " + error.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

const refresh = document.querySelector("#refresh");
if (refresh) refresh.addEventListener("click", loadNews);

loadNews();

