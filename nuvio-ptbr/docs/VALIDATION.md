# Validação · 20/10/2026

## Resultado técnico

`npm run verify`: **27 testes aprovados**, incluindo o bundle distribuído em sandbox sem require, URL ou Buffer; três IDs simples e três IDs compostos usados pelo Nuvio; settings; áudio versus legendas; episódios; cabeçalhos; deduplicação; falhas e prazos.

Manifestos públicos das três fontes responderam HTTP 200 e anunciaram o recurso `stream`.

## Matriz real de fontes

Execução do arquivo distribuído com HTTP real em Node 24.19.0, em 20/10/2026 às 03:45 UTC. Relatório completo sem URLs: [validation-2026-10-20.json](validation-2026-10-20.json).

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

## Ainda depende do aparelho

Instalação no Nuvio do usuário, início de reprodução de filme/episódio e conferência do áudio. Não foram marcados como aprovados. O comportamento de timeout e player também depende da build e da rede do aparelho.

## Reproduzir os testes

```sh
cd nuvio-ptbr
npm run verify
node scripts/live.mjs --matrix --probe --require-results --output reports/live.json
```

O relatório inclui hash SHA-256 do bundle testado. Os cabeçalhos de reprodução recebidos das fontes são usados nas sondagens, mas ficam fora do relatório. O smoke test do workflow do GitHub fornece outra observação de rede; seu resultado deve ser consultado separadamente da matriz acima.
