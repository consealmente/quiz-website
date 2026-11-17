// Personal quiz sync. No public DB table permissions; a high-entropy pairing code
// is checked before the function uses Supabase's server-side service-role key.
const EXPECTED_SHA256 = '33ef128255c1d42425fe93272abb5831eba624d846a2fc7f37fdd7daf76d8ab2';
const headers = {'Content-Type':'application/json','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};
function reply(status, data) { return new Response(JSON.stringify(data), {status, headers}); }
async function authorized(code) {
  if (!code || code.length > 256) return false;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  const actual = [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
  let diff = 0;
  for (let i=0;i<EXPECTED_SHA256.length;i++) diff |= actual.charCodeAt(i) ^ EXPECTED_SHA256.charCodeAt(i);
  return diff === 0;
}
function validState(s) {
  return s && typeof s === 'object' && !Array.isArray(s) && s.version === 5 &&
    Array.isArray(s.attempts) && s.attempts.length > 0 && s.attempts.length <= 1000 &&
    typeof s.activeId === 'string' && s.attempts.some(a => a?.id === s.activeId) &&
    s.attempts.every(a => a && typeof a.id === 'string' && Array.isArray(a.questionIds) &&
      a.questionIds.length <= 80 && a.questionIds.every(n => Number.isInteger(n) && n >= 1 && n <= 80) &&
      a.answers && typeof a.answers === 'object' && !Array.isArray(a.answers));
}
Deno.serve(async req => {
  if (req.method !== 'GET' && req.method !== 'PUT') return reply(405,{error:'Method not allowed'});
  if (!(await authorized(req.headers.get('x-sync-code')))) return reply(401,{error:'Incorrect pairing code'});
  const base = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) return reply(503,{error:'Cloud backend not configured'});
  const endpoint = base + '/rest/v1/quiz_sync';
  const dbHeaders = {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'};
  async function db(method,url,body,extra={}) {
    const r = await fetch(url,{method,headers:{...dbHeaders,...extra},
      body:body === undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    const text = await r.text();let data;
    try {data=JSON.parse(text);}catch {data=null;}
    return {ok:r.ok,status:r.status,data};
  }
  try {
    if (req.method === 'GET') {
      const r=await db('GET',endpoint+'?id=eq.personal&select=state,revision');
      if (!r.ok) return reply(503,{error:'Cloud database unavailable'});
      return reply(200,r.data?.[0] || {state:null,revision:0});
    }
    const body=await req.json().catch(()=>null);
    if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || !validState(body.state))
      return reply(400,{error:'Invalid quiz state'});
    if (new TextEncoder().encode(JSON.stringify(body.state)).byteLength > 950000)
      return reply(413,{error:'Quiz history is too large for sync'});
    let r;
    if (body.revision === 0) {
      r=await db('POST',endpoint,{id:'personal',state:body.state,revision:1},{Prefer:'return=representation'});
      if (r.status === 409) return reply(409,{error:'Cloud history changed. Refresh and retry.'});
    } else {
      const url=endpoint+'?id=eq.personal&revision=eq.'+body.revision+'&select=revision';
      r=await db('PATCH',url,{state:body.state,revision:body.revision+1,updated_at:new Date().toISOString()},{Prefer:'return=representation'});
      if (r.ok && (!Array.isArray(r.data) || r.data.length === 0))
        return reply(409,{error:'Another device saved newer progress. Refresh and retry.'});
    }
    if (!r.ok) return reply(503,{error:'Cloud database unavailable'});
    return reply(200,{revision:r.data?.[0]?.revision ?? body.revision+1});
  } catch {
    return reply(503,{error:'Cloud database unavailable. Your local answers are safe.'});
  }
});