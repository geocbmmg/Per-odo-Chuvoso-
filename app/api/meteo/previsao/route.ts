import { metaDaLeitura, respostaErro, respostaJson } from "@/lib/api/respostas";
import { obterPrevisaoCobs } from "@/lib/sources/open-meteo";

/**
 * GET /api/meteo/previsao — precipitação prevista (Open-Meteo) nas sedes dos
 * 6 COBs: acumulados de 24 h e 72 h a partir da hora corrente, série horária
 * (72 h) e totais diários. Atribuição obrigatória: Open-Meteo.com (CC BY 4.0).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leitura = await obterPrevisaoCobs();
    return respostaJson(
      { previsoes: leitura.dados, meta: metaDaLeitura(leitura), credito: "Previsão: Open-Meteo.com (CC BY 4.0)" },
      // Acumulados dependem da hora corrente: CDN por no máximo 10 min.
      { sMaxAge: 600, origem: leitura.origem },
    );
  } catch (erro) {
    return respostaErro(erro);
  }
}
