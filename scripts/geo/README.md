# Dados geográficos estáticos

| Arquivo gerado | Conteúdo | Gerador |
|---|---|---|
| `scripts/geo/insumos/municipios-mg.json` | 853 municípios simplificados com topologia preservada (erro ≈ 2 km), com `{ibge, nome, cob}` | `gerar_malha.py` |
| `public/geo/municipios-mg.json` | a mesma malha com `{ibge, nome, cob, ueop}`, usada pelo mapa | `gerar_territorio.py` |
| `public/geo/ueops-mg.json` | áreas **aproximadas** das 17 UEOp (dissolve dos municípios) | `gerar_territorio.py` |
| `lib/territorio/municipios-mg.json` | `{ibge, nome, cob, ueop, fracao, lat, lon}` (sede IBGE), usado no servidor | `gerar_territorio.py` |

## Fontes

- **Malha municipal:** IBGE, via [tbrugz/geodata-br](https://github.com/tbrugz/geodata-br)
  `geojson/geojs-31-mun.json` (CC0).
- **Sedes municipais:** IBGE, via
  [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros)
  `csv/municipios.csv` (MIT). Só as linhas de MG estão em `insumos/municipios.csv`.
- **COB de cada município:** **aproximado**. Vem do mapa dos COBs do GeoRescue cruzado com a
  malha. Para usar a camada oficial, exporte `MG_DISSOLVIDO_COB` em GeoJSON e rode
  `gerar_malha.py --cobs-oficiais <arquivo>`.
- **UEOp e fração:** **aproximadas**. Cada município fica com a fração cuja cidade é a mais
  próxima da sede municipal, dentro do COB. A lista de frações é a tabela oficial
  `lib/territorio/fracoes-cbmmg.json`. A aproximação sai quando houver a articulação
  oficial município → fração (`docs/fase-1.md`, seção 6).

## Regenerar

```bash
# 1. malha simplificada (precisa dos insumos brutos; ver o cabeçalho do script)
python3 scripts/geo/gerar_malha.py --help
# 2. território, malha pública e áreas das UEOp (shapely 2)
python3 scripts/geo/gerar_territorio.py
npx vitest run tests/municipios.test.ts
```
