# Organização territorial do CBMMG na Sala de Situação

A Sala de Situação usa a hierarquia **COB → BBM/UEOp → fração (Cia/Pel/posto) → município**.
Na Fase 0, só o nível **COB** é normalizado (`lib/territorio.ts`). Os demais chegam como texto
das fontes e aparecem como estão.

## Rótulo canônico de COB

`normalizarRotuloCob()` converte as variações encontradas nos formulários e planilhas para
**"Nº COB"**: `1º COB`, `1° COB`, `1 COB`, `1COB`, `1_cob`, `cob1`, `COB 1`, `2o COB`,
`4º Comando Operacional de Bombeiros` e `Quinto COB`. Registros sem COB reconhecível vão
para o balde **"Sem COB"**, que aparece nos gráficos em vez de sumir. Isso corrige os 12
registros "null" do painel atual.

> O prefixo `cob_*` só casa campos como `cob_responsavel`. O nome `cobrade` (classificação
> de desastres) não casa, de propósito.

## COBs e sedes

| COB | Sede | Coordenadas (sede municipal, IBGE) | UEOp identificadas* |
|---|---|---|---|
| 1º COB | Belo Horizonte | -19.9167, -43.9345 | 1º BBM, 2º BBM, 3º BBM, 10º BBM, 5ª Cia Ind |
| 2º COB | Uberlândia | -18.9113, -48.2622 | 5º BBM, 8º BBM, 12º BBM |
| 3º COB | Juiz de Fora | -21.7642, -43.3496 | 4º BBM, 2ª Cia Ind |
| 4º COB | Montes Claros | -16.7282, -43.8578 | 7º BBM, 6ª Cia Ind |
| 5º COB | Governador Valadares | -18.8545, -41.9555 | 6º BBM, 11º BBM |
| 6º COB | Poços de Caldas | -21.7878, -46.5613 | 9º BBM, 1ª Cia Ind, 7ª Cia Ind |

\* **Lista parcial.** Vem das páginas públicas das unidades em `bombeiros.mg.gov.br`, cruzadas
com os limites de COB. Não substitui a articulação operacional oficial e deve ser
conferida pela 3ª Seção do Estado-Maior antes de virar domínio de formulário.

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

1. Trocar o texto livre de COB/UEOp dos formulários por **domínios fechados** (Fase 3). É
   isso que acaba com os registros "Sem COB" na origem.
2. Publicar no ArcGIS uma tabela oficial **município → fração → UEOp → COB**. Ela permite
   agregar por UEOp e por fração, e completar o COB a partir do município quando faltar.
