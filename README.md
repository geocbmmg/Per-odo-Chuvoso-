# Sala de Situação — Período Chuvoso · CBMMG

Nova plataforma da **Sala de Situação do Período Chuvoso** do Corpo de Bombeiros Militar
de Minas Gerais. Substitui gradualmente o painel atual em ArcGIS Experience Builder
(portal `geoprocessamento.bombeiros.mg.gov.br`) por uma aplicação web própria hospedada na
Vercel. Segue o padrão de produto do **GeoRescue**.

> **Fase 0 — Fundação e prova de conceito.** O ArcGIS Enterprise continua sendo a fonte
> de verdade e o acesso é **somente leitura**: só `query`, nunca `applyEdits`. Os
> formulários Survey123 e o painel atual seguem funcionando durante toda a migração.

---

## Visão

- **Uma tela em vez de iframes aninhados.** O mapa e os indicadores são lidos direto dos
  feature services do CBMMG e das APIs oficiais, sem embutir dashboards de terceiros.
- **Tempo real com carimbo.** Todo bloco de dados mostra "Atualizado às HH:MM" e a origem
  da leitura. Se uma fonte cair, a tela continua com a **última leitura válida** e avisa.
- **Mobile-first, tema claro e escuro, em português.** Datas sempre no horário de Brasília.
- **Organização territorial do CBMMG em todo lugar:** COB → BBM/UEOp → fração → município.
  Os registros normalizados carregam os quatro níveis. Registros sem COB aparecem como
  **"Sem COB"**, não somem.
- **LGPD por construção.** A normalização no servidor copia só os atributos operacionais.
  Nome de militar, nº BM e telefone nunca chegam ao navegador.

### Módulos

| Módulo | Situação na Fase 0 | Substitui |
|---|---|---|
| **Visão Geral** | Mapa de MG (COBs, alertas, ações RRD, ocorrências complexas) + indicadores | Panorama |
| **Monitoramento** | Avisos INMET vigentes para MG + previsão de chuva por COB (Open-Meteo) | Risco Meteorológico |
| Alertas & Ações RRD | Placeholder | Aba Alertas |
| NAC | Placeholder | Aba NAC |
| Ocorrências Complexas | Placeholder | Oc. Complexas + Histórico |
| Boletim | Placeholder | Boletim v1/v2 + Relatório Final |
| **Status das fontes** (`/status`) | Estado de cada fonte (ok / atrasada / fora do ar) | — |

---

## Arquitetura

```
Navegador ──► Páginas (Server Components) ──► lib/sources/* ──► ArcGIS REST (só /query)
    │                                              │            INMET (RSS)
    └──► /api/* (Route Handlers) ─────────────────┘            Open-Meteo
                  ▲                         cache + última leitura válida
     Vercel Cron ─┘ /api/ingest/*           (lib/fontes/leituras.ts)
```

- **Next.js 16 (App Router) + TypeScript.** Páginas server-side; o mapa (MapLibre GL) é o
  único componente pesado no cliente.
- **Toda chamada às fontes de dados passa pelo servidor.** No navegador ficam só `/api/*`,
  os tiles do mapa base, o brasão do CBMMG (imagem pública do portal ArcGIS; se não carregar,
  aparece o monograma) e, se a cópia local faltar, o worker do MapLibre no unpkg. Nenhum
  token chega ao front-end.
- **Cache e fallback** (`lib/fontes/leituras.ts`): cada fonte tem um ttl. Requisições
  simultâneas são unificadas. Depois de uma falha, a fonte não é reconsultada por até 60 s,
  e se ela cair vale a última leitura válida, com `origem: "ultima-valida"`. Por padrão o
  armazém fica **na memória de cada instância serverless**: não é compartilhado e se perde em
  cold start. Com `ARMAZEM_LEITURAS=postgres` (e `DATABASE_URL`, depois de `npm run db:push`)
  a leitura também vai para a tabela `leituras_fontes`, sobrevive a cold starts e vale para
  todas as instâncias (`lib/fontes/armazem-servidor.ts`). As respostas de `/api/*` também vão
  para o CDN da Vercel com `s-maxage`, um `stale-while-revalidate` curto e `stale-if-error`
  de um dia (só quando a função falha).
- **Estado das fontes** (`statusDaFonte`): `ok`, `atrasada` (falhou na última tentativa ou
  passou da tolerância, exibindo a última leitura válida), `fora-do-ar` (sem leitura válida
  ou velha demais) e `nao-implementada` (stubs). Os limites por fonte ficam em
  `lib/fontes/catalogo.ts`.
- **Campos do ArcGIS resolvidos por candidatos** (`lib/sources/arcgis/campos.ts` e
  `camadas.ts`). Os formulários Survey123 nomeiam campos a partir das perguntas, então cada
  atributo lógico (COB, nº da chamada CAD, município…) tem uma lista de nomes e aliases
  aceitos. Os rótulos das escolhas vêm dos domínios da camada. **A página `/status` mostra
  qual campo foi resolvido para cada atributo**: se algum aparecer como "não encontrado",
  ajuste a lista em `camadas.ts`.
- **Regra de "pendente"** (`lib/dados/indicadores.ts`): alerta do período sem nenhuma ação
  RRD, de qualquer data, com o mesmo nº de chamada CAD (comparado só pelos dígitos). Alertas
  sem nº de chamada contam como pendentes e são informados à parte.
- **Período chuvoso:** de 1º/out a 31/mar no horário de Brasília (`lib/dominio/periodo.ts`).
  A Visão Geral permite alternar entre temporada atual, temporada anterior e todo o histórico.
- **Banco:** Drizzle ORM + Postgres (Neon / Vercel Postgres) em `lib/db/`. Na Fase 0 nada é
  migrado e a aplicação funciona sem `DATABASE_URL`.

### Estrutura

```
app/
  page.tsx                 Visão Geral
  monitoramento/           Avisos INMET + previsão por COB
  status/                  Estado das fontes
  alertas-acoes-rrd/ nac/ ocorrencias-complexas/ boletim/   (placeholders)
  api/
    arcgis/[camada]/       GeoJSON normalizado das camadas do CBMMG
    indicadores/           Totais, pendentes, por COB, por tipo de risco
    inmet/avisos/          Avisos vigentes/futuros que afetam MG
    meteo/previsao/        Chuva prevista nas sedes dos COBs
    status/                Estado das fontes + resolução de campos
    ingest/[job]/          Jobs da Vercel Cron (stubs na Fase 0)
components/
  ui/                      Primitivos shadcn/ui no padrão GeoRescue
  layout/                  Trilho, cabeçalho institucional, carimbo "atualizado às", indicador de fontes
  mapa/                    Mapa MapLibre (COBs, camadas, legenda, controles, balões)
  visao-geral/ graficos/   KPIs, avisos INMET, gráficos Recharts e tabela por COB
  monitoramento/ status/   Blocos das páginas de Monitoramento e Status
  comum/                   Seletor de período, fonte indisponível, atualização automática
lib/
  sources/                 Clientes tipados: arcgis/, inmet/, open-meteo/ (+ stubs ana/, glofas/, rainviewer/)
  sources/exemplos/        Dados de exemplo (modo demonstração e testes)
  fontes/                  Catálogo, cache/fallback, estado das fontes, fetch com timeout
  dominio/                 Tipos normalizados e período chuvoso
  dados/                   Indicadores, Visão Geral, painel de status
  mapa/                    Estilo do mapa (função pura), simbologia, mapas base, máscara de MG
  db/                      Drizzle (schema + cliente)
  territorio/              COB → BBM/UEOp → fração → município; tabela oficial de frações; sedes
  datas.ts                 Datas em America/Sao_Paulo
  env.ts                   Variáveis de ambiente (server-only, validadas com zod)
docs/                      Padrão visual, fontes de dados, território, métricas de risco, Fase 1
scripts/                   copiar-worker-maplibre.mjs (postinstall); arcgis/ (criação das camadas da Fase 1)
public/geo/                Contorno de Minas Gerais
tests/                     vitest (parsers das fontes, cache, indicadores, território, mapa)
```

---

## Como rodar

Requisitos: **Node.js 22+** e npm.

```bash
npm install                     # o postinstall copia o worker do MapLibre para public/vendor/
cp .env.example .env.local      # ajuste se necessário
npm run dev                     # http://localhost:3000
```

> O MapLibre 6 carrega o worker por `import.meta.url`, e o bundle do Next não preserva
> esse caminho. Por isso `scripts/copiar-worker-maplibre.mjs` copia o worker para
> `public/vendor/maplibre-gl/` em todo `npm install`, inclusive no build da Vercel. A
> pasta não é versionada. Sem ela, o mapa usa a mesma versão no unpkg.

Sem acesso às fontes (rede bloqueada, apresentação ou desenvolvimento offline):

```bash
DADOS_EXEMPLO=1 npm run dev
```

O **modo demonstração** usa dados fictícios no formato real das fontes (ArcGIS, INMET,
Open-Meteo) e mostra uma faixa "MODO DE DEMONSTRAÇÃO" em todas as telas. Nunca use em
produção.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build de produção / servidor de produção |
| `npm test` | Testes (vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera os tipos de rotas do Next e roda o `tsc` |
| `npm run db:generate` / `db:push` | Drizzle: gera migrações / aplica o schema (Fase 1) |

---

## Variáveis de ambiente

Documentadas em [`.env.example`](.env.example). Todas são lidas **só no servidor**
(`lib/env.ts` importa `server-only`). Nenhuma usa o prefixo `NEXT_PUBLIC_`. Uma variável
com formato inválido não derruba a aplicação: ela é ignorada (vale o padrão), e só o nome
vai para o log e para `GET /api/status` (`variaveisInvalidas`).

| Variável | Obrigatória | Uso |
|---|---|---|
| `ARCGIS_SERVICES_URL` | não (tem padrão) | Base dos feature services hospedados do CBMMG |
| `ARCGIS_PORTAL`, `ARCGIS_USER`, `ARCGIS_PASS` | não | Reservadas para leitura de camadas restritas em fases futuras. **Não usadas na Fase 0** (somente leitura de serviços públicos) |
| `DATABASE_URL` | não | Postgres (Neon / Vercel Postgres) |
| `ANA_IDENTIFICADOR`, `ANA_TOKEN` | não | ANA HidroWebService (stub na Fase 0) |
| `CRON_SECRET` | **sim em produção** | Protege `/api/ingest/*` (a Vercel envia `Authorization: Bearer …`) |
| `ARMAZEM_LEITURAS` | não | `memoria` (padrão) ou `postgres` (última leitura válida no banco) |
| `DADOS_EXEMPLO` | não | `1` = modo demonstração |
| `FONTES_TIMEOUT_MS` | não | Tempo máximo de cada chamada externa (padrão 15000) |

---

## Deploy na Vercel

1. Na Vercel: **Add New… → Project → Import** o repositório `geocbmmg/Per-odo-Chuvoso-`.
   O framework (Next.js) é detectado sozinho. O diretório raiz é a raiz do repositório.
2. Em **Settings → Environment Variables**, cadastre pelo menos `CRON_SECRET` (marcar como
   *Sensitive*). As demais são opcionais nesta fase.
3. Deploy. A região das funções é `gru1` (São Paulo), definida em `vercel.json`.

### Crons

`vercel.json` agenda os jobs `/api/ingest/{arcgis,inmet,meteo,hidrologia}` **uma vez por
dia** (06:00–06:15 de Brasília). No plano **Hobby** a Vercel **recusa o deploy** de crons
que rodem mais de uma vez por dia. Quando a ingestão gravar no banco (Fase 1), as
frequências previstas são:

| Job | Frequência alvo | Cron |
|---|---|---|
| `inmet` | 10 min | `*/10 * * * *` |
| `arcgis` | 5 min | `*/5 * * * *` |
| `meteo` | 1 h | `0 * * * *` |
| `hidrologia` | 15 min | `*/15 * * * *` |

Essas frequências exigem o plano **Pro** ou um agendador externo (ex.: cron-job.org)
chamando a rota com `Authorization: Bearer $CRON_SECRET`. Na Fase 0 os jobs só consultam as
fontes e devolvem o estado de cada uma. Com `ARMAZEM_LEITURAS=postgres`, a leitura também
fica gravada para todas as instâncias. As telas funcionam sem os jobs.

---

## Fontes de dados

| Fonte | Estado na Fase 0 | Crédito exibido |
|---|---|---|
| ArcGIS do CBMMG: limites dos COBs, Emissão de Alertas (camada 1), Ações RRD, Ocorrências Complexas | Implementada (só leitura) | CBMMG — ArcGIS Enterprise |
| ArcGIS do CBMMG: Cotas SACE, Anúncio NAC | Catalogada (próximas fases) | — |
| INMET — Avisos (RSS) | Implementada | Avisos: INMET (domínio público) |
| Open-Meteo — Previsão | Implementada | Previsão: Open-Meteo.com (CC BY 4.0) |
| ANA — HidroWebService | Stub | — |
| Open-Meteo Flood (GloFAS) | Stub | — |
| RainViewer (radar) | Stub | — |

Formatos, peculiaridades e decisões de cada fonte estão em
[`docs/fontes-de-dados.md`](docs/fontes-de-dados.md). Um exemplo: o `pubDate` do RSS do
INMET repete o início do aviso com um fuso falso, e o feed mantém avisos vencidos.

---

## Padrão visual

A interface segue o padrão do GeoRescue: tema escuro por padrão com acento ouro, trilho
lateral com o brasão do CBMMG, cartões e pílulas, "dois sinais, nunca só a cor", números
tabulares e as cores dos 6 COBs tratadas como dado. Referência completa em
[`docs/padrao-visual.md`](docs/padrao-visual.md).

- **Gráficos:** paleta validada para daltonismo e contraste nos dois temas, com o script
  da skill de visualização de dados.

  | Série | Escuro | Claro |
  |---|---|---|
  | Com ação RRD | `#3B9EDB` | `#1F6FA8` |
  | Pendente | `#D9692A` | `#B4561F` |

  Barras horizontais com rótulos medidos (quebram linha em vez de se sobrepor), valor no
  fim da barra e tabela alternativa.
- **Cores dos COBs:** as herdadas do GeoRescue **não passam** no teste de daltonismo
  (6º × 2º COB). Por isso o COB é sempre identificado também por **texto**: rótulo no
  mapa, eixo, legenda e tabela. Nos gráficos, a cor da barra indica o estado, não o COB.

---

## Roteiro

- **Fase 0 (este repositório):** fundação, mapa e indicadores lendo o ArcGIS, avisos INMET,
  previsão Open-Meteo e `/status`.
- **Fase 1 (desenho em [`docs/fase-1.md`](docs/fase-1.md)):**
  - emissão e fila de alertas na própria Sala, substituindo o Survey123, com gravação em
    feições do ArcGIS pré-desenhada;
  - login pelos usuários do GeoRescue;
  - mapa de risco por município (INMET, CEMADEN e alertas do CBMMG);
  - chuva prevista nos 853 municípios, no modelo do GeoRisk, com as matrizes oficiais
    ([`docs/metricas-risco.md`](docs/metricas-risco.md)).
- **Fase 2:** ANA/SACE e estações hidrológicas, GloFAS, radar, NAC e notificações
  (Telegram).
- **Fase 3:** migração para o cartão **Período Chuvoso** do GeoRescue e Ocorrências
  Complexas/SCI.
- **Fase 4:** boletim matinal e relatórios gerados automaticamente (PDF/DOCX).
