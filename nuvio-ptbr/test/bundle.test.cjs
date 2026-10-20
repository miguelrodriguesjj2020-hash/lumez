'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
const code = fs.readFileSync(path.join(root,'providers/aurora.js'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));

function sandbox(scraperId, withTimers = false) {
  const calls = [], logs = [];
  const host = {
    module:{exports:{}}, SCRAPER_ID:scraperId, SCRAPER_SETTINGS:{},
    console:{log:value=>logs.push(value)},
    fetch:async (url,options)=>{
      calls.push({url,options});
      return {status:200,text:async()=>JSON.stringify({streams:[{
        name:'1080p · Dublado',title:'Matrix (1999) · Dublado',
        url:'https://video.example/stream.m3u8?token=do-not-log',
        behaviorHints:{proxyHeaders:{request:{Referer:'https://upstream.example/'}}},
        subtitles:[{url:'https://sub.example/pt.srt',language:'pt-BR'}]
      }]})};
    }
  };
  if(withTimers){host.setTimeout=setTimeout;host.clearTimeout=clearTimeout;}
  const context=vm.createContext(host);
  // Reproduce Nuvio's wrapper. No require, Buffer, URL or Node builtins injected.
  vm.runInContext('var exports=module.exports;(function(){\n'+code+'\n})();',context,{timeout:1000});
  return {host,context,calls,logs};
}

test('manifest references an existing deterministic JS bundle and independent suppliers',()=>{
  assert.equal(manifest.scrapers.length,3);
  assert.equal(new Set(manifest.scrapers.map(s=>s.id)).size,3);
  for(const scraper of manifest.scrapers){
    assert.equal(scraper.hasSettings,true);
    assert.deepEqual(scraper.supportedTypes,['movie','tv']);
    assert.ok(fs.existsSync(path.join(root,scraper.filename)));
  }
});

for(const scraper of manifest.scrapers) test('Nuvio module contract: '+scraper.id,async()=>{
  const {host,calls,logs,context}=sandbox(scraper.id);
  assert.equal(vm.runInContext('typeof require',context),'undefined');
  assert.equal(vm.runInContext('typeof URL',context),'undefined');
  assert.equal(vm.runInContext('typeof Buffer',context),'undefined');
  assert.equal(typeof host.module.exports.getStreams,'function');
  assert.equal(typeof host.getStreams,'function');
  const result=JSON.parse(JSON.stringify(await host.module.exports.getStreams('tt0133093','movie')));
  assert.equal(calls.length,1);
  assert.equal(result.length,1);
  assert.equal(result[0].url,'https://video.example/stream.m3u8?token=do-not-log');
  assert.equal(result[0].headers.Referer,'https://upstream.example/');
  assert.equal(result[0].subtitles[0].language,'pt-BR');
  assert.equal(result[0].type,'hls');
  assert.ok(!logs.join('').includes('do-not-log'));
});

for(const scraper of manifest.scrapers) test('current Mobile composite ID selects exactly one source: '+scraper.id,async()=>{
  const composite='https://raw.githubusercontent.com/owner/repo/refs/heads/main/nuvio-ptbr/manifest.json:'+scraper.id;
  const {host,calls}=sandbox(composite);
  const result=await host.getStreams('tt0133093','movie');
  assert.equal(calls.length,1);
  assert.equal(result.length,1);
  assert.equal(host.module.exports.onSettings().filter(f=>f.key==='sourceUrl').length,1);
});

test('Nuvio settings layout uses supported fields, values and defaults',()=>{
  const {host}=sandbox(manifest.scrapers[0].id);
  const fields=host.module.exports.onSettings();
  const supported=['header','info','toggle','text','select'];
  assert.ok(fields.every(f=>supported.includes(f.type)));
  for(const f of fields.filter(f=>f.type==='select')) assert.ok(f.options.some(o=>o.value===f.defaultValue));
  assert.equal(fields.find(f=>f.key==='audioMode').defaultValue,'portugues');
});

test('current async runtime path works and does not depend on AbortController',async()=>{
  const {host}=sandbox(manifest.scrapers[0].id,true);
  const result=await host.getStreams('tt0903747:1:1','tv',1,1);
  assert.equal(result.length,1);
});
