# সত্যের সন্ধানে সব সময় — Cloudflare Pages + Supabase (ফ্রি স্টার্টার)

এই সংস্করণটি static website + Supabase database/auth ব্যবহার করে। ZIP ফাইলটি সরাসরি ইন্টারনেটে লাইভ নয়; নিচের সেটআপ শেষ করলে লাইভ হবে।

## অংশ ১: Supabase (ডেটাবেস ও অ্যাডমিন লগইন)
1. https://supabase.com/ এ গিয়ে ফ্রি অ্যাকাউন্ট খুলুন এবং New project তৈরি করুন।
2. শক্তিশালী Database Password দিন এবং নিরাপদে রাখুন।
3. Project তৈরি হলে **SQL Editor → New query** খুলুন।
4. এই ZIP-এর `supabase-schema.sql` ফাইলের সম্পূর্ণ কোড কপি করে SQL Editor-এ paste করে **Run** চাপুন।
5. **Project Settings → API** (কিছু ড্যাশবোর্ডে Connect/API Keys) থেকে Project URL এবং `anon`/publishable public key কপি করুন।
6. `config.js` ফাইলে `SUPABASE_URL` ও `SUPABASE_ANON_KEY`-এর placeholder বদলে নিজের মান বসান। `service_role` বা `secret` key কখনো ওয়েবসাইটে দেবেন না।

### নিজের অ্যাডমিন অ্যাকাউন্ট তৈরি ও অনুমোদন
1. Supabase Dashboard → Authentication → Users → Add user → Create new user নির্বাচন করুন।
2. নিজের ইমেইল ও শক্তিশালী পাসওয়ার্ড দিয়ে অ্যাকাউন্ট তৈরি করুন। ইমেইল কনফার্মেশন চালু থাকলে সেটি সম্পন্ন করুন।
3. Authentication → Users তালিকা থেকে ওই ব্যবহারকারীর UUID কপি করুন।
4. SQL Editor-এ এই SQL চালান (UUID এবং ইমেইল নিজেরটি দিয়ে বদলান):
```sql
insert into public.portal_admins(user_id)
select id from auth.users where email = 'আপনার-ইমেইল@example.com'
on conflict (user_id) do nothing;
```
5. `admin.html` পেজে ওই ইমেইল-পাসওয়ার্ড দিয়ে লগইন করুন। Admin role না থাকলে কেউ নিউজ অনুমোদন বা ডিলিট করতে পারবে না।

## অংশ ২: Cloudflare Pages-এ ফ্রি প্রকাশ
1. https://dash.cloudflare.com/ এ ফ্রি অ্যাকাউন্ট খুলুন।
2. GitHub-এ নতুন **Private repository** তৈরি করে এই ZIP-এর ফাইলগুলো extract করে repository-তে upload/commit করুন। `config.js`-এ Supabase URL ও public anon key বসানো থাকতে হবে।
3. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** নির্বাচন করুন।
4. GitHub account connect করে repository বাছুন।
5. Framework preset: **None**; Build command ফাঁকা রাখুন; Build output directory হিসেবে `/` বা `.` দিন (ড্যাশবোর্ড যে root-directory output নেয় সেটি)।
6. Deploy চাপুন। Cloudflare একটি `*.pages.dev` ঠিকানা দেবে। ওই লিংক মোবাইল ও কম্পিউটার—দুই জায়গা থেকেই খুলবে।
7. ভবিষ্যতে GitHub-এ পরিবর্তন push করলে Cloudflare স্বয়ংক্রিয়ভাবে নতুন deploy করবে।

## ব্যবহার
- মূল ওয়েবসাইট: আপনার Cloudflare `pages.dev` ঠিকানা।
- অ্যাডমিন: একই ঠিকানার শেষে `/admin.html`।
- যে কেউ মূল সাইটের ফর্ম দিয়ে নিউজ জমা দিতে পারবে।
- জমা নিউজ `pending`; অ্যাডমিন লগইন করে অনুমোদন দিলে প্রকাশিত হবে।
- অ্যাডমিন বাতিল বা স্থায়ীভাবে ডিলিট করতে পারবেন।

## কপি নিউজ শনাক্তকরণ কীভাবে কাজ করে
ডেটাবেসে আগের ৯০ দিনের শিরোনাম+বিস্তারিত টেক্সটের সঙ্গে নতুন লেখার মিল পরীক্ষা করা হয়। হুবহু মিল বা ৮২%+ trigram similarity হলে জমা আটকে যায়। এটি শতভাগ plagiarism detector নয়: একই ঘটনার আলাদা রিপোর্ট ভুলভাবে আটকে যেতে পারে; শব্দ বদলে কপি করা লেখা ধরা নাও পড়তে পারে। প্রয়োজনে অ্যাডমিনকে নিজে যাচাই করতে হবে।

## ফ্রি প্ল্যান ও সীমাবদ্ধতা
- Cloudflare Pages ও Supabase-এর free tier-এর সীমা/শর্ত পরিবর্তিত হতে পারে; ড্যাশবোর্ডে বর্তমান usage দেখুন।
- Supabase Free project দীর্ঘদিন নিষ্ক্রিয় থাকলে pause হতে পারে; Free tier-এ ব্যাকআপ ও SLA সীমিত।
- নিজস্ব domain ঐচ্ছিক; Cloudflare-এর `pages.dev` ঠিকানা বিনামূল্যে পাওয়া যায়।
- এই starter-এ CAPTCHA, rate limiting, সাংবাদিকদের আলাদা account, ছবি আপলোড, রিপোর্ট/অভিযোগ, নীতিমালা ও privacy page এখনো নেই। বড় পরিসরে চালুর আগে এগুলো যোগ করা উচিত।
- Supabase anon/public key browser-এ থাকা স্বাভাবিক; ডেটা সুরক্ষা RLS policy ও RPC function দিয়ে করা হয়েছে। কখনো service_role/secret key browser-এ দেবেন না।
