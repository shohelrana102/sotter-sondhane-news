export async function onRequest({request,env}){
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(!["GET","POST"].includes(request.method))return reply({error:"অনুরোধ গ্রহণযোগ্য নয়।"},405);
 try{
  const url=env.SUPABASE_URL || "https://juitlxjvqzmuzumlphos.supabase.co",service=env.SUPABASE_SERVICE_ROLE_KEY,anon=request.headers.get("apikey") || env.SUPABASE_ANON_KEY;
  const auth=request.headers.get("Authorization")||"";
  if(!url||!service||!anon||!auth.startsWith("Bearer "))return reply({error:"সাংবাদিক হিসেবে লগইন করুন।"},401);
  const userRes=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:auth}});
  if(!userRes.ok)return reply({error:"লগইন যাচাই হয়নি।"},401);
  const user=await userRes.json();
  const headers={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
  const profileRes=await fetch(url+"/rest/v1/portal_reporters?user_id=eq."+encodeURIComponent(user.id)+"&active=eq.true&select=user_id,full_name,email,phone,address,reporter_post,photo_url,active,can_submit",{headers});
  if(!profileRes.ok)return reply({error:"সাংবাদিকের তথ্য পাওয়া যায়নি।"},500);
  const rows=await profileRes.json(),profile=rows[0];
  if(!profile)return reply({error:"আপনার সাংবাদিক অনুমোদন সক্রিয় নেই। অ্যাডমিনের সঙ্গে যোগাযোগ করুন।"},403);
  if(request.method==="POST" && !["update_profile"].includes((await request.clone().json().catch(()=>({}))).action) && profile.can_submit===false)return reply({error:"অ্যাডমিন সাময়িকভাবে আপনার সংবাদ জমা বন্ধ রেখেছেন।"},403);
  if(request.method==="GET"){
   const nr=await fetch(url+"/rest/v1/news?reporter_id=eq."+encodeURIComponent(user.id)+"&select=id,title,body,status,created_at&order=created_at.desc&limit=50",{headers});
   if(!nr.ok)return reply({error:"আপনার সংবাদ তালিকা লোড হয়নি।"},500);
   return reply({ok:true,profile,news:await nr.json()});
  }
  const input=await request.json();
  if(input.action==="update_profile"){
   const photo_url=typeof input.photo_url==="string"?input.photo_url.trim():"";
   if(!/^https:\/\//i.test(photo_url))return reply({error:"সঠিক ছবির লিংক দিন।"},400);
   const update=await fetch(url+"/rest/v1/portal_reporters?user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({photo_url})});
   if(!update.ok)return reply({error:"প্রোফাইল ছবি পরিবর্তন করা যায়নি।"},500);
   return reply({ok:true,message:"প্রোফাইল ছবি পরিবর্তন হয়েছে।"});
  }
  const title=typeof input.title==="string"?input.title.trim():"";
  const body=typeof input.body==="string"?input.body.trim():"";
  let image_url=typeof input.image_url==="string"?input.image_url.trim():"";
  const imageBase64=typeof input.image_base64==="string"?input.image_base64:"";
  const imageType=typeof input.image_type==="string"?input.image_type:"";
  const video_url=typeof input.video_url==="string"?input.video_url.trim():"";
  if(!image_url&&!imageBase64)return reply({error:"সংবাদ জমা দেওয়ার জন্য ছবি আপলোড করুন অথবা ছবির https:// লিংক দিন।"},400);
  if(image_url&&!/^https:\/\//i.test(image_url))return reply({error:"ছবির লিংক https:// দিয়ে শুরু হতে হবে।"},400);
  const imageTypes={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
  if(imageBase64||imageType){
   if(!imageTypes[imageType]||imageBase64.length>7_000_000)return reply({error:"ছবির ধরন সঠিক নয় অথবা ছবিটি ৫ MB-এর বেশি।"},400);
  }
  if(title.length<5||title.length>180||body.length<20||body.length>12000)return reply({error:"শিরোনাম ও বিস্তারিত সঠিকভাবে লিখুন।"},400);
  if(video_url&&!/^https:\/\//i.test(video_url))return reply({error:"ভিডিওর লিংক https:// দিয়ে শুরু হতে হবে।"},400);

  // পুরোনো, অপেক্ষমাণ ও প্রকাশিত সংবাদে একই/খুব কাছাকাছি লেখা খোঁজা
  const oldRes=await fetch(url+"/rest/v1/news?select=title,body&order=created_at.desc&limit=1000",{headers});
  if(!oldRes.ok)return reply({error:"কপি-নিউজ যাচাই করা যাচ্ছে না। পরে আবার চেষ্টা করুন।"},503);
  const oldNews=await oldRes.json();
  const normalize=s=>String(s||"").toLocaleLowerCase("bn").normalize("NFKC").replace(/[০-৯]/g,c=>"০১২৩৪৫৬৭৮৯".indexOf(c)).replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
  const grams=s=>{const w=normalize(s).split(" ").filter(x=>x.length>1);const set=new Set();for(let i=0;i+2<w.length;i++)set.add(w.slice(i,i+3).join(" "));return set;};
  const similarity=(a,b)=>{const A=grams(a),B=grams(b);if(!A.size||!B.size)return 0;let common=0;for(const x of A)if(B.has(x))common++;return common/(A.size+B.size-common);};
  const incoming=normalize(title+" "+body);
  const incomingTitle=normalize(title);
  for(const old of oldNews){
   const previous=normalize((old.title||"")+" "+(old.body||""));
   if(!previous)continue;
   const titleMatch=incomingTitle.length>12&&normalize(old.title||"")===incomingTitle;
   const exact=incoming.length>80&&(previous.includes(incoming)||incoming.includes(previous));
   const score=similarity(title+" "+body,(old.title||"")+" "+(old.body||""));
   if(titleMatch||exact||score>=0.62){
    return reply({error:"কপি নিউজ! নিজের ভাষায় ও নিজস্ব তথ্য দিয়ে সংবাদ লিখুন। মিল পাওয়া সংবাদ জমা নেওয়া হয়নি।"},409);
   }
  }
  let uploadedImagePath="";
  if(imageBase64){
   let binary;
   try{binary=Uint8Array.from(atob(imageBase64),ch=>ch.charCodeAt(0));}catch{return reply({error:"ছবির তথ্য পড়া যায়নি। আবার ছবি নির্বাচন করুন।"},400);}
   if(!binary.length||binary.length>5*1024*1024)return reply({error:"ছবির আকার ৫ MB-এর বেশি।"},400);
   uploadedImagePath="reporter-news/"+crypto.randomUUID()+"."+imageTypes[imageType];
   const storage=await fetch(url+"/storage/v1/object/news-images/"+uploadedImagePath,{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":imageType,"x-upsert":"false"},body:binary});
   if(!storage.ok)return reply({error:"ছবি আপলোড হয়নি: "+(await storage.text()).slice(0,250)},400);
   image_url=url+"/storage/v1/object/public/news-images/"+uploadedImagePath;
  }
  const insert=await fetch(url+"/rest/v1/news",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({title,body,author:profile.full_name,phone:profile.phone||"",image_url,video_url,status:"pending",reporter_id:user.id})});
  if(!insert.ok){
   if(uploadedImagePath)await fetch(url+"/storage/v1/object/news-images/"+uploadedImagePath,{method:"DELETE",headers:{apikey:service,Authorization:"Bearer "+service}});
   return reply({error:"সংবাদ জমা হয়নি। পরে আবার চেষ্টা করুন।"},400);
  }
  return reply({ok:true,message:"সংবাদ জমা হয়েছে।"});
 }catch(e){return reply({error:"সার্ভারে সমস্যা হয়েছে।"},500);}
}