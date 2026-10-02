# Organização territorial do CBMMG na Sala de Situação

A Sala de Situação usa a hierarquia **COB → BBM/UEOp → fração (Cia/Pel/posto) → município**.
Os registros normalizados (alertas, ações RRD e ocorrências complexas) carregam os quatro
níveis: `cob`, `ueop`, `fracao` e `municipio` (`lib/dominio/tipos.ts`). O COB é normalizado
para o rótulo canônico (`lib/territorio/index.ts`).

## Tabela oficial de frações

Os formulários de Emissão de Alertas e de Ações RRD gravam a **fração** no campo `ueop`, com
um código como `1_BBM_2CIA_1PEL_Ouro_Preto_1_COB` (rótulo "1 BBM/2CIA/1PEL (Ouro Preto)").
A lista de escolhas do XLSForm virou a tabela `lib/territorio/fracoes-cbmmg.json`: 96
frações, cada uma com COB, UEOp, fração e cidade. `buscarFracao()` aceita o código ou o
rótulo e devolve a decomposição:

| Código no formulário | COB | UEOp | Fração |
|---|---|---|---|
| `1_BBM_Belo_Horizonte_Sede_1_COB` | 1º COB | 1º BBM | (sede) |
| `1_BBM_2CIA_1PEL_Ouro_Preto_1_COB` | 1º COB | 1º BBM | 2ª Cia/1º Pel (Ouro Preto) |
| `1CIA_IND_Pocos_de_Caldas_Sede_6_COB` | 6º COB | 1ª Cia Ind | (sede) |

Os 853 municípios do formulário (`municipios-formulario.json`) traduzem o código gravado
(`Acucena`) para o nome oficial (`Açucena`). Quando a fração é reconhecida, ela também
completa o COB de um registro que veio sem ele.

## Rótulo canônico de COB

`normalizarRotuloCob()` converte as variações encontradas nos formulários e planilhas para
**"Nº COB"**: `1º COB`, `1° COB`, `1 COB`, `1COB`, `1_cob`, `cob1`, `COB 1`, `2o COB`,
`4º Comando Operacional de Bombeiros` e `Quinto COB`. Registros sem COB reconhecível vão
para o balde **"Sem COB"**, que aparece nos gráficos em vez de sumir. Isso corrige os 12
registros "null" do painel atual.

> O prefixo `cob_*` só casa campos como `cob_responsavel`. O nome `cobrade` (classificação
> de desastres) não casa, de propósito.

## COBs e sedes

| COB | Sede | Coordenadas (sede municipal, IBGE) |
|---|---|---|
| 1º COB | Belo Horizonte | -19.9167, -43.9345 |
| 2º COB | Uberlândia | -18.9113, -48.2622 |
| 3º COB | Juiz de Fora | -21.7642, -43.3496 |
| 4º COB | Montes Claros | -16.7282, -43.8578 |
| 5º COB | Governador Valadares | -18.8545, -41.9555 |
| 6º COB | Poços de Caldas* | -21.7878, -46.5613 |

As UEOp de cada COB saem da tabela oficial de frações (`ueopsDoCob()`).

\* A sede do 6º COB foi assumida como Poços de Caldas e precisa ser confirmada.

As sedes alimentam a previsão por COB (`SEDES_COBS`, usada pelo cliente Open-Meteo).

## Limites dos COBs

- **Produção:** a camada oficial `MG_DISSOLVIDO_COB/FeatureServer/0` do ArcGIS do CBMMG. O
  servidor simplifica os polígonos (`maxAllowableOffset` ≈ 200 m).
- **Modo demonstração:** os limites em `lib/sources/exemplos/arcgis/cobs.json` são
  **aproximados**. Foram derivados do mapa SVG dos COBs do GeoRescue, georreferenciado e
  dissolvido sobre a malha municipal do IBGE (853 municípios).

  | COB | Municípios |
  |---|---|
  | 1º | 122 |
  | 2º | 91 |
  | 3º | 146 |
  | 4º | 114 |
  | 5º | 221 |
  | 6º | 159 |

  Servem só para demonstração.

## Cores dos COBs (cor é dado)

São iguais em qualquer tema e vêm do GeoRescue. Veja `docs/padrao-visual.md`.

| COB | Preenchimento |
|---|---|
| 1º | `#F1C23C` |
| 2º | `#5FA07A` |
| 3º | `#4E86C4` |
| 4º | `#D08A3E` |
| 5º | `#9AA0AC` |
| 6º | `#C05F58` |

## Próximos passos

1. Publicar no ArcGIS a tabela **município → fração → UEOp → COB** (área de atuação de cada
   fração). A tabela de frações já existe, mas não diz quais municípios cada fração atende.
   Com ela, o mapa agrega o risco por fração e completa a fração a partir do município.
2. Tornar COB e fração **obrigatórios** no novo formulário interno de emissão de alertas. É
   isso que acaba com os registros "Sem COB" na origem.
