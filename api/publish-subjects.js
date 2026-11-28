const MAX_BODY=600000;
const THEMES=new Set(['forest','ocean','solar','cosmic','rose','slate']);
const MASCOTS=new Set(['brain','owl','fox','robot','planet','book']);
function validate(subjects){
 if(!Array.isArray(subjects)||subjects.length>40)throw Error('Catalog must contain at most 40 subjects.');
 const ids=new Set();
 for(const s of subjects){
  if(!s||typeof s!=='object'||typeof s.id!=='string'||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(s.id)||s.id.length>64||s.id==='psychology'||ids.has(s.id))throw Error('Subject IDs must be unique, lowercase URL slugs.');
  ids.add(s.id);
  if(typeof s.name!=='string'||!s.name.trim()||s.name.length>80||typeof s.description!=='string'||s.description.length>280||typeof s.notes!=='string'||s.notes.length>30000||!THEMES.has(s.theme)||!MASCOTS.has(s.mascot))throw Error('Invalid subject metadata.');
  if(!Array.isArray(s.cards)||s.cards.length<1||s.cards.length>150||s.cards.some(c=>!c||typeof c.q!=='string'||!c.q.trim()||c.q.length>1000||typeof c.a!=='string'||!c.a.trim()||c.a.length>1500))throw Error('Each subject needs 1–150 valid study cards.');
  if(Object.keys(s).some(k=>!['id','name','description','notes','theme','mascot','cards'].includes(k)))throw Error('Unknown subject field.');
 }
 if(JSON.stringify(subjects).length>400000)throw Error('Catalog is too large.');
 return subjects;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='PUT'){res.setHeader('Allow','PUT');return res.status(405).json({error:'Method not allowed'});}
 const token=String(req.headers.authorization||'').match(/^Bearer ((?:github_pat_|ghp_)[A-Za-z0-9_]+)$/)?.[1];
 if(!token)return res.status(401).json({error:'A GitHub personal access token with Contents write access is required.'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body||JSON.stringify(body).length>MAX_BODY)return res.status(413).json({error:'Catalog is too large.'});
  let subjects;try{subjects=validate(body.subjects);}catch(e){return res.status(400).json({error:e.message});}
  const url='https://api.github.com/repos/consealmente/quiz-website/contents/subjects.json';
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'Study-Studio-Publisher'};
  const current=await fetch(url+'?ref=main',{headers,signal:AbortSignal.timeout(10000)});
  if(!current.ok)return res.status(current.status===401||current.status===403?403:502).json({error:'GitHub could not read the catalog. Check your repository permissions.'});
  const file=await current.json();const existing=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
  if(JSON.stringify(existing)!==JSON.stringify(body.base))return res.status(409).json({error:'Published catalog changed. Reload it before publishing your draft.'});
  const save=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Publish Study Studio subject catalog',branch:'main',sha:file.sha,content:Buffer.from(JSON.stringify(subjects,null,2)+'\n').toString('base64')}),signal:AbortSignal.timeout(10000)});
  if(!save.ok)return res.status(save.status===409?409:save.status===401||save.status===403?403:502).json({error:'GitHub did not accept the publication. Check access, branch protection or conflicts.'});
  const result=await save.json();return res.status(200).json({ok:true,commit:result.commit?.sha||null});
 }catch{return res.status(502).json({error:'Publication failed. Your draft is unchanged.'});}
};
module.exports.validate=validate;
