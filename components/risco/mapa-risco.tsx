"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/mapa/mapa.css";

import { Earth, House, Maximize, Minimize, Minus, Plus, TriangleAlert } from "lucide-react";
import type { LngLatLike, Map as MapaMapLibre, MapMouseEvent, Popup } from "maplibre-gl";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type RefObject } from "react";

import { useContornoMg, useEhCelular, usePrefereMenosMovimento, useTemaMapa } from "@/components/mapa/hooks";
import { SeletorBase } from "@/components/mapa/seletor-base";
import { CORES_NIVEL } from "@/lib/dominio/matrizes";
import {
  armazenamentoLocal,
  CENTRO_MG,
  lerBaseSalva,
  LIMITES_NAVEGACAO,
  LIMITES_VISTA_MG,
  LOCALE_MAPLIBRE_PT_BR,
  paddingVista,
  PREFIXO_BASE,
  prepararWorkerMapLibre,
  salvarBase,
  ZOOM_INICIAL,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  type BaseMapaId,
} from "@/lib/mapa";
import {
  chaveDaArea,
  conteudoBalaoArea,
  conteudoBalaoMunicipio,
  DESTAQUE_POR_NIVEL,
  ESCOLHAS_NIVEL,
  ID_CAMADAS_RISCO,
  indexarMalha,
  montarEstiloRisco,
  nivelEfetivo,
  ROTULOS_ESCOLHA_NIVEL,
  ROTULOS_NIVEL_AREA,
  rotulosCobPelasSedes,
  rotulosDasAreas,
  ZOOM_AREA_MUNICIPIO,
  ZOOM_AREA_UEOP,
  ZOOM_VER_MUNICIPIO,
  type ConteudoBalaoRisco,
  type DadosPintura,
  type Envelope,
  type EscolhaNivel,
  type NivelArea,
} from "@/lib/mapa/risco";
import { MUNICIPIOS_MG, municipioPorIbge } from "@/lib/territorio/municipios";
import { cn } from "@/lib/utils";

import { ALTURA_MAPA_RISCO } from "./altura";
import { criarBalaoRisco } from "./balao-risco";
import { useCobsOficiais, useMalhasRisco } from "./hooks";
import { RotulosAreasRisco, RotulosMunicipiosRisco } from "./rotulos-risco";

type MapLibre = typeof import("maplibre-gl");

/** Alvo de um balão: uma área (COB, UEOp) ou um município. */
export type AlvoMapaRisco =
  | { tipo: "municipio"; ibge: string }
  | { tipo: "area"; nivel: Exclude<NivelArea, "municipio">; chave: string };

/** Pedido vindo das listas: "ver no mapa" (seq muda a cada clique). */
export interface PedidoFocoMapa {
  seq: number;
  alvo: AlvoMapaRisco;
  /** Elemento que pediu (o foco volta para ele quando o balão fecha). */
  origem: HTMLElement | null;
}

export interface PropsMapaRisco {
  /** Dados da pintura escolhida; null enquanto carrega ou com a camada indisponível. */
  dados: DadosPintura | null;
  /** Aviso sobre o mapa ("Carregando…", "Camada indisponível…"). */
  aviso: string | null;
  escolhaNivel: EscolhaNivel;
  onEscolherNivel: (escolha: EscolhaNivel) => void;
  pedidoFoco: PedidoFocoMapa | null;
  /** Rótulo acessível da região do mapa. */
  rotulo: string;
  /** Classes de altura da área do mapa. */
  altura?: string;
}

const FALHA_CARREGAR = "Não foi possível carregar o mapa. Verifique a conexão e recarregue a página.";
const FALHA_WEBGL =
  "Este navegador não conseguiu desenhar o mapa (WebGL indisponível ou desativado). As listas e a tabela abaixo trazem os mesmos dados.";

/** Margens para o balão não nascer sob a barra de ferramentas (à esquerda). */
const PADDING_BALAO = { top: 10, right: 10, bottom: 10, left: 60 };

interface Destaque {
  fonte: string;
  id: string;
}

function definirDestaque(
  mapa: MapaMapLibre,
  ref: RefObject<Destaque | null>,
  novo: Destaque | null,
  estado: "hover" | "selecionado",
): void {
  const atual = ref.current;
  if (atual && novo && atual.fonte === novo.fonte && atual.id === novo.id) return;
  if (atual && mapa.getSource(atual.fonte))
    mapa.setFeatureState({ source: atual.fonte, id: atual.id }, { [estado]: false });
  ref.current = novo;
  if (novo && mapa.getSource(novo.fonte)) mapa.setFeatureState({ source: novo.fonte, id: novo.id }, { [estado]: true });
}

function destaqueDoAlvo(alvo: AlvoMapaRisco): Destaque {
  if (alvo.tipo === "municipio") return { fonte: DESTAQUE_POR_NIVEL.municipio.fonte, id: alvo.ibge };
  return { fonte: DESTAQUE_POR_NIVEL[alvo.nivel].fonte, id: alvo.chave };
}

/** Alvo sob as propriedades de um município da malha, no nível exibido. */
function alvoDasPropriedades(nivel: NivelArea, props: Record<string, unknown>): AlvoMapaRisco | null {
  const chave = chaveDaArea(nivel, props);
  if (!chave || chave === " · ") return null;
  return nivel === "municipio" ? { tipo: "municipio", ibge: chave } : { tipo: "area", nivel, chave };
}

function centro(env: Envelope): [number, number] {
  return [(env[0] + env[2]) / 2, (env[1] + env[3]) / 2];
}

/**
 * Mapa de risco e chuva no modelo do GeoRisk: uma pintura por vez, nível de
 * agregação pelo zoom (COB → UEOp → município) ou fixado pelo usuário,
 * balões em DOM e rótulos HTML. Reaproveita a infraestrutura do mapa da
 * Visão Geral (bases Esri, worker, máscara de MG, tema, seletor de base).
 */
export default function MapaRisco({
  dados,
  aviso,
  escolhaNivel,
  onEscolherNivel,
  pedidoFoco,
  rotulo,
  altura = ALTURA_MAPA_RISCO,
}: PropsMapaRisco) {
  const raizRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaMapLibre | null>(null);
  const libRef = useRef<MapLibre | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const alvoBalaoRef = useRef<{ alvo: AlvoMapaRisco; onde: LngLatLike } | null>(null);
  const hoverRef = useRef<Destaque | null>(null);
  const selecionadoRef = useRef<Destaque | null>(null);
  const rotulosAreasRef = useRef<RotulosAreasRisco | null>(null);
  const rotulosMunicipiosRef = useRef<RotulosMunicipiosRisco | null>(null);
  const botaoBaseRef = useRef<HTMLButtonElement>(null);
  const nomeGrupoNivel = useId();

  const tema = useTemaMapa();
  const reduzir = usePrefereMenosMovimento();
  const celular = useEhCelular();
  const contornoMg = useContornoMg();
  const malhas = useMalhasRisco();
  const cobs = useCobsOficiais();

  const [pronto, setPronto] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [zoom, setZoom] = useState(ZOOM_INICIAL);
  const [base, setBase] = useState<BaseMapaId>(() => lerBaseSalva(armazenamentoLocal()));
  const [falhaBase, setFalhaBase] = useState(false);
  const [painelBase, setPainelBase] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [expandido, setExpandido] = useState(false);

  const nivelVisivel = nivelEfetivo(escolhaNivel, zoom);
  const indice = useMemo(() => indexarMalha(malhas.municipios), [malhas.municipios]);

  const estilo = useMemo(
    () =>
      montarEstiloRisco({
        base,
        tema,
        contornoMg,
        municipios: malhas.municipios,
        ueops: malhas.ueops,
        cobs: cobs.colecao,
        dados,
        escolha: escolhaNivel,
        reduzirMovimento: reduzir,
      }),
    [base, tema, contornoMg, malhas.municipios, malhas.ueops, cobs.colecao, dados, escolhaNivel, reduzir],
  );

  // ── Balão ────────────────────────────────────────────────────────────────

  const conteudoDoAlvo = (alvo: AlvoMapaRisco): ConteudoBalaoRisco | null => {
    if (alvo.tipo === "municipio") {
      const m = municipioPorIbge(alvo.ibge);
      return m ? conteudoBalaoMunicipio(dados, m) : null;
    }
    return dados ? conteudoBalaoArea(dados, alvo.nivel, alvo.chave, MUNICIPIOS_MG) : null;
  };

  const corDaBorda = (conteudo: ConteudoBalaoRisco) =>
    conteudo.nivel ? CORES_NIVEL[conteudo.nivel].fundo : "rgba(var(--m-linha-rgb), 0.3)";

  const aproximarEm = (alvo: Extract<AlvoMapaRisco, { tipo: "area" }>) => {
    const mapa = mapaRef.current;
    const env = indice[alvo.nivel].get(alvo.chave);
    if (!mapa || !env) return;
    popupRef.current?.remove();
    const { clientWidth, clientHeight } = mapa.getContainer();
    mapa.fitBounds(
      [
        [env[0], env[1]],
        [env[2], env[3]],
      ],
      { padding: paddingVista(clientWidth, clientHeight), animate: !reduzir, duration: 600 },
    );
  };

  const montarBalao = (alvo: AlvoMapaRisco): { el: HTMLElement; cor: string } | null => {
    const conteudo = conteudoDoAlvo(alvo);
    if (!conteudo) return null;
    const el = criarBalaoRisco(conteudo, {
      aoAproximar: alvo.tipo === "area" ? () => aproximarEm(alvo) : undefined,
    });
    return { el, cor: corDaBorda(conteudo) };
  };

  const abrirBalao = (alvo: AlvoMapaRisco, onde: LngLatLike, retornoFoco: HTMLElement | null = null) => {
    const mapa = mapaRef.current;
    const lib = libRef.current;
    if (!mapa || !lib) return;
    const balao = montarBalao(alvo);
    if (!balao) {
      popupRef.current?.remove();
      return;
    }
    popupRef.current?.remove();
    // Em mapas estreitos, o ponto desce um pouco para o balão caber acima dele.
    const { clientWidth, clientHeight } = mapa.getContainer();
    if (clientWidth < 560) {
      mapa.easeTo({ center: onde, offset: [0, Math.round(clientHeight * 0.14)], duration: 280, animate: !reduzir });
    }
    const popup = new lib.Popup({
      className: "mapa-popup",
      maxWidth: "390px",
      offset: 12,
      closeButton: true,
      closeOnClick: false,
      // O MapLibre focaria o primeiro botão (o "Aproximar", no fim) e rolaria o
      // balão até ele; o foco vai para o início do conteúdo, logo abaixo.
      focusAfterOpen: false,
      padding: PADDING_BALAO,
    })
      .setLngLat(onde)
      .setDOMContent(balao.el)
      .addTo(mapa);
    const elemento = popup.getElement();
    elemento.style.setProperty("--pop-borda", balao.cor);
    let fechadoPorDentro = false;
    elemento.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        fechadoPorDentro = true;
        popup.remove();
      }
    });
    elemento.addEventListener(
      "click",
      (evento) => {
        if (evento.target instanceof Element && evento.target.closest(".maplibregl-popup-close-button")) {
          fechadoPorDentro = true;
        }
      },
      true,
    );
    popup.on("close", () => {
      if (popupRef.current === popup) {
        popupRef.current = null;
        alvoBalaoRef.current = null;
        if (mapaRef.current) definirDestaque(mapaRef.current, selecionadoRef, null, "selecionado");
      }
      // Fechado por quem estava dentro (Esc ou o botão ×): o foco volta para quem pediu o
      // balão ("Ver no mapa") ou, senão, para o canvas do mapa — nunca cai no <body>.
      if (fechadoPorDentro) {
        if (retornoFoco?.isConnected) retornoFoco.focus();
        else mapa.getCanvas().focus();
      }
    });
    balao.el.focus({ preventScroll: true });
    popupRef.current = popup;
    alvoBalaoRef.current = { alvo, onde };
    definirDestaque(mapa, selecionadoRef, destaqueDoAlvo(alvo), "selecionado");
  };

  // ── Eventos do mapa (sempre leem o estado mais recente) ──────────────────

  const obterEstiloInicial = useEffectEvent(() => estilo);
  const obterReduzir = useEffectEvent(() => reduzir);

  const alvoNoPonto = (mapa: MapaMapLibre, ponto: MapMouseEvent["point"]): AlvoMapaRisco | null => {
    if (!mapa.getLayer(ID_CAMADAS_RISCO.preenchimento)) return null;
    const [feicao] = mapa.queryRenderedFeatures(ponto, { layers: [ID_CAMADAS_RISCO.preenchimento] });
    if (!feicao) return null;
    return alvoDasPropriedades(nivelEfetivo(escolhaNivel, mapa.getZoom()), feicao.properties ?? {});
  };

  const aoClicar = useEffectEvent((evento: MapMouseEvent) => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (celular) setPainelBase(false);
    const alvo = alvoNoPonto(mapa, evento.point);
    if (!alvo) {
      popupRef.current?.remove();
      return;
    }
    const onde =
      alvo.tipo === "municipio"
        ? (() => {
            const m = municipioPorIbge(alvo.ibge);
            return m ? ([m.lon, m.lat] as LngLatLike) : evento.lngLat;
          })()
        : evento.lngLat;
    abrirBalao(alvo, onde);
  });

  const aoMover = useEffectEvent((evento: MapMouseEvent) => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const alvo = alvoNoPonto(mapa, evento.point);
    definirDestaque(mapa, hoverRef, alvo ? destaqueDoAlvo(alvo) : null, "hover");
    mapa.getCanvas().style.cursor = alvo ? "pointer" : "";
  });

  const aoSair = useEffectEvent(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    definirDestaque(mapa, hoverRef, null, "hover");
    mapa.getCanvas().style.cursor = "";
  });

  const aoTerminarMovimento = useEffectEvent(() => {
    rotulosMunicipiosRef.current?.atualizar(dados?.niveis ?? null);
    rotulosAreasRef.current?.evitarSobreposicao();
  });

  const aoErro = useEffectEvent((evento: { error?: { message?: string }; sourceId?: string }) => {
    if (evento.sourceId?.startsWith(PREFIXO_BASE)) {
      setFalhaBase(true);
      return;
    }
    if (/worker/i.test(evento.error?.message ?? "")) {
      setFalha(FALHA_CARREGAR);
      return;
    }
    console.warn("[mapa-risco]", evento.error?.message ?? "erro no MapLibre");
  });

  const aoCarregarTileBase = useEffectEvent(() => {
    if (falhaBase) setFalhaBase(false);
  });

  // ── Criação do mapa (uma vez) ─────────────────────────────────────────────

  useEffect(() => {
    let cancelado = false;
    let mapa: MapaMapLibre | null = null;

    const iniciar = async () => {
      let lib: MapLibre;
      try {
        lib = await import("maplibre-gl");
        await prepararWorkerMapLibre(lib);
      } catch {
        if (!cancelado) setFalha(FALHA_CARREGAR);
        return;
      }
      const container = canvasRef.current;
      if (cancelado || !container) return;

      const reduzirAgora = obterReduzir();
      try {
        mapa = new lib.Map({
          container,
          style: obterEstiloInicial(),
          center: CENTRO_MG,
          zoom: ZOOM_INICIAL,
          minZoom: ZOOM_MINIMO,
          maxZoom: ZOOM_MAXIMO,
          maxBounds: LIMITES_NAVEGACAO,
          renderWorldCopies: false,
          attributionControl: {},
          maplibreLogo: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          rollEnabled: false,
          locale: LOCALE_MAPLIBRE_PT_BR,
          fadeDuration: reduzirAgora ? 0 : 300,
          reduceMotion: reduzirAgora ? true : undefined,
        });
      } catch {
        if (!cancelado) setFalha(FALHA_WEBGL);
        return;
      }
      const m = mapa;
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      libRef.current = lib;
      mapaRef.current = m;
      rotulosAreasRef.current = new RotulosAreasRisco(lib, m);
      rotulosMunicipiosRef.current = new RotulosMunicipiosRisco(lib, m, MUNICIPIOS_MG);

      const { clientWidth, clientHeight } = container;
      m.fitBounds(LIMITES_VISTA_MG, { padding: paddingVista(clientWidth, clientHeight), animate: false });

      m.once("styledata", () => {
        if (!cancelado) setPronto(true);
      });
      // Durante o zoom, o estado só muda quando o nível inteiro muda (é o que
      // decide COB/UEOp/município); o valor exato chega no fim do movimento.
      let zoomInteiro = Math.floor(m.getZoom());
      m.on("zoom", () => {
        const agora = Math.floor(m.getZoom());
        if (agora === zoomInteiro) return;
        zoomInteiro = agora;
        setZoom(m.getZoom());
      });
      m.on("zoomend", () => setZoom(m.getZoom()));
      m.on("moveend", () => aoTerminarMovimento());
      m.on("click", (e) => aoClicar(e));
      m.on("mousemove", (e) => aoMover(e));
      m.on("mouseout", () => aoSair());
      m.on("error", (e) => aoErro(e as unknown as { error?: { message?: string }; sourceId?: string }));
      m.on("data", (e) => {
        if (e.dataType === "source" && "tile" in e && e.tile && e.sourceId?.startsWith(PREFIXO_BASE)) {
          aoCarregarTileBase();
        }
      });
      setZoom(m.getZoom());
    };

    void iniciar();

    return () => {
      cancelado = true;
      popupRef.current?.remove();
      popupRef.current = null;
      rotulosAreasRef.current?.remover();
      rotulosAreasRef.current = null;
      rotulosMunicipiosRef.current?.remover();
      rotulosMunicipiosRef.current = null;
      hoverRef.current = null;
      selecionadoRef.current = null;
      mapa?.remove();
      mapaRef.current = null;
      libRef.current = null;
    };
  }, []);

  // ── Estado da tela → estilo do mapa (diff, sem recriar o mapa) ───────────

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!pronto || !mapa) return;
    mapa.setStyle(estilo, { diff: true });
  }, [pronto, estilo]);

  // Rótulos das áreas (COB oficial ou, na falta dele, pelas sedes; UEOp aproximada).
  useEffect(() => {
    if (!pronto) return;
    const rotulosCob = cobs.colecao
      ? rotulosDasAreas(cobs.colecao, "cob", dados)
      : rotulosCobPelasSedes(MUNICIPIOS_MG, dados);
    rotulosAreasRef.current?.definir([...rotulosCob, ...rotulosDasAreas(malhas.ueops, "ueop", dados)]);
    rotulosMunicipiosRef.current?.atualizar(dados?.niveis ?? null);
  }, [pronto, cobs.colecao, malhas.ueops, dados]);

  // Rótulos que se tocam: medidos depois que o nível exibido aparece (CSS).
  useEffect(() => {
    if (pronto) rotulosAreasRef.current?.evitarSobreposicao();
  }, [pronto, nivelVisivel, cobs.colecao, malhas.ueops, dados]);

  // Dados novos (atualização periódica, outra camada): o balão aberto acompanha.
  const atualizarBalao = useEffectEvent(() => {
    const aberto = alvoBalaoRef.current;
    const popup = popupRef.current;
    if (!aberto || !popup) return;
    const balao = montarBalao(aberto.alvo);
    if (!balao) {
      popup.remove();
      return;
    }
    popup.setDOMContent(balao.el);
    popup.getElement().style.setProperty("--pop-borda", balao.cor);
  });

  useEffect(() => {
    if (pronto) atualizarBalao();
  }, [pronto, dados]);

  // Nível exibido mudou (zoom ou escolha): o balão de outro nível perde o sentido.
  useEffect(() => {
    // O destaque do hover era da área do nível anterior.
    if (mapaRef.current) definirDestaque(mapaRef.current, hoverRef, null, "hover");
    const aberto = alvoBalaoRef.current;
    if (!aberto) return;
    const nivelDoBalao = aberto.alvo.tipo === "municipio" ? "municipio" : aberto.alvo.nivel;
    if (nivelDoBalao !== nivelVisivel) popupRef.current?.remove();
  }, [nivelVisivel]);

  // "Ver no mapa" das listas e da tabela.
  const focar = useEffectEvent((pedido: PedidoFocoMapa) => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    setPainelBase(false);
    const { clientWidth, clientHeight } = mapa.getContainer();
    // O ponto fica abaixo do meio: o balão cabe inteiro acima dele.
    const deslocamento = Math.round(clientHeight * (clientWidth < 560 ? 0.14 : 0.2));
    if (pedido.alvo.tipo === "municipio") {
      const m = municipioPorIbge(pedido.alvo.ibge);
      if (!m) return;
      // Sem animação: o balão nasce já dentro da área visível e o foco vai para ele.
      mapa.jumpTo({ center: [m.lon, m.lat], zoom: Math.max(mapa.getZoom(), ZOOM_VER_MUNICIPIO) });
      mapa.panBy([0, -deslocamento], { animate: false });
      setZoom(mapa.getZoom());
      abrirBalao(pedido.alvo, [m.lon, m.lat], pedido.origem);
      return;
    }
    const env = indice[pedido.alvo.nivel].get(pedido.alvo.chave);
    if (!env) return;
    const camera = mapa.cameraForBounds(
      [
        [env[0], env[1]],
        [env[2], env[3]],
      ],
      { padding: paddingVista(clientWidth, clientHeight) },
    );
    if (!camera) return;
    // No automático, o enquadramento não pode passar do nível da própria área
    // (senão o mapa mudaria para o nível de baixo e o balão perderia o sentido).
    const teto = pedido.alvo.nivel === "cob" ? ZOOM_AREA_UEOP : ZOOM_AREA_MUNICIPIO;
    const zoomAlvo = escolhaNivel === "auto" ? Math.min(camera.zoom ?? teto, teto - 0.05) : camera.zoom;
    mapa.jumpTo({ center: camera.center, zoom: zoomAlvo });
    mapa.panBy([0, -deslocamento], { animate: false });
    setZoom(mapa.getZoom());
    abrirBalao(pedido.alvo, centro(env), pedido.origem);
  });

  useEffect(() => {
    if (pronto && pedidoFoco) focar(pedidoFoco);
  }, [pronto, pedidoFoco]);

  // Tela cheia nativa.
  useEffect(() => {
    const aoMudar = () => setTelaCheia(Boolean(raizRef.current) && document.fullscreenElement === raizRef.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  // Tela cheia "simulada" (sem Fullscreen API): trava a rolagem e sai com Esc.
  useEffect(() => {
    if (!expandido) return;
    const html = document.documentElement;
    const anterior = html.style.overflow;
    html.style.overflow = "hidden";
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setExpandido(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      html.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [expandido]);

  // ── Ações dos controles ──────────────────────────────────────────────────

  const animar = !reduzir;
  const aproximar = () => mapaRef.current?.zoomIn({ animate: animar });
  const afastar = () => mapaRef.current?.zoomOut({ animate: animar });

  const verMgInteiro = () => {
    const mapa = mapaRef.current;
    const container = canvasRef.current;
    if (!mapa || !container) return;
    mapa.fitBounds(LIMITES_VISTA_MG, {
      padding: paddingVista(container.clientWidth, container.clientHeight),
      animate: animar,
      duration: 600,
    });
  };

  const alternarTelaCheia = async () => {
    const raiz = raizRef.current;
    if (!raiz) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (expandido) {
      setExpandido(false);
      return;
    }
    if (document.fullscreenEnabled && typeof raiz.requestFullscreen === "function") {
      try {
        await raiz.requestFullscreen();
        return;
      } catch {
        // Recusado (iframe, política do navegador): usa o modo expandido.
      }
    }
    setExpandido(true);
  };

  const alternarPainelBase = () => {
    if (celular) popupRef.current?.remove();
    setPainelBase((aberto) => !aberto);
  };

  const fecharPainelBase = () => {
    setPainelBase(false);
    botaoBaseRef.current?.focus();
  };

  const escolherBase = (nova: BaseMapaId) => {
    setBase(nova);
    setFalhaBase(false);
    salvarBase(armazenamentoLocal(), nova);
  };

  // ── Derivados para a interface ───────────────────────────────────────────

  const emTelaCheia = telaCheia || expandido;
  const carregandoMalha = !malhas.municipios && !malhas.erro;
  const avisos = [
    malhas.erro ? `Malha municipal indisponível: ${malhas.erro}` : null,
    cobs.erro ? "Limites oficiais dos COBs indisponíveis — o mapa segue com os municípios." : null,
    falhaBase ? "Mapa base indisponível — limites e cores seguem no mapa." : null,
    aviso,
  ].filter((a): a is string => Boolean(a));

  return (
    <div
      ref={raizRef}
      className="mapa-sit risco-mapa"
      data-mapa-tema={tema}
      data-nivel-area={nivelVisivel}
      data-expandido={expandido}
      role="region"
      aria-label={rotulo}
    >
      <div className="risco-nivel">
        <p className="risco-nivel__atual" aria-live="polite">
          Exibindo: <strong>{ROTULOS_NIVEL_AREA[nivelVisivel]}</strong>
          <span className="risco-nivel__modo">
            {escolhaNivel === "auto" ? " · conforme o zoom" : " · nível fixado"}
          </span>
        </p>
        <fieldset className="risco-nivel__opcoes">
          <legend className="mapa-sr">Nível de agregação do mapa</legend>
          {ESCOLHAS_NIVEL.map((escolha) => (
            <label key={escolha} className="risco-nivel__op" data-ativo={escolha === escolhaNivel}>
              <input
                type="radio"
                name={nomeGrupoNivel}
                value={escolha}
                checked={escolha === escolhaNivel}
                onChange={() => onEscolherNivel(escolha)}
              />
              {ROTULOS_ESCOLHA_NIVEL[escolha]}
            </label>
          ))}
        </fieldset>
      </div>

      <div className={cn("mapa-sit__area", altura)}>
        <div className="mapa-sit__ferramentas" role="group" aria-label="Ferramentas do mapa">
          <div className="mapa-sit__grupo">
            <button
              type="button"
              className="mapa-tb"
              onClick={aproximar}
              disabled={!pronto || zoom >= ZOOM_MAXIMO - 0.01}
              aria-label="Aproximar"
              title="Aproximar"
            >
              <Plus aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mapa-tb"
              onClick={afastar}
              disabled={!pronto || zoom <= ZOOM_MINIMO + 0.01}
              aria-label="Afastar"
              title="Afastar"
            >
              <Minus aria-hidden="true" />
            </button>
          </div>
          <div className="mapa-sit__grupo">
            <button
              type="button"
              className="mapa-tb"
              onClick={verMgInteiro}
              disabled={!pronto}
              aria-label="Ver Minas Gerais inteiro"
              title="MG inteiro"
            >
              <House aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mapa-tb"
              onClick={() => void alternarTelaCheia()}
              aria-pressed={emTelaCheia}
              aria-label={emTelaCheia ? "Sair da tela cheia" : "Tela cheia"}
              title={emTelaCheia ? "Sair da tela cheia" : "Tela cheia"}
            >
              {emTelaCheia ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            </button>
            <button
              ref={botaoBaseRef}
              type="button"
              className="mapa-tb"
              onClick={alternarPainelBase}
              aria-expanded={painelBase}
              aria-label={falhaBase ? "Mapa base — indisponível" : "Mapa base"}
              title="Mapa base"
            >
              <Earth aria-hidden="true" />
              {falhaBase ? (
                <span className="mapa-tb__aviso" aria-hidden="true">
                  <span>!</span>
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {painelBase ? (
          <SeletorBase base={base} falhaBase={falhaBase} onEscolher={escolherBase} onFechar={fecharPainelBase} />
        ) : null}

        <div ref={canvasRef} className="mapa-sit__canvas" />

        {pronto && avisos.length && !painelBase ? (
          <p className="mapa-sit__dica risco-mapa__aviso">
            <TriangleAlert aria-hidden="true" />
            {avisos[avisos.length - 1]}
          </p>
        ) : null}

        {falha ? (
          <div className="mapa-sit__estado" role="alert">
            <TriangleAlert aria-hidden="true" size={28} />
            <p>
              <strong>Mapa indisponível.</strong> {falha}
            </p>
          </div>
        ) : !pronto || carregandoMalha ? (
          <div className="mapa-sit__estado" role="status">
            <span className="mapa-giro" aria-hidden="true" />
            <span className="mapa-carregando__texto">Carregando mapa</span>
          </div>
        ) : null}

        <p className="mapa-sr" aria-live="polite">
          {avisos.join(" ")}
        </p>
      </div>
    </div>
  );
}
