"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { carregarCamada, type DadosCamada } from "@/lib/mapa";
import {
  carregarJsonMapa,
  ErroDadosMapa,
  interpretarMalha,
  URL_MALHA_MUNICIPIOS,
  URL_MALHA_UEOPS,
} from "@/lib/mapa/dados-risco";
import type { ColecaoPoligonos, LeituraCliente } from "@/lib/mapa/risco";

function ehAbortamento(erro: unknown): boolean {
  return erro instanceof DOMException && erro.name === "AbortError";
}

function mensagem(erro: unknown, padrao: string): string {
  return erro instanceof ErroDadosMapa || erro instanceof Error ? erro.message || padrao : padrao;
}

// ── Rotas da API com atualização periódica ──────────────────────────────────

export interface LeituraPeriodica<T> extends LeituraCliente<T> {
  /** Instante (ms) da última resposta válida. */
  recebidoEm: number | null;
  recarregar: () => void;
}

/**
 * Lê uma rota da API ao montar e a cada `intervaloMs`, SÓ com a aba visível
 * (ao voltar para a aba, atualiza na hora se o intervalo já passou). Uma
 * falha mantém o último dado válido na tela e guarda a mensagem em `erro`.
 * `interpretar` precisa ser estável (função de módulo).
 */
export function useLeituraPeriodica<T>(
  url: string,
  interpretar: (corpo: unknown) => T,
  intervaloMs: number,
): LeituraPeriodica<T> {
  const [estado, setEstado] = useState<LeituraCliente<T> & { recebidoEm: number | null }>({
    dados: null,
    erro: null,
    carregando: true,
    recebidoEm: null,
  });
  const ultimaRef = useRef(0);
  const recargasRef = useRef<Set<AbortController>>(new Set());

  const buscar = useCallback(
    async (signal: AbortSignal) => {
      // Nunca altera estado de forma síncrona dentro do efeito que chamou.
      await Promise.resolve();
      if (signal.aborted) return;
      ultimaRef.current = Date.now();
      setEstado((atual) => ({ ...atual, carregando: true }));
      try {
        const dados = await carregarJsonMapa(url, interpretar, { signal });
        if (signal.aborted) return;
        setEstado({ dados, erro: null, carregando: false, recebidoEm: Date.now() });
      } catch (erro) {
        if (signal.aborted || ehAbortamento(erro)) return;
        setEstado((atual) => ({ ...atual, erro: mensagem(erro, "Falha ao carregar os dados."), carregando: false }));
      }
    },
    [url, interpretar],
  );

  useEffect(() => {
    const controle = new AbortController();
    void buscar(controle.signal);
    if (!(intervaloMs > 0)) return () => controle.abort();

    const vencido = () => Date.now() - ultimaRef.current >= intervaloMs - 1_000;
    const atualizar = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (vencido()) void buscar(controle.signal);
    };
    const temporizador = window.setInterval(atualizar, intervaloMs);
    document.addEventListener("visibilitychange", atualizar);
    window.addEventListener("online", atualizar);
    return () => {
      controle.abort();
      window.clearInterval(temporizador);
      document.removeEventListener("visibilitychange", atualizar);
      window.removeEventListener("online", atualizar);
    };
  }, [buscar, intervaloMs]);

  useEffect(() => {
    const recargas = recargasRef.current;
    return () => {
      for (const controle of recargas) controle.abort();
      recargas.clear();
    };
  }, []);

  /** Botão "Tentar de novo" (manipulador de evento). */
  const recarregar = () => {
    const controle = new AbortController();
    recargasRef.current.add(controle);
    void buscar(controle.signal).finally(() => recargasRef.current.delete(controle));
  };

  return { ...estado, recarregar };
}

// ── Malhas estáticas (carregadas uma vez por página) ────────────────────────

const cacheMalhas = new Map<string, Promise<ColecaoPoligonos>>();

/** Uma promessa por arquivo, compartilhada entre montagens; esquecida se falhar. */
function malha(url: string, propriedade: string): Promise<ColecaoPoligonos> {
  let promessa = cacheMalhas.get(url);
  if (!promessa) {
    promessa = carregarJsonMapa(url, (corpo) => interpretarMalha(corpo, propriedade), { cache: "force-cache" });
    promessa.catch(() => cacheMalhas.delete(url));
    cacheMalhas.set(url, promessa);
  }
  return promessa;
}

export interface MalhasRisco {
  municipios: ColecaoPoligonos | null;
  ueops: ColecaoPoligonos | null;
  erro: string | null;
}

/** Malha dos 853 municípios (~440 KB) e áreas aproximadas das UEOp. */
export function useMalhasRisco(): MalhasRisco {
  const [estado, setEstado] = useState<MalhasRisco>({ municipios: null, ueops: null, erro: null });
  useEffect(() => {
    let cancelado = false;
    malha(URL_MALHA_MUNICIPIOS, "ibge")
      .then((municipios) => !cancelado && setEstado((e) => ({ ...e, municipios })))
      .catch(
        (erro) => !cancelado && setEstado((e) => ({ ...e, erro: mensagem(erro, "Malha municipal indisponível.") })),
      );
    malha(URL_MALHA_UEOPS, "chave")
      .then((ueops) => !cancelado && setEstado((e) => ({ ...e, ueops })))
      .catch(() => {
        // Sem as UEOp o mapa segue com COB e municípios; o contorno da UEOp some.
      });
    return () => {
      cancelado = true;
    };
  }, []);
  return estado;
}

// ── Limites oficiais dos COBs (GET /api/arcgis/cobs) ────────────────────────

export interface CobsOficiais {
  colecao: ColecaoPoligonos | null;
  meta: DadosCamada["meta"];
  erro: string | null;
}

/** Limites oficiais dos COBs, lidos uma vez (mudam raramente). */
export function useCobsOficiais(): CobsOficiais {
  const [estado, setEstado] = useState<CobsOficiais>({ colecao: null, meta: null, erro: null });
  useEffect(() => {
    const controle = new AbortController();
    carregarCamada("cobs", { signal: controle.signal })
      .then((dados) => setEstado({ colecao: interpretarMalha(dados.colecao, "cob"), meta: dados.meta, erro: null }))
      .catch((erro) => {
        if (controle.signal.aborted || ehAbortamento(erro)) return;
        setEstado({ colecao: null, meta: null, erro: mensagem(erro, "Limites dos COBs indisponíveis.") });
      });
    return () => controle.abort();
  }, []);
  return estado;
}
