import { metaDaLeitura, respostaErro, respostaJson } from "@/lib/api/respostas";
import { CAMADAS_MAPA, type CamadaMapaId } from "@/lib/dominio/tipos";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { CAMADAS_ARCGIS, obterCamada } from "@/lib/sources/arcgis";

/**
 * GET /api/arcgis/{camada} — camada do ArcGIS do CBMMG como GeoJSON
 * normalizado (somente leitura), com o membro "meta" (fonte, atualizadoEm,
 * origem, erro). Camadas: cobs, alertas, acoes-rrd, ocorrencias-complexas.
 */
export const dynamic = "force-dynamic";

function ehCamada(valor: string): valor is CamadaMapaId {
  return (CAMADAS_MAPA as readonly string[]).includes(valor);
}

export async function GET(_req: Request, ctx: RouteContext<"/api/arcgis/[camada]">) {
  const { camada } = await ctx.params;
  if (!ehCamada(camada)) {
    return Response.json(
      { erro: `Camada desconhecida. Use: ${CAMADAS_MAPA.join(", ")}.` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const leitura = await obterCamada(camada);
    const definicao = CAMADAS_ARCGIS[camada];
    return respostaJson(
      {
        type: "FeatureCollection",
        features: leitura.dados.feicoes.features,
        meta: { ...metaDaLeitura(leitura), camada: definicao.nome },
      },
      { sMaxAge: CATALOGO_FONTES[definicao.fonte].ttlSegundos, origem: leitura.origem },
    );
  } catch (erro) {
    return respostaErro(erro);
  }
}
