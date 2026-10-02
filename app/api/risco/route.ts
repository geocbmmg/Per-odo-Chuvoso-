import { respostaErro, respostaJson } from "@/lib/api/respostas";
import { obterRisco } from "@/lib/dados/risco";

/**
 * GET /api/risco — mapa de risco por município (docs/fase-1.md §5): as camadas
 * Meteorológico (INMET), Geológico e Hidrológico (CEMADEN) e Alertas do CBMMG,
 * cada uma com carimbo e resumo por COB e UEOp, mais a combinada (pior nível
 * por município). Uma fonte fora do ar deixa só a sua camada indisponível;
 * 503 apenas quando TODAS falham sem leitura anterior.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const risco = await obterRisco();
    if (!risco.meta) {
      return Response.json(
        {
          erro: "Nenhuma fonte do mapa de risco está disponível no momento e não há leitura anterior.",
          camadas: Object.values(risco.camadas).map((c) => ({ id: c.id, rotulo: c.rotulo, erro: c.erro })),
        },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
      );
    }
    // Vigência recalculada a cada resposta: CDN por no máximo 1 min (30 s se faltar alguma camada).
    const incompleto = risco.combinado.indisponiveis.length > 0;
    return respostaJson(risco, { sMaxAge: incompleto ? 30 : 60, origem: risco.meta.origem });
  } catch (erro) {
    return respostaErro(erro);
  }
}
