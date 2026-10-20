# Histórico

## 1.0.1 · 2026-10-20

- Renova a consulta King VOD por uma chave de cache de um minuto. O teste real encontrou resposta HTTP em cache por até quatro horas contendo autorização de reprodução vencida; a consulta renovada retornou uma playlist válida. URLs e cookies recebidos continuam preservados.
- Relatório HTTP identifica o hash do bundle e os códigos de falha de transporte.

## 1.0.0 · 2026-10-20

- Primeira implementação original do Aurora PT-BR para Nuvio Mobile Full.
- Três fornecedores isolados: BsCine, King VOD e FrostStream.
- IDs IMDb/TMDB, filmes, séries e especiais; detecção de conflitos de episódio.
- Seleção por evidência declarada de áudio, filtros de qualidade e deduplicação dentro da busca.
- Preservação de URLs assinadas, headers e legendas; prazos lógicos e relatórios sem URLs.
- Build determinístico, testes de contrato do bundle e ferramenta de verificação HTTP real.
