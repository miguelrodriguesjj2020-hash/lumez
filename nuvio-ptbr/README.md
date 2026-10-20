# Aurora PT-BR · Nuvio

Fornecedores de reprodução para os filmes e episódios dos seus catálogos existentes, incluindo Cinemeta. Consultam **BsCine, King VOD e FrostStream** e selecionam os links cuja fonte informa dublagem ou áudio em português.

## Instalar

No **Nuvio Mobile Full → Configurações → Plugins → Adicionar repositório**, cole:

```text
https://raw.githubusercontent.com/miguelrodriguesjj2020-hash/lumez/refs/heads/main/nuvio-ptbr/manifest.json
```

Mantenha os três fornecedores do Aurora ativados. Abra um filme ou episódio pelo Cinemeta e procure **Aurora PT-BR** na seleção de fontes. Com a opção de agrupar por repositório ativada, eles aparecem juntos. O manifesto acima é de **Plugins**, não de Add-ons Stremio.

Não exige servidor seu, chave de debrid ou alteração dos catálogos. Seus outros fornecedores podem continuar instalados.

## Como seleciona

- Usa o IMDb ID do Cinemeta; preserva temporada e episódio, incluindo especiais da temporada zero.
- Consulta três serviços independentes. O Nuvio pode apresentar o resultado de um fornecedor enquanto outro ainda busca.
- Mostra dublagem e português declarados pela fonte; oculta versões apenas legendadas e idioma desconhecido por padrão.
- Separa português genérico de PT-BR, preserva cabeçalhos e legendas, remove URLs duplicadas dentro da busca e mantém links assinados diferentes.
- Prioriza 1080p por padrão. Qualidade ausente continua como **Qualidade não informada**.
- Rejeita identificadores/episódios explicitamente divergentes, torrents sem URL HTTP e resultados que exigem DRM.
- Registra contagens e motivos de descarte sem incluir URLs de mídia ou chaves no relatório do Aurora.

O plugin não gera nem injeta faixas de dublagem. Disponibilidade e reprodução dependem dos serviços consultados. Não há promessa de dublagem para todo o catálogo ou para uma porcentagem ainda não medida.

## O que significam os rótulos

| Rótulo | Evidência utilizada |
| --- | --- |
| PT-BR informado pela fonte | Campo de áudio ou rótulo explícito PT-BR/Pob/Português brasileiro |
| Dublado informado pela fonte | Rótulo Dublado de um dos serviços brasileiros selecionados |
| Português informado; variante incerta | Português informado sem distinguir Brasil e Portugal |
| Áudio português não informado | Sem evidência suficiente; aparece somente no modo Todos |

Nenhum desses rótulos significa idioma confirmado por escuta. Bandeira ou PT-BR associados somente a **legendas**, sinopse em português e `DUAL` isolado não contam como áudio português.

## Ajustes

Cada fornecedor tem configurações próprias no Nuvio. Os padrões já permitem usar o plugin.

| Ajuste | Padrão |
| --- | --- |
| Áudio | Dublado/PT-BR e português sem variante |
| Prioridade | 1080p |
| Resolução máxima conhecida | 2160p |
| Opções por fornecedor | 30 |
| Prazo lógico | 12 segundos |
| Endereço alternativo | Vazio: usa o endereço distribuído |

Para ser mais restritivo, selecione **Somente PT-BR ou Dublado informado**. O campo de endereço alternativo serve para mudança de domínio do mesmo serviço e exige HTTPS.

IDs TMDB numéricos usam a chave TMDB já fornecida pelo app para encontrar o IMDb correspondente, quando disponível. Sem essa chave, a fonte com suporte direto a TMDB ainda pode ser consultada. Uma falha nessa conversão é registrada; o número não é adivinhado como IMDb.

## Se a fonte desaparecer ou não tocar

O Nuvio oculta fornecedores que terminam sem streams. Isso também ocorre se o filtro descartar tudo; o repositório continua instalado. Tente outro fornecedor do Aurora. Um link retornado pode expirar ou falhar na reprodução mesmo com o serviço de busca disponível.

Se os três não aparecerem, confira se o repositório e seus fornecedores estão ativados e atualize o repositório. Para relatar um problema, informe título, ano, temporada/episódio, versão do Nuvio e qual fornecedor foi usado. Não é necessário enviar chaves ou URLs de reprodução.

## Estado e limites da entrega

Consulte [VALIDATION.md](docs/VALIDATION.md) para os testes reais e [CHECKPOINT.md](CHECKPOINT.md) para o estado da entrega. A validação do contrato JS e de respostas HTTP não substitui reprodução e seleção de áudio no seu celular.

O prazo de busca é lógico. Algumas versões do Nuvio ignoram `fetch(signal)` e aguardam jobs nativos de rede antes de entregar o resultado; nelas o app pode demorar mais. Os fornecedores separados reduzem o efeito de uma fonte lenta sobre as outras. Não há sondagem de vídeo dentro do plugin para evitar acrescentar essas esperas à busca.

O pacote destina-se ao runtime JS do **Nuvio Mobile Full**. O contrato foi revisado no código oficial e testado em sandbox; outras plataformas e runtimes antigos não foram validados. Não modifica a interface do Nuvio nem oferece catálogo próprio nesta versão.

## Desenvolver e diagnosticar

Node.js 22 ou superior; sem dependências npm externas.

```sh
cd nuvio-ptbr
npm run build
npm run verify
npm run live -- --matrix --probe --require-results --output reports/live.json
```

`build` gera o manifesto e `providers/aurora.js`; `check` detecta saída desatualizada. `test` testa o motor e o arquivo distribuído sem APIs Node no sandbox. `live` executa o arquivo distribuído com HTTP real e salva apenas relatório sem URLs. `--probe` lê no máximo 32 KiB por opção amostrada; não baixa filmes completos nem comprova o idioma falado. Redes corporativas com proxy podem exigir a configuração de proxy do Node.

O workflow do GitHub verifica o build e os testes em cada mudança e faz uma consulta de fumaça de fontes públicas. Falhas externas aparecem no job de diagnóstico e não são transformadas em prova de reprodução.

[Contrato e arquitetura](docs/CONTRACT.md) · [Objetivo](GOAL.md) · [Histórico](CHANGELOG.md) · [Licença MIT](LICENSE)
