"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./mapa.css";

import type { Point } from "geojson";
import { Earth, House, Layers, Maximize, Minimize, Minus, Plus, TriangleAlert } from "lucide-react";
import type {
  GeoJSONSource,
  LngLatLike,
  Map as MapaMapLibre,
  MapGeoJSONFeature,
  MapMouseEvent,
  PointLike,
  Popup,
} from "maplibre-gl";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { CAMADAS_MAPA, type CamadaMapaId, type Periodo } from "@/lib/dominio/tipos";
import {
  CAMADAS_CLICAVEIS_PONTOS,
  camadaLogicaDoEstilo,
  CENTRO_MG,
  chamadasComAcaoRrd,
  conteudoCob,
  conteudoDoPonto,
  contarPorCob,
  filtrarPorPeriodo,
  FONTES_CAMADAS,
  ID_CAMADAS,
  INTERVALO_ATUALIZACAO_PADRAO_MS,
  LIMITES_NAVEGACAO,
  LIMITES_VISTA_MG,
  LOCALE_MAPLIBRE_PT_BR,
  montarEstiloMapa,
  paddingVista,
  PREFIXO_BASE,
  prepararWorkerMapLibre,
  ROTULO_REGIAO_MAPA,
  ROTULOS_CAMADAS,
  armazenamentoLocal,
  lerBaseSalva,
  salvarBase,
  TOLERANCIA_CLIQUE_PX,
  ZOOM_INICIAL,
  ZOOM_MAXIMO,
  ZOOM_MAXIMO_ROTULOS_COB,
  ZOOM_MINIMO,
  ZOOM_MINIMO_ROTULOS_COB_CELULAR,
  type BaseMapaId,
  type ColecaoMapa,
  type ConteudoPopup,
  type DadosCamada,
  type MetaCamada,
} from "@/lib/mapa";
import { ALTURA_PADRAO_MAPA } from "./altura";
import {
  useCamadasMapa,
  useContornoMg,
  useEhCelular,
  usePrefereMenosMovimento,
  useTemaMapa,
} from "./hooks";
import { infoDaCamada, type InfoCamada } from "./info";
import { LegendaMapa } from "./legenda-mapa";
import { ContagensClusters, RotulosCob } from "./marcadores";
import { PainelCamadas } from "./painel-camadas";
import { criarConteudoPopup } from "./popup-dom";
import { SeletorBase } from "./seletor-base";

type MapLibre = typeof import("maplibre-gl");

export interface PropsMapaSituacao {
  /** Camadas disponíveis no painel (padrão: as quatro). */
  camadas?: readonly CamadaMapaId[];
  /** Camadas visíveis ao abrir (padrão: todas as disponíveis). */
  camadasIniciais?: readonly CamadaMapaId[];
  /**
   * Classe(s) de altura da área do MAPA (padrão: ALTURA_PADRAO_MAPA, ~60% da
   * tela no celular). A legenda fica abaixo e não reduz o mapa.
   */
  altura?: string;
  className?: string;
  /** Período chuvoso aplicado às camadas de pontos (mesma regra dos indicadores). */
  periodo?: Pick<Periodo, "inicio" | "fim" | "rotulo"> | null;
  /** Atualização automática das camadas de pontos; 0 desliga. Padrão: 5 min. */
  intervaloAtualizacaoMs?: number;
  /** Mostra a legenda sob o mapa (padrão: true). */
  mostrarLegenda?: boolean;
  /** Rótulo acessível da região do mapa. */
  rotulo?: string;
  /**
   * Chamado a cada leitura de camada, para a página mostrar o carimbo
   * "atualizado às". Em falha: meta = null e a mensagem em `erro`.
   * (Função: só pode ser passada por um Client Component.)
   */
  onMeta?: (camada: CamadaMapaId, meta: MetaCamada | null, erro?: string) => void;
}

type Painel = "camadas" | "base" | null;

const FALHA_CARREGAR = "Não foi possível carregar o mapa. Verifique a conexão e recarregue a página.";
const FALHA_WEBGL =
  "Este navegador não conseguiu desenhar o mapa (WebGL indisponível ou desativado). As contagens continuam na legenda.";

// ── Ações sobre o mapa (fora do render; recebem tudo por parâmetro) ─────────

function caixaEmVolta(ponto: { x: number; y: number }, tolerancia: number): [PointLike, PointLike] {
  return [
    [ponto.x - tolerancia, ponto.y - tolerancia],
    [ponto.x + tolerancia, ponto.y + tolerancia],
  ];
}

function camadasExistentes(mapa: MapaMapLibre, ids: readonly string[]): string[] {
  return ids.filter((id) => Boolean(mapa.getLayer(id)));
}

function selecionarCob(mapa: MapaMapLibre, selecaoRef: RefObject<string | null>, cob: string | null): void {
  const fonte = FONTES_CAMADAS.cobs;
  if (!mapa.getSource(fonte)) {
    selecaoRef.current = null;
    return;
  }
  if (selecaoRef.current) mapa.setFeatureState({ source: fonte, id: selecaoRef.current }, { selecionado: false });
  selecaoRef.current = cob;
  if (cob) mapa.setFeatureState({ source: fonte, id: cob }, { selecionado: true });
}

/** Margens para o balão não nascer sob a barra de ferramentas (à esquerda). */
const PADDING_BALAO = { top: 10, right: 10, bottom: 10, left: 60 };

function abrirPopup(
  lib: MapLibre,
  mapa: MapaMapLibre,
  popupRef: RefObject<Popup | null>,
  onde: LngLatLike,
  conteudo: HTMLElement,
  corBorda: string,
  aoFechar?: () => void,
): void {
  popupRef.current?.remove();
  const popup = new lib.Popup({
    className: "mapa-popup",
    maxWidth: "320px",
    offset: 14,
    closeButton: true,
    closeOnClick: false,
    focusAfterOpen: true,
    padding: PADDING_BALAO,
  })
    .setLngLat(onde)
    .setDOMContent(conteudo)
    .addTo(mapa);
  const elemento = popup.getElement();
  elemento.style.setProperty("--pop-borda", corBorda);
  elemento.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      popup.remove();
      mapa.getCanvas().focus();
    }
  });
  popup.on("close", () => {
    if (popupRef.current === popup) popupRef.current = null;
    aoFechar?.();
  });
  popupRef.current = popup;
}

/**
 * Em mapas estreitos (celular), centraliza o ponto um pouco abaixo do meio
 * antes de abrir o balão, para ele caber inteiro acima do ponto.
 */
function enquadrarParaBalao(mapa: MapaMapLibre, onde: LngLatLike, reduzir: boolean): void {
  const { clientWidth, clientHeight } = mapa.getContainer();
  if (clientWidth >= 560) return;
  mapa.easeTo({ center: onde, offset: [0, Math.round(clientHeight * 0.14)], duration: 280, animate: !reduzir });
}

function coordenadasDoPonto(feicao: MapGeoJSONFeature): [number, number] | null {
  const geometria = feicao.geometry as Point | undefined;
  if (geometria?.type !== "Point") return null;
  return [geometria.coordinates[0], geometria.coordinates[1]];
}

/** Pontos sob o clique, sem repetição (o "alvo" da ocorrência tem duas camadas). */
function registrosUnicos(feicoes: MapGeoJSONFeature[]): MapGeoJSONFeature[] {
  const vistos = new Set<string>();
  const unicos: MapGeoJSONFeature[] = [];
  for (const f of feicoes) {
    const props = f.properties ?? {};
    const chave = `${f.source}:${String(props.id ?? f.id ?? JSON.stringify(props))}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(f);
  }
  return unicos;
}

async function expandirCluster(mapa: MapaMapLibre, feicao: MapGeoJSONFeature, reduzir: boolean): Promise<void> {
  const fonte = mapa.getSource(feicao.source) as GeoJSONSource | undefined;
  const centro = coordenadasDoPonto(feicao);
  const id = Number(feicao.properties?.cluster_id);
  if (!fonte || !centro || !Number.isFinite(id)) return;
  try {
    const zoom = Math.min(await fonte.getClusterExpansionZoom(id), ZOOM_MAXIMO);
    if (reduzir) mapa.jumpTo({ center: centro, zoom });
    else mapa.easeTo({ center: centro, zoom, duration: 450 });
  } catch {
    // Os dados mudaram entre o clique e a resposta: ignora.
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function MapaSituacao({
  camadas = CAMADAS_MAPA,
  camadasIniciais,
  altura = ALTURA_PADRAO_MAPA,
  className,
  periodo = null,
  intervaloAtualizacaoMs = INTERVALO_ATUALIZACAO_PADRAO_MS,
  mostrarLegenda = true,
  rotulo = ROTULO_REGIAO_MAPA,
  onMeta,
}: PropsMapaSituacao) {
  const raizRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaMapLibre | null>(null);
  const libRef = useRef<MapLibre | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const rotulosRef = useRef<RotulosCob | null>(null);
  const clustersRef = useRef<ContagensClusters | null>(null);
  const cobSelecionadoRef = useRef<string | null>(null);
  const botaoCamadasRef = useRef<HTMLButtonElement>(null);
  const botaoBaseRef = useRef<HTMLButtonElement>(null);

  const tema = useTemaMapa();
  const reduzir = usePrefereMenosMovimento();
  const celular = useEhCelular();
  const contornoMg = useContornoMg();

  const chaveCamadas = camadas.join(",");
  const disponiveis = useMemo(
    () => (chaveCamadas ? (chaveCamadas.split(",") as CamadaMapaId[]) : []),
    [chaveCamadas],
  );
  const { estados, recarregar } = useCamadasMapa(disponiveis, intervaloAtualizacaoMs, onMeta);

  const [pronto, setPronto] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [zoom, setZoom] = useState(ZOOM_INICIAL);
  const [telaCheia, setTelaCheia] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [painel, setPainel] = useState<Painel>(null);
  const [base, setBase] = useState<BaseMapaId>(() => lerBaseSalva(armazenamentoLocal()));
  const [falhaBase, setFalhaBase] = useState(false);
  const [visiveis, setVisiveis] = useState<ReadonlySet<CamadaMapaId>>(
    () => new Set(camadasIniciais ?? camadas),
  );

  // Dados no período (o que vai para o mapa e para as contagens).
  const inicio = periodo?.inicio ?? null;
  const fim = periodo?.fim ?? null;
  const dadosNoPeriodo = useMemo(() => {
    const resultado: Partial<Record<CamadaMapaId, DadosCamada>> = {};
    for (const camada of disponiveis) {
      const dados = estados[camada]?.dados;
      if (dados) resultado[camada] = filtrarPorPeriodo(camada, dados, { inicio, fim });
    }
    return resultado;
  }, [disponiveis, estados, inicio, fim]);

  const colecoes = useMemo(() => {
    const resultado: Partial<Record<CamadaMapaId, ColecaoMapa>> = {};
    for (const [camada, dados] of Object.entries(dadosNoPeriodo) as [CamadaMapaId, DadosCamada][]) {
      resultado[camada] = dados.colecao;
    }
    return resultado;
  }, [dadosNoPeriodo]);

  const info = useMemo(() => {
    const resultado: Partial<Record<CamadaMapaId, InfoCamada>> = {};
    for (const camada of disponiveis) {
      resultado[camada] = infoDaCamada(estados[camada], dadosNoPeriodo[camada] ?? null);
    }
    return resultado;
  }, [disponiveis, estados, dadosNoPeriodo]);

  // Pendência de alerta: ação RRD de QUALQUER data com o mesmo nº de chamada.
  const acoesTodas = estados["acoes-rrd"]?.dados ?? null;
  const chamadasComAcao = useMemo(
    () => (acoesTodas ? chamadasComAcaoRrd(acoesTodas.propriedades) : null),
    [acoesTodas],
  );

  const estilo = useMemo(
    () =>
      montarEstiloMapa({
        base,
        tema,
        visiveis,
        dados: colecoes,
        contornoMg,
        reduzirMovimento: reduzir,
      }),
    [base, tema, visiveis, colecoes, contornoMg, reduzir],
  );

  // ── Eventos do mapa (sempre leem o estado mais recente) ──────────────────

  const obterEstiloInicial = useEffectEvent(() => estilo);
  const obterReduzir = useEffectEvent(() => reduzir);

  const aoClicar = useEffectEvent((evento: MapMouseEvent) => {
    const mapa = mapaRef.current;
    const lib = libRef.current;
    if (!mapa || !lib) return;
    // No celular o painel é uma folha sobre o mapa: tocar no mapa a fecha.
    if (celular) setPainel(null);

    const idsPontos = camadasExistentes(mapa, CAMADAS_CLICAVEIS_PONTOS);
    const sob = idsPontos.length
      ? mapa.queryRenderedFeatures(caixaEmVolta(evento.point, TOLERANCIA_CLIQUE_PX), { layers: idsPontos })
      : [];

    // O que está desenhado por cima decide: agrupamento → aproxima.
    if (sob[0]?.properties?.cluster) {
      popupRef.current?.remove();
      void expandirCluster(mapa, sob[0], reduzir);
      return;
    }

    const pontos = registrosUnicos(sob.filter((f) => !f.properties?.cluster));
    if (pontos.length) {
      const conteudos: ConteudoPopup[] = [];
      for (const f of pontos) {
        const camada = camadaLogicaDoEstilo(f.layer.id);
        if (!camada || camada === "cobs") continue;
        conteudos.push(conteudoDoPonto(camada, f.properties ?? {}, { chamadasComAcao }));
      }
      if (conteudos.length) {
        const onde = coordenadasDoPonto(pontos[0]) ?? evento.lngLat;
        selecionarCob(mapa, cobSelecionadoRef, null);
        enquadrarParaBalao(mapa, onde, reduzir);
        abrirPopup(lib, mapa, popupRef, onde, criarConteudoPopup(conteudos), conteudos[0].cor);
        return;
      }
    }

    const idsCob = camadasExistentes(mapa, [ID_CAMADAS.cobsPreenchimento]);
    const [areaCob] = idsCob.length ? mapa.queryRenderedFeatures(evento.point, { layers: idsCob }) : [];
    const cob = typeof areaCob?.properties?.cob === "string" ? areaCob.properties.cob : null;
    if (cob) {
      const contar = (camada: CamadaMapaId) => {
        const dados = dadosNoPeriodo[camada];
        if (!dados) return null;
        // Só os registros com localização (os que aparecem no mapa).
        return contarPorCob(dados.colecao.features.map((f) => f.properties ?? {})).get(cob) ?? 0;
      };
      const conteudo = conteudoCob(
        cob,
        tema,
        { alertas: contar("alertas"), acoesRrd: contar("acoes-rrd"), ocorrencias: contar("ocorrencias-complexas") },
        periodo?.rotulo,
      );
      selecionarCob(mapa, cobSelecionadoRef, cob);
      enquadrarParaBalao(mapa, evento.lngLat, reduzir);
      abrirPopup(lib, mapa, popupRef, evento.lngLat, criarConteudoPopup([conteudo]), conteudo.cor, () => {
        if (cobSelecionadoRef.current === cob && mapaRef.current) {
          selecionarCob(mapaRef.current, cobSelecionadoRef, null);
        }
      });
      return;
    }

    popupRef.current?.remove();
  });

  const aoMover = useEffectEvent((evento: MapMouseEvent) => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const ids = camadasExistentes(mapa, CAMADAS_CLICAVEIS_PONTOS);
    const sobre =
      ids.length > 0 &&
      mapa.queryRenderedFeatures(caixaEmVolta(evento.point, TOLERANCIA_CLIQUE_PX), { layers: ids }).length > 0;
    mapa.getCanvas().style.cursor = sobre ? "pointer" : "";
  });

  const aoRenderizar = useEffectEvent(() => {
    const mapa = mapaRef.current;
    const lib = libRef.current;
    if (!mapa || !lib) return;
    if (!clustersRef.current) clustersRef.current = new ContagensClusters(lib, mapa);
    clustersRef.current.atualizar(visiveis);
  });

  const aoErro = useEffectEvent((evento: { error?: { message?: string }; sourceId?: string }) => {
    if (evento.sourceId?.startsWith(PREFIXO_BASE)) {
      setFalhaBase(true);
      return;
    }
    // Sem o worker nenhuma camada GeoJSON é desenhada: avisa em vez de ficar em branco.
    if (/worker/i.test(evento.error?.message ?? "")) {
      setFalha(FALHA_CARREGAR);
      return;
    }
    // Erros de dados das camadas já aparecem no painel; aqui só o que sobrar.
    console.warn("[mapa]", evento.error?.message ?? "erro no MapLibre");
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

      const { clientWidth, clientHeight } = container;
      m.fitBounds(LIMITES_VISTA_MG, { padding: paddingVista(clientWidth, clientHeight), animate: false });

      m.once("styledata", () => {
        if (!cancelado) setPronto(true);
      });
      m.on("zoomend", () => setZoom(m.getZoom()));
      m.on("click", (e) => aoClicar(e));
      m.on("mousemove", (e) => aoMover(e));
      m.on("mouseout", () => {
        m.getCanvas().style.cursor = "";
      });
      m.on("render", () => aoRenderizar());
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
      rotulosRef.current?.remover();
      rotulosRef.current = null;
      clustersRef.current?.remover();
      clustersRef.current = null;
      cobSelecionadoRef.current = null;
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

  // Rótulos dos COBs (marcadores HTML no ponto interno de cada área).
  const colecaoCobs = colecoes.cobs ?? null;
  useEffect(() => {
    const mapa = mapaRef.current;
    const lib = libRef.current;
    if (!pronto || !mapa || !lib) return;
    if (!rotulosRef.current) rotulosRef.current = new RotulosCob(lib, mapa);
    rotulosRef.current.definir(colecaoCobs);
  }, [pronto, colecaoCobs]);

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

  /** Fecha o painel e devolve o foco ao botão que o abriu. */
  const fecharPainel = () => {
    const anterior = painel;
    setPainel(null);
    (anterior === "base" ? botaoBaseRef : botaoCamadasRef).current?.focus();
  };

  const alternarPainel = (qual: Exclude<Painel, null>) => {
    // No celular, balão e painel juntos cobririam o mapa inteiro.
    if (celular) popupRef.current?.remove();
    setPainel((p) => (p === qual ? null : qual));
  };

  const alternarCamada = (camada: CamadaMapaId) => {
    popupRef.current?.remove();
    setVisiveis((atual) => {
      const nova = new Set(atual);
      if (nova.has(camada)) nova.delete(camada);
      else nova.add(camada);
      return nova;
    });
  };

  const escolherBase = (nova: BaseMapaId) => {
    setBase(nova);
    setFalhaBase(false);
    salvarBase(armazenamentoLocal(), nova);
  };

  // ── Derivados para a interface ───────────────────────────────────────────

  const camadasComFalha = disponiveis.filter((c) => info[c]?.estado === "erro");
  const emTelaCheia = telaCheia || expandido;
  const rotulosCobVisiveis =
    visiveis.has("cobs") &&
    zoom <= ZOOM_MAXIMO_ROTULOS_COB &&
    (!celular || zoom >= ZOOM_MINIMO_ROTULOS_COB_CELULAR);
  const anuncio = [
    ...camadasComFalha.map((c) => `${ROTULOS_CAMADAS[c]}: ${info[c]?.erro ?? "falha ao carregar"}`),
    falhaBase ? "Mapa base indisponível." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={raizRef}
      className={cn("mapa-sit", className)}
      data-mapa-tema={tema}
      data-rotulos-cob={rotulosCobVisiveis ? "on" : "off"}
      data-expandido={expandido}
      role="region"
      aria-label={rotulo}
    >
      <div className={cn("mapa-sit__area", altura)}>
        {/* Ferramentas antes do canvas no DOM: chegam primeiro pelo Tab. */}
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
          </div>
          <div className="mapa-sit__grupo">
            <button
              ref={botaoCamadasRef}
              type="button"
              className="mapa-tb"
              onClick={() => alternarPainel("camadas")}
              aria-expanded={painel === "camadas"}
              aria-label={
                camadasComFalha.length
                  ? `Camadas — ${camadasComFalha.length} com falha`
                  : "Camadas"
              }
              title="Camadas"
            >
              <Layers aria-hidden="true" />
              {camadasComFalha.length ? (
                <span className="mapa-tb__aviso" aria-hidden="true">
                  <span>!</span>
                </span>
              ) : null}
            </button>
            <button
              ref={botaoBaseRef}
              type="button"
              className="mapa-tb"
              onClick={() => alternarPainel("base")}
              aria-expanded={painel === "base"}
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

        {painel === "camadas" ? (
          <PainelCamadas
            camadas={disponiveis}
            visiveis={visiveis}
            info={info}
            rotuloPeriodo={periodo?.rotulo}
            onAlternar={alternarCamada}
            onTentarDeNovo={recarregar}
            onFechar={fecharPainel}
          />
        ) : null}
        {painel === "base" ? (
          <SeletorBase base={base} falhaBase={falhaBase} onEscolher={escolherBase} onFechar={fecharPainel} />
        ) : null}

        <div ref={canvasRef} className="mapa-sit__canvas" />

        {falhaBase && painel !== "base" && pronto ? (
          <p className="mapa-sit__dica">
            <TriangleAlert aria-hidden="true" />
            Mapa base indisponível — limites e registros seguem no mapa.
          </p>
        ) : null}

        {falha ? (
          <div className="mapa-sit__estado" role="alert">
            <TriangleAlert aria-hidden="true" size={28} />
            <p>
              <strong>Mapa indisponível.</strong> {falha}
            </p>
          </div>
        ) : !pronto ? (
          <div className="mapa-sit__estado" role="status">
            <span className="mapa-giro" aria-hidden="true" />
            <span className="mapa-carregando__texto">Carregando mapa</span>
          </div>
        ) : null}

        <p className="mapa-sr" aria-live="polite">
          {anuncio}
        </p>
      </div>

      {mostrarLegenda ? (
        <LegendaMapa
          variante="embutida"
          camadas={disponiveis}
          visiveis={visiveis}
          info={info}
          rotuloPeriodo={periodo?.rotulo}
          tema={tema}
        />
      ) : null}
    </div>
  );
}

