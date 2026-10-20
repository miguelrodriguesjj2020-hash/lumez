# Contrato e arquitetura

## Runtime alvo

Revisão do código oficial do Nuvio Mobile em 20/10/2026, commit [`324afcffb962f1f7df45c5fa951131acec5a15a7`](https://github.com/NuvioMedia/NuvioMobile/tree/324afcffb962f1f7df45c5fa951131acec5a15a7).

- `PluginModels.kt`: manifesto com `name`, `version`, `scrapers`, `hasSettings`, tipos `movie` e `tv`.
- `PluginRepository.kt`: ID salvo como `${manifestUrl.lowercase()}:${info.id}`. O adaptador reconhece esse ID composto e o ID simples usado por alguns clientes.
- `PluginRuntime.kt` / `JsBindings.kt`: módulo CommonJS; chama `getStreams(id, mediaType, season, episode)`. Também publicamos `globalThis.getStreams` e `onSettings`.
- `HostFunctions.kt`: `SCRAPER_ID`, `SCRAPER_SETTINGS`, `TMDB_API_KEY` vêm do host. Não há acesso a credenciais de debrid por esse contrato.
- `PluginSettingsDialog.kt`: campos header, info, text, toggle e select; padrões via `defaultValue`.
- `StreamFetchSupport.kt`: nome, URL, qualidade, idioma, tamanho, cabeçalhos e legendas são preservados pela conversão. O app pode reordenar alfabeticamente; os rótulos possuem posições visíveis dentro de cada fornecedor.

Os arquivos ficam sob `composeApp/src/`, nos pacotes `com/nuvio/app/features/plugins` e `com/nuvio/app/features/streams` do repositório oficial. A build instalada pode divergir da revisão consultada.

## Fluxo

O manifesto instala três scrapers com IDs próprios e o mesmo bundle. Cada chamada seleciona apenas sua fonte. Assim, os jobs do próprio Nuvio isolam as buscas e podem mostrar resultados parciais do repositório. Não há resultados incrementais dentro de um único `getStreams`.

O motor aceita IMDb e TMDB explicitamente. Para um IMDb do Cinemeta não há pesquisa textual nem consulta extra obrigatória: usa `/stream/movie/{imdb}.json` ou `/stream/series/{imdb}:{season}:{episode}.json`, com o ID codificado no segmento da URL. O endpoint é o protocolo público do Stremio, não código remoto executável.

Para TMDB, tenta resolver o IMDb com a chave fornecida pelo app; a fonte compatível também pode receber `tmdb:{id}`. Temporada/episódio são obrigatórios para séries. Conflitos entre ID e argumentos impedem a busca.

O motor consolidado também permite consultar várias fontes e deduplicar em uma chamada (usado por consumidores do módulo sem `SCRAPER_ID`). Na instalação padrão, a deduplicação ocorre dentro de cada scraper. Não há estado compartilhado entre runtimes do Nuvio para remover duplicatas entre os três fornecedores.

## Áudio e identidade

Dados de áudio específicos têm precedência sobre rótulos. Rótulos de legendas são removidos da inferência; `DUAL`, `MULTI`, BRRip e nomes portugueses não comprovam PT-BR. `Dublado` é uma declaração do serviço brasileiro, não uma inspeção de áudio. Português genérico não é promovido para brasileiro.

Rejeitamos IMDb/episódio explicitamente conflitantes na resposta. Uma resposta sem esses campos continua dependendo da correspondência feita pelo upstream. Não afirmamos validar por reconhecimento visual ou sonoro qual filme foi entregue. Metadados TMDB de título/ano não são usados como prova de idioma de áudio.

## Prazos, limites e diagnóstico

Há limite de 150 candidatos por resposta, tamanho máximo de JSON, teto de resultados e prazo lógico por chamada. Timers curtos são encerrados ao concluir a resposta. O AbortController é usado quando disponível; não há busy-wait nem timers falsos nos hosts sem timers.

O bridge nativo revisado não usa `signal` para cancelar sua requisição. Além disso, o runtime pode aguardar jobs nativos mesmo após uma Promise resolver. Por isso o motor não promete um limite de ponta a ponta de 12 s. A restrição de 60 s pertence ao Nuvio, não ao Aurora. Sem timers, a busca ainda funciona, dependendo do timeout do host.

Diagnósticos distinguem HTTP, rede, JSON inválido, prazo, ID não suportado, resposta vazia e itens filtrados. Preservam somente IDs de conteúdo, nomes de fontes, contagens e códigos; não incluem URLs, cabeçalhos, mensagens brutas de erro ou chaves. Logs da camada de rede do próprio app têm comportamento independente.

## Fontes e autoria

Os três endereços foram confirmados por seus manifestos públicos e consultas `stream`. Uma lista inicial de endereços foi encontrada no [Kazuji Media](https://github.com/Kazuji-Media/kazuji-nuvio-plugin); nenhum código desse projeto ou dos scripts obfuscados do Liet foi incorporado.

Referências primárias: [repositório oficial Nuvio](https://github.com/NuvioMedia/NuvioMobile), [protocolo Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html) e manifestos dos serviços listados em `src/sources.json`. O código Aurora é original e distribuído sob MIT. Não armazena mídia, não cria dublagens e não contorna DRM, login ou desafios de acesso.
