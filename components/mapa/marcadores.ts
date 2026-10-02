import type { Point } from "geojson";
import type { Map as MapaMapLibre, Marker } from "maplibre-gl";
import type { CamadaMapaId } from "@/lib/dominio/tipos";
import { corDoCob, DESLOCAMENTO_CLUSTER, FONTES_COM_CLUSTER, pontoDeRotulo, type ColecaoMapa } from "@/lib/mapa";

/**
 * Marcadores HTML do mapa: rótulos dos COBs e números dos agrupamentos.
 * Substituem camadas `symbol` (que exigiriam glyphs remotos). São
 * decorativos (aria-hidden, sem eventos): a mesma informação está na
 * legenda e no painel de camadas, fora do canvas.
 */

type MapLibre = typeof import("maplibre-gl");

function elemento(classe: string, texto: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = classe;
  span.textContent = texto;
  span.setAttribute("aria-hidden", "true");
  return span;
}

/** Rótulos "1º COB"… no ponto interno de cada polígono. */
export class RotulosCob {
  private marcadores: Marker[] = [];

  constructor(
    private readonly lib: MapLibre,
    private readonly mapa: MapaMapLibre,
  ) {}

  definir(colecao: ColecaoMapa | null): void {
    this.remover();
    if (!colecao) return;
    for (const feicao of colecao.features) {
      const rotulo = typeof feicao.properties?.cob === "string" ? feicao.properties.cob : null;
      const ponto = pontoDeRotulo(feicao.geometry);
      if (!rotulo || !ponto) continue;
      const el = elemento("mapa-rotulo-cob", rotulo);
      // Cor de dado (tabela fixa dos COBs), nunca um valor vindo da fonte.
      el.style.setProperty("--cob-cor", corDoCob(rotulo, "escuro", "preenchimento"));
      this.marcadores.push(new this.lib.Marker({ element: el, anchor: "center" }).setLngLat(ponto).addTo(this.mapa));
    }
  }

  remover(): void {
    for (const m of this.marcadores) m.remove();
    this.marcadores = [];
  }
}

const formatoInteiro = new Intl.NumberFormat("pt-BR");

/** "8", "999", "1,2 mil". */
export function abreviarContagem(n: number): string {
  if (n < 1000) return formatoInteiro.format(n);
  const mil = n / 1000;
  return `${mil.toLocaleString("pt-BR", { maximumFractionDigits: mil < 10 ? 1 : 0 })} mil`;
}

/** Números sobre os círculos de agrupamento (clusters) de alertas e ações. */
export class ContagensClusters {
  private ativos = new Map<string, Marker>();

  constructor(
    private readonly lib: MapLibre,
    private readonly mapa: MapaMapLibre,
  ) {}

  atualizar(visiveis: ReadonlySet<CamadaMapaId>): void {
    const manter = new Set<string>();
    for (const fonte of FONTES_COM_CLUSTER) {
      if (!visiveis.has(fonte) || !this.mapa.getSource(fonte)) continue;
      if (!this.mapa.isSourceLoaded(fonte)) {
        // Tiles carregando: mantém os números atuais para não piscar.
        for (const chave of this.ativos.keys()) if (chave.startsWith(`${fonte}:`)) manter.add(chave);
        continue;
      }
      for (const feicao of this.mapa.querySourceFeatures(fonte, { filter: ["has", "point_count"] })) {
        const props = feicao.properties ?? {};
        const quantidade = Number(props.point_count);
        const coordenadas = (feicao.geometry as Point | undefined)?.coordinates;
        if (!Number.isFinite(quantidade) || !coordenadas) continue;
        const chave = `${fonte}:${String(props.cluster_id)}:${quantidade}`;
        if (manter.has(chave)) continue;
        manter.add(chave);
        if (!this.ativos.has(chave)) {
          const el = elemento("mapa-cluster-n", abreviarContagem(quantidade));
          el.dataset.camada = fonte;
          const marcador = new this.lib.Marker({
            element: el,
            anchor: "center",
            offset: DESLOCAMENTO_CLUSTER[fonte] ?? [0, 0],
          })
            .setLngLat([coordenadas[0], coordenadas[1]])
            .addTo(this.mapa);
          this.ativos.set(chave, marcador);
        }
      }
    }
    for (const [chave, marcador] of this.ativos) {
      if (!manter.has(chave)) {
        marcador.remove();
        this.ativos.delete(chave);
      }
    }
  }

  remover(): void {
    for (const m of this.ativos.values()) m.remove();
    this.ativos.clear();
  }
}
