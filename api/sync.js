module.exports=async function handler(req,res) {
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET' && req.method!=='PUT') return res.status(405).json({error:'Method not allowed'});
 // The browser needs no account, pairing code, or credentials. The server forwards
 // the private service-to-service code, which is never included in the HTML.
 const code=process.env.QUIZ_SYNC_CODE;
 const target=process.env.SUPABASE_EDGE_SYNC_URL;
 if(!code||!target) return res.status(503).json({error:'Cloud sync is being configured'});
 let url;
 try {
  url=new URL(target);
  if(url.protocol!=='https:' || !url.hostname.endsWith('.supabase.co') || url.pathname!=='/functions/v1/quiz-sync-personal')
   throw new Error('Invalid endpoint');
 } catch {return res.status(503).json({error:'Cloud sync configuration is invalid'});}
 try {
  const r=await fetch(url,{method:req.method,headers:{'x-sync-code':code,'Content-Type':'application/json','Accept':'application/json'},
   body:req.method==='PUT'?JSON.stringify(req.body):undefined,signal:AbortSignal.timeout(12000)});
  const responseText=await r.text();
  res.status(r.status).setHeader('Content-Type','application/json').send(responseText);
 }catch{
  res.status(503).json({error:'Cloud sync is temporarily unavailable. Your local answers are safe.'});
 }
};