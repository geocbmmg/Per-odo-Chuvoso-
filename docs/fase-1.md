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

### 3.5 Implementação

- Código: `lib/auth/` (cliente do GeoRescue em `georescue.ts`, tabela de papéis pura em `papeis.ts`,
  sessão assinada em `token.ts`, leitura em `sessao.ts`), rotas `app/api/auth/*`, tela `app/entrar`,
  chip do usuário no cabeçalho (`components/auth/`).
- Contrato lido do `login.py` (origin/homolog): pedido `{usuario, senha}`; resposta
  `{ok, usuario, nome, cpf (mascarado), bm, unidade, papel, dominios, escopo_global, troca_senha, token,
  expira_em_horas}`. O administrador de emergência vem sem `cpf`/`bm`/`unidade` e com token `{u, exp}`.
  Do token a Sala lê só a carga (`sub`, `gr_dgrupo`, `gr_pg`, `gr_situacao`, `gr_optotal`, `exp`), sem
  conferir a assinatura: ele chegou por TLS, direto do GeoRescue, na resposta ao próprio login. Token com
  `typ` (o de campo) é recusado. O teste de contrato fica em `tests/auth-georescue.test.ts`.
- Sessão da Sala: `base64url(carga).base64url(HMAC-SHA256)`, com `typ: "sala-sessao"`, `exp` obrigatório
  (≤ 8 h e ≤ `exp` do GeoRescue), sem CPF (`usuarioId` = HMAC do CPF com `SALA_PSEUDO_SEGREDO` ou, sem
  ele, com chave derivada do `SALA_SESSION_SECRET`). Sessão de demonstração nunca vale fora do modo
  demonstração.
- Decisões adotadas até a confirmação (seção 9, item 2):
  - **CEB:** Gestor/Operador com o domínio CEB (ou `gr_optotal`) entra como Unidade com escopo do Estado
    inteiro, a mesma exceção do GeoRescue; visualizador do CEB não ganha a exceção.
  - **Domínio que não é COB** (CG, DRH…) não dá recorte; sem COB e sem escopo global, a conta é recusada.
  - **Visualizador com o grupo `SALA`** entra como Leitura do Estado inteiro.
- Limitações: sessão sem estado (sem tabela `sala_sessoes` nesta fase; revogação em massa trocando o
  `SALA_SESSION_SECRET`); limite de tentativas em memória por instância; suspensão no GeoRescue só pesa
  no próximo login.

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
- `GET /api/alertas?so=fila|contagem[&situacao=EMITIDO,PENDENTE,VENCIDO][&cob=1º COB][&tipo=GEOLOGICO][&id=AL-…]`
  devolve `{ok, perfil, capacidades, alertas, resumo, truncado}`.
  - Cada alerta traz os estados derivados (`pendente`, `vencido`, `vigenciaExpirada`),
    `destinatarios`, `acoes` e, com `id`, o `historico`.
  - `resumo` traz `{total, porSituacao, pendentes, vencidos, vigenciaExpirada}`.
  - Unidade e leitura veem só o próprio COB (ou alertas que notificam o COB) e nunca
    rascunho.
- `POST /api/alertas` com `{acao: "salvar" | "emitir" | "ciencia" | "registrar_acao" | "encerrar" | "cancelar" | "apagar", ...}`
  devolve `{ok, id, alerta, avisos[, acaoId]}`.
  - `alteradoEm` (a versão lida) é obrigatório para editar, emitir um rascunho
    existente, encerrar, cancelar e apagar.
  - Datas em ISO 8601 com fuso.
- Erros: `{ok: false, erro, motivo[, campos][, alteradoEmAtual]}`.
  - `erro` é a mensagem para a tela; `motivo` é o código estável: `entrada_invalida`,
    `campo_travado`, `sessao`, `permissao`, `escopo`, `origem`, `nao_encontrado`,
    `conflito`, `transicao_invalida`, `ja_ciente`, `armazem`, `escrita_desligada`,
    `configuracao`, `armazem_nao_configurado`.
  - Status: 400, 401, 403, 404, 409, 502 ou 503.
- Sempre `Cache-Control: no-store`, para que dado recortado por usuário nunca fique no CDN.
- O POST só é aceito com `Origin` da própria aplicação (proteção contra CSRF).

### 4.6 Convivência com o Survey123

A Sala lê as duas fontes:
- o legado continua entrando pela camada atual, como hoje;
- os registros novos levam `origem_registro = SALA`;
- a deduplicação é feita pelo Nº da chamada.

O Survey123 fica como plano B durante a temporada.

### 4.7 Implementação (backend)

Código em `lib/alertas/` (regras puras em `dominio.ts`, `feicao.ts`, `cap.ts`; serviço em
`servico.ts`) e rota em `app/api/alertas/route.ts`.

**Transições** (tabela explícita em `lib/alertas/dominio.ts`; o resto é recusado com 409):

| De | Passo | Para |
|---|---|---|
| RASCUNHO | emitir | EMITIDO |
| EMITIDO | ciência do destinatário **principal** | CIENTE |
| CIENTE | ação "em andamento" | EM_AÇÃO |
| CIENTE, EM_AÇÃO | ação "concluída" ou "parcial" | AÇÃO_REGISTRADA |
| AÇÃO_REGISTRADA | encerrar (operador) | ENCERRADO |
| EMITIDO, CIENTE, EM_AÇÃO, AÇÃO_REGISTRADA | cancelar com motivo (operador) | CANCELADO |

- Registrar ação num alerta só emitido dá a ciência implícita.
- Ação "não realizada" fica registrada, mas o alerta segue pendente.
- Encerrar exige ação registrada; sem ação, cancela-se com motivo.
- Rascunho não se cancela: apaga-se (o histórico fica com o evento `APAGADO` e o número
  não é reaproveitado).
- Depois de emitido, território, destinatários e natureza não mudam. As demais edições
  geram uma mensagem CAP *Update* (evento `ATUALIZADO`, ou `PRAZO_ALTERADO` se só o
  prazo mudou).

**Gerado pelo servidor:**
- `alerta_id` = `AL-AAAAMMDD-NNNN`, sequencial por dia de Brasília (`AC-…` nas ações);
- `cap_identifier` = `BR-MG-CBMMG-SALA-<alerta_id>` (`-U<n>` nas atualizações, `-C` no
  cancelamento);
- datas de emissão e de encerramento;
- prazo padrão pelo nível e `area_desc` padrão ("Município/MG");
- toda a autoria.

**Autoria (LGPD):** `*_por_id` = HMAC-SHA256 do identificador da sessão com
`SALA_PSEUDO_SEGREDO` (32 hex). Nunca CPF, nome ou nº BM. Quem não é operador da Sala
recebe os pseudônimos de outras pessoas como `null`.

**Validação da emissão:** campos "E" do esquema, mais os do tipo de risco:
- meteorológico: mm/h ou mm em 24 h;
- hidrológico: bacia, rio e cota;
- geológico: índice.

Confere também a cascata tipo → evento e a ordem das datas. A fração precisa estar na
lista oficial e o município em MG. Município de outro COB pela tabela aproximada só gera
**aviso**. Nível diferente da sugestão da matriz (`sugerirNivel`) também só avisa.

**Armazém** (`ALERTAS_ARMAZEM`):
- `memoria`: desenvolvimento e testes; recusado em produção;
- `postgres`: tabelas `sala_*`, no mesmo formato da feição;
- `arcgis`: só leitura; escrita responde 503 "escrita desligada".

Com `DADOS_EXEMPLO=1`, a fila usa sempre a memória, com 10 alertas de exemplo em todos os
estados.

**Concorrência:** `alteradoEm` é a versão do alerta. Edição, emissão, encerramento,
cancelamento e exclusão exigem a versão lida; versão velha responde 409 com
`alteradoEmAtual`. A ciência no mesmo destinatário não tem versão: se duas pessoas derem
ao mesmo tempo, a última vence.

**Mapa de risco:** os alertas EMITIDO, CIENTE e EM_AÇÃO, reais e vigentes, entram na
camada "Alertas do CBMMG" junto com os do Survey123, deduplicados pelo nº da chamada.

### 4.8 Telas da fila e da emissão (`/alertas-acoes-rrd`)

- **Acesso:** a página lê a sessão no servidor (`obterSessao`). Sem sessão, mostra só o convite
  "Entre com seu usuário do GeoRescue" (`/entrar?voltar=/alertas-acoes-rrd`); os totais públicos
  continuam na Visão Geral. Se a sessão acabar com a tela aberta (401), a fila vira o mesmo cartão.
- **Fila:** vem inteira do escopo da sessão (o servidor recorta por COB) e é relida a cada minuto
  com a aba visível. Abas: Pendentes (padrão; vencidos primeiro, depois pelo prazo), A encerrar
  (ação RRD registrada; quem encerra), Rascunhos (quem emite), Encerrados/cancelados e Todos.
  Filtros por COB, tipo e nível. Contadores: pendentes, vencidos, emitidos hoje (Brasília) e a
  encerrar. Pendente/vencido são recalculados com o relógio da tela.
- **Detalhe:** gaveta lateral (tela cheia no celular; Esc fecha), com campos, destinatários e
  ciência, ações RRD, linha do tempo e só as ações que as capacidades da sessão permitem: Emitir,
  Editar/Atualizar (CAP Update, território travado), Dar ciência, Registrar ação RRD, Encerrar,
  Cancelar (motivo + confirmação) e Apagar rascunho. Um 409 mostra "alguém alterou este alerta —
  recarregue" sem perder o que foi digitado. `?alerta=AL-…` abre o detalhe por link.
- **Formulário:** COB → fração (lista oficial) → município (sugerido pela cidade da fração; busca
  por nome); tipo de risco e campos do tipo; **nível sugerido ao vivo** pela matriz
  ("Sugerido: Laranja — Perigo, porque 45 mm/h > 30"); nível diferente do sugerido exige
  justificativa (vai, por ora, no fim da descrição); nº da chamada com máscara AAAA-NNNNNNNN-N;
  validade padrão de 24 h; prazo "pelo nível" (calculado na emissão) ou definido; texto CAP com
  urgência "Esperada" e certeza "Provável" por padrão; destinatários adicionais (frações ou COB
  inteiro). A validação da tela usa os mesmos esquemas do servidor (`lib/alertas/dominio.ts`).
- Pendências: campo próprio `justificativa_nivel` na camada; paginação dos finalizados acima
  de 500; `emitidosHoje` calculado no servidor.

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

**Implementação (`GET /api/risco`, `lib/dados/risco.ts`):**
- **As três fontes são lidas em paralelo,** cada uma com cache e última leitura válida. Uma
  fonte fora do ar sem leitura deixa só a sua camada com `camada: null` e `erro`; as outras
  continuam. A rota devolve 503 só quando todas falham.
- **Cada camada traz** o carimbo (`meta`), os municípios com itens (`ItemRisco` com início e
  fim), o resumo por COB e por UEOp (`areas`) e os registros descartados por motivo.
- **Combinada:** pior nível por município entre as camadas disponíveis, com os itens de todas
  (cada um com a sua `camada`) e as áreas.
- **Alertas do CBMMG:** contam os alertas com validade não vencida ou, sem validade,
  emitidos nas últimas 24 h, mais os alertas pendentes da fila da Sala. O município vira
  código IBGE pelo nome. A deduplicação é por nº da chamada + município + tipo.
- **CDN:** 60 s, ou 30 s se faltar alguma camada. A vigência é recalculada a cada resposta.

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
  - **Implementado:** `GET /api/chuva` devolve `{meta, credito, inicioJanela, modelo, municipios (853),
    areas: {"24h"|"72h": {cob, ueop}}, ranking: {acumulado24h, pior24hEm72h} (15 cada)}`.
    A consulta é um único POST em formulário com as 853 sedes (evidência em
    `docs/fontes-de-dados.md`). O cache guarda só a série compacta (~270 KB).
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

### Na tela: `/risco`

- **Uma pintura por vez** ("Pintar municípios por"): Chuva prevista (próximas 24 h | 72 h),
  Meteorológico (INMET), Geológico e Hidrológico (Cemaden), Alertas do CBMMG ou Maior risco
  (combinado). A escolha fica na URL: `/risco?camada=geologico&janela=72h&nivel=ueop` (padrão:
  chuva, 24 h, automático).
- **Zoom pela hierarquia:** abaixo de z6, cada município pinta com o pior nível do seu COB
  (contorno oficial dos COBs, `/api/arcgis/cobs`); de z6 a z7, o nível da UEOp (contorno de
  `public/geo/ueops-mg.json`, tracejado); a partir de z7, o nível do próprio município; nomes dos
  municípios a partir de z8. Os limiares são inteiros porque o MapLibre avalia a cor (expressão
  composta zoom + propriedade) no zoom do tile. Os botões Automático · COB · UEOp · Município
  fixam o nível (`?nivel=`).
- **Cores:** `CORES_NIVEL`, iguais nos dois temas; sem dado = sem preenchimento, com contorno.
  Contornos em tinta neutra, não nas cores dos COBs (aqui a cor é o risco).
- **Legenda** gerada de `lib/dominio/matrizes.ts` (chuva: `MATRIZ_CHUVA` + `descreverFaixa`) e
  das tabelas de conversão de cada fonte (INMET, Cemaden), com cobertura, crédito e carimbo
  "Atualizado às".
- **Alternativa textual:** "Municípios com mais chuva prevista" (ranking da API) ou
  "Municípios em risco", e a tabela "Resumo por COB"; cada linha centraliza o mapa e abre o
  balão.
- Os dados são lidos no navegador e atualizados com a aba visível: chuva a cada 10 min, risco
  a cada 5 min. Uma camada fora do ar mostra "Fonte indisponível" só para ela.
- Código: regras puras em `lib/mapa/risco.ts` e `lib/mapa/dados-risco.ts` (testes em
  `tests/mapa-risco.test.ts`); tela em `components/risco/`.

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
   registros "Sem COB"? Nesta fase: CEB (Gestor/Operador) alcança todos os COBs; conta sem
   COB (só CG, DRH…) é recusada; visualizador com o grupo SALA lê o Estado inteiro
   (`lib/auth/papeis.ts`).
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
