import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import type { FonteId } from "@/lib/fontes/tipos";
import { CAMADAS_ARCGIS, obterCamada } from "@/lib/sources/arcgis";
import { obterAvisosInmet } from "@/lib/sources/inmet";
import { obterPrevisaoCobs } from "@/lib/sources/open-meteo";

/**
 * GET /api/ingest/{job} — jobs agendados no vercel.json (Vercel Cron).
 *
 * FASE 0 (stub): cada job só consulta as fontes através do cache, aquecendo
 * a instância e registrando o estado. Na Fase 1 os jobs gravarão as leituras
 * no Postgres (tabelas leituras_fontes / execucoes_ingestao em lib/db/schema.ts).
 *
 * Proteção: a Vercel envia "Authorization: Bearer <CRON_SECRET>". Sem
 * CRON_SECRET configurado, o job só roda em desenvolvimento.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResultadoFonte {
  fonte: FonteId;
  nome: string;
  ok: boolean;
  origem?: string;
  atualizadoEm?: string;
  erro?: string;
}

const JOBS: Record<string, { descricao: string; executar: () => Promise<ResultadoFonte[]> }> = {
  arcgis: {
    descricao: "Camadas do ArcGIS do CBMMG (COBs, alertas, ações RRD, ocorrências complexas)",
    executar: () =>
      Promise.all(
        Object.values(CAMADAS_ARCGIS).map((c) => executarFonte(c.fonte, () => obterCamada(c.id))),
      ),
  },
  inmet: {
    descricao: "Avisos meteorológicos do INMET",
    executar: async () => [await executarFonte("inmet-avisos", () => obterAvisosInmet())],
  },
  meteo: {
    descricao: "Previsão Open-Meteo nas sedes dos COBs",
    executar: async () => [await executarFonte("open-meteo-previsao", () => obterPrevisaoCobs())],
  },
  hidrologia: {
    descricao: "ANA HidroWebService e Open-Meteo Flood (GloFAS) — ainda não implementados",
    executar: async () =>
      (["ana-telemetria", "open-meteo-flood"] as const).map((fonte) => ({
        fonte,
        nome: CATALOGO_FONTES[fonte].nome,
        ok: false,
        erro: "Fonte não implementada nesta fase (stub).",
      })),
  },
};

async function executarFonte(
  fonte: FonteId,
  ler: () => Promise<{ origem: string; atualizadoEm: string; erro?: string }>,
): Promise<ResultadoFonte> {
  const nome = CATALOGO_FONTES[fonte].nome;
  try {
    const leitura = await ler();
    return {
      fonte,
      nome,
      ok: leitura.origem !== "ultima-valida",
      origem: leitura.origem,
      atualizadoEm: leitura.atualizadoEm,
      ...(leitura.erro ? { erro: leitura.erro } : {}),
    };
  } catch (erro) {
    return { fonte, nome, ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

const TAMANHO_MINIMO_SEGREDO = 16;

function autorizado(req: Request): boolean {
  const segredo = env().CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  if (segredo.length < TAMANHO_MINIMO_SEGREDO) {
    // Falha fechada só para o cron: as demais rotas seguem funcionando.
    console.error(`[ingest] CRON_SECRET com menos de ${TAMANHO_MINIMO_SEGREDO} caracteres; jobs bloqueados.`);
    return false;
  }
  // Comparação em tempo constante (não vaza o segredo por tempo de resposta).
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: Request, ctx: RouteContext<"/api/ingest/[job]">) {
  if (!autorizado(req)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const { job } = await ctx.params;
  // Object.hasOwn: "constructor", "__proto__" etc. não podem passar por job válido.
  const definicao = Object.hasOwn(JOBS, job) ? JOBS[job] : undefined;
  if (!definicao) {
    return Response.json(
      { erro: `Job desconhecido. Use: ${Object.keys(JOBS).join(", ")}.` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const iniciadoEm = new Date().toISOString();
  const resultados = await definicao.executar();
  return Response.json(
    {
      job,
      descricao: definicao.descricao,
      fase: "Fase 0 — stub (aquece o cache; persistência no Postgres na Fase 1)",
      iniciadoEm,
      concluidoEm: new Date().toISOString(),
      resultados,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
