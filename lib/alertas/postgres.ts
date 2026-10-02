import "server-only";
import { and, asc, desc, eq, inArray, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import type { BancoDados } from "@/lib/db/cliente";
import { salaAcoesRrd, salaAlertas, salaAlertasDestinatarios, salaAlertasHistorico } from "@/lib/db/schema";
import type { AcaoRrdSala, AlertaSala, Destinatario, EventoHistorico } from "./dominio";
import {
  acaoParaFeicao,
  alertaParaFeicao,
  atributosParaDestinatario,
  atributosParaEvento,
  destinatarioParaAtributos,
  eventoParaAtributos,
  feicaoParaAcao,
  feicaoParaAlerta,
  type AtributosEsri,
  type FeicaoPontoEsri,
} from "./feicao";
import {
  ErroArmazem,
  ErroConflito,
  ErroNaoEncontrado,
  maiorNumero,
  type FiltroAlertas,
  type ListaAlertas,
  type RepositorioAlertas,
  type TipoNumeracao,
} from "./repositorio";

/**
 * Armazém Postgres (Neon) da fila, enquanto as camadas do ArcGIS não existem.
 * As linhas têm o MESMO formato da feição (lib/db/schema.ts): a conversão é a
 * de feicao.ts, e as linhas viram atributos Esri sem tradução.
 *
 * Concorrência otimista no próprio UPDATE (`WHERE alterado_em = <lida>`):
 * zero linhas afetadas = outra pessoa gravou antes (409) ou o alerta sumiu (404).
 * O driver neon-http não tem transação interativa: o alerta (com a conferência
 * de versão) é gravado ANTES de destinatários, ações e histórico.
 */

// ---------------------------------------------------------------------------------------------
// Linha ↔ feição (puro)
// ---------------------------------------------------------------------------------------------

/** Linha de tabela de ponto → feição (x/y viram a geometria). */
export function linhaParaFeicao(linha: Record<string, unknown>): FeicaoPontoEsri {
  const { x, y, ...atributos } = linha;
  const geometria =
    typeof x === "number" && typeof y === "number" ? { x, y, spatialReference: { wkid: 4326 } } : null;
  return { attributes: atributos as AtributosEsri, geometry: geometria };
}

/** Feição → valores de INSERT/UPDATE (sem objectid, que é do banco). */
export function feicaoParaLinha(feicao: FeicaoPontoEsri): Record<string, unknown> {
  const { objectid: _oid, ...atributos } = feicao.attributes; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...atributos, x: feicao.geometry?.x ?? null, y: feicao.geometry?.y ?? null };
}

/** Atributos de tabela (sem geometria) → valores de INSERT/UPDATE. */
export function atributosParaLinha(atributos: AtributosEsri): Record<string, unknown> {
  const { objectid: _oid, ...resto } = atributos; // eslint-disable-line @typescript-eslint/no-unused-vars
  return resto;
}

/** Código 23505 (unique_violation), no erro ou na causa (o neon embrulha). */
function violouUnico(erro: unknown): boolean {
  for (let e: unknown = erro, i = 0; e && i < 3; i++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

async function protegido<T>(operacao: string, executar: () => Promise<T>): Promise<T> {
  try {
    return await executar();
  } catch (erro) {
    if (erro instanceof ErroConflito || erro instanceof ErroNaoEncontrado) throw erro;
    if (violouUnico(erro)) throw new ErroConflito(`Registro repetido (${operacao}).`);
    console.error(`[alertas/postgres] falha em ${operacao}`, erro instanceof Error ? erro.message : erro);
    throw new ErroArmazem(`Falha no banco ao ${operacao}.`);
  }
}

// ---------------------------------------------------------------------------------------------
// Repositório
// ---------------------------------------------------------------------------------------------

type ValoresAlerta = typeof salaAlertas.$inferInsert;
type ValoresAcao = typeof salaAcoesRrd.$inferInsert;
type ValoresDestinatario = typeof salaAlertasDestinatarios.$inferInsert;
type ValoresHistorico = typeof salaAlertasHistorico.$inferInsert;

export function criarRepositorioPostgres(db: BancoDados): RepositorioAlertas {
  const versaoIgual = (lida: string | null) =>
    lida === null ? isNull(salaAlertas.alterado_em) : eq(salaAlertas.alterado_em, Date.parse(lida));

  async function lerAlerta(alertaId: string) {
    const [linha] = await db.select().from(salaAlertas).where(eq(salaAlertas.alerta_id, alertaId)).limit(1);
    return linha ? feicaoParaAlerta(linhaParaFeicao(linha)) : null;
  }

  async function conflitoOuAusente(alertaId: string): Promise<never> {
    const gravado = await lerAlerta(alertaId);
    if (!gravado) throw new ErroNaoEncontrado(`Alerta ${alertaId} não encontrado.`);
    throw new ErroConflito("O alerta foi alterado por outra pessoa depois que você o abriu.", gravado.alteradoEm);
  }

  return {
    tipo: "postgres",

    listar: (filtro: FiltroAlertas, limite: number) =>
      protegido("listar alertas", async (): Promise<ListaAlertas> => {
        const condicoes: SQL[] = [];
        if (!filtro.incluirRascunhos) condicoes.push(ne(salaAlertas.situacao, "RASCUNHO"));
        if (filtro.cobs !== null) {
          const cobs = [...filtro.cobs];
          if (cobs.length === 0) return { alertas: [], truncado: false };
          const notificados = db
            .select({ id: salaAlertasDestinatarios.alerta_id })
            .from(salaAlertasDestinatarios)
            .where(inArray(salaAlertasDestinatarios.cob, cobs));
          condicoes.push(or(inArray(salaAlertas.cob, cobs), inArray(salaAlertas.alerta_id, notificados)) as SQL);
        }
        if (filtro.cob) condicoes.push(eq(salaAlertas.cob, filtro.cob));
        if (filtro.tipo) condicoes.push(eq(salaAlertas.tipo_risco, filtro.tipo));
        if (filtro.situacoes && filtro.situacoes.length > 0) {
          condicoes.push(inArray(salaAlertas.situacao, [...filtro.situacoes]));
        }
        const linhas = await db
          .select()
          .from(salaAlertas)
          .where(condicoes.length ? and(...condicoes) : undefined)
          .orderBy(desc(salaAlertas.alterado_em), desc(salaAlertas.alerta_id))
          .limit(limite + 1);
        return {
          alertas: linhas.slice(0, limite).map((l) => feicaoParaAlerta(linhaParaFeicao(l))),
          truncado: linhas.length > limite,
        };
      }),

    obter: (alertaId) => protegido("ler o alerta", () => lerAlerta(alertaId)),

    proximoNumero: (tipo: TipoNumeracao, prefixo: string) =>
      protegido("numerar", async () => {
        const padrao = `${prefixo}%`;
        let ids: (string | null)[];
        if (tipo === "alerta") {
          // Inclui os ids que só restam no histórico (rascunho apagado não devolve o número).
          const [a, h] = await Promise.all([
            db.select({ id: salaAlertas.alerta_id }).from(salaAlertas).where(like(salaAlertas.alerta_id, padrao)),
            db
              .selectDistinct({ id: salaAlertasHistorico.alerta_id })
              .from(salaAlertasHistorico)
              .where(like(salaAlertasHistorico.alerta_id, padrao)),
          ]);
          ids = [...a, ...h].map((r) => r.id);
        } else {
          ids = (await db.select({ id: salaAcoesRrd.acao_id }).from(salaAcoesRrd).where(like(salaAcoesRrd.acao_id, padrao))).map(
            (r) => r.id,
          );
        }
        return maiorNumero(ids.filter((id): id is string => !!id), prefixo) + 1;
      }),

    criar: (alerta: AlertaSala) =>
      protegido("criar o alerta", async () => {
        const [historico] = await db
          .select({ n: sql<number>`count(*)` })
          .from(salaAlertasHistorico)
          .where(eq(salaAlertasHistorico.alerta_id, alerta.alertaId));
        if (Number(historico?.n ?? 0) > 0) throw new ErroConflito(`O código ${alerta.alertaId} já foi usado.`);
        const valores = feicaoParaLinha(alertaParaFeicao(alerta)) as ValoresAlerta;
        const [linha] = await db.insert(salaAlertas).values(valores).returning();
        return feicaoParaAlerta(linhaParaFeicao(linha));
      }),

    atualizar: (alerta: AlertaSala, alteradoEmLido: string | null) =>
      protegido("gravar o alerta", async () => {
        const valores = feicaoParaLinha(alertaParaFeicao(alerta)) as ValoresAlerta;
        const [linha] = await db
          .update(salaAlertas)
          .set(valores)
          .where(and(eq(salaAlertas.alerta_id, alerta.alertaId), versaoIgual(alteradoEmLido)))
          .returning();
        if (!linha) return conflitoOuAusente(alerta.alertaId);
        return feicaoParaAlerta(linhaParaFeicao(linha));
      }),

    apagarRascunho: (alertaId: string, alteradoEmLido: string | null) =>
      protegido("apagar o rascunho", async () => {
        const apagados = await db
          .delete(salaAlertas)
          .where(and(eq(salaAlertas.alerta_id, alertaId), eq(salaAlertas.situacao, "RASCUNHO"), versaoIgual(alteradoEmLido)))
          .returning({ id: salaAlertas.alerta_id });
        if (apagados.length === 0) {
          const gravado = await lerAlerta(alertaId);
          if (gravado && gravado.situacao !== "RASCUNHO") throw new ErroConflito("Só rascunho pode ser apagado.");
          return conflitoOuAusente(alertaId);
        }
        await db.delete(salaAlertasDestinatarios).where(eq(salaAlertasDestinatarios.alerta_id, alertaId));
      }),

    listarDestinatarios: (alertaIds: readonly string[]) =>
      protegido("listar destinatários", async () => {
        if (alertaIds.length === 0) return [];
        const linhas = await db
          .select()
          .from(salaAlertasDestinatarios)
          .where(inArray(salaAlertasDestinatarios.alerta_id, [...alertaIds]))
          .orderBy(asc(salaAlertasDestinatarios.objectid));
        return linhas.map((l) => atributosParaDestinatario(l));
      }),

    substituirDestinatarios: (alertaId: string, destinatarios: readonly Destinatario[]) =>
      protegido("gravar destinatários", async () => {
        await db.delete(salaAlertasDestinatarios).where(eq(salaAlertasDestinatarios.alerta_id, alertaId));
        if (destinatarios.length === 0) return [];
        const valores = destinatarios.map(
          (d) => atributosParaLinha(destinatarioParaAtributos({ ...d, alertaId, objectid: null })) as ValoresDestinatario,
        );
        const linhas = await db.insert(salaAlertasDestinatarios).values(valores).returning();
        return linhas.map((l) => atributosParaDestinatario(l));
      }),

    atualizarDestinatario: (destinatario: Destinatario) =>
      protegido("gravar a ciência", async () => {
        if (destinatario.objectid === null) throw new ErroNaoEncontrado("Destinatário não encontrado.");
        const valores = atributosParaLinha(destinatarioParaAtributos(destinatario)) as ValoresDestinatario;
        const [linha] = await db
          .update(salaAlertasDestinatarios)
          .set(valores)
          .where(eq(salaAlertasDestinatarios.objectid, destinatario.objectid))
          .returning();
        if (!linha) throw new ErroNaoEncontrado("Destinatário não encontrado.");
        return atributosParaDestinatario(linha);
      }),

    listarAcoes: (alertaIds: readonly string[]) =>
      protegido("listar ações", async () => {
        if (alertaIds.length === 0) return [];
        const linhas = await db
          .select()
          .from(salaAcoesRrd)
          .where(inArray(salaAcoesRrd.alerta_id, [...alertaIds]))
          .orderBy(asc(salaAcoesRrd.data_acao));
        return linhas.map((l) => feicaoParaAcao(linhaParaFeicao(l)));
      }),

    criarAcao: (acao: AcaoRrdSala) =>
      protegido("registrar a ação", async () => {
        const valores = feicaoParaLinha(acaoParaFeicao(acao)) as ValoresAcao;
        const [linha] = await db.insert(salaAcoesRrd).values(valores).returning();
        return feicaoParaAcao(linhaParaFeicao(linha));
      }),

    listarHistorico: (alertaId: string) =>
      protegido("ler o histórico", async () => {
        const linhas = await db
          .select()
          .from(salaAlertasHistorico)
          .where(eq(salaAlertasHistorico.alerta_id, alertaId))
          .orderBy(asc(salaAlertasHistorico.quando), asc(salaAlertasHistorico.objectid));
        return linhas.map((l) => atributosParaEvento(l));
      }),

    acrescentarHistorico: (eventos: readonly EventoHistorico[]) =>
      protegido("gravar o histórico", async () => {
        if (eventos.length === 0) return;
        const valores = eventos.map((e) => atributosParaLinha(eventoParaAtributos({ ...e, objectid: null })) as ValoresHistorico);
        await db.insert(salaAlertasHistorico).values(valores);
      }),
  };
}
