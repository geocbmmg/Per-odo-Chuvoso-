import { respostaErro } from "@/lib/api/respostas";
import { obterPainelStatus } from "@/lib/dados/status";

/**
 * GET /api/status — estado de cada fonte de dados (ok, atrasada, fora do ar,
 * não implementada), com a resolução de campos das camadas ArcGIS.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const painel = await obterPainelStatus();
    return Response.json(painel, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    return respostaErro(erro);
  }
}
