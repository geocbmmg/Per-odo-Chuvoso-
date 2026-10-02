import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Esquema do Postgres (Neon / Vercel Postgres): última leitura válida das
 * fontes (ARMAZEM_LEITURAS=postgres), registro dos jobs e a fila de alertas da
 * Sala (ALERTAS_ARMAZEM=postgres, tabelas sala_*, no mesmo formato da feição do
 * ArcGIS). Para criar no banco: `npm run db:push` (com DATABASE_URL definido).
 */

/** Última leitura válida de cada fonte — substituirá o armazém em memória. */
export const leiturasFontes = pgTable(
  "leituras_fontes",
  {
    fonte: text("fonte").notNull(),
    chave: text("chave").notNull(),
    dados: jsonb("dados").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.fonte, t.chave] })],
);

/** Registro de cada execução dos jobs de ingestão (/api/ingest/*). */
export const execucoesIngestao = pgTable("execucoes_ingestao", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  sucesso: boolean("sucesso"),
  registros: integer("registros"),
  mensagem: text("mensagem"),
});

// ---------------------------------------------------------------------------------------------
// Fila de alertas da Sala (docs/fase-1.md §4.4) — enquanto as camadas do ArcGIS não existem.
//
// MESMO FORMATO da feição de SalaSituacao_AlertasRRD (scripts/arcgis/criar_camadas_sala.py):
// colunas com os nomes EXATOS dos campos (por isso as chaves em snake_case), textos com o
// mesmo tamanho, datas em epoch ms (bigint) e o ponto em x/y (WGS84). Uma linha daqui É os
// atributos que o applyEdits receberia: a conversão (lib/alertas/feicao.ts) é a mesma.
// tests/alertas-feicao.test.ts confere colunas × campos. O histórico só recebe INSERT
// (o repositório não tem update/delete para ele).
// ---------------------------------------------------------------------------------------------

/** Data/hora em epoch ms, como esriFieldTypeDate. */
const epoch = (nome: string) => bigint(nome, { mode: "number" });

/** /0 Sala_Alertas — um alerta por município × unidade principal. */
export const salaAlertas = pgTable(
  "sala_alertas",
  {
    objectid: serial("objectid").primaryKey(),
    alerta_id: varchar("alerta_id", { length: 40 }).notNull(),
    lote_id: varchar("lote_id", { length: 40 }),
    situacao: varchar("situacao", { length: 20 }).notNull().default("RASCUNHO"),
    natureza: varchar("natureza", { length: 12 }).notNull().default("REAL"),
    origem_registro: varchar("origem_registro", { length: 12 }).notNull().default("SALA"),
    fonte_gatilho: varchar("fonte_gatilho", { length: 12 }),
    fonte_ref: varchar("fonte_ref", { length: 255 }),
    tipo_risco: varchar("tipo_risco", { length: 20 }),
    evento: varchar("evento", { length: 20 }),
    nivel_alerta: varchar("nivel_alerta", { length: 10 }),
    numero_chamada: varchar("numero_chamada", { length: 30 }),
    mm_hora: doublePrecision("mm_hora"),
    mm_24h: doublePrecision("mm_24h"),
    bacia: varchar("bacia", { length: 120 }),
    rio: varchar("rio", { length: 120 }),
    cota: doublePrecision("cota"),
    estacao_codigo: varchar("estacao_codigo", { length: 20 }),
    indice_risco: doublePrecision("indice_risco"),
    cob: varchar("cob", { length: 30 }),
    ueop: varchar("ueop", { length: 80 }),
    fracao: varchar("fracao", { length: 120 }),
    municipio: varchar("municipio", { length: 120 }),
    cod_ibge: varchar("cod_ibge", { length: 7 }),
    local_referencia: varchar("local_referencia", { length: 255 }),
    titulo: varchar("titulo", { length: 160 }),
    descricao: varchar("descricao", { length: 4000 }),
    instrucao: varchar("instrucao", { length: 2000 }),
    area_desc: varchar("area_desc", { length: 500 }),
    cap_identifier: varchar("cap_identifier", { length: 120 }),
    cap_msg_type: varchar("cap_msg_type", { length: 10 }),
    cap_escopo: varchar("cap_escopo", { length: 12 }).notNull().default("Restricted"),
    cap_urgencia: varchar("cap_urgencia", { length: 12 }),
    cap_certeza: varchar("cap_certeza", { length: 12 }),
    cap_resposta: varchar("cap_resposta", { length: 12 }),
    data_emissao: epoch("data_emissao"),
    inicio_vigencia: epoch("inicio_vigencia"),
    valido_ate: epoch("valido_ate"),
    prazo_acao: epoch("prazo_acao"),
    encerrado_em: epoch("encerrado_em"),
    motivo_cancelamento: varchar("motivo_cancelamento", { length: 500 }),
    id_op: varchar("id_op", { length: 50 }),
    criado_por_id: varchar("criado_por_id", { length: 64 }),
    criado_em: epoch("criado_em"),
    emitido_por_id: varchar("emitido_por_id", { length: 64 }),
    emitido_por_dominio: varchar("emitido_por_dominio", { length: 60 }),
    alterado_por_id: varchar("alterado_por_id", { length: 64 }),
    alterado_em: epoch("alterado_em"),
    x: doublePrecision("x"),
    y: doublePrecision("y"),
  },
  (t) => [
    uniqueIndex("idx_sala_al_id").on(t.alerta_id),
    uniqueIndex("idx_sala_al_cap").on(t.cap_identifier),
    index("idx_sala_al_cham").on(t.numero_chamada),
    index("idx_sala_al_sit").on(t.situacao),
    index("idx_sala_al_cob").on(t.cob),
    index("idx_sala_al_ibge").on(t.cod_ibge),
    index("idx_sala_al_emis").on(t.data_emissao),
    index("idx_sala_al_lote").on(t.lote_id),
  ],
);

/** /1 Sala_Acoes_RRD — uma linha por ação RRD executada. */
export const salaAcoesRrd = pgTable(
  "sala_acoes_rrd",
  {
    objectid: serial("objectid").primaryKey(),
    acao_id: varchar("acao_id", { length: 40 }).notNull(),
    alerta_id: varchar("alerta_id", { length: 40 }),
    numero_chamada: varchar("numero_chamada", { length: 30 }),
    ocorrencia_cad: varchar("ocorrencia_cad", { length: 30 }),
    natureza: varchar("natureza", { length: 12 }).notNull().default("REAL"),
    origem_registro: varchar("origem_registro", { length: 12 }).notNull().default("SALA"),
    tipo_risco: varchar("tipo_risco", { length: 20 }),
    tipo_acao: varchar("tipo_acao", { length: 20 }),
    resultado: varchar("resultado", { length: 16 }),
    acao_executada: varchar("acao_executada", { length: 2000 }),
    data_acao: epoch("data_acao"),
    cob: varchar("cob", { length: 30 }),
    ueop: varchar("ueop", { length: 80 }),
    fracao: varchar("fracao", { length: 120 }),
    municipio: varchar("municipio", { length: 120 }),
    cod_ibge: varchar("cod_ibge", { length: 7 }),
    local_referencia: varchar("local_referencia", { length: 255 }),
    pessoas_orientadas: integer("pessoas_orientadas"),
    pessoas_removidas: integer("pessoas_removidas"),
    imoveis_vistoriados: integer("imoveis_vistoriados"),
    imoveis_interditados: integer("imoveis_interditados"),
    efetivo_empregado: integer("efetivo_empregado"),
    viaturas_empregadas: integer("viaturas_empregadas"),
    compdec_acionada: varchar("compdec_acionada", { length: 1 }),
    registrado_por_id: varchar("registrado_por_id", { length: 64 }),
    registrado_por_dominio: varchar("registrado_por_dominio", { length: 60 }),
    criado_em: epoch("criado_em"),
    alterado_por_id: varchar("alterado_por_id", { length: 64 }),
    alterado_em: epoch("alterado_em"),
    x: doublePrecision("x"),
    y: doublePrecision("y"),
  },
  (t) => [
    uniqueIndex("idx_sala_ac_id").on(t.acao_id),
    index("idx_sala_ac_alerta").on(t.alerta_id),
    index("idx_sala_ac_cham").on(t.numero_chamada),
    index("idx_sala_ac_cob").on(t.cob),
    index("idx_sala_ac_data").on(t.data_acao),
  ],
);

/** /2 Sala_Alertas_Destinatarios — uma linha por unidade notificada (notificação e ciência). */
export const salaAlertasDestinatarios = pgTable(
  "sala_alertas_destinatarios",
  {
    objectid: serial("objectid").primaryKey(),
    alerta_id: varchar("alerta_id", { length: 40 }).notNull(),
    dest_nivel: varchar("dest_nivel", { length: 10 }),
    cob: varchar("cob", { length: 30 }),
    ueop: varchar("ueop", { length: 80 }),
    fracao: varchar("fracao", { length: 120 }),
    principal: varchar("principal", { length: 1 }).default("N"),
    situacao_dest: varchar("situacao_dest", { length: 16 }).default("AGUARDANDO"),
    canal_notificacao: varchar("canal_notificacao", { length: 10 }),
    notificado_em: epoch("notificado_em"),
    ciente_em: epoch("ciente_em"),
    ciente_por_id: varchar("ciente_por_id", { length: 64 }),
    ciente_por_dominio: varchar("ciente_por_dominio", { length: 60 }),
    redirecionado_para: varchar("redirecionado_para", { length: 120 }),
    observacao: varchar("observacao", { length: 1000 }),
    criado_em: epoch("criado_em"),
    alterado_em: epoch("alterado_em"),
  },
  (t) => [
    index("idx_sala_de_alerta").on(t.alerta_id),
    index("idx_sala_de_cob").on(t.cob),
    index("idx_sala_de_ueop").on(t.ueop),
  ],
);

/** /3 Sala_Alertas_Historico — trilha de auditoria, SÓ ACRESCENTA. */
export const salaAlertasHistorico = pgTable(
  "sala_alertas_historico",
  {
    objectid: serial("objectid").primaryKey(),
    alerta_id: varchar("alerta_id", { length: 40 }).notNull(),
    alvo_tipo: varchar("alvo_tipo", { length: 12 }),
    alvo_id: varchar("alvo_id", { length: 40 }),
    evento: varchar("evento", { length: 30 }),
    situacao_de: varchar("situacao_de", { length: 20 }),
    situacao_para: varchar("situacao_para", { length: 20 }),
    quando: epoch("quando"),
    por_id: varchar("por_id", { length: 64 }),
    por_dominio: varchar("por_dominio", { length: 60 }),
    cap_identifier: varchar("cap_identifier", { length: 120 }),
    cap_msg_type: varchar("cap_msg_type", { length: 10 }),
    cap_json: varchar("cap_json", { length: 20000 }),
    campos_alterados: varchar("campos_alterados", { length: 1000 }),
    detalhe: varchar("detalhe", { length: 2000 }),
  },
  (t) => [index("idx_sala_hi_alerta").on(t.alerta_id), index("idx_sala_hi_quando").on(t.quando)],
);
