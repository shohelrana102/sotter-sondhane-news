
const cfg=window.PORTAL_CONFIG||{};
const ready=cfg.SUPABASE_URL?.startsWith("https://") && cfg.SUPABASE_ANON_KEY?.length>30 && !cfg.SUPABASE_URL.includes("PASTE_");
const db=ready?supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const form=document.querySelector("#submitForm"), msg=document.querySelector("#formMsg");
document.querySelector("#year").textContent=new Date().getFullYear();

function message(el,text,kind=""){el.textContent=text;el.className=kind;}

async function loadNews(){
 const list=document.querySelector("#newsList");
 if(!db){list.innerHTML='<p class="notice">প্রথমে config.js ফাইলে Supabase URL ও anon key বসাতে হবে। README-BN.md দেখুন।</p>';return;}
 const {data,error}=await db.from("news").select("id,title,body,author,image_url,created_at").eq("status","approved").order("created_at",{ascending:false}).limit(60);
 if(error){list.textContent="সংবাদ লোড করা যায়নি। Supabase সেটিংস যাচাই করুন।";return;}
 list.innerHTML="";
 if(!data.length){list.innerHTML="<p>এখনো কোনো সংবাদ প্রকাশিত হয়নি।</p>";return;}

 for(const n of data){
  const card=document.createElement("article");
  card.className="news-card";
  card.id="news-"+n.id;

  if(n.image_url){
   const im=document.createElement("img");
   im.src=n.image_url;
   im.alt="সংবাদের ছবি";
   im.loading="lazy";
   im.referrerPolicy="no-referrer";
   im.onerror=()=>im.remove();
   card.append(im);
  }

  const h=document.createElement("h3");
  h.textContent=n.title;

  const p=document.createElement("p");
  p.textContent=n.body.length>480?n.body.slice(0,480)+"…":n.body;

  const meta=document.createElement("small");
  meta.textContent=`প্রতিবেদক: ${n.author} · ${new Date(n.created_at).toLocaleString("bn-BD")}`;

  const share=document.createElement("button");
  share.type="button";
  share.className="button outline share-button";
  share.textContent="↗ শেয়ার করুন";
  share.style.display="block";
  share.style.marginTop="14px";

  share.addEventListener("click",async()=>{
   const url=window.location.origin+window.location.pathname+"#news-"+n.id;
   const shareData={
    title:n.title,
    text:n.title+"\n\n"+n.body.slice(0,220)+(n.body.length>220?"…":""),
    url:url
   };

   if(navigator.share){
    try{
     await navigator.share(shareData);
    }catch(error){
     if(error.name!=="AbortError"){
      alert("শেয়ার করা যায়নি। আবার চেষ্টা করুন।");
     }
    }
   }else{
    try{
     await navigator.clipboard.writeText(url);
     alert("সংবাদের লিংক কপি হয়েছে। এখন Facebook বা WhatsApp-এ পেস্ট করুন।");
    }catch(error){
     window.prompt("সংবাদের লিংক কপি করুন:",url);
    }
   }
  });

  card.append(h,p,meta,share);
  list.append(card);
 }

 if(location.hash.startsWith("#news-")){
  const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if(target) target.scrollIntoView({behavior:"smooth",block:"start"});
 }
}

form.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!db){message(msg,"সাইট সেটআপ সম্পূর্ণ হয়নি। config.js যাচাই করুন।","error");return;}
 const d=Object.fromEntries(new FormData(form));
 const btn=form.querySelector("button");
 btn.disabled=true;
 message(msg,"নিউজ জমা হচ্ছে…");
 const {data,error}=await db.rpc("submit_news",{p_title:d.title,p_body:d.body,p_author:d.author,p_phone:d.phone||"",p_image_url:d.image_url||""});
 btn.disabled=false;
 if(error){
  message(msg,error.message.includes("duplicate")?"সম্ভাব্য কপি নিউজ শনাক্ত হয়েছে; জমা নেওয়া হয়নি।":"নিউজ জমা হয়নি: "+error.message,"error");
  return;
 }
 message(msg,data?.message||"নিউজ জমা হয়েছে। অ্যাডমিন অনুমোদনের পর প্রকাশিত হবে।","success");
 form.reset();
});

document.querySelector("#refresh").addEventListener("click",loadNews);
loadNews();
