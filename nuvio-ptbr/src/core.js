'use strict';

// Original dependency-free engine. Runs in Node and in Nuvio's JS sandbox.
var VERSION = '1.0.0';
var MAX_BODY = 950000;
var MAX_CANDIDATES = 150;

function fault(code, status) {
  var error = new Error(code);
  error.code = code;
  if (status !== undefined) error.status = status;
  return error;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function folded(value) {
  var s = text(value).toLowerCase();
  return typeof s.normalize === 'function' ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
}

function bounded(value, fallback, min, max) {
  var n = Number(value);
  return value !== '' && value != null && isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

function settings(input) {
  input = plain(input);
  return {
    audioMode: ['portugues', 'br', 'todos'].indexOf(input.audioMode) >= 0 ? input.audioMode : 'portugues',
    maxResolution: bounded(input.maxResolution, 2160, 360, 4320),
    maxResults: bounded(input.maxResults, 30, 1, 80),
    timeoutMs: bounded(input.timeoutSeconds, 12, 3, 25) * 1000,
    prefer1080: input.prefer1080 !== false && input.prefer1080 !== 'false',
    sourceUrl: text(input.sourceUrl).trim()
  };
}

function httpUrl(value) {
  var s = text(value);
  if (!s || s.length > 16384 || /[\s\x00-\x1f\x7f\\]/.test(s)) return false;
  // No reliance on a browser URL object; some Nuvio URL polyfills are partial.
  return /^https?:\/\/[^\/?#@:]+(?::\d{1,5})?(?:[\/?#]|$)/i.test(s);
}

function baseUrl(value) {
  var s = text(value).trim().replace(/\/+$/, '').replace(/\/manifest\.json$/i, '');
  if (!httpUrl(s) || !/^https:\/\//i.test(s) || /[?#]/.test(s) || /(?:^|\/)\.\.(?:\/|$)/.test(s)) throw fault('INVALID_SOURCE_URL');
  return s;
}

function episodeNumber(value, allowZero) {
  if (value === undefined || value === null || value === '') return null;
  var n = Number(value);
  if (!isFinite(n) || n !== Math.floor(n) || n < (allowZero ? 0 : 1) || n > 10000) throw fault('INVALID_EPISODE');
  return n;
}

function parseIdentity(id, mediaType, season, episode) {
  var type = mediaType === 'tv' ? 'series' : mediaType;
  if (type !== 'movie' && type !== 'series') throw fault('UNSUPPORTED_TYPE');
  var raw = text(id).trim();
  var prefix = /^(imdb|tmdb)[:\/]/i.exec(raw);
  if (prefix) raw = raw.slice(prefix[0].length);
  var parts = raw.split(':');
  if (parts.length !== 1 && parts.length !== 3) throw fault('INVALID_ID');
  var root = parts[0];
  var kind = /^tt\d{7,10}$/.test(root) ? 'imdb' : /^\d{1,10}$/.test(root) ? 'tmdb' : null;
  if (!kind || (prefix && prefix[1].toLowerCase() !== kind) || (kind === 'tmdb' && Number(root) < 1)) throw fault('INVALID_ID');
  var s = episodeNumber(season, true), e = episodeNumber(episode, false);
  if (parts.length === 3) {
    if (!/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])) throw fault('INVALID_EPISODE');
    var fromS = episodeNumber(parts[1], true), fromE = episodeNumber(parts[2], false);
    if ((s !== null && s !== fromS) || (e !== null && e !== fromE)) throw fault('EPISODE_CONFLICT');
    s = fromS; e = fromE;
  }
  if (type === 'series' && (s === null || e === null)) throw fault('EPISODE_REQUIRED');
  if (type === 'movie' && (s !== null || e !== null)) throw fault('MOVIE_WITH_EPISODE');
  return {kind: kind, id: root, imdb: kind === 'imdb' ? root : null, tmdb: kind === 'tmdb' ? root : null, type: type, season: s, episode: e};
}

// Poll short timers instead of leaving a long native sleep after a fast result.
// Abort is best effort: Nuvio versions may ignore fetch(signal).
function requestJson(url, env, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var ended = false, timer = null, start = Date.now(), controller = null;
    if (typeof env.AbortController === 'function') controller = new env.AbortController();
    function finish(error, result) {
      if (ended) return;
      ended = true;
      if (timer !== null && typeof env.clearTimeout === 'function') env.clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    }
    function tick() {
      if (ended) return;
      if (Date.now() - start >= timeoutMs) {
        finish(fault('TIMEOUT'));
        if (controller) { try { controller.abort(); } catch (_) {} }
      } else timer = env.setTimeout(tick, Math.min(200, timeoutMs - (Date.now() - start)));
    }
    if (typeof env.setTimeout === 'function' && typeof env.clearTimeout === 'function') timer = env.setTimeout(tick, Math.min(200, timeoutMs));
    Promise.resolve().then(function() {
      return env.fetch(url, {headers: {Accept: 'application/json'}, signal: controller ? controller.signal : undefined});
    }).then(function(response) {
      if (!response || response.status < 200 || response.status >= 300) throw fault('HTTP_ERROR', response ? response.status : 0);
      return response.text();
    }).then(function(body) {
      if (typeof body !== 'string' || body.length > MAX_BODY || /\.\.\.\[truncated\]\s*$/.test(body)) throw fault('RESPONSE_TOO_LARGE');
      var data;
      try { data = JSON.parse(body); } catch (_) { throw fault('INVALID_JSON'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw fault('INVALID_RESPONSE');
      finish(null, data);
    }).catch(function(error) { finish(error && error.code ? error : fault('NETWORK_ERROR')); });
  });
}

function collectAudio(value, out) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(function(v) { collectAudio(v, out); });
  else if (value && typeof value === 'object') {
    if (/subtitle|caption|text|video/i.test(text(value.type)) || (value.codec_type && value.codec_type !== 'audio')) return;
    ['language', 'lang', 'locale', 'name', 'label'].forEach(function(k) { if (typeof value[k] === 'string') out.push(value[k]); });
  }
}

function languageFlags(value) {
  var s = folded(value);
  var br = /(?:^|[^a-z])(?:pt[._ -]?br|por[._ -]?br|pob)(?:$|[^a-z])|brazilian portuguese|portugues (?:do brasil|brasileiro)|🇧🇷/.test(s);
  var ptpt = /pt[._ -]?pt|portugues (?:de )?portugal|🇵🇹/.test(s);
  var pt = br || ptpt || /(?:^|[^a-z])(?:pt|por|portugues|portuguese)(?:$|[^a-z])/.test(s);
  return {br: br, ptpt: ptpt, pt: pt};
}

function audioEvidence(stream, source) {
  var fields = [];
  ['audioLanguages', 'audioLanguage', 'audio_languages', 'audioTracks', 'audio_tracks', 'language', 'languages'].forEach(function(k) { collectAudio(stream[k], fields); });
  var structured = languageFlags(fields.join(' '));
  // Subtitles and a Portuguese movie title do not establish an audio language.
  var lines = [stream.name, stream.title, stream.description, stream.filename, plain(stream.behaviorHints).filename].map(text).join('\n').split('\n');
  var labels = lines.map(function(line) {
    var f = folded(line);
    if (/\b(?:subtitles?|legendas?|legendado|cc)\b/.test(f)) {
      // Keep an explicit audio clause before a subtitles clause on the same line.
      var beforeSubtitle = line.split(/\b(?:subtitles?|legendas?|legendado|cc)\b/i)[0];
      line = /audio|idioma|language|dublado|dubbed|🎧/.test(folded(beforeSubtitle)) ? beforeSubtitle : '';
    }
    var clean = folded(line);
    return /audio|idioma|language|dublado|dubbed|🌎|🌐|🎧|🇧🇷|pt[._ -]?br|portugues (?:do brasil|brasileiro)|brazilian portuguese|(?:^|[._ -])pob(?:$|[._ -])/.test(clean) || /^(?:portugues|portuguese|pt|por|pt-pt|pt-br)\s*$/i.test(clean.trim()) ? line : '';
  }).join('\n');
  var named = languageFlags(labels);
  if (structured.br || named.br) return {rank: 4, locale: 'pt-BR', code: 'declared-br', label: 'PT-BR informado pela fonte'};
  if (structured.ptpt || named.ptpt) return {rank: -1, locale: 'pt-PT', code: 'declared-pt', label: 'Português de Portugal informado'};
  if (/\b(?:dublado|dubbed)\b/.test(folded(labels)) && source.dubLocale === 'pt-BR') return {rank: 3, locale: 'pt-BR', code: 'declared-dub', label: 'Dublado informado pela fonte'};
  if (structured.pt || named.pt) return {rank: 2, locale: 'pt', code: 'declared-portuguese', label: 'Português informado; variante incerta'};
  if (/\b(?:legendado|subtitled)\b/.test(folded([stream.name, stream.title, stream.description].map(text).join(' ')))) return {rank: -1, locale: null, code: 'subtitled-only', label: 'Legendado; áudio português não informado'};
  return {rank: 0, locale: null, code: 'unknown', label: 'Áudio português não informado'};
}

function qualityOf(stream) {
  var values = [stream.quality, stream.resolution, stream.name, stream.title, stream.filename, plain(stream.behaviorHints).filename].map(function(v) { return typeof v === 'number' ? String(v) : text(v); }).join(' ');
  var match = /(?:^|[^\d])(4320|2160|1440|1080|720|576|480|360)(?:p|i|\b)/i.exec(values);
  if (match) return Number(match[1]);
  if (/\b4k\b|\buhd\b/i.test(values)) return 2160;
  if (/\bfull[ -]?hd\b/i.test(values)) return 1080;
  return 0;
}

function headersOf(stream) {
  var result = {}, byLower = {};
  var request = plain(plain(plain(stream.behaviorHints).proxyHeaders).request);
  [request, plain(stream.headers)].forEach(function(headers) {
    Object.keys(headers).forEach(function(key) {
      var value = headers[key], lower = key.toLowerCase();
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(key) || typeof value !== 'string' || /[\r\n\x00]/.test(value) || value.length > 8192) return;
      if (['host', 'range', 'content-length', '__proto__', 'constructor', 'prototype'].indexOf(lower) >= 0) return;
      if (byLower[lower]) delete result[byLower[lower]];
      result[key] = value; byLower[lower] = key;
    });
  });
  return result;
}

function subtitlesOf(stream) {
  return Array.isArray(stream.subtitles) ? stream.subtitles.slice(0, 40).filter(function(s) { return s && httpUrl(s.url); }).map(function(s) {
    return {url: s.url, language: text(s.language || s.lang) || 'und', name: text(s.name || s.label) || undefined, headers: headersOf({headers: s.headers})};
  }) : [];
}

function matchingReason(stream, media) {
  var claimed = stream.imdbId || stream.imdb_id || stream.metaId;
  if (typeof claimed === 'string' && /^tt\d{7,10}(?::\d+:\d+)?$/.test(claimed)) {
    var parsed = claimed.split(':');
    if (media.imdb && parsed[0] !== media.imdb) return 'wrong-id';
    if (media.type === 'series' && parsed.length === 3 && (Number(parsed[1]) !== media.season || Number(parsed[2]) !== media.episode)) return 'wrong-episode';
  }
  if (media.tmdb && stream.tmdbId != null && String(stream.tmdbId) !== media.tmdb) return 'wrong-id';
  var title = [stream.filename, plain(stream.behaviorHints).filename, stream.title].map(text).join(' ');
  var explicit = /\bS(\d{1,3})[ ._·-]*E(?:P)?[ ._-]*(\d{1,4})\b/i.exec(title) || /\bT(\d{1,3})[ ._·-]*(?:EP|E)[ ._-]*(\d{1,4})\b/i.exec(title);
  if (media.type === 'series') {
    if (stream.season != null && episodeNumber(stream.season, true) !== media.season) return 'wrong-episode';
    if (stream.episode != null && episodeNumber(stream.episode, false) !== media.episode) return 'wrong-episode';
    if (explicit && (Number(explicit[1]) !== media.season || Number(explicit[2]) !== media.episode)) return 'wrong-episode';
  } else {
    if (explicit) return 'wrong-type';
    var year = Number(stream.year || stream.releaseYear);
    if (media.year && year >= 1880 && year !== media.year) return 'wrong-year';
  }
  return null;
}

function normalizeStream(stream, source, media, opts) {
  if (!stream || typeof stream !== 'object') return {reason: 'invalid-item'};
  if (!httpUrl(stream.url) || /\.torrent(?:[?#]|$)/i.test(stream.url)) return {reason: 'not-http-video'};
  if (stream.drm || stream.drmInfo || stream.licenseUrl || /^(?:widevine|playready)$/i.test(text(stream.type))) return {reason: 'drm-unsupported'};
  var mismatch;
  try { mismatch = matchingReason(stream, media); } catch (_) { mismatch = 'invalid-episode'; }
  if (mismatch) return {reason: mismatch};
  var audio = audioEvidence(stream, source);
  if (opts.audioMode !== 'todos' && audio.rank < (opts.audioMode === 'br' ? 3 : 2)) return {reason: audio.code};
  var quality = qualityOf(stream);
  if (quality > opts.maxResolution) return {reason: 'resolution-limit'};
  var hints = plain(stream.behaviorHints);
  var size = text(stream.size);
  if (!size && typeof hints.videoSize === 'number' && isFinite(hints.videoSize) && hints.videoSize > 0) size = (hints.videoSize / 1073741824).toFixed(2) + ' GB';
  return {item: {
    url: stream.url, headers: headersOf(stream), subtitles: subtitlesOf(stream),
    quality: quality, audio: audio, source: source.name, origins: [source.id],
    release: text(stream.title || stream.name || stream.filename).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, 700),
    size: size,
    type: /\.m3u8(?:[?#]|$)/i.test(stream.url) || /^(?:hls|m3u8)$/i.test(text(stream.type)) ? 'hls' : 'direct'
  }};
}

function playbackKey(item) {
  var headers = Object.keys(item.headers).map(function(k) { return [k.toLowerCase(), item.headers[k]]; }).sort(function(a,b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  // Signed URLs and differing auth headers must remain distinct alternatives.
  return JSON.stringify([item.url, headers]);
}

function deduplicate(items) {
  var seen = Object.create(null), result = [], duplicates = 0;
  items.forEach(function(item) {
    var key = playbackKey(item), existing = seen[key];
    if (!existing) { seen[key] = item; result.push(item); return; }
    duplicates++;
    item.origins.forEach(function(origin) { if (existing.origins.indexOf(origin) < 0) existing.origins.push(origin); });
    if (item.audio.rank > existing.audio.rank) existing.audio = item.audio;
    if (item.quality > existing.quality) existing.quality = item.quality;
    item.subtitles.forEach(function(s) { if (!existing.subtitles.some(function(e) { return e.url === s.url && e.language === s.language; })) existing.subtitles.push(s); });
  });
  return {items: result, duplicates: duplicates};
}

function renderResults(items, opts) {
  function qualityRank(q) { return opts.prefer1080 && q === 1080 ? 5000 : q; }
  items.sort(function(a,b) { return b.audio.rank - a.audio.rank || qualityRank(b.quality) - qualityRank(a.quality) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0); });
  return items.slice(0, opts.maxResults).map(function(item, i) {
    var q = item.quality ? item.quality + 'p' : 'Qualidade não informada';
    var name = ('0' + (i + 1)).slice(-2) + ' · ' + item.audio.label + '\n' + item.source + ' · ' + q;
    return {name: name, title: item.release || name, url: item.url, quality: item.quality ? q : undefined, language: item.audio.label, provider: item.source, type: item.type, size: item.size || undefined, headers: item.headers, subtitles: item.subtitles};
  });
}

async function resolveIdentity(media, env, opts) {
  if (media.kind !== 'tmdb' || !text(env.tmdbKey).trim()) return media;
  var key = env.tmdbKey.trim();
  try {
    var data = await requestJson('https://api.themoviedb.org/3/' + (media.type === 'movie' ? 'movie' : 'tv') + '/' + media.tmdb + '?append_to_response=external_ids&api_key=' + encodeURIComponent(key), env, opts.timeoutMs);
    var imdb = plain(data.external_ids).imdb_id || data.imdb_id;
    if (/^tt\d{7,10}$/.test(text(imdb))) media.imdb = imdb;
    media.title = text(data.title || data.name);
    var year = Number(text(data.release_date || data.first_air_date).slice(0,4));
    if (year >= 1880) media.year = year;
  } catch (error) { media.resolutionError = error.code || 'NETWORK_ERROR'; }
  return media;
}

function sourceStreamUrl(source, media, override) {
  var kind = media.imdb && source.idKinds.indexOf('imdb') >= 0 ? 'imdb' : media.tmdb && source.idKinds.indexOf('tmdb') >= 0 ? 'tmdb' : null;
  if (!kind) throw fault('ID_UNSUPPORTED');
  var id = kind === 'imdb' ? media.imdb : 'tmdb:' + media.tmdb;
  if (media.type === 'series') id += ':' + media.season + ':' + media.episode;
  return baseUrl(override || source.baseUrl) + '/stream/' + media.type + '/' + encodeURIComponent(id) + '.json';
}

async function search(input, sources, env, rawSettings) {
  var start = Date.now(), opts = settings(rawSettings), media;
  var diagnostics = {version: VERSION, status: 'empty', sources: [], totals: {received: 0, accepted: 0, duplicates: 0, returned: 0}, logicalTimeout: typeof env.setTimeout === 'function', cancellation: 'host-dependent'};
  try { media = parseIdentity(input.id, input.type, input.season, input.episode); }
  catch (error) { diagnostics.status = 'invalid-input'; diagnostics.code = error.code; diagnostics.durationMs = Date.now() - start; return {streams: [], diagnostics: diagnostics}; }
  media = await resolveIdentity(media, env, opts);
  diagnostics.request = {id: media.id, kind: media.kind, type: media.type, season: media.season, episode: media.episode};
  if (media.resolutionError) diagnostics.idResolution = media.resolutionError;
  var groups = await Promise.all(sources.map(async function(source) {
    var stat = {id: source.id, name: source.name, status: 'empty', received: 0, accepted: 0, rejected: {}}, began = Date.now(), items = [];
    try {
      if (source.types.indexOf(media.type) < 0) throw fault('TYPE_UNSUPPORTED');
      var data = await requestJson(sourceStreamUrl(source, media, sources.length === 1 ? opts.sourceUrl : ''), env, opts.timeoutMs);
      if (!Array.isArray(data.streams)) throw fault('INVALID_RESPONSE');
      stat.received = data.streams.length;
      if (stat.received > MAX_CANDIDATES) stat.truncatedCandidates = stat.received - MAX_CANDIDATES;
      data.streams.slice(0, MAX_CANDIDATES).forEach(function(stream) {
        var normalized = normalizeStream(stream, source, media, opts);
        if (normalized.item) items.push(normalized.item);
        else stat.rejected[normalized.reason] = (stat.rejected[normalized.reason] || 0) + 1;
      });
      stat.accepted = items.length;
      stat.status = items.length ? 'ok' : stat.received ? 'filtered' : 'empty';
    } catch (error) {
      stat.status = 'error'; stat.code = error.code || 'NETWORK_ERROR';
      if (error.status !== undefined) stat.httpStatus = error.status;
    }
    stat.durationMs = Date.now() - began;
    return {stat: stat, items: items};
  }));
  var all = [];
  groups.forEach(function(group) {
    diagnostics.sources.push(group.stat);
    diagnostics.totals.received += group.stat.received;
    diagnostics.totals.accepted += group.stat.accepted;
    all = all.concat(group.items);
  });
  var unique = deduplicate(all), streams = renderResults(unique.items, opts);
  diagnostics.totals.duplicates = unique.duplicates;
  diagnostics.totals.returned = streams.length;
  var failures = diagnostics.sources.filter(function(s) { return s.status === 'error'; }).length;
  diagnostics.status = streams.length ? (failures ? 'partial' : 'ok') : failures ? 'unavailable' : 'empty';
  diagnostics.durationMs = Date.now() - start;
  return {streams: streams, diagnostics: diagnostics};
}

module.exports = {VERSION: VERSION, settings: settings, parseIdentity: parseIdentity, audioEvidence: audioEvidence, qualityOf: qualityOf, headersOf: headersOf, normalizeStream: normalizeStream, deduplicate: deduplicate, playbackKey: playbackKey, sourceStreamUrl: sourceStreamUrl, requestJson: requestJson, search: search, httpUrl: httpUrl};
