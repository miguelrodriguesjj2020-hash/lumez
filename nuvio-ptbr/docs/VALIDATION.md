# Validação · 20/10/2026

## Resultado técnico

`npm run verify` na versão 1.0.1: **28 testes aprovados**, incluindo o bundle distribuído em sandbox sem require, URL ou Buffer; três IDs simples e três IDs compostos usados pelo Nuvio; settings; áudio versus legendas; episódios; cabeçalhos; deduplicação; falhas, prazos e renovação do cache.

Manifestos públicos das três fontes responderam HTTP 200 e anunciaram o recurso `stream`.

## Matriz real de fontes

Execução do arquivo distribuído 1.0.0 com HTTP real em Node 24.19.0, em 20/10/2026 às 03:45 UTC. Relatório completo sem URLs: [validation-2026-10-20.json](validation-2026-10-20.json). A atualização 1.0.1 abaixo corrige a renovação de respostas King VOD sem mudar os filtros dessa matriz.

| Filme/episódio | BsCine | King VOD | FrostStream |
| --- | ---: | ---: | ---: |
| Matrix | 1 | 1 | 3 |
| Frozen | 1 | 1 | 0 |
| Um Sonho de Liberdade | 1 | 1 | 3 |
| Interestelar | 1 | 1 | 7 |
| Super Mario Bros. O Filme | 1 | 1 | 7 |
| Divertida Mente 2 | 1 | 1 | 6 |
| Breaking Bad S01E01 | 1 | 1 | 2 |
| Stranger Things S01E01 | 1 | 1 | 3 |
| The Last of Us S01E01 | 1 | 1 | 3 |

Os números são **opções aceitas por evidência declarada de áudio**, não reproduções comprovadas: 9/9 itens com resultados, 26/27 respostas com opções e 52 streams. Os IDs foram conferidos no metadado Cinemeta. A amostra não mede a cobertura da maioria do catálogo.

## Sondagens de mídia

Na execução registrada, a primeira opção de cada fonte com resultado foi amostrada: 6 playlists HLS acessíveis, 3 respostas HTTP 410 e 17 falhas de socket (`UND_ERR_SOCKET`) nesta rede com proxy. Uma execução anterior encontrou 9 playlists HLS, evidenciando que a disponibilidade pode mudar mesmo com a busca respondendo normalmente.

Uma requisição independente via Python ao MP4 da BsCine respondeu HTTP 206 com assinatura `ftyp` e 4096 bytes. A mesma URL HTTP falhou no transporte Node/proxy. Isso distingue transportes e horários; não comprova reprodução no aparelho. A primeira URL proxy de Frost também respondeu 503 em uma sondagem independente.

Um init MP4 da playlist King VOD foi reconhecido pelo ffprobe como vídeo H.264 e áudio AAC. A tag de idioma era `und` (indeterminado). As playlists amostradas não declararam idioma de faixa. Não houve confirmação por escuta de PT-BR.

As sondagens não baixaram filmes completos. O plugin no Nuvio não faz essas requisições adicionais de vídeo; oferece as alternativas e identifica a evidência declarada.

## Correção de cache · 1.0.1

A comparação independente encontrou uma resposta de streams com `Age: 971` e `Cache-Control: max-age=14400`, cuja autorização de reprodução retornou 410. A mesma consulta renovada retornou uma nova autorização e playlist HLS HTTP 200. São dados novos emitidos pelo serviço; não houve alteração ou fabricação de cookies/assinaturas.

O Aurora agora renova essa consulta King VOD por uma chave de cache de um minuto. A revalidação do bundle 1.0.1 para Matrix retornou cinco opções (três fontes) e playlist King VOD HTTP 200. Breaking Bad S01E01 retornou quatro opções e playlist King VOD HTTP 200. BsCine e Frost ainda apresentaram falhas de socket no transporte Node desta rede. Veja [cache-refresh-1.0.1.json](cache-refresh-1.0.1.json) e [episode-refresh-1.0.1.json](episode-refresh-1.0.1.json), com hash do bundle atualizado.

O primeiro workflow independente no GitHub também aprovou os testes e o diagnóstico de fontes: [execução 39366227865](https://github.com/miguelrodriguesjj2020-hash/lumez/actions/runs/39366227865). Naquela rede, King VOD retornou playlist HTTP 200, BsCine excedeu o prazo de conexão de mídia e Frost não retornou opções. A aprovação do workflow exige resultado de busca para o caso testado; não significa que todas as fontes ou mídias passaram.

A atualização 1.0.1 também passou pelos jobs de testes e diagnóstico na [execução 39366585750](https://github.com/miguelrodriguesjj2020-hash/lumez/actions/runs/39366585750). O manifesto referencia um nome de bundle com versão; `check` e os testes verificam esse arquivo e seu alias para evitar divergência na distribuição.

## Ainda depende do aparelho

Instalação no Nuvio do usuário, início de reprodução de filme/episódio e conferência do áudio. Não foram marcados como aprovados. O comportamento de timeout e player também depende da build e da rede do aparelho.

## Reproduzir os testes

```sh
cd nuvio-ptbr
npm run verify
node scripts/live.mjs --matrix --probe --require-results --output reports/live.json
```

O relatório inclui hash SHA-256 do bundle testado. Os cabeçalhos de reprodução recebidos das fontes são usados nas sondagens, mas ficam fora do relatório. O smoke test do workflow do GitHub fornece outra observação de rede; seu resultado deve ser consultado separadamente da matriz acima.
