# Objetivo de produção

Entregar um repositório de plugins Nuvio instalável por URL, usando os catálogos já existentes do usuário para encontrar opções informadas como dubladas/PT-BR e português, com diagnóstico transparente de disponibilidade.

## Critérios de entrega técnica

- Manifesto nativo e bundle determinístico publicados no GitHub do usuário.
- Filmes e episódios identificados sem misturar IMDb e TMDB.
- Três fontes HTTP independentes, sem exigir assinatura ou servidor do usuário.
- Dublagem declarada separada de português genérico e de idioma desconhecido.
- Preservação de headers e legendas e filtros contra episódios conflitantes.
- Testes do motor, dos IDs compostos e do bundle distribuído no formato usado pelo Nuvio.
- Consultas reais de filmes e episódios com evidências e falhas registradas.
- Instruções de instalação e reprodução do diagnóstico.

## Critério que depende do aparelho

Instalar no Nuvio do usuário, abrir um filme e um episódio, verificar início da reprodução e selecionar/ouvir o áudio. Essa etapa não pode ser marcada como concluída por um teste de JSON, playlist ou metadados de faixa.

## Escopo desta versão

Reprodução integrada ao Cinemeta e outros catálogos compatíveis. Catálogo próprio, criação de dublagem, hospedagem de mídia e mudanças na interface do Nuvio ficam fora da versão 1.0.0. Cobertura majoritária do catálogo exige uma medição representativa; a pequena amostra funcional não comprova essa cobertura.
