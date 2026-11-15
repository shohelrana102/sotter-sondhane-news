
const cfg=window.PORTAL_CONFIG||{};
const ready=cfg.SUPABASE_URL?.startsWith("https://") && cfg.SUPABASE_ANON_KEY?.length>30 && !cfg.SUPABASE_URL.includes("PASTE_");
const db=ready?supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const form=document.querySelector("#submitForm");
const msg=document.querySelector("#formMsg");

document.querySelector("#year").textContent=new Date().getFullYear();

function message(el,text,kind=""){
 el.textContent=text;
 el.className=kind;
}

async function loadNews(){
 const list=document.querySelector("#newsList");

 if(!db){
  list.innerHTML='<p class="notice">প্রথমে config.js ফাইলে Supabase URL ও anon key বসাতে হবে।</p>';
  return;
 }

 const {data,error}=await db.from("news")
  .select("id,title,body,author,image_url,created_at")
  .eq("status","approved")
  .order("created_at",{ascending:false})
  .limit(60);

   if(error){
  message(msg,"নিউজ জমা হয়নি: "+error.message,"error");
  return;
 }

 message(msg,data?.message||"নিউজ জমা হয়েছে। অ্যাডমিন অনুমোদনের পর প্রকাশিত হবে।","success");
 form.reset();
});
});

document.querySelector("#refresh").addEventListener("click",loadNews);

loadNews();
