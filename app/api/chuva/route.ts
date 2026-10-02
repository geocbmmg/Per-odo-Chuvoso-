import { respostaErro, respostaJson } from "@/lib/api/respostas";
import { obterChuvaMunicipios } from "@/lib/dados/chuva";

/**
 * GET /api/chuva — chuva prevista nos 853 municípios de MG (Open-Meteo),
 * classificada pela matriz de chuva do CBMMG nas janelas das próximas 24 h e
 * 72 h (pior 24 h dentro das 72 h), com o resumo por COB e por UEOp e o
 * ranking dos municípios (docs/fase-1.md §6).
 *
 * A série da fonte fica 3 h em cache no servidor; as janelas são recalculadas
 * a cada resposta a partir da hora corrente. Atribuição obrigatória:
 * Open-Meteo.com (CC BY 4.0), enviada em `credito`.
 */
export const dynamic = "force-dynamic";
// A consulta à fonte traz ~2,5 MB (853 pontos): folga além do timeout de 30 s.
export const maxDuration = 60;

export async function GET() {
  try {
    // { meta, credito, inicioJanela, modelo, municipios, areas, ranking }
    const chuva = await obterChuvaMunicipios();
    // As janelas andam a cada hora cheia: CDN por no máximo 5 min.
    return respostaJson(chuva, { sMaxAge: 300, origem: chuva.meta.origem });
  } catch (erro) {
    return respostaErro(erro);
  }
}
