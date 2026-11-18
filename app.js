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

const form = document.querySelector("#submitForm");
const msg = document.querySelector("#formMsg");

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

function message(el, text, kind = "") {
  if (!el) return;
  el.textContent = text;
  el.className = kind;
}

// WhatsApp যোগাযোগ বাটন
const whatsappContact = document.createElement("a");
whatsappContact.href =
  "https://wa.me/8801518739647?text=" +
  encodeURIComponent("আসসালামু আলাইকুম। সত্যের সন্ধানে সব সময় নিউজ পোর্টাল থেকে যোগাযোগ করছি।");
whatsappContact.textContent = "☘ WhatsApp-এ যোগাযোগ করুন";
whatsappContact.target = "_blank";
whatsappContact.rel = "noopener noreferrer";
whatsappContact.style.cssText =
  "position:fixed;bottom:18px;right:12px;z-index:9999;background:#25D366;color:white;padding:12px 15px;border-radius:30px;text-decoration:none;font-weight:bold;box-shadow:0 3px 12px #777;font-size:13px;";
document.body.appendChild(whatsappContact);


// লিংক কপি
async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    alert("সংবাদের লিংক কপি হয়েছে।");
  } catch (e) {
    prompt("সংবাদের লিংক কপি করুন:", url);
  }
}


// শেয়ার বাটন
function addShareButtons(card, news) {
  const url =
    location.origin +
    location.pathname +
    "#news-" + encodeURIComponent(news.id);

  const title = news.title || "সত্যের সন্ধানে সব সময়";

  const shareBox = document.createElement("div");
  shareBox.className = "actions";

  function makeLink(text, href) {
    const a = document.createElement("a");
    a.className = "button outline";
    a.textContent = text;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    shareBox.appendChild(a);
  }

  makeLink(
    "Facebook",
    "https://www.facebook.com/sharer/sharer.php?u=" +
      encodeURIComponent(url)
  );

  makeLink(
    "WhatsApp",
    "https://wa.me/?text=" +
      encodeURIComponent(title + "\n" + url)
  );

  makeLink(
    "Twitter / X",
    "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(title) +
      "&url=" + encodeURIComponent(url)
  );

  const share = document.createElement("button");
  share.type = "button";
  share.className = "button";
  share.textContent = "আরও শেয়ার";

  share.addEventListener("click", async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: title,
          url
        });
      } else {
        await copyLink(url);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        await copyLink(url);
      }
    }
  });

  shareBox.appendChild(share);
  card.appendChild(shareBox);
}


// প্রকাশিত সংবাদ লোড
async function loadNews() {
  const list = document.querySelector("#newsList");
  if (!list) return;

  if (!db) {
    list.textContent = "Supabase সেটিংস যাচাই করুন।";
    return;
  }

  list.textContent = "সংবাদ লোড হচ্ছে...";

  const { data, error } = await db
    .from("news")
    .select("id,title,body,author,image_url,video_url,created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    list.textContent = "সংবাদ লোড করা যায়নি: " + error.message;
    return;
  }

  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.textContent = "এখনো কোনো সংবাদ প্রকাশিত হয়নি।";
    return;
  }

  for (const n of data) {
    const card = document.createElement("article");
    card.className = "news-card";
    card.id = "news-" + n.id;

    const h = document.createElement("h3");
    h.textContent = n.title || "শিরোনাম নেই";
    card.appendChild(h);

    // শিরোনামের নিচে ছবি
    if (n.image_url) {
      const im = document.createElement("img");
      im.src = n.image_url;
      im.alt = n.title || "সংবাদের ছবি";
      im.loading = "lazy";
      im.onerror = () => {
        im.alt = "ছবিটি লোড করা যায়নি";
        im.style.display = "none";
      };
      card.appendChild(im);
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
        frame.style.cssText = "display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:12px 0;";
        card.appendChild(frame);
      }
    }

    const p = document.createElement("p");
    const body = String(n.body || "");
    p.textContent = body.length > 1000
      ? body.slice(0, 1000) + "…"
      : body;

    const meta = document.createElement("small");
    meta.textContent =
      "প্রতিবেদক: " + (n.author || "অজানা") +
      " · " +
      new Date(n.created_at).toLocaleString("bn-BD");

    card.append(p, meta);

    addShareButtons(card, n);
    list.appendChild(card);
  }

  if (location.hash.startsWith("#news-")) {
    const target = document.getElementById(
      decodeURIComponent(location.hash.slice(1))
    );

    if (target) target.scrollIntoView();
  }
}


// ছবি আপলোড
async function uploadNewsImage(file) {
  if (!file) return "";

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

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

  const fileName =
    Date.now() + "-" +
    Math.random().toString(36).slice(2) +
    "." + extension;

  const { data, error } = await db.storage
    .from("news-images")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) {
    throw new Error("ছবি আপলোড হয়নি: " + error.message);
  }

  const { data: publicData } = db.storage
    .from("news-images")
    .getPublicUrl(data.path);

  return publicData.publicUrl;
}


// নিউজ জমা
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!db) {
      message(msg, "Supabase সেটিংস যাচাই করুন।", "error");
      return;
    }

    const d = Object.fromEntries(new FormData(form));
    const fileInput = document.querySelector("#imageFile");
    const file = fileInput?.files?.[0] || null;
    const btn = form.querySelector('button[type="submit"]');

    if (btn) btn.disabled = true;

    try {
      let imageUrl = "";

      if (file) {
        message(msg, "ছবি আপলোড হচ্ছে, অপেক্ষা করুন...");
        imageUrl = await uploadNewsImage(file);
      }

      message(msg, "নিউজ জমা হচ্ছে...");

      const { data, error } = await db.rpc("submit_news", {
        p_title: d.title,
        p_body: d.body,
        p_author: d.author,
        p_phone: d.phone || "",
        p_image_url: imageUrl
      });

      if (error) {
        throw new Error("নিউজ জমা হয়নি: " + error.message);
      }

      message(
        msg,
        data?.message ||
          "নিউজ জমা হয়েছে। অ্যাডমিন অনুমোদনের পর প্রকাশিত হবে।",
        "success"
      );

      form.reset();

    } catch (error) {
      message(msg, error.message, "error");

    } finally {
      if (btn) btn.disabled = false;
    }
  });
}


// রিফ্রেশ
const refresh = document.querySelector("#refresh");

if (refresh) {
  refresh.addEventListener("click", loadNews);
}

loadNews();
