const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");

const app = express();
const db = new Database("news.db");
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "ChangeThis-Strong-Password-Now", 12);

db.exec(`
CREATE TABLE IF NOT EXISTS news (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 author TEXT NOT NULL,
 phone TEXT DEFAULT '',
 image_url TEXT DEFAULT '',
 normalized TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(session({
 secret: process.env.SESSION_SECRET || "development-secret-change-me",
 resave: false, saveUninitialized: false,
 store: new SQLiteStore({ db: "sessions.db" }),
 cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

function normalize(s) {
 return s.toLowerCase().normalize("NFKC")
  .replace(/[০-৯]/g, c => "০১২৩৪৫৬৭৮৯".indexOf(c))
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function similarity(a,b) {
 const A = new Set(a.split(" ").filter(Boolean));
 const B = new Set(b.split(" ").filter(Boolean));
 if (!A.size || !B.size) return 0;
 let n=0; for (const x of A) if (B.has(x)) n++;
 return n / (A.size + B.size - n);
}
function findDuplicate(title, body) {
 const candidate = normalize(title + " " + body);
 const rows = db.prepare("SELECT id,title,normalized,status FROM news WHERE created_at >= datetime('now','-90 days')").all();
 for (const row of rows) {
   const score = similarity(candidate, row.normalized);
   if (candidate === row.normalized || score >= 0.82) return { row, score };
 }
 return null;
}
const insert = db.prepare(`INSERT INTO news(title,body,author,phone,image_url,normalized,status)
 VALUES(?,?,?,?,?,?,'pending')`);
const getNews = db.prepare("SELECT id,title,body,author,image_url,created_at FROM news WHERE status='approved' ORDER BY id DESC");
const getOne = db.prepare("SELECT * FROM news WHERE id=?");
function adminOnly(req,res,next) { if (!req.session.admin) return res.redirect("/admin/login"); next(); }

app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.get("/api/news", (req,res)=>res.json(getNews.all()));
app.post("/api/submit", (req,res)=>{
 const {title,body,author,phone="",image_url=""}=req.body;
 if (![title,body,author].every(x=>typeof x==="string" && x.trim()) || title.length>180 || body.length>15000 || author.length>80) {
  return res.status(400).json({error:"শিরোনাম, বিস্তারিত ও প্রতিবেদকের নাম দিন।"});
 }
 const duplicate=findDuplicate(title,body);
 if (duplicate) return res.status(409).json({error:"সম্ভাব্য কপি/ডুপ্লিকেট নিউজ শনাক্ত হয়েছে। এটি জমা নেওয়া হয়নি।", match:duplicate.row.title});
 insert.run(title.trim(),body.trim(),author.trim(),String(phone).slice(0,30),String(image_url).slice(0,500),normalize(title+" "+body));
 res.json({message:"নিউজ জমা হয়েছে। প্রকাশের আগে অ্যাডমিন অনুমোদন করবেন।"});
});

app.get("/admin/login",(req,res)=>res.sendFile(path.join(__dirname,"public","login.html")));
app.post("/admin/login",(req,res)=>{
 const {username,password}=req.body;
 if(username===ADMIN_USER && bcrypt.compareSync(password||"",ADMIN_HASH)) {
  req.session.admin=true; return res.redirect("/admin");
 }
 res.status(401).send("লগইন তথ্য সঠিক নয়। <a href='/admin/login'>আবার চেষ্টা করুন</a>");
});
app.post("/admin/logout",adminOnly,(req,res)=>req.session.destroy(()=>res.redirect("/")));
app.get("/admin",adminOnly,(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/api/admin/news",adminOnly,(req,res)=>{
 res.json(db.prepare("SELECT id,title,body,author,phone,image_url,status,created_at FROM news ORDER BY id DESC").all());
});
app.post("/api/admin/news/:id/approve",adminOnly,(req,res)=>{
 const info=db.prepare("UPDATE news SET status='approved' WHERE id=?").run(req.params.id);
 res.json({ok:info.changes>0});
});
app.delete("/api/admin/news/:id",adminOnly,(req,res)=>{
 const info=db.prepare("DELETE FROM news WHERE id=?").run(req.params.id);
 res.json({ok:info.changes>0});
});
app.post("/api/admin/news/:id/reject",adminOnly,(req,res)=>{
 const info=db.prepare("UPDATE news SET status='rejected' WHERE id=?").run(req.params.id);
 res.json({ok:info.changes>0});
});
app.listen(PORT,()=>console.log(`Portal running at http://localhost:${PORT}`));
