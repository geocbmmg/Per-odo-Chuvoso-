# Fontes de dados da Sala de Situação

Regras comuns a todas as fontes:

- **Toda chamada externa sai do servidor.** O navegador só usa `/api/*`, mais os tiles do
  mapa base.
- **Fallback.** Cada fonte tem cache com ttl, unificação de requisições simultâneas e
  espera após falha. Se a fonte cair, vale a última leitura válida
  (`lib/fontes/leituras.ts`).
- **Carimbo.** Toda resposta traz `meta.atualizadoEm` (ISO, UTC) e `meta.origem`:
  - `ao-vivo`, `cache` ou `ultima-valida`;
  - `exemplo` no modo demonstração.
  A UI mostra "Atualizado às HH:MM" no horário de Brasília.
- **Parsers puros e testados** (`tests/*.test.ts`). Cada um usa um exemplo com a estrutura
  real da fonte.

> **Verificação pendente:** o container onde a Fase 0 foi construída não alcançava o ArcGIS
> do CBMMG, o INMET nem a Open-Meteo (bloqueio de rede). Os formatos abaixo vêm da
> documentação oficial e de cópias reais publicadas. No primeiro acesso com rede, abra
> **`/status`**: lá aparecem o estado de cada fonte e, para o ArcGIS, qual campo do
> formulário foi resolvido para cada atributo.

---

## ArcGIS Enterprise do CBMMG (fonte de verdade)

**Base:** `https://geoprocessamento.bombeiros.mg.gov.br/server/rest/services/Hosted/`
(`ARCGIS_SERVICES_URL`).

| Camada | Serviço / camada configurada | Uso |
|---|---|---|
| Limites dos COBs | `MG_DISSOLVIDO_COB/FeatureServer/0` | Mapa |
| Emissão de Alertas | `service_6f690a1b09bf4bab9d6b831de9fc3767_form/FeatureServer/1` | Mapa + indicadores |
| Ações RRD | `service_84097bf8336f4667bba0441c1571cd94_form/FeatureServer/0` + repetição "Ações" | Mapa + indicadores |
| Ocorrências Complexas | `service_f0ff0b0661d941a0aac4db84ba95f566_form/FeatureServer/0` | Mapa + contadores |
| Cotas de Inundação (SACE) | `service_7736003ef907440aac59eeb7031941dc_form/FeatureServer` | Catalogada |
| Anúncio Operacional Diário (NAC) | `service_69637c0e22b84971a20d9d3f617f605c/FeatureServer` | Catalogada |

**O índice configurado é só a preferência.** A Sala lê todas as camadas e tabelas do serviço
e usa a que resolve mais **campos-chave** do formulário (nº da chamada, COB, fração,
município, tipo e níveis de risco). Em caso de empate, vale o índice configurado. Se a
escolha divergir do configurado, `/status` mostra um aviso: por exemplo, os Alertas estão
configurados na camada 1, mas o `pulldata` do formulário de Ações RRD consulta a camada 0. O
código está em `lib/sources/arcgis/deteccao.ts` e `plano.ts`.

**Como é lido (somente leitura).** Código em `lib/sources/arcgis/cliente.ts`. Não existe
função de escrita, e o montador de URL recusa nomes de serviço fora de `[A-Za-z0-9_]`.

1. `GET <serviço>/FeatureServer/layers?f=json`: todas as camadas e tabelas, numa chamada,
   com os `fields` e os **domínios** (`codedValues`). O Survey123 grava o *name* da escolha
   e o rótulo fica no domínio.
2. `GET <camada>/query?where=1=1&outFields=*&returnGeometry=true&outSR=4326&f=json`, com
   paginação por `resultOffset`/`resultRecordCount` enquanto vier
   `exceededTransferLimit: true`.
3. Polígonos com `maxAllowableOffset=0.002` e `geometryPrecision=5`, para reduzir o volume.
4. **Ações RRD:** as ações executadas ficam na **repetição "Ações"** do formulário, uma
   tabela filha (`acao`, `reds`) ligada ao registro principal por `parentglobalid`. A Sala
   consulta essa tabela e junta as ações ao registro pelo `globalid`. `/status` mostra
   quantas linhas foram ligadas.

### Esquema dos formulários reais (XLSForms de 02/10/2026)

| Atributo | Emissão de Alertas | Ações RRD |
|---|---|---|
| Data/hora | `datain` | `datain` |
| Nº da chamada | `chamada` (`AAAA-NNNNNNNN-N`) | `chamada` (busca o alerta via `pulldata`) |
| COB | `cob` (código `1_COB`) | `cob` |
| Fração | `ueop` (código da fração, ex.: `1_BBM_2CIA_1PEL_Ouro_Preto_1_COB`) | `ueop` |
| Município | `municipio` (código, ex.: `Acucena`) | `municipio` |
| Tipo de risco | `tipo` | `alerta` |
| Nível | `nivel` (meteorológico), `inundacao` (hidrológico), `deslizamento` (geológico) | — |
| Chuva | `mmh` (mm/h), `mmpor` (mm em 24 h) | — |
| Hidrológico | `bacia`, `rio`, `cota` (cm) | — |
| Geológico | `indice` (índice de risco) | — |
| Validade | `validade` | — |
| Ações | — | repetição: `acao`, `reds` |

Como cada campo é interpretado:

- **Fração.** O campo `ueop` traz a fração completa. A tabela oficial de 96 frações
  (`lib/territorio/fracoes-cbmmg.json`, extraída do XLSForm) a decompõe em COB → UEOp →
  fração e completa o COB quando ele falta.
- **Município.** O código do município vira o nome com acentos (`Acucena` → `Açucena`).
- **Tipo de risco.** É normalizado para **Meteorológico**, **Hidrológico** ou **Geológico**.
  Os rótulos do formulário têm erros de digitação ("Metereológico (Chuva)", "Hidrológico
  (Inuncação)"), e o agrupamento não pode depender deles.
- **Nível.** Vale o campo do tipo de risco que estiver preenchido.
- **Dados pessoais** (`numero`, `nome`, `posto_grad`, `unidade`) não são copiados.

**Peculiaridades tratadas:**

- **Erro com HTTP 200.** O ArcGIS responde `{"error": {"code", "message", "details"}}` com
  status 200. O cliente transforma isso em `ErroArcGIS`.
- **Datas** `esriFieldTypeDate` chegam em epoch **ms** UTC.
- **Ponto 0,0.** O Survey123 grava `0,0` quando o ponto não é informado. Esses pontos ficam
  com geometria `null`: entram nos indicadores, mas não no mapa.
- **Anéis dos polígonos.** O Esri usa anel externo horário e buraco anti-horário numa lista
  plana. A conversão reagrupa em Polygon/MultiPolygon e reorienta para a RFC 7946.
- **Nomes de campo variam por formulário.** Cada atributo lógico tem uma lista de
  candidatos de nome ou alias (`camadas.ts`), testados **na ordem da lista**: para cada
  candidato, o nome e depois o alias. Assim um alias específico ("Data de emissão") vence um
  campo genérico listado depois (`CreationDate`). A correspondência ignora caixa, acentos e
  pontuação. O resultado da resolução aparece em `/status`.
- **Datas em texto.** `DateOnly` ("2026-10-01") vira 00:00 de Brasília; texto sem offset é
  horário de Brasília (inclusive `dd/mm/aaaa`); epoch de 10 dígitos é em segundos.
- **LGPD.** Só os atributos mapeados são copiados para o GeoJSON. Nome do militar, nº BM,
  posto/graduação, unidade, telefone e comandante do incidente são descartados no servidor,
  e um teste garante isso.
  O candidato genérico `nome` ficou fora do título das ocorrências por esse motivo.

**Regras de negócio derivadas:**

- **Pendente:** alerta do período sem ação RRD, de qualquer data, com o mesmo nº de chamada
  CAD. A comparação usa só os dígitos, sem zeros à esquerda: `CAD 000123456` = `123456`.
- **Período chuvoso:** de 1º/out a 31/mar (horário de Brasília). As ocorrências em
  andamento e em monitoramento contam sempre; as finalizadas só no período.

---

## INMET — Avisos meteorológicos (RSS)

**URL:** `https://apiprevmet3.inmet.gov.br/avisos/rss`. Conteúdo em domínio público, com
citação da fonte. Código em `lib/sources/inmet/`.

Formato confirmado por cópias reais do feed publicadas em repositórios públicos:

- **Item:** `title`, `link`, `description` (CDATA), `pubDate` e `guid`. `guid` e `link`
  apontam para o CAP XML do aviso, e o ID é o número final.
- **`description`:** tabela HTML com as linhas `Status`, `Evento`, `Severidade`, `Início`,
  `Fim`, `Descrição`, `Área` e `Link Gráfico`.
- **Início/Fim:** `AAAA-MM-DD HH:MM:SS.0`, **horário de Brasília sem offset**. Lidas como
  UTC, um aviso até 23:59 sumiria às 20:59.
- **O `pubDate` do item NÃO é a publicação.** Ele repete o Início com um `+0000` falso, por
  isso é ignorado.
- **O feed mantém avisos vencidos.** Numa cópia real, 87 de 94 itens já tinham expirado. A
  Sala filtra pelo Fim, com bordas inclusivas. Isso resolve o boletim que exibia aviso de
  julho em outubro.
- **Cancelamentos e atualizações são itens novos.** O original continua no feed.
  `consolidarAvisos()` remove o aviso cancelado junto com o cancelamento, além das
  duplicatas por conteúdo: mesmo evento, severidade, início e fim, com áreas contidas. Fica o
  item mais completo/recente.
- **Área:** lista de **mesorregiões do IBGE**, sem UF. O filtro de MG usa o conjunto exato
  das 12 mesorregiões mineiras: buscar "Minas" no texto perderia Zona da Mata, Campo das
  Vertentes, Vale do Rio Doce etc.
- **Severidade:**

  | Severidade | Cor | Código CAP |
  |---|---|---|
  | Perigo Potencial | amarelo `#FFFE00` | Moderate/Minor |
  | Perigo | laranja `#F96602` | Severe |
  | Grande Perigo | vermelho `#F80703` | Extreme |

  Valor desconhecido fica em cinza, nunca na cor mais grave.
- **Feed sem itens = falha da fonte.** O feed sempre traz o histórico recente, então vazio
  não significa "sem avisos".

---

## Open-Meteo — Previsão

**URL:** `https://api.open-meteo.com/v1/forecast`. Uso não comercial, com atribuição
**"Open-Meteo.com (CC BY 4.0)"**, exibida na tela. Código em `lib/sources/open-meteo/`.

- **Uma chamada para as 6 sedes de COB.** Com várias coordenadas
  (`latitude=a,b,…&longitude=c,d,…`), a resposta é um **array** na mesma ordem; com uma só,
  é um objeto.
- **Parâmetros:** `hourly=precipitation,precipitation_probability`,
  `daily=precipitation_sum,precipitation_probability_max`, `timezone=America/Sao_Paulo`,
  `forecast_days=5` (4 dias exibidos e 1 de folga para a janela de 72 h).
- **Horários:** vêm locais sem offset (`2026-10-02T14:00`). O offset sai de
  `utc_offset_seconds`.
- **Acumulados de 24 h e 72 h** contam a partir da hora em curso. O valor de `HH:00` é a
  chuva da hora ANTERIOR, então a janela começa no registro de `floor(agora)+1h`. Se faltar
  qualquer hora na janela, o valor fica `null`, sem estimativa.
- **Erro:** HTTP 400 com `{"error": true, "reason": "…"}`.

---

## Fontes da Fase 1 (stubs tipados)

| Fonte | Endpoint | Observações |
|---|---|---|
| ANA HidroWebService | `https://www.ana.gov.br/hidrowebservice/` (Swagger em `/swagger-ui/index.html`) | Token gratuito. Credenciais em `ANA_IDENTIFICADOR` / `ANA_TOKEN`, só no servidor. Telemetria de nível/vazão para comparar com as cotas do SACE |
| Open-Meteo Flood (GloFAS) | `https://flood-api.open-meteo.com/v1/flood?…&daily=river_discharge,river_discharge_mean,river_discharge_max` | Atribuição "Open-Meteo.com / Copernicus GloFAS (CC BY 4.0)" |
| RainViewer | `https://api.rainviewer.com/public/weather-maps.json` | O índice de quadros é lido no servidor e os tiles vão direto ao MapLibre. Antes de usar, confirmar os limites atuais da API pública (zoom e quadros disponíveis) |

Os stubs (`lib/sources/{ana,glofas,rainviewer}`) lançam `FonteIndisponivelError` e
aparecem como **"não implementada"** em `/status`.
