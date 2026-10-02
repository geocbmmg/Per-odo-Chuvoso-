import { metaDaLeitura, respostaErro, respostaJson } from "@/lib/api/respostas";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { obterAvisosInmet } from "@/lib/sources/inmet";

/**
 * GET /api/inmet/avisos — avisos meteorológicos do INMET que afetam Minas
 * Gerais e ainda não expiraram (vigentes e futuros), do mais grave ao menos grave.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leitura = await obterAvisosInmet();
    return respostaJson(
      { avisos: leitura.dados, meta: metaDaLeitura(leitura) },
      // Curto no CDN: a vigência é recalculada a cada resposta.
      { sMaxAge: Math.min(CATALOGO_FONTES["inmet-avisos"].ttlSegundos, 300), origem: leitura.origem },
    );
  } catch (erro) {
    return respostaErro(erro);
  }
}
