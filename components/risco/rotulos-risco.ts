import type { Map as MapaMapLibre, Marker } from "maplibre-gl";
import { CORES_NIVEL, gravidade, type NivelRisco } from "@/lib/dominio/matrizes";
import { rotulosSemSobreposicao, ZOOM_ROTULOS_MUNICIPIO, type CaixaTela, type RotuloArea } from "@/lib/mapa/risco";
import type { MunicipioMg } from "@/lib/territorio/municipios";

/**
 * Rótulos do mapa de risco como marcadores HTML (o estilo não tem glyphs,
 * então não há camadas `symbol`). Decorativos (aria-hidden, sem eventos): a
 * mesma informação está nas listas e na tabela fora do canvas.
 *
 * - COB e UEOp: nome + amostra e nome da cor do nível. Qual aparece depende
 *   do nível exibido (CSS: [data-nivel-area] na raiz do mapa).
 * - Municípios: só o nome, a partir do zoom 8, sem sobreposição (os de nível
 *   mais grave têm prioridade).
 */

type MapLibre = typeof import("maplibre-gl");

function span(classe: string, texto?: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function amostra(nivel: NivelRisco | null): HTMLSpanElement {
  const el = span("risco-rotulo__cor");
  if (nivel) el.style.setProperty("--risco-cor", CORES_NIVEL[nivel].fundo);
  else el.dataset.vazia = "true";
  return el;
}

export class RotulosAreasRisco {
  private marcadores: { marcador: Marker; rotulo: RotuloArea }[] = [];

  constructor(
    private readonly lib: MapLibre,
    private readonly mapa: MapaMapLibre,
  ) {}

  definir(rotulos: readonly RotuloArea[]): void {
    this.remover();
    for (const r of rotulos) {
      const el = span("risco-rotulo");
      el.dataset.nivelArea = r.nivelArea;
      el.setAttribute("aria-hidden", "true");
      el.append(amostra(r.nivel), span("risco-rotulo__nome", r.texto));
      if (r.nivel) el.append(span("risco-rotulo__nivel", CORES_NIVEL[r.nivel].nome));
      const marcador = new this.lib.Marker({ element: el, anchor: "center" }).setLngLat(r.ponto).addTo(this.mapa);
      this.marcadores.push({ marcador, rotulo: r });
    }
  }

  /**
   * Esconde os rótulos do nível exibido que encostariam em outro (fica o de
   * nível mais grave). Mede o DOM: chamar depois do render e do movimento.
   */
  evitarSobreposicao(): void {
    const visiveis = this.marcadores
      .map(({ marcador, rotulo }) => ({ el: marcador.getElement(), rotulo }))
      .filter(({ el }) => {
        el.dataset.colide = "false";
        return el.getClientRects().length > 0;
      })
      .map(({ el, rotulo }) => {
        const r = el.getBoundingClientRect();
        return { el, rotulo, caixa: { x: r.x, y: r.y, largura: r.width, altura: r.height } };
      })
      .sort(
        (a, b) =>
          (b.rotulo.nivel ? gravidade(b.rotulo.nivel) + 1 : 0) - (a.rotulo.nivel ? gravidade(a.rotulo.nivel) + 1 : 0),
      );
    const aceitos = new Set(rotulosSemSobreposicao(visiveis, 2).map((v) => v.el));
    for (const { el } of visiveis) el.dataset.colide = aceitos.has(el) ? "false" : "true";
  }

  remover(): void {
    for (const { marcador } of this.marcadores) marcador.remove();
    this.marcadores = [];
  }
}

/** Largura aproximada do rótulo (11px, peso 700) para evitar sobreposição. */
function caixaDoNome(nome: string, x: number, y: number): CaixaTela {
  const largura = Math.ceil(nome.length * 6.4 + 12);
  const altura = 18;
  return { x: x - largura / 2, y: y - altura / 2, largura, altura };
}

/** Canto ocupado pela barra de ferramentas do mapa (px; 44 px por botão no celular). */
const FERRAMENTAS = { largura: 58, altura: 300 };

/** Limite de nomes na tela (o celular inteiro tem ~60 municípios no zoom 8). */
const MAXIMO_NOMES = 220;

export class RotulosMunicipiosRisco {
  private ativos = new Map<string, Marker>();

  constructor(
    private readonly lib: MapLibre,
    private readonly mapa: MapaMapLibre,
    private readonly municipios: readonly MunicipioMg[],
  ) {}

  atualizar(niveis: ReadonlyMap<string, NivelRisco> | null): void {
    if (this.mapa.getZoom() < ZOOM_ROTULOS_MUNICIPIO) {
      this.remover();
      return;
    }
    const limites = this.mapa.getBounds();
    const { clientWidth, clientHeight } = this.mapa.getContainer();
    const candidatos = this.municipios
      .filter((m) => limites.contains([m.lon, m.lat]))
      .map((m) => {
        const p = this.mapa.project([m.lon, m.lat]);
        return { m, nivel: niveis?.get(m.ibge) ?? null, caixa: caixaDoNome(m.nome, p.x, p.y) };
      })
      // Dentro da área visível (com margem para o rótulo não cortar na borda).
      .filter(
        ({ caixa }) =>
          caixa.x > 2 &&
          caixa.y > 2 &&
          caixa.x + caixa.largura < clientWidth - 2 &&
          caixa.y + caixa.altura < clientHeight - 2 &&
          // Fora da barra de ferramentas (canto superior esquerdo).
          !(caixa.x < FERRAMENTAS.largura && caixa.y < FERRAMENTAS.altura),
      )
      .sort(
        (a, b) =>
          (b.nivel ? gravidade(b.nivel) + 1 : 0) - (a.nivel ? gravidade(a.nivel) + 1 : 0) ||
          a.m.nome.localeCompare(b.m.nome, "pt-BR"),
      )
      .slice(0, MAXIMO_NOMES * 2);
    const aceitos = rotulosSemSobreposicao(candidatos, 3).slice(0, MAXIMO_NOMES);

    const manter = new Set(aceitos.map((a) => a.m.ibge));
    for (const [ibge, marcador] of this.ativos) {
      if (!manter.has(ibge)) {
        marcador.remove();
        this.ativos.delete(ibge);
      }
    }
    for (const { m } of aceitos) {
      if (this.ativos.has(m.ibge)) continue;
      const el = span("risco-rotulo-mun", m.nome);
      el.setAttribute("aria-hidden", "true");
      this.ativos.set(
        m.ibge,
        new this.lib.Marker({ element: el, anchor: "center" }).setLngLat([m.lon, m.lat]).addTo(this.mapa),
      );
    }
  }

  remover(): void {
    for (const m of this.ativos.values()) m.remove();
    this.ativos.clear();
  }
}
