export async function onRequest({request,env}){
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(!["GET","POST"].includes(request.method))return reply({error:"অনুরোধ গ্রহণযোগ্য নয়।"},405);
 try{
  const url=env.SUPABASE_URL,service=env.SUPABASE_SERVICE_ROLE_KEY,anon=env.SUPABASE_ANON_KEY;
  const auth=request.headers.get("Authorization")||"";
  if(!url||!service||!anon||!auth.startsWith("Bearer "))return reply({error:"সাংবাদিক হিসেবে লগইন করুন।"},401);
  const userRes=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:auth}});
  if(!userRes.ok)return reply({error:"লগইন যাচাই হয়নি।"},401);
  const user=await userRes.json();
  const headers={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
  const profileRes=await fetch(url+"/rest/v1/portal_reporters?user_id=eq."+encodeURIComponent(user.id)+"&active=eq.true&select=user_id,full_name,email,phone,address,reporter_post,photo_url,active", {headers});
  if(!profileRes.ok)return reply({error:"সাংবাদিকের তথ্য পাওয়া যায়নি।"},500);
  const rows=await profileRes.json(),profile=rows[0];
  if(!profile)return reply({error:"আপনার সাংবাদিক অনুমোদন সক্রিয় নেই। অ্যাডমিনের সঙ্গে যোগাযোগ করুন।"},403);
  if(request.method==="GET"){
   const nr=await fetch(url+"/rest/v1/news?reporter_id=eq."+encodeURIComponent(user.id)+"&select=id,title,body,status,created_at&order=created_at.desc&limit=50",{headers});
   if(!nr.ok)return reply({error:"আপনার সংবাদ তালিকা লোড হয়নি।"},500);
   return reply({ok:true,profile,news:await nr.json()});
  }
  const input=await request.json();
  const title=typeof input.title==="string"?input.title.trim():"";
  const body=typeof input.body==="string"?input.body.trim():"";
  const image_url=typeof input.image_url==="string"?input.image_url.trim():"";
  const video_url=typeof input.video_url==="string"?input.video_url.trim():"";
  if(title.length<5||title.length>180||body.length<20||body.length>12000)return reply({error:"শিরোনাম ও বিস্তারিত সঠিকভাবে লিখুন।"},400);
  if(image_url&&!/^https:\/\//i.test(image_url))return reply({error:"ছবির লিংক https:// দিয়ে শুরু হতে হবে।"},400);
  if(video_url&&!/^https:\/\//i.test(video_url))return reply({error:"ভিডিওর লিংক https:// দিয়ে শুরু হতে হবে।"},400);
  const insert=await fetch(url+"/rest/v1/news",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({title,body,author:profile.full_name,phone:profile.phone||"",image_url,video_url,status:"pending",reporter_id:user.id})});
  if(!insert.ok)return reply({error:"সংবাদ জমা হয়নি। ডাটাবেজের নতুন SQL migration চালানো হয়েছে কি না দেখুন।"},400);
  return reply({ok:true,message:"সংবাদ জমা হয়েছে।"});
 }catch(e){return reply({error:"সার্ভারে সমস্যা হয়েছে।"},500);}
}