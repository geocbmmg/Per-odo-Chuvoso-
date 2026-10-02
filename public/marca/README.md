# public/marca

Arquivos de marca servidos em `/marca/*`.

- **Brasão do CBMMG** — hoje é carregado direto do portal ArcGIS da corporação
  (`components/layout/brasao-cbmmg.tsx`, constante `URL_BRASAO_CBMMG`). Se o portal ficar
  fora do ar, o trilho mostra o monograma "CBMMG". Para servir o brasão localmente, salve a
  imagem oficial aqui como `brasao-cbmmg.png` (fundo transparente, ~144 px de altura para
  telas de alta densidade) e troque a constante para `"/marca/brasao-cbmmg.png"`.
- **Ícone da Sala** — `app/icon.svg` (gota de chuva sobre escudo, ouro `#F1C23C` sobre
  `#0A0E14`). É identidade própria da Sala de Situação.

Não copie para cá os PNGs do GeoRescue (águia, logotipo): são marca de outro produto.
O contorno de Minas Gerais usado no mapa fica em `public/geo/mg-outline.json`.
