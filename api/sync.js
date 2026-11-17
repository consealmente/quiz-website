const { createHash, timingSafeEqual } = require('node:crypto');
function sameSecret(attempt,expected) {
  if (typeof attempt !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a=createHash('sha256').update(attempt,'utf8').digest();
  const b=createHash('sha256').update(expected,'utf8').digest();
  return timingSafeEqual(a,b);
}
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET' && req.method!=='PUT') return res.status(405).json({error:'Method not allowed'});
  const code=req.headers['x-sync-code'];
  if(!process.env.QUIZ_SYNC_CODE) return res.status(503).json({error:'Cloud sync is being configured'});
  if(!sameSecret(code,process.env.QUIZ_SYNC_CODE)) return res.status(401).json({error:'Incorrect pairing code'});
  const target=process.env.SUPABASE_EDGE_SYNC_URL;
  if(!target) return res.status(503).json({error:'Cloud sync is being configured'});
  let url;
  try {
    url=new URL(target);
    if(url.protocol!=='https:' || !url.hostname.endsWith('.supabase.co') || url.pathname!=='/functions/v1/quiz-sync-personal')
      throw new Error('Invalid endpoint');
  } catch { return res.status(503).json({error:'Cloud sync configuration is invalid'}); }
  try {
    const r=await fetch(url,{method:req.method,headers:{'x-sync-code':code,'Content-Type':'application/json','Accept':'application/json'},
      body:req.method==='PUT'?JSON.stringify(req.body):undefined,signal:AbortSignal.timeout(12000)});
    const text=await r.text();
    res.status(r.status).setHeader('Content-Type','application/json').send(text);
  } catch {
    res.status(503).json({error:'Cloud sync is temporarily unavailable. Your local answers are safe.'});
  }
};