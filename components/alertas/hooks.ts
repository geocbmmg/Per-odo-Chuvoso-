"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { RespostaFila } from "@/lib/alertas/servico";

import { carregarFila, ehSemSessao, ErroApiAlertas, INTERVALO_FILA_MS } from "./api";

// ── Relógio da tela ─────────────────────────────────────────────────────────

const TIQUE_MS = 30_000;
let agoraMs = 0;
const ouvintes = new Set<() => void>();
let temporizador: ReturnType<typeof setInterval> | null = null;

function tique() {
  agoraMs = Date.now();
  ouvintes.forEach((avisar) => avisar());
}

function aoVoltar() {
  if (document.visibilityState === "visible") tique();
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  if (!temporizador) {
    agoraMs = Date.now();
    temporizador = setInterval(tique, TIQUE_MS);
    document.addEventListener("visibilitychange", aoVoltar);
  }
  return () => {
    ouvintes.delete(avisar);
    if (ouvintes.size === 0 && temporizador) {
      clearInterval(temporizador);
      temporizador = null;
      document.removeEventListener("visibilitychange", aoVoltar);
    }
  };
}

/**
 * Instante atual (ms) que anda a cada 30 s e ao voltar para a aba: os prazos
 * "vence em…" e os vencidos se atualizam sozinhos. 0 no servidor e na
 * hidratação (nada dependente de hora é desenhado antes de montar).
 */
export function useAgoraMs(): number {
  return useSyncExternalStore(assinar, () => agoraMs, () => 0);
}

/** Força o relógio a andar agora (depois de gravar algo, por exemplo). */
export function tiqueAgora(): void {
  tique();
}

// ── Fila com releitura periódica ────────────────────────────────────────────

export interface EstadoFila {
  resposta: RespostaFila | null;
  /** Erro da última leitura (a fila anterior continua na tela). */
  erro: ErroApiAlertas | null;
  /** 401: a sessão acabou. */
  semSessao: boolean;
  carregando: boolean;
  /** ISO da última leitura válida (carimbo "Atualizado às HH:MM"). */
  recebidoEm: string | null;
  recarregar: () => Promise<void>;
}

function comoErro(erro: unknown): ErroApiAlertas {
  return erro instanceof ErroApiAlertas ? erro : new ErroApiAlertas(0, "desconhecido", "Falha ao carregar a fila de alertas.");
}

/**
 * Lê a fila ao montar e a cada minuto com a aba visível (ao voltar para a
 * aba, na hora se o intervalo passou). Uma falha mantém a última fila válida
 * na tela e guarda o erro; 401 marca `semSessao`.
 */
export function useFilaAlertas(): EstadoFila {
  const [estado, setEstado] = useState<Omit<EstadoFila, "recarregar">>({
    resposta: null,
    erro: null,
    semSessao: false,
    carregando: true,
    recebidoEm: null,
  });
  const ultimaRef = useRef(0);
  const controleRef = useRef<AbortController | null>(null);

  const buscar = useCallback(async () => {
    controleRef.current?.abort();
    const controle = new AbortController();
    controleRef.current = controle;
    // Nunca altera estado de forma síncrona dentro do efeito que chamou.
    await Promise.resolve();
    if (controle.signal.aborted) return;
    ultimaRef.current = Date.now();
    setEstado((atual) => ({ ...atual, carregando: true }));
    try {
      const resposta = await carregarFila({ signal: controle.signal });
      if (controle.signal.aborted) return;
      setEstado({ resposta, erro: null, semSessao: false, carregando: false, recebidoEm: new Date().toISOString() });
    } catch (erro) {
      if (controle.signal.aborted || (erro instanceof DOMException && erro.name === "AbortError")) return;
      setEstado((atual) => ({ ...atual, erro: comoErro(erro), semSessao: ehSemSessao(erro), carregando: false }));
    }
  }, []);

  useEffect(() => {
    void buscar();
    const vencido = () => Date.now() - ultimaRef.current >= INTERVALO_FILA_MS - 1_000;
    const atualizar = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (vencido()) void buscar();
    };
    const t = window.setInterval(atualizar, INTERVALO_FILA_MS);
    document.addEventListener("visibilitychange", atualizar);
    window.addEventListener("online", atualizar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", atualizar);
      window.removeEventListener("online", atualizar);
      controleRef.current?.abort();
    };
  }, [buscar]);

  return { ...estado, recarregar: buscar };
}
