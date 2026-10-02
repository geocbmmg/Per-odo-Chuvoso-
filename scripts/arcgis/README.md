# Scripts do ArcGIS Enterprise

**`criar_camadas_sala.py` cria as camadas da Fase 1:**
- alertas;
- ações RRD;
- destinatários;
- histórico;
- território.

O esquema está em `docs/fase-1.md`, seção 4.3. O script segue o padrão dos scripts do
GeoRescue: é idempotente, relê o que criou e compartilha só com o grupo, nunca com a
organização.

**Ainda não foi executado.** Está pré-desenhado para revisão.

1. Confira o esquema sem acessar o portal:

   ```bash
   python3 scripts/arcgis/criar_camadas_sala.py --conferir
   ```

2. Rode no ArcGIS Notebook do portal do CBMMG, com a conta dona dos serviços. As
   credenciais vão no próprio Notebook, nunca neste repositório.
3. A Sala não grava nessas camadas até a escrita ser autorizada (`docs/fase-1.md`, seção 4.4).
