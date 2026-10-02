"use client";

import { useTheme } from "next-themes";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { CamadaMapaId } from "@/lib/dominio/tipos";
import {
  carregarCamada,
  ehContornoMg,
  ErroCamada,
  resolverTemaMapa,
  URL_CONTORNO_MG,
  type DadosCamada,
  type MetaCamada,
  type TemaMapa,
} from "@/lib/mapa";
import type { Feature, MultiPolygon, Polygon } from "geojson";

// ── Tema ─────────────────────────────────────────────────────────────────────

const ATRIBUTOS_TEMA = ["data-tema", "data-theme", "class", "style"];

function assinarTemaDocumento(aoMudar: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ATRIBUTOS_TEMA });
  return () => observador.disconnect();
}

/** Tema realmente aplicado no <html> (o que o CSS enxerga). */
function temaDoDocumento(): string | null {
  const raiz = document.documentElement;
  const atributo = raiz.getAttribute("data-tema") ?? raiz.getAttribute("data-theme");
  if (atributo) return atributo;
  if (raiz.classList.contains("dark")) return "dark";
  if (raiz.classList.contains("light")) return "light";
  return null;
}

const semAssinatura = () => () => {};

/** false no servidor e durante a hidratação; true depois (sem descompasso de HTML). */
function useHidratado(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );
}

/**
 * Tema do mapa: o atributo `data-tema` do <html> (posto pelo next-themes
 * antes da primeira pintura, padrão GeoRescue) ou a classe; na falta deles,
 * o `resolvedTheme`; por fim, escuro. Durante a hidratação vale o mesmo
 * valor do servidor (escuro), para o HTML não divergir.
 */
export function useTemaMapa(): TemaMapa {
  const { resolvedTheme } = useTheme();
  const hidratado = useHidratado();
  const doDocumento = useSyncExternalStore(assinarTemaDocumento, temaDoDocumento, () => null);
  return resolverTemaMapa(doDocumento, hidratado ? resolvedTheme : null);
}

// ── prefers-reduced-motion ───────────────────────────────────────────────────

const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function assinarMovimento(aoMudar: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const consulta = window.matchMedia(CONSULTA_MOVIMENTO);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

export function usePrefereMenosMovimento(): boolean {
  return useSyncExternalStore(
    assinarMovimento,
    () => (window.matchMedia ? window.matchMedia(CONSULTA_MOVIMENTO).matches : false),
    () => false,
  );
}

// ── Largura (celular x desktop) ──────────────────────────────────────────────

const CONSULTA_CELULAR = "(max-width: 767.98px)";

function assinarCelular(aoMudar: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const consulta = window.matchMedia(CONSULTA_CELULAR);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

export function useEhCelular(): boolean {
  return useSyncExternalStore(
    assinarCelular,
    () => (window.matchMedia ? window.matchMedia(CONSULTA_CELULAR).matches : false),
    () => false,
  );
}

// ── Contorno de MG ───────────────────────────────────────────────────────────

/** Carrega /geo/mg-outline.json. Falha silenciosa: o mapa segue sem máscara. */
export function useContornoMg(): Feature<Polygon | MultiPolygon> | null {
  const [contorno, setContorno] = useState<Feature<Polygon | MultiPolygon> | null>(null);
  useEffect(() => {
    const controle = new AbortController();
    fetch(URL_CONTORNO_MG, { signal: controle.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        if (ehContornoMg(json)) setContorno(json);
      })
      .catch(() => {
        // Sem contorno: sem máscara nem linha de divisa, o resto funciona.
      });
    return () => controle.abort();
  }, []);
  return contorno;
}

// ── Camadas (GET /api/arcgis/{camada}) ───────────────────────────────────────

export interface EstadoCamada {
  carregando: boolean;
  /** Mensagem da última falha (null se a última leitura deu certo). */
  erro: string | null;
  /** Última leitura válida (mantida mesmo se uma atualização falhar). */
  dados: DadosCamada | null;
}

export const ESTADO_CARREGANDO: EstadoCamada = { carregando: true, erro: null, dados: null };

export type AoReceberMeta = (camada: CamadaMapaId, meta: MetaCamada | null, erro?: string) => void;

function ehAbortamento(erro: unknown): boolean {
  return erro instanceof DOMException && erro.name === "AbortError";
}

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroCamada) return erro.message;
  return "Falha ao carregar a camada.";
}

type DefinirEstados = Dispatch<SetStateAction<Partial<Record<CamadaMapaId, EstadoCamada>>>>;

/** Uma busca: marca "carregando", guarda o resultado (ou o erro) e avisa o carimbo. */
async function buscarCamada(
  camada: CamadaMapaId,
  signal: AbortSignal,
  setEstados: DefinirEstados,
  onMetaRef: RefObject<AoReceberMeta | undefined>,
): Promise<void> {
  // Nunca altera estado de forma síncrona dentro do efeito que chamou.
  await Promise.resolve();
  if (signal.aborted) return;
  setEstados((atual) => ({
    ...atual,
    [camada]: { ...(atual[camada] ?? ESTADO_CARREGANDO), carregando: true },
  }));
  try {
    const dados = await carregarCamada(camada, { signal });
    if (signal.aborted) return;
    setEstados((atual) => ({ ...atual, [camada]: { carregando: false, erro: null, dados } }));
    onMetaRef.current?.(camada, dados.meta);
  } catch (erro) {
    if (signal.aborted || ehAbortamento(erro)) return;
    const mensagem = mensagemDoErro(erro);
    setEstados((atual) => ({
      ...atual,
      [camada]: { carregando: false, erro: mensagem, dados: atual[camada]?.dados ?? null },
    }));
    onMetaRef.current?.(camada, null, mensagem);
  }
}

/**
 * Carrega as camadas pedidas em paralelo, atualiza as de pontos a cada
 * `intervaloMs` (só com a aba visível) e permite recarregar uma camada.
 * Uma camada que falha não afeta as outras.
 */
export function useCamadasMapa(
  camadas: readonly CamadaMapaId[],
  intervaloMs: number,
  onMeta?: AoReceberMeta,
): {
  estados: Partial<Record<CamadaMapaId, EstadoCamada>>;
  recarregar: (camada: CamadaMapaId) => void;
} {
  const chave = camadas.join(",");
  const [estados, setEstados] = useState<Partial<Record<CamadaMapaId, EstadoCamada>>>({});
  const onMetaRef = useRef<AoReceberMeta | undefined>(onMeta);
  const recargasRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);

  // Carga inicial + atualização periódica.
  useEffect(() => {
    const lista = chave ? (chave.split(",") as CamadaMapaId[]) : [];
    const controle = new AbortController();
    for (const camada of lista) void buscarCamada(camada, controle.signal, setEstados, onMetaRef);

    let temporizador: ReturnType<typeof setInterval> | undefined;
    if (intervaloMs > 0) {
      temporizador = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        // Os limites dos COBs quase não mudam: só os pontos são atualizados.
        for (const camada of lista) {
          if (camada !== "cobs") void buscarCamada(camada, controle.signal, setEstados, onMetaRef);
        }
      }, intervaloMs);
    }
    return () => {
      controle.abort();
      if (temporizador) clearInterval(temporizador);
    };
  }, [chave, intervaloMs]);

  // Recargas manuais em andamento são canceladas ao desmontar.
  useEffect(() => {
    const recargas = recargasRef.current;
    return () => {
      for (const controle of recargas) controle.abort();
      recargas.clear();
    };
  }, []);

  /** Botão "Tentar de novo" (manipulador de evento, fora de efeitos). */
  const recarregar = (camada: CamadaMapaId) => {
    const controle = new AbortController();
    recargasRef.current.add(controle);
    void buscarCamada(camada, controle.signal, setEstados, onMetaRef).finally(() =>
      recargasRef.current.delete(controle),
    );
  };

  return { estados, recarregar };
}
