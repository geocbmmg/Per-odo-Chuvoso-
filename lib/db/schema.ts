import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Esquema do Postgres (Neon / Vercel Postgres). Na Fase 0 nada é migrado:
 * as tabelas abaixo preparam a Fase 1 (ingestão por cron gravando no banco).
 * Para criar no banco: `npm run db:push` (com DATABASE_URL definido).
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
