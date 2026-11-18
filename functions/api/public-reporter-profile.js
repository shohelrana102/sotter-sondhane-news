export async function onRequest({request,env}){
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=60"}});
 if(request.method!=="GET")return reply({error:"শুধু GET গ্রহণযোগ্য।"},405);
 try{
  const id=new URL(request.url).searchParams.get("id");
  if(!id)return reply({error:"সাংবাদিকের আইডি পাওয়া যায়নি।"},400);
  const url=env.SUPABASE_URL,service=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!service)return reply({error:"সার্ভার সেটিংস পাওয়া যায়নি।"},500);
  const headers={apikey:service,Authorization:"Bearer "+service};
  const r=await fetch(url+"/rest/v1/portal_reporters?user_id=eq."+encodeURIComponent(id)+"&active=eq.true&select=full_name,email,phone,address,reporter_post,photo_url",{headers});
  if(!r.ok)return reply({error:"সাংবাদিকের তথ্য পাওয়া যায়নি।"},404);
  const rows=await r.json();
  if(!rows.length)return reply({error:"সাংবাদিকের প্রোফাইল পাওয়া যায়নি।"},404);
  return reply({ok:true,profile:rows[0]});
 }catch(e){return reply({error:"সার্ভারে সমস্যা হয়েছে।"},500);}
}