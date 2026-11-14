const cfg=window.PORTAL_CONFIG||{};
const ready=cfg.SUPABASE_URL?.startsWith("https://") && cfg.SUPABASE_ANON_KEY?.length>30 && !cfg.SUPABASE_URL.includes("PASTE_");
const db=ready?supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const loginPanel=document.querySelector("#loginPanel"),dash=document.querySelector("#dashboard"),loginMsg=document.querySelector("#loginMsg");
let currentStatus="pending";
function say(el,t,k=""){el.textContent=t;el.className=k;}
async function init(){
 if(!db){say(loginMsg,"প্রথমে config.js-এ Supabase URL ও anon key বসান।","error");return;}
 const {data:{session}}=await db.auth.getSession();if(session)await enter();
}
async function enter(){
 const {data:{user}}=await db.auth.getUser();if(!user)return;
 const {data:role,error}=await db.rpc("is_portal_admin");
 if(error||role!==true){await db.auth.signOut();say(loginMsg,"এই ইমেইল অ্যাডমিন হিসেবে অনুমোদিত নয়। Supabase SQL Editor থেকে admin role দিন।","error");return;}
 loginPanel.hidden=true;dash.hidden=false;document.querySelector("#who").textContent=user.email;loadAdmin();
}
document.querySelector("#loginForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!db)return;const d=Object.fromEntries(new FormData(e.currentTarget));
 const {error}=await db.auth.signInWithPassword({email:d.email,password:d.password});
 if(error){say(loginMsg,"লগইন হয়নি: "+error.message,"error");return;}await enter();
});
document.querySelector("#logout").addEventListener("click",async()=>{await db.auth.signOut();location.reload();});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");currentStatus=b.dataset.status;loadAdmin();}));
async function loadAdmin(){
 const box=document.querySelector("#adminNews");box.textContent="লোড হচ্ছে…";
 const {data,error}=await db.from("news").select("*").eq("status",currentStatus).order("created_at",{ascending:false});
 if(error){box.textContent="নিউজ লোড করা যায়নি: "+error.message;return;}box.innerHTML="";
 if(!data.length){box.textContent="এই তালিকায় কোনো নিউজ নেই।";return;}
 for(const n of data){
  const card=document.createElement("article");card.className="admin-card";
  const h=document.createElement("h3");h.textContent=n.title;const p=document.createElement("p");p.textContent=n.body;
  const meta=document.createElement("small");meta.textContent=`প্রতিবেদক: ${n.author} · ফোন: ${n.phone||"নেই"} · ${new Date(n.created_at).toLocaleString("bn-BD")}`;
  const actions=document.createElement("div");actions.className="actions";
  if(currentStatus!=="approved"){const approve=document.createElement("button");approve.className="button";approve.textContent="অনুমোদন ও প্রকাশ";approve.onclick=()=>updateStatus(n.id,"approved");actions.append(approve);}
  if(currentStatus!=="rejected"){const reject=document.createElement("button");reject.className="button outline";reject.textContent="বাতিল";reject.onclick=()=>updateStatus(n.id,"rejected");actions.append(reject);}
  const del=document.createElement("button");del.className="button danger";del.textContent="স্থায়ীভাবে ডিলিট";del.onclick=async()=>{if(confirm("এই নিউজ স্থায়ীভাবে মুছে ফেলবেন?")){const {error}=await db.from("news").delete().eq("id",n.id);if(error)alert(error.message);else loadAdmin();}};actions.append(del);
  card.append(h,p,meta,actions);box.append(card);
 }
}
async function updateStatus(id,status){const {error}=await db.from("news").update({status}).eq("id",id);if(error)alert(error.message);else loadAdmin();}
init();