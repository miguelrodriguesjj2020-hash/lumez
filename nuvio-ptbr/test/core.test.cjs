'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const sources = require('../src/sources.json');
const source = sources[0];
const movie = core.parseIdentity('tt0133093', 'movie');
const opts = core.settings({});
const stream = (extra = {}) => ({url: 'https://media.example/matrix.mp4', name: '1080p · Dublado', ...extra});
const response = (body, status = 200) => ({status, text: async () => JSON.stringify(body)});
const environment = fetch => ({fetch, setTimeout, clearTimeout, AbortController});

test('IMDb and TMDB IDs retain their namespace, including specials', () => {
  assert.equal(core.parseIdentity('imdb:tt0133093', 'movie').kind, 'imdb');
  assert.equal(core.parseIdentity('tmdb/603', 'movie').tmdb, '603');
  assert.equal(core.parseIdentity('603', 'movie').kind, 'tmdb');
  const special = core.parseIdentity('tt0903747:0:1', 'tv');
  assert.equal(special.type, 'series');
  assert.equal(special.season, 0);
  assert.equal(special.episode, 1);
});

test('missing, conflicting and malformed episode inputs never fall back to episode 1', () => {
  for (const args of [
    ['tt0903747', 'series'], ['tt0903747:1:2', 'series', 1, 1],
    ['tt0903747:1:', 'series'], ['tt0903747', 'series', -1, 1],
    ['tt0903747:1:1', 'movie'], ['tmdb:tt0133093', 'movie'],
    ['imdb:603', 'movie'], ['https://example.com', 'movie'], ['0', 'movie']
  ]) assert.throws(() => core.parseIdentity(...args), {name: 'Error'});
});

test('only audio evidence establishes Portuguese; titles, subtitles, flags in subtitle labels and DUAL alone do not', () => {
  for (const item of [
    {title: 'O Português'}, {title: 'DUAL AUDIO MULTI'},
    {title: 'Legendas: PT-BR 🇧🇷'}, {title: 'Legendado em Português'},
    {title: 'PT-BR LEGENDADO'}, {title: '🇧🇷 Legendado'},
    {title: 'Audio: English | Subtitles: PT-BR'},
    {audioTracks: [{type:'subtitle',language:'pt-BR'}]},
    {audioTracks: [{codec_type:'video',language:'pt-BR'}]},
    {subtitles: [{url: 'https://s.example/br.srt', language: 'pt-BR'}]}
  ]) assert.ok(core.audioEvidence(item, source).rank < 2, JSON.stringify(item));
});

test('PT-BR, source-declared dubbing, generic Portuguese and Portugal remain distinct', () => {
  assert.equal(core.audioEvidence({audioLanguages: ['en', 'pt-BR']}, source).code, 'declared-br');
  assert.equal(core.audioEvidence({audioTracks: [{language: 'pob'}]}, source).locale, 'pt-BR');
  assert.equal(core.audioEvidence({title: 'Dublado'}, source).code, 'declared-dub');
  assert.equal(core.audioEvidence({title: 'Dublado'}, {name: 'Unspecified'}).rank, 0);
  assert.equal(core.audioEvidence({title: '🎬 Matrix\n🌎 Português'}, source).locale, 'pt');
  assert.equal(core.audioEvidence({audioLanguage: 'pt-PT'}, source).rank, -1);
  assert.equal(core.audioEvidence({title: 'Áudio: PT-BR | Legendas: inglês'}, source).rank,4);
});

test('strict BR policy hides generic Portuguese; unknown audio is opt-in', () => {
  const generic = stream({name: '720p', title: '🌎 Português'});
  assert.ok(core.normalizeStream(generic, source, movie, opts).item);
  assert.equal(core.normalizeStream(generic, source, movie, core.settings({audioMode: 'br'})).reason, 'declared-portuguese');
  const unknown = stream({name: '1080p', title: 'DUAL AUDIO'});
  assert.equal(core.normalizeStream(unknown, source, movie, opts).reason, 'unknown');
  assert.ok(core.normalizeStream(unknown, source, movie, core.settings({audioMode: 'todos'})).item);
});

test('quality is never manufactured for an unlabelled stream', () => {
  assert.equal(core.qualityOf({title: 'Dublado'}), 0);
  assert.equal(core.qualityOf({name: '4K HDR'}), 2160);
  assert.equal(core.qualityOf({resolution: 1080}), 1080);
  assert.equal(core.normalizeStream(stream({name: '4K · Dublado'}), source, movie, core.settings({maxResolution: '1080'})).reason, 'resolution-limit');
});

test('wrong IDs and explicit episode mismatches are rejected, including source-style T01·E01', () => {
  const series = core.parseIdentity('tt0903747:1:2', 'series');
  for (const extra of [{title: 'S01E01 · Dublado'}, {title: 'T01·E01 · Dublado'}, {title: 'T01 EP01 · Dublado'}, {episode: 1}, {metaId: 'tt0903747:1:1'}]) {
    assert.equal(core.normalizeStream(stream(extra), source, series, opts).reason, 'wrong-episode');
  }
  assert.equal(core.normalizeStream(stream({imdbId: 'tt0111161'}), source, movie, opts).reason, 'wrong-id');
  assert.ok(core.normalizeStream(stream({title: 'T01 EP02 · Dublado'}), source, series, opts).item);
});

test('hash-only torrents, external pages and DRM requests do not become direct playback URLs', () => {
  for (const item of [{infoHash: 'a'.repeat(40)}, {externalUrl: 'https://p.example/watch'}, {url: 'magnet:?xt=urn:btih:abc'}, {url: 'https://s.example/movie.torrent'}, {url: 'javascript:alert(1)'}]) {
    assert.equal(core.normalizeStream({...stream(), ...item, url: item.url}, source, movie, opts).reason, 'not-http-video');
  }
  assert.equal(core.normalizeStream(stream({drm: {type: 'widevine'}}), source, movie, opts).reason, 'drm-unsupported');
});

test('required playback headers and subtitles survive; invalid header values are removed', () => {
  const item = core.normalizeStream(stream({
    behaviorHints: {proxyHeaders: {request: {Referer: 'https://site.example/', 'User-Agent': 'Player', Range: 'bytes=0-1', Cookie: 'public-source-token'}}},
    headers: {referer: 'https://new.example/', Bad: 'x\r\nInjected: true'},
    subtitles: [{url: 'https://sub.example/pt.srt', lang: 'pt-BR', headers: {Referer: 'https://site.example/'}}, {url: 'javascript:1'}]
  }), source, movie, opts).item;
  assert.equal(item.headers.referer, 'https://new.example/');
  assert.equal(item.headers.Referer, undefined);
  assert.equal(item.headers['User-Agent'], 'Player');
  assert.equal(item.headers.Cookie, 'public-source-token');
  assert.equal(item.headers.Range, undefined);
  assert.equal(item.headers.Bad, undefined);
  assert.equal(item.subtitles.length, 1);
  assert.equal(item.subtitles[0].language, 'pt-BR');
});

test('dedup preserves signed URL and auth differences, merges useful subtitles and evidence', () => {
  const a = core.normalizeStream(stream({name: '720p', title: '🌎 Português'}), source, movie, opts).item;
  const b = core.normalizeStream(stream({audioLanguage: 'pt-BR', subtitles: [{url: 'https://sub.example/br.srt', language: 'pt-BR'}]}), sources[1], movie, opts).item;
  const c = {...a, headers: {Authorization: 'different'}};
  const d = {...a, url: a.url + '?token=different'};
  const unique = core.deduplicate([a,b,c,d]);
  assert.equal(unique.items.length, 3);
  assert.equal(unique.duplicates, 1);
  assert.equal(unique.items[0].audio.locale, 'pt-BR');
  assert.deepEqual(unique.items[0].origins, ['bscine','kingvod']);
  assert.equal(unique.items[0].subtitles.length, 1);
});

test('a failed source does not discard another source; diagnostics never include URLs, tokens or raw errors', async () => {
  const secret = 'sensitive-example-token';
  const env = environment(async url => {
    if (url.includes('alwaysdata')) return response({streams: [stream({url: 'https://media.example/video.mp4?token=' + secret})]});
    throw new Error('Failed URL containing ' + secret);
  });
  const result = await core.search({id: movie.id, type: 'movie'}, sources.slice(0,2), env, {});
  assert.equal(result.streams.length, 1);
  assert.equal(result.diagnostics.status, 'partial');
  assert.equal(result.diagnostics.sources[1].code, 'NETWORK_ERROR');
  assert.ok(!JSON.stringify(result.diagnostics).includes(secret));
  assert.ok(!JSON.stringify(result.diagnostics).includes('https://'));
});

test('malformed JSON, HTTP errors, empty and filtered lists remain distinguishable', async () => {
  const cases = [
    [{status: 503, text: async () => ''}, 'HTTP_ERROR'],
    [{status: 200, text: async () => '<html>error</html>'}, 'INVALID_JSON'],
    [response({wrong: []}), 'INVALID_RESPONSE']
  ];
  for (const [r, code] of cases) {
    const result = await core.search({id: movie.id, type: 'movie'}, [source], environment(async () => r), {});
    assert.equal(result.diagnostics.sources[0].code, code);
  }
  for (const [list,status] of [[[],'empty'], [[stream({name:'1080p',title:'Legendado'})],'filtered']]) {
    const result = await core.search({id: movie.id, type: 'movie'}, [source], environment(async () => response({streams:list})), {});
    assert.equal(result.diagnostics.sources[0].status, status);
  }
});

test('invalid identity triggers no network request', async () => {
  let calls = 0;
  const result = await core.search({id:'bad-id',type:'movie'}, sources, environment(async () => { calls++; }), {});
  assert.equal(calls, 0);
  assert.equal(result.diagnostics.code, 'INVALID_ID');
});

test('timeouts isolate an unresolved fetch; a late rejection is handled', async () => {
  let aborted = false;
  const env = environment((url, options) => new Promise((resolve,reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  }));
  await assert.rejects(core.requestJson('https://source.example', env, 25), {code:'TIMEOUT'});
  assert.equal(aborted, true);
});

test('legacy runtime without timers still executes and does not invent a timeout guarantee', async () => {
  const result = await core.search({id: movie.id,type:'movie'}, [source], {fetch:async () => response({streams:[stream()]})}, {});
  assert.equal(result.streams.length, 1);
  assert.equal(result.diagnostics.logicalTimeout, false);
});

test('TMDB ID uses the app key only for ID resolution; numeric IDs are not guessed as IMDb', async () => {
  const urls = [];
  const env = environment(async url => {
    urls.push(url);
    return url.includes('themoviedb') ? response({title:'Matrix',release_date:'1999-03-30',external_ids:{imdb_id:'tt0133093'}}) : response({streams:[stream()]});
  });
  env.tmdbKey = 'example-key';
  const result = await core.search({id:'tmdb:603',type:'movie'}, [source], env, {});
  assert.ok(urls[1].endsWith('/stream/movie/tt0133093.json'));
  assert.equal(result.streams.length,1);
  assert.ok(!JSON.stringify(result.diagnostics).includes('example-key'));
  const noKey = await core.search({id:'603',type:'movie'}, [source], environment(async () => {throw new Error('must not call');}), {});
  assert.equal(noKey.diagnostics.sources[0].code,'ID_UNSUPPORTED');
});

test('TMDB-capable source works without a key; alternate endpoints keep their full prefix', () => {
  const media = core.parseIdentity('tmdb/1396','series',1,2);
  assert.ok(core.sourceStreamUrl(sources[2],media).endsWith('/stream/series/tmdb%3A1396%3A1%3A2.json'));
  assert.equal(core.sourceStreamUrl(source,movie,'https://alt.example/prefix/manifest.json'),'https://alt.example/prefix/stream/movie/tt0133093.json');
  for (const url of ['http://alt.example','https://alt.example?token=x','https://alt.example/../x','https://user:pass@alt.example']) assert.throws(() => core.sourceStreamUrl(source,movie,url),{code:'INVALID_SOURCE_URL'});
});

test('result ordering and caps reflect audio and real quality, with visible stable ranks', async () => {
  const list = [stream({name:'4K · Dublado'}),stream({url:'https://m.example/1080',name:'1080p · Dublado'}),stream({url:'https://m.example/unknown',name:'Dublado'}),stream({url:'https://m.example/pt',name:'1080p',title:'🌎 Português'})];
  const result = await core.search({id:movie.id,type:'movie'},[source],environment(async()=>response({streams:list})),{maxResults:3});
  assert.equal(result.streams.length,3);
  assert.ok(result.streams[0].name.startsWith('01 ·'));
  assert.equal(result.streams[0].quality,'1080p');
  assert.equal(result.streams[1].quality,'2160p');
  assert.equal(result.streams[2].quality,undefined);
  assert.ok(result.streams[2].name.includes('Qualidade não informada'));
});
