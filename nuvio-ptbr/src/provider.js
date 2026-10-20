'use strict';

module.exports = function createProvider(core, sources, host) {
  var lastReport = null;

  function selectedSources() {
    var id = typeof host.SCRAPER_ID === 'string' ? host.SCRAPER_ID : '';
    // Mobile stores IDs as "<manifest URL>:<scraper ID>". Older clients may
    // provide the manifest ID alone. Match a delimited suffix, never a substring.
    var matches = sources.filter(function(source) {
      return source.scraperId === id || id.slice(-(source.scraperId.length + 1)) === ':' + source.scraperId;
    });
    // Direct module consumers/older runtimes can run the consolidated engine.
    if (!id) return sources;
    return matches;
  }

  function environment() {
    return {
      fetch: function(url, options) { return host.fetch(url, options); },
      setTimeout: typeof host.setTimeout === 'function' ? function(fn, ms) { return host.setTimeout(fn, ms); } : undefined,
      clearTimeout: typeof host.clearTimeout === 'function' ? function(id) { host.clearTimeout(id); } : undefined,
      AbortController: host.AbortController,
      tmdbKey: host.TMDB_API_KEY
    };
  }

  async function getStreams(id, mediaType, season, episode) {
    var result = await core.search({id: id, type: mediaType, season: season, episode: episode}, selectedSources(), environment(), host.SCRAPER_SETTINGS || {});
    lastReport = result.diagnostics;
    if (host.console && typeof host.console.log === 'function') host.console.log('[Aurora PT-BR] ' + JSON.stringify(lastReport));
    return result.streams;
  }

  function onSettings() {
    var selected = selectedSources();
    var source = selected.length === 1 ? selected[0] : null;
    var fields = [
      {type: 'header', label: 'Aurora PT-BR' + (source ? ' · ' + source.name : '')},
      {type: 'info', label: 'Usa os filmes e episódios dos seus catálogos. Os idiomas são informados pelas fontes; não são comprovados por escuta. O plugin não cria dublagens.'},
      {type: 'select', key: 'audioMode', label: 'Quais áudios mostrar', defaultValue: 'portugues', options: [
        {value: 'portugues', label: 'Dublado/PT-BR e português sem variante'},
        {value: 'br', label: 'Somente PT-BR ou Dublado informado'},
        {value: 'todos', label: 'Todos, inclusive idioma desconhecido'}
      ]},
      {type: 'toggle', key: 'prefer1080', label: 'Priorizar Full HD (1080p)', defaultValue: true},
      {type: 'select', key: 'maxResolution', label: 'Resolução máxima', defaultValue: '2160', options: [
        {value: '720', label: 'HD (720p)'}, {value: '1080', label: 'Full HD (1080p)'}, {value: '2160', label: '4K (2160p)'}
      ], description: 'Qualidade não informada continua aparecendo com esse rótulo.'},
      {type: 'select', key: 'maxResults', label: 'Máximo de opções desta fonte', defaultValue: '30', options: [
        {value: '10', label: '10'}, {value: '30', label: '30'}, {value: '60', label: '60'}
      ]},
      {type: 'select', key: 'timeoutSeconds', label: 'Prazo lógico de busca', defaultValue: '12', options: [
        {value: '8', label: '8 segundos'}, {value: '12', label: '12 segundos'}, {value: '20', label: '20 segundos'}
      ], description: 'Algumas versões do Nuvio aguardam a rede nativa mesmo após esse prazo.'},
      {type: 'info', label: 'Uma fonte vazia pode desaparecer da lista do Nuvio. Isso não desinstala o plugin. As outras fontes do Aurora continuam independentes.'}
    ];
    if (source) fields.push({type: 'text', key: 'sourceUrl', label: 'Endereço alternativo desta fonte (opcional)', placeholder: source.baseUrl, description: 'Deixe vazio para usar o endereço padrão. Aceita somente HTTPS e preserva o contrato stream da fonte.'});
    return fields;
  }

  return {getStreams: getStreams, onSettings: onSettings, getDiagnostics: function() { return lastReport; }};
};
