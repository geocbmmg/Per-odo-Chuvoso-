# Fase 1: desenho

Este documento registra o que a Fase 1 entrega, as decisões tomadas e o caminho para o
GeoRescue. Ele junta as decisões da equipe (02/10/2026) com três levantamentos: o login do
GeoRescue, o esquema das camadas e as fontes de risco. Os pontos que ainda dependem da equipe
estão na seção 9.

## 1. Objetivos e decisões

| # | Objetivo | Decisão da equipe |
|---|---|---|
| 1 | Substituir o Survey123 de emissão de alertas por um formulário da Sala. O operador emite alertas para as unidades e acompanha cada um numa fila. | Armazenamento em feições do ArcGIS Enterprise, **pré-desenhado** agora; as camadas são criadas depois. |
| 2 | Acesso pelos usuários do GeoRescue. | Quem tem acesso no GeoRescue, por domínio ou grupo, acessa a Sala. |
| 3 | Mostrar no mapa onde o Estado está em risco. | Camadas no mesmo mapa, uma por tipo: Geológico, Meteorológico e Hidrológico. |
| 4 | Mapa de chuva no modelo do GeoRisk (CEMADEN): o risco por município aparece conforme o zoom aumenta. | Grade regional sobre MG. Zoom pela hierarquia do CBMMG. Limiares pelas matrizes oficiais (`docs/metricas-risco.md`). |
| 5 | Levar tudo para o GeoRescue, no cartão **Período Chuvoso** de Gestão de Risco MG. | Restrição de projeto: o que se constrói agora tem de migrar sem reescrita onde for possível. |

## 2. Como fica a arquitetura

```
Navegador ──► Sala (Next.js, Vercel gru1)
               ├─ /api/auth/*        login federado no GeoRescue (seção 3)
               ├─ /api/alertas       fila e emissão (seção 4) ──► repositório de alertas
               ├─ /api/risco         camadas de risco por município (seção 5)
               ├─ /api/chuva         chuva prevista por município (seção 6)
               └─ /api/arcgis, /api/inmet, /api/meteo, /api/status  (Fase 0)
```

Regras que continuam valendo:
- Toda chamada externa sai do servidor, com cache e última leitura válida.
- Nenhum segredo vai para o navegador.
- Datas no horário de Brasília.
- A hierarquia COB → UEOp → fração → município vale em todo lugar.

**Leitura e escrita no ArcGIS.** A leitura continua igual à da Fase 0. A **escrita** de
alertas fica desenhada (esquema, script de criação das camadas e conversão para feição),
mas desligada até que a equipe crie as camadas e autorize a gravação. Enquanto isso, a fila
grava num repositório local (seção 4.4).

## 3. Login pelo GeoRescue

### 3.1 Como o GeoRescue autentica (`origin/homolog`)

- **Usuários:** tabela `GeoRescue_Acesso/0` (`Acesso_Usuarios`). O login é o CPF.
- **Senha:** PBKDF2-SHA256 com 260.000 iterações.
- **Token:** `base64url(JSON).HMAC-SHA256(GEORESCUE_SECRET)`, válido por 8 h, guardado no
  `sessionStorage` do navegador. Claims úteis:
  - `gr_papel`;
  - `gr_dominios` (territoriais: 1º–6º COB, CEB…);
  - `gr_dgrupo` (domínios de grupo);
  - `gr_bm`, `gr_nome`.
- **Papéis:** `gerenciador`, `operador` (aparece na tela como "Gestor"), `operacional`
  (aparece como "Operador") e `visualizador`.
- **Sem CORS e sem cookie:** o GeoRescue não aceita chamadas de outro domínio pelo navegador.

### 3.2 Opção adotada: login federado de servidor para servidor

1. A pessoa digita CPF e senha na tela da Sala.
2. O servidor da Sala repassa as credenciais ao `POST <GeoRescue>/api/login` (TLS, timeout
   de 15 s) e recebe papel, domínios, grupos, Nº BM e nome.
3. A Sala emite **sessão própria**:
   - cookie `__Host-sala_sessao`, HttpOnly, Secure, SameSite=Lax;
   - assinado com `SALA_SESSION_SECRET`, que é diferente do segredo do GeoRescue;
   - validade de no máximo 8 h.
   O token do GeoRescue é descartado.
4. A Sala não guarda senha e não lê a tabela de usuários. O CPF não vai para cookie nem para
   log.

**Por que esta opção:**
- Não exige nenhuma mudança no GeoRescue.
- Não compartilha segredo entre os dois sistemas.
- Herda todas as regras do GeoRescue: bloqueio por tentativas, troca obrigatória de senha,
  situação da conta e domínios.

As alternativas foram descartadas porque exigiriam mudar o GeoRescue (compartilhar o segredo
HMAC) ou copiar as regras dele (ler a tabela de senhas).

### 3.3 Papéis da Sala (a confirmar, seção 9)

| Papel na Sala | Regra sobre os dados do login do GeoRescue | Pode |
|---|---|---|
| Operador da Sala | grupo **`SALA`** em `gr_dgrupo` e papel `gerenciador`, `operador` ou `operacional` | emitir, editar, cancelar e encerrar alertas; ver tudo |
| Unidade (COB/UEOp) | papel `operador` ou `operacional`; COB pelos domínios territoriais | ver os alertas do próprio COB, dar ciência, registrar ação RRD |
| Leitura | `visualizador` no próprio COB; `gerenciador` sem o grupo vê o Estado | só ler |
| Negado | conta não ativa, troca de senha pendente, ou sem domínio nem grupo | — |

As páginas públicas de hoje (Visão Geral, Monitoramento, Status) continuam abertas. Só a
emissão, a fila e os dados com texto livre exigem login.

### 3.4 Variáveis novas

| Variável | Uso |
|---|---|
| `GEORESCUE_BASE_URL` | URL de produção do GeoRescue (não é segredo) |
| `SALA_SESSION_SECRET` | assina a sessão da Sala (32+ bytes, aleatório) |
| `SALA_GRUPO_OPERADOR` | nome do domínio de grupo dos operadores (ex.: `SALA`) |

> **Achado de segurança no GeoRescue (para a equipe do GeoRescue).** O token do App de
> Campo (`typ: "campo"`) é assinado com o mesmo segredo do token da mesa. O
> `sessao_do_header` aceita token sem `gr_papel` como **administrador**. Resultado: um token de
> campo abre o `/api/acesso`, incluindo a listagem de usuários com CPF e a troca de senha.
> A correção sugerida é recusar token com `typ` e exigir `iss == "georescue"`. Nada foi
> alterado no GeoRescue. Referências: `acesso.py:821-858`, `coleta.py:494-498`.

## 4. Emissão e fila de alertas

### 4.1 Fluxo

```
RASCUNHO ──emitir──► EMITIDO ──ciência──► CIENTE ──1ª ação──► EM_AÇÃO ──► AÇÃO_REGISTRADA ──► ENCERRADO
    │                   └──────────────── cancelar (com motivo) ─────────────────────────────► CANCELADO
    └─ pode ser apagado
```

São derivados na leitura e nunca gravados:
- **Pendente:** EMITIDO, CIENTE ou EM_AÇÃO.
- **Vencido:** pendente com o prazo da ação RRD já passado.
- **Vigência expirada:** passou do "válido até".

### 4.2 Formulário (operador da Sala)

Os campos seguem o formulário atual, para que os indicadores continuem iguais:
- **Território:** COB → fração (lista oficial de 96, `lib/territorio/fracoes-cbmmg.json`) →
  município. O COB e a UEOp saem da fração.
- **Tipo de risco** e campos por tipo:

  | Tipo | Campos |
  |---|---|
  | Meteorológico | mm/h e mm em 24 h |
  | Hidrológico | bacia, rio e cota (cm) |
  | Geológico | índice de risco |

  O **nível é sugerido pela matriz oficial** a partir desses valores, e o operador confirma
  ou ajusta (`lib/dominio/matrizes.ts`).
- **Nº da chamada CAD, validade e texto do alerta:** título, descrição e ação esperada.
- **Destinatários:** a unidade principal e outras unidades notificadas.

### 4.3 Esquema no ArcGIS Enterprise (pré-desenhado)

| Serviço | Camada | Conteúdo |
|---|---|---|
| `SalaSituacao_AlertasRRD` (restrito) | `/0 Sala_Alertas` | ponto; um alerta por município e unidade |
| | `/1 Sala_Acoes_RRD` | ponto; uma linha por ação executada |
| | `/2 Sala_Alertas_Destinatarios` | tabela; uma linha por unidade notificada (ciência) |
| | `/3 Sala_Alertas_Historico` | tabela; só acrescenta linhas (trilha de auditoria) |
| `SalaSituacao_Referencia` | `/0 Sala_Territorio` | município × fração × UEOp × COB |

Decisões de esquema:
- **Padrão do GeoRescue.** As camadas se ligam pelo texto `alerta_id`, gerado no servidor
  com índice único, e não pelo GlobalID. O OBJECTID é a identidade da linha. As datas são
  epoch em ms.
- **Domínio codificado só onde o código decide** (situação, nível, tipo, COB). Fração e
  município ficam sem domínio: um valor fora do domínio faz o serviço recusar a feição
  inteira.
- **Autoria:** quem emitiu é gravado pelo servidor, a partir da sessão, como pseudônimo
  (HMAC do identificador). Nunca CPF, nome ou Nº BM em texto (LGPD).
- **Campos CAP 1.2** (identifier, msgType, urgency, certainty, onset, expires…), para
  integrar depois com o IDAP / Defesa Civil Alerta.

O script de criação, idempotente e no estilo dos scripts do GeoRescue, fica em
`scripts/arcgis/criar_camadas_sala.py`. Ele roda no ArcGIS Notebook com a conta dona,
compartilha só com o grupo e **não foi executado**.

### 4.4 Repositório de alertas

A fila grava num **repositório** com uma interface única:

| Implementação | Quando |
|---|---|
| `memoria` | modo demonstração e testes |
| `postgres` | enquanto as camadas não existem (tabela no mesmo formato da feição) |
| `arcgis` | depois de criadas as camadas e autorizada a escrita (desligada por padrão) |

A conversão alerta ↔ feição é uma função pura e testada, a mesma nos três casos. Assim, a
troca para o ArcGIS (e depois para o GeoRescue) não muda a tela nem a API.

### 4.5 API (no formato do GeoRescue)

Mesmo contrato do módulo INSARAG, para migrar sem reescrever o cliente:
- `GET /api/alertas?so=fila|contagem` devolve `{ok, perfil, capacidades, alertas, resumo, truncado}`.
- `POST /api/alertas` com `{acao: "salvar" | "emitir" | "ciencia" | "registrar_acao" | "encerrar" | "cancelar", ...}`
  devolve `{ok, id, ...}`.
- Erros: `{ok: false, erro, motivo}` com 400, 401, 403, 409 (alguém alterou antes) ou 502.
- Respostas autenticadas usam `Cache-Control: no-store`, para que dado recortado por usuário
  nunca fique no CDN.

### 4.6 Convivência com o Survey123

A Sala lê as duas fontes:
- o legado continua entrando pela camada atual, como hoje;
- os registros novos levam `origem_registro = SALA`;
- a deduplicação é feita pelo Nº da chamada.

O Survey123 fica como plano B durante a temporada.

## 5. Mapa de risco (camadas no mesmo mapa)

O risco é pintado por **município** (malha de 853 municípios, simplificada, em
`public/geo/`). Cada fonte vira um mapa `{códigoIBGE → nível}` na escala única das matrizes.

| Camada | Fonte | Como vira nível |
|---|---|---|
| **Meteorológico** | INMET `apiprevmet3.inmet.gov.br/avisos/ativos` (JSON com `geocodes` IBGE); o RSS atual fica como reserva | Perigo Potencial → amarelo, Perigo → laranja, Grande Perigo → vermelho. Vale o aviso mais grave vigente no município. |
| **Geológico** | CEMADEN `painelalertas.cemaden.gov.br/wsAlertas2` ("Movimentos de Massa") | Moderado → amarelo, Alto → laranja, Muito Alto → vermelho |
| **Hidrológico** | CEMADEN `wsAlertas2` ("Risco Hidrológico"); depois as estações SACE/ANA | mesma conversão; estações em pontos, pela cota frente às cotas de referência |
| **Alertas do CBMMG** | alertas emitidos pela Sala e pelo Survey123 | `nivelRisco` de cada alerta, por município |

Cuidados:
- O CEMADEN só emite alerta para municípios monitorados: "sem alerta" não é "sem risco".
  A legenda diz isso.
- O polígono do aviso do INMET corta municípios vizinhos. A atribuição vem da lista IBGE do
  aviso, e o polígono aparece só como contorno.
- O endpoint do CEMADEN não é documentado. A Sala valida o formato e, se ele mudar, mostra
  a camada como "fonte indisponível". Os créditos "Cemaden/MCTI" e "INMET" ficam visíveis.

## 6. Chuva prevista no modelo GeoRisk

- **Pontos:** as **853 sedes municipais** formam a "grade regional". O valor de cada ponto é
  o da célula do modelo, de cerca de 9 km.
  - Isso dá o ranking de municípios direto.
  - Substitui a previsão por sede de COB da Fase 0, que era **pontual**: uma coordenada por
    COB, e não média da área.
- **Fonte:** Open-Meteo (ECMWF IFS 9 km no Brasil), num POST com até 853 pontos.
  - O modelo só atualiza a cada 6 h, então a Sala busca **a cada 3 h** (cerca de 6.800
    chamadas por dia, dentro do limite gratuito de 10.000).
  - Os acumulados são recalculados a cada hora sobre a série em cache.
- **Classificação** pela matriz de chuva (`classificarChuva`): o nível é o pior entre o
  critério por hora e o acumulado em 24 h. O mapa tem as janelas **próximas 24 h** e
  **próximas 72 h** (pior janela de 24 h dentro das 72 h). A cor é a do nível.
- **Zoom pela hierarquia do CBMMG:**

  | Zoom | O que aparece | Valor |
  |---|---|---|
  | Estado | 6 COBs | pior nível entre os municípios do COB e quantos municípios em cada nível |
  | Aproximando | UEOp | idem, por UEOp |
  | Perto | 853 municípios | nível do município; o balão mostra mm/h e mm em 24 h e 72 h |

  > A área de cada UEOp é **aproximada**: cada município vai para a fração mais próxima
  > dentro do seu COB. Não existe hoje tabela oficial município → fração. Quando a EMBM/3
  > publicar a articulação (`Sala_Territorio`), a aproximação sai.

- **Ressalvas:**
  - O limite gratuito da Open-Meteo é por IP, e a Vercel compartilha IP de saída. Mitigações:
    última leitura válida, chave paga (cerca de US$ 29/mês) ou ingestão pelo ArcGIS Notebook
    do CBMMG.
  - O uso é não comercial, com atribuição "Open-Meteo.com (CC BY 4.0)".

## 7. Atualização periódica

O plano **Hobby** da Vercel só roda cron uma vez por dia. Por isso a Sala atualiza **sob
demanda**: a primeira consulta depois de vencido o cache busca a fonte, com espera após falha
e a última leitura válida no Postgres para todas as instâncias. Se for preciso atualizar sem
ninguém com a tela aberta, um agendador externo chama `/api/ingest/*` com `CRON_SECRET`
(GitHub Actions ou ArcGIS Notebook).

| Fonte | Validade do cache |
|---|---|
| INMET | 10 min |
| CEMADEN | 10 min |
| Chuva em grade | 3 h |
| Alertas da Sala | sem cache (dado do usuário) |

## 8. Migração para o GeoRescue (cartão Período Chuvoso)

### 8.1 O que existe hoje no GeoRescue

- O cartão **Período Chuvoso** de Gestão de Risco MG só mostra um aviso (`_grsAbrirChuvoso`).
- O recurso `gestaorisco` está como "não construído", visível só para administrador.
- Não há esquema nem endpoint do Período Chuvoso.

### 8.2 Caminho recomendado (híbrido)

1. **Escrita e acesso nascem no padrão GeoRescue.** A emissão, a fila e as permissões são o
   que mais custa duplicar: login, recorte, concorrência e LGPD. Por isso a Sala já usa:
   - o contrato do módulo INSARAG (4.5);
   - as camadas no formato `GeoRescue_*` (4.3);
   - os papéis e domínios do GeoRescue (3.3).

   Na migração, entram no GeoRescue:
   - `api/gestaorisco.py`, com o mesmo contrato da 4.5;
   - a camada pelo script da 4.3;
   - a tela no cartão;
   - a virada de `construida` para `True`.
2. **Os painéis de leitura** (mapa, INMET, chuva, indicadores) podem continuar na Sala e
   abrir dentro do GeoRescue na **mesma origem**. O GeoRescue ganha um `rewrite`
   `/chuvoso/*` para o deploy da Sala, que passa a usar `basePath: "/chuvoso"`. Assim não há
   CORS nem iframe, e a sessão é a mesma. Portar os painéis depois fica opcional.
3. **O que a Sala já faz para facilitar:**
   - regras de negócio puras em `lib/dominio` (matrizes, período, pendência, território),
     sem React nem Next, prontas para virar `assets/regras-chuvoso.js`;
   - mapa alimentado só por GeoJSON, que o Leaflet do GeoRescue consome igual;
   - simbologia e cores em tabelas de dados.

O rewrite exige uma mudança no GeoRescue, que fica para quando a equipe decidir a migração.

## 9. Decisões pendentes

1. **Grupo dos operadores:** criar o domínio de grupo `SALA` no GeoRescue. Cuidado: ao
   marcar um domínio explícito na conta, o administrador precisa marcar também o COB da
   pessoa (ex.: `1COB` + `SALA`), senão ela perde o COB.
2. **Recorte por COB e o CEB:** a exceção do CEB vale para alertas? O que fazer com os
   registros "Sem COB"?
3. **Nº da chamada CAD:** é obrigatório na emissão, como hoje, ou a Sala passa a ser a
   origem do alerta?
4. **Prazo da ação RRD por nível:** proposta de 24 h (verde), 12 h (amarelo), 6 h (laranja)
   e 2 h (vermelho/roxo).
5. **Conta de serviço** própria da Sala no ArcGIS para a gravação (recomendado), em vez do
   `creator.1`.
6. **Articulação município × fração** da EMBM/3, para a camada `Sala_Territorio` e para a
   área exata das UEOp no mapa.
7. **Credenciais externas:**
   - ANA HidroWebService: e-mail a hidro@ana.gov.br com o CNPJ do CBMMG;
   - CEMADEN: cadastro no PED e ofício para o uso do Painel de Alertas;
   - SGB: lista de estações de MG com as cotas de referência.
8. **Open-Meteo:** confirmar o enquadramento como uso não comercial ou contratar a chave.
9. **Inconsistências das matrizes** (`docs/metricas-risco.md`), em especial o "ou" × "e"
   da matriz de chuva frente ao formulário.
10. **Sede do 6º COB** (assumida Poços de Caldas) e qual camada do serviço de alertas é a
    real (configurada a 1; o formulário de Ações RRD consulta a 0; `/status` mostra qual foi
    usada).
