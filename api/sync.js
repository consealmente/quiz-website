const { createHash, timingSafeEqual } = require('node:crypto');
function send(res,status,object){res.status(status).json(object);}
function sameSecret(attempt,expected){
 if(typeof attempt!=='string'||typeof expected!=='string'||!expected)return false;
 const a=createHash('sha256').update(attempt,'utf8').digest();
 const b=createHash('sha256').update(expected,'utf8').digest();
 return timingSafeEqual(a,b);
}
function validState(s){
 return s&&typeof s==='object'&&!Array.isArray(s)&&s.version===5&&
 Array.isArray(s.attempts)&&s.attempts.length<=1000&&s.attempts.length>0&&
 typeof s.activeId==='string'&&s.attempts.some(a=>a?.id===s.activeId)&&
 s.attempts.every(a=>a&&typeof a.id==='string'&&Array.isArray(a.questionIds)&&a.questionIds.length<=80&&a.questionIds.every(n=>Number.isInteger(n)&&n>=1&&n<=80)&&a.answers&&typeof a.answers==='object'&&!Array.isArray(a.answers));
}
module.exports = async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'&&req.method!=='PUT')return send(res,405,{error:'Method not allowed'});
 const expected=process.env.QUIZ_SYNC_CODE;
 if(!expected)return send(res,503,{error:'Sync service is being configured'});
 if(!sameSecret(req.headers['x-sync-code'],expected))return send(res,401,{error:'Incorrect pairing code'});
 const rawUrl=process.env.SUPABASE_URL;
 const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!rawUrl||!serviceKey)return send(res,503,{error:'Supabase has not been connected yet'});
 let base;
 try{base=new URL(rawUrl);if(base.protocol!=='https:')throw Error('Invalid URL');}catch(e){return send(res,503,{error:'Supabase configuration is invalid'});}
 const path=base.origin+'/rest/v1/quiz_sync';
 const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',Accept:'application/json'};
 async function call(method,url,body,moreHeaders={}){
  const response=await fetch(url,{method,headers:{...headers,...moreHeaders},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(9000)});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch(e){data=null;}
  return {ok:response.ok,status:response.status,data};
 }
 try{
  const filter=path+'?id=eq.personal&select=state,revision';
  if(req.method==='GET'){
   const result=await call('GET',filter);
   if(!result.ok)throw Error('Database read failed: '+result.status);
   return send(res,200,result.data?.[0]||{state:null,revision:0});
  }
  const incoming=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!incoming||!Number.isSafeInteger(incoming.revision)||incoming.revision<0||!validState(incoming.state))return send(res,400,{error:'Invalid quiz state'});
  const rawState=JSON.stringify(incoming.state);
  if(Buffer.byteLength(rawState,'utf8')>950000)return send(res,413,{error:'Quiz history is too large for sync'});
  let result;
  if(incoming.revision===0){
   result=await call('POST',path,{id:'personal',state:incoming.state,revision:1},{Prefer:'return=representation'});
   if(result.status===409)return send(res,409,{error:'Another device created the record. Refresh and retry.'});
  }else{
   const updateUrl=path+'?id=eq.personal&revision=eq.'+incoming.revision+'&select=revision';
   result=await call('PATCH',updateUrl,{state:incoming.state,revision:incoming.revision+1,updated_at:new Date().toISOString()},{Prefer:'return=representation'});
   if(result.ok&&(!Array.isArray(result.data)||result.data.length===0))return send(res,409,{error:'Another device saved newer progress. Refresh and retry.'});
  }
  if(!result.ok)throw Error('Database write failed: '+result.status);
  return send(res,200,{revision:result.data?.[0]?.revision??incoming.revision+1});
 }catch(err){return send(res,503,{error:'Cloud database unavailable. Your local answers are safe.'});}
};