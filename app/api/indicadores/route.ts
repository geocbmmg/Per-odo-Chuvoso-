import { respostaErro, respostaJson } from "@/lib/api/respostas";
import { obterIndicadores } from "@/lib/dados/visao-geral";
import { ehPeriodoId } from "@/lib/dominio/periodo";

/**
 * GET /api/indicadores?periodo=atual|anterior|tudo — total de alertas,
 * ações RRD, pendentes, por COB e por tipo de risco, calculados das camadas
 * do ArcGIS. O carimbo "meta" é o da fonte mais antiga.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const periodo = new URL(req.url).searchParams.get("periodo") ?? "atual";
  if (!ehPeriodoId(periodo)) {
    return Response.json(
      { erro: "Período inválido. Use atual, anterior ou tudo." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const resultado = await obterIndicadores(periodo);
    return respostaJson(resultado, { sMaxAge: 120, origem: resultado.meta.origem });
  } catch (erro) {
    return respostaErro(erro);
  }
}
