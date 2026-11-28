const crypto=require('node:crypto'),{promisify}=require('node:util'),scrypt=promisify(crypto.scrypt);
const COOKIE='studio_session_v3',fail=(status,message)=>Object.assign(new Error(message),{status});
function cfg(){const token=process.env.STUDIO_BACKEND_TOKEN,url=process.env.STUDIO_BACKEND_URL;if(!token||!url)throw fail(503,'Account database is not connected.');return {token,url};}
async function db(op,args={}){const {token,url}=cfg(),r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Backend':token},body:JSON.stringify({op,...args}),signal:AbortSignal.timeout(15000)});let d;try{d=await r.json();}catch{}if(!r.ok)throw fail(r.status===409?409:503,r.status===409?'Concurrent change; retry.':'Account database temporarily unavailable.');return d;}
function username(v){return typeof v==='string'?v.trim().toLowerCase():'';}
function validUser(v){return /^[a-z0-9_]{3,32}$/.test(v);}
function validPassword(v){return typeof v==='string'&&v.length>=10&&v.length<=128;}
async function passwordHash(p,s){return (await scrypt(p,s,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}
function same(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function key(){return crypto.createHmac('sha256',cfg().token).update('study-studio/session/v3').digest();}
function sign(id,version){const data=Buffer.from(JSON.stringify({id,version,exp:Date.now()+7*86400000})).toString('base64url');return data+'.'+crypto.createHmac('sha256',key()).update(data).digest('base64url');}
function session(req){try{const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));if(!cookie)return null;const [data,sig]=cookie.slice(COOKIE.length+1).split('.');if(!data||!sig||!same(sig,crypto.createHmac('sha256',key()).update(data).digest('base64url')))return null;const p=JSON.parse(Buffer.from(data,'base64url').toString());return typeof p.id==='string'&&Number.isInteger(p.version)&&p.exp>Date.now()?p:null;}catch{return null;}}
function setSession(res,id,version){res.setHeader('Set-Cookie',COOKIE+'='+sign(id,version)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800');}
function logout(res){res.setHeader('Set-Cookie',COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');}
function guard(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.origin;if(origin){try{if(new URL(origin).host!==req.headers.host)throw Error();}catch{throw fail(403,'Cross-site request rejected.');}}}}
function payload(req){let p=req.body;if(typeof p==='string')try{p=JSON.parse(p);}catch{throw fail(400,'Invalid JSON.');}if(!p||typeof p!=='object'||Array.isArray(p))throw fail(400,'Invalid request.');return p;}

function publicUser(u){return {id:u.id,username:u.username,role:u.role==='admin'?'admin':'user',status:u.status==='suspended'?'suspended':'active',createdAt:u.created_at,lockedUntil:u.locked_until||''};}
async function authorize(req){const p=session(req);if(!p)throw fail(401,'Sign in to access your account.');const u=(await db('find_id',{id:p.id}))[0];if(!u||u.session_version!==p.version)throw fail(401,'Session expired. Sign in again.');if(u.status==='suspended')throw fail(403,'This account is suspended.');return u;}
async function handleAuth(req,res){guard(req,res);
 if(req.method==='GET'){let configured=false;try{await db('health');configured=true;}catch{}let user=null;if(configured&&session(req)){try{user=publicUser(await authorize(req));}catch{logout(res);}}return res.status(200).json({user,configured});}
 if(req.method!=='POST')throw fail(405,'Method not allowed');
 const p=payload(req);if(p.action==='logout'){logout(res);return res.status(200).json({ok:true});}
 if(!['register','login'].includes(p.action))throw fail(400,'Invalid action.');
 const name=username(p.username);if(!validUser(name)||!validPassword(p.password))throw fail(400,'Use 3–32 letters, numbers or underscores and a password of 10–128 characters.');
 let u=(await db('find_name',{name}))[0];
 if(p.action==='register'){if(name==='admin'||u)throw fail(409,'Username is unavailable.');const salt=crypto.randomBytes(24).toString('hex'),hash=await passwordHash(p.password,salt);try{u=(await db('register',{name,salt,hash}))[0];}catch(e){if(e.status===409)throw fail(409,'Username is unavailable.');throw e;}if(!u)throw fail(503,'Unable to create account.');setSession(res,u.id,u.session_version);return res.status(201).json({user:publicUser(u)});}
 if(!u){await passwordHash(p.password,'0'.repeat(48));throw fail(401,'Incorrect username or password.');}
 if(Date.parse(u.locked_until||'')>Date.now())throw fail(429,'Too many attempts. Try again in 15 minutes.');
 const hash=await passwordHash(p.password,u.password_salt);
 if(!same(hash,u.password_hash)){const n=(Number(u.failed_attempts)||0)+1;await db('login_attempt',{id:u.id,failed:n>=5?0:n,locked:n>=5?new Date(Date.now()+900000).toISOString():null});throw fail(401,'Incorrect username or password.');}
 if(u.status==='suspended')throw fail(403,'This account is suspended.');
 await db('login_attempt',{id:u.id,failed:0,locked:null});setSession(res,u.id,u.session_version);return res.status(200).json({user:publicUser(u)});
}
function validState(s){return s&&s.version===5&&typeof s.activeId==='string'&&Array.isArray(s.attempts)&&s.attempts.length>0&&s.attempts.length<=200&&s.attempts.some(a=>a?.id===s.activeId)&&s.attempts.every(a=>a&&typeof a.id==='string'&&a.id.length<=100&&['full','retry','topic'].includes(a.mode)&&Array.isArray(a.questionIds)&&a.questionIds.length>0&&a.questionIds.length<=80&&new Set(a.questionIds).size===a.questionIds.length&&a.questionIds.every(n=>Number.isInteger(n)&&n>=1&&n<=80)&&Number.isInteger(a.position)&&a.position>=0&&a.position<=a.questionIds.length&&a.answers&&typeof a.answers==='object'&&!Array.isArray(a.answers)&&Object.entries(a.answers).every(([n,r])=>a.questionIds.includes(Number(n))&&r&&Number.isInteger(r.selected)&&r.selected>=0&&r.selected<=3&&typeof r.answeredAt==='string'));}

function merge(remote,incoming){if(!remote)return incoming;const map=new Map(remote.attempts.map(a=>[a.id,a]));for(const a of incoming.attempts){const old=map.get(a.id);if(!old){map.set(a.id,a);continue;}const answers={...old.answers};for(const [n,r] of Object.entries(a.answers)){if(!answers[n]||String(r.answeredAt)<String(answers[n].answeredAt))answers[n]=r;}map.set(a.id,{...old,answers,position:Math.max(old.position,a.position),completedAt:old.completedAt||a.completedAt});}const attempts=[...map.values()].sort((a,b)=>String(a.startedAt).localeCompare(String(b.startedAt))).slice(-200);return {...incoming,attempts,activeId:attempts.some(a=>a.id===incoming.activeId)?incoming.activeId:attempts.at(-1).id};}

async function handleSync(req,res){guard(req,res);if(!['GET','PUT'].includes(req.method))throw fail(405,'Method not allowed');const u=await authorize(req),row=(await db('progress',{id:u.id}))[0],old=row?{revision:row.revision,generation:row.generation,state:row.state}:{revision:0,generation:0,state:null};
 if(req.method==='GET')return res.status(200).json(old);
 const p=payload(req);if(p.generation!==old.generation||p.revision!==old.revision)return res.status(409).json({error:'Progress changed on another device. Refresh and retry.',...old});if(!validState(p.state))throw fail(400,'Invalid quiz progress.');const state=p.reset===true?p.state:merge(old.state,p.state);if(JSON.stringify(state).length>320000)throw fail(413,'Quiz history exceeds the storage limit.');
 const saved=await db('save_progress',{id:u.id,revision:old.revision,generation:old.generation,state,reset:p.reset===true,insert:!row});
 if(!saved?.length)throw fail(409,'Progress changed on another device. Refresh and retry.');
 return res.status(200).json({revision:saved[0].revision,generation:saved[0].generation,state:saved[0].state});
}
async function handleAdmin(req,res){guard(req,res);const actor=await authorize(req);if(actor.role!=='admin')throw fail(403,'Administrator access required.');
 if(req.method==='GET'){const [users,progress,audit]=await Promise.all([db('admin_users'),db('admin_progress'),db('admin_audit')]);const byId=new Map(progress.map(x=>[x.user_id,x.state]));return res.status(200).json({users:users.map(u=>{const a=byId.get(u.id)?.attempts||[];return {...publicUser(u),attempts:a.filter(x=>Object.keys(x.answers||{}).length>0).length,answered:a.reduce((n,x)=>n+Object.keys(x.answers||{}).length,0)};}),audit});}
 if(req.method!=='POST')throw fail(405,'Method not allowed');const p=payload(req);if(!['suspend','reactivate','unlock','reset_progress','revoke_sessions'].includes(p.action)||typeof p.userId!=='string'||!(/^[a-f0-9-]{36}$/).test(p.userId))throw fail(400,'Invalid administrative action.');
 const ok=await db('admin_action',{id:p.userId,actor:actor.id,action:p.action});if(ok!==true)throw fail(403,'Action not allowed. Administrator accounts are owner-managed.');return res.status(200).json({ok:true});
}
function handler(fn){return async(req,res)=>{try{return await fn(req,res);}catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Account database temporarily unavailable.'});}};}
module.exports={auth:handler(handleAuth),sync:handler(handleSync),admin:handler(handleAdmin),validState,merge,validUser,validPassword};
