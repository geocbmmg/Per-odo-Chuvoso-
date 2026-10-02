"use client";

import { useSyncExternalStore } from "react";

import { formatarIdade, idadeEmSegundos } from "@/lib/datas";
import { cn } from "@/lib/utils";

const INTERVALO_MS = 30_000;

/**
 * Relógio compartilhado por todos os carimbos da tela: um único setInterval de 30 s,
 * ligado só enquanto houver alguém ouvindo. Também atualiza ao voltar para a aba.
 */
let agoraMs = 0;
const ouvintes = new Set<() => void>();
let temporizador: ReturnType<typeof setInterval> | null = null;

function tique() {
  agoraMs = Date.now();
  ouvintes.forEach((avisar) => avisar());
}

function aoVoltarParaAba() {
  if (document.visibilityState === "visible") tique();
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  if (!temporizador) {
    agoraMs = Date.now();
    temporizador = setInterval(tique, INTERVALO_MS);
    document.addEventListener("visibilitychange", aoVoltarParaAba);
  }
  return () => {
    ouvintes.delete(avisar);
    if (ouvintes.size === 0 && temporizador) {
      clearInterval(temporizador);
      temporizador = null;
      document.removeEventListener("visibilitychange", aoVoltarParaAba);
    }
  };
}

const lerAgora = () => agoraMs;
const lerAgoraServidor = () => 0;

/**
 * "há 3 min" — idade de um instante ISO, atualizada a cada 30 s.
 * No servidor e na hidratação não renderiza nada (o servidor não sabe quando a
 * página será vista); o valor aparece logo depois de montar, sem mismatch.
 */
export function IdadeRelativa({ iso, className }: { iso: string; className?: string }) {
  const agora = useSyncExternalStore(assinar, lerAgora, lerAgoraServidor);
  if (agora === 0 || Number.isNaN(new Date(iso).getTime())) return null;
  const segundos = idadeEmSegundos(iso, new Date(agora));
  return <span className={cn("tabular-nums", className)}>{formatarIdade(segundos)}</span>;
}
