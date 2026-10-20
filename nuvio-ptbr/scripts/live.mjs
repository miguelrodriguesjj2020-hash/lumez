import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = key => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; };
const sources = JSON.parse(await readFile(path.join(root,'src/sources.json'),'utf8'));
const bundle = await readFile(path.join(root,'providers/aurora.js'),'utf8');
const matrix = args.includes('--matrix');
const probe = args.includes('--probe');
const cases = matrix ? JSON.parse(await readFile(path.join(root,'test/live-cases.json'),'utf8')) : [{
  title:option('--id') || 'Matrix', id:option('--id') || 'tt0133093', type:option('--type') || 'movie',
  season:option('--season') == null ? undefined : Number(option('--season')),
  episode:option('--episode') == null ? undefined : Number(option('--episode'))
}];

async function pool(tasks, concurrency) {
  let next=0;
  const results=new Array(tasks.length);
  await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)},async()=>{
    while(next<tasks.length){const i=next++;results[i]=await tasks[i]();}
  }));
  return results;
}

async function limitedBody(response, maximum=32768) {
  if(!response.body)return Buffer.alloc(0);
  const reader=response.body.getReader(), chunks=[];
  let length=0;
  try {
    while(length<maximum){
      const {value,done}=await reader.read();
      if(done)break;
      const slice=value.subarray(0,maximum-length);
      chunks.push(Buffer.from(slice));length+=slice.length;
    }
  } finally { await reader.cancel().catch(()=>{}); }
  return Buffer.concat(chunks);
}

async function mediaProbe(stream) {
  // A bounded sample is not full playback or a semantic audio-language check.
  try {
    const headers={...stream.headers,Range:'bytes=0-4095'};
    if(!Object.keys(headers).some(k=>k.toLowerCase()==='user-agent'))headers['User-Agent']='Mozilla/5.0';
    const r=await fetch(stream.url,{headers,signal:AbortSignal.timeout(15000)});
    const bytes=await limitedBody(r);
    if(r.status<200 || r.status>=300)return {status:r.status,result:'http-error'};
    const body=bytes.toString('utf8');
    const hls=body.trimStart().startsWith('#EXTM3U');
    const mp4=bytes.subarray(4,8).toString()==='ftyp' || bytes.subarray(4,8).toString()==='styp';
    const mkv=bytes.subarray(0,4).toString('hex')==='1a45dfa3';
    const html=/^\s*(?:<!doctype html|<html)/i.test(body);
    const audioLanguages=hls ? [...body.matchAll(/^#EXT-X-MEDIA:.*TYPE=AUDIO.*$/gm)].flatMap(m=>[...m[0].matchAll(/\bLANGUAGE="([^"]+)"/g)].map(x=>x[1])) : [];
    return {status:r.status, result:hls?'hls-playlist':mp4?'mp4-sample':mkv?'mkv-sample':html?'html-page':'inconclusive', bytesRead:bytes.length, audioLanguages};
  } catch(error) {
    const timeout=[error.name,error.cause?.name].some(name=>name==='TimeoutError' || name==='AbortError');
    const code=error.cause?.code || error.code;
    return {result:timeout?'timeout':'network-error',code:typeof code==='string' && /^[A-Z0-9_]+$/.test(code)?code:undefined};
  }
}

async function checkManifest(source) {
  try {
    const r=await fetch(source.baseUrl+'/manifest.json',{signal:AbortSignal.timeout(10000)});
    if(!r.ok)return {source:source.id,status:r.status,usable:false};
    const data=await r.json();
    const resources=Array.isArray(data.resources)?data.resources:[];
    return {source:source.id,status:r.status,id:data.id,version:data.version,types:data.types,usable:resources.some(v=>v==='stream' || v?.name==='stream')};
  } catch(error) {return {source:source.id,usable:false,code:error.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR'};}
}

async function runCase(item,source) {
  // Run the distributed file, not a second implementation of its filtering.
  const host={
    module:{exports:{}},SCRAPER_ID:'https://raw.githubusercontent.com/miguelrodriguesjj2020-hash/lumez/refs/heads/main/nuvio-ptbr/manifest.json:'+source.scraperId,SCRAPER_SETTINGS:{},
    fetch:(url,options)=>fetch(url,options),setTimeout,clearTimeout,AbortController,
    console:{log:()=>{}}
  };
  vm.runInNewContext(bundle,host,{filename:'aurora.js',timeout:1000});
  try {
    const streams=await host.module.exports.getStreams(item.id,item.type,item.season,item.episode);
    const checks=probe ? await Promise.all(streams.slice(0,1).map(mediaProbe)) : [];
    return {case:item.title,id:item.id,type:item.type,source:source.id,diagnostics:host.module.exports.getDiagnostics(),
      audioLabels:[...new Set(streams.map(s=>s.language))],qualities:[...new Set(streams.map(s=>s.quality||'unknown'))],probes:checks};
  } catch(_) { return {case:item.title,id:item.id,source:source.id,code:'HARNESS_ERROR'}; }
}

const report={
  testedAt:new Date().toISOString(),version:'1.0.0',runtime:process.version,
  bundleSha256:createHash('sha256').update(bundle).digest('hex'),
  test:'Distributed plugin in VM with real HTTP transport; no device playback',
  manifests:await pool(sources.map(s=>()=>checkManifest(s)),3),
  results:await pool(cases.flatMap(item=>sources.map(source=>()=>runCase(item,source))),6)
};
report.summary={
  cases:cases.length,sourceRequests:report.results.length,
  casesWithResults:cases.filter(c=>report.results.some(r=>r.id===c.id && r.diagnostics?.totals.returned>0)).length,
  sourceResponsesWithResults:report.results.filter(r=>r.diagnostics?.totals.returned>0).length,
  returnedStreams:report.results.reduce((n,r)=>n+(r.diagnostics?.totals.returned||0),0),
  mediaSamples:report.results.flatMap(r=>r.probes||[]).reduce((out,p)=>{out[p.result]=(out[p.result]||0)+1;return out;},{})
};
for(const result of report.results)console.log(JSON.stringify({case:result.case,source:result.source,count:result.diagnostics?.totals.returned||0,status:result.diagnostics?.status||result.code,probes:result.probes}));
console.log(JSON.stringify({summary:report.summary}));
if(option('--output')){
  const dest=path.resolve(option('--output'));
  await mkdir(path.dirname(dest),{recursive:true});
  await writeFile(dest,JSON.stringify(report,null,2)+'\n');
  console.log('Saved redacted validation report.');
}
if(args.includes('--require-results') && report.summary.casesWithResults!==cases.length)process.exitCode=1;
