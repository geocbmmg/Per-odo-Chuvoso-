"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_PADRAO_MS = 120_000;

/**
 * Atualiza os dados da página (router.refresh(): refaz a renderização dos
 * Server Components, sem perder o estado dos componentes de cliente, como o
 * mapa e a rolagem) a cada `intervaloMs`, SÓ com a aba visível. Ao voltar
 * para a aba, atualiza na hora se o intervalo já passou desde a última vez.
 *
 * Não desenha nada nem anima nada: com prefers-reduced-motion não há efeito
 * visual a suprimir (os números simplesmente trocam no lugar).
 */
export function AutoAtualizar({ intervaloMs = INTERVALO_PADRAO_MS }: { intervaloMs?: number }) {
  const router = useRouter();
  const ultimaRef = useRef(0);

  useEffect(() => {
    if (!(intervaloMs > 0)) return;
    ultimaRef.current = Date.now();

    const atualizar = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      ultimaRef.current = Date.now();
      router.refresh();
    };

    const temporizador = window.setInterval(() => {
      // Aba escondida: o intervalo segue, mas a busca fica para quando voltar.
      if (Date.now() - ultimaRef.current >= intervaloMs - 1_000) atualizar();
    }, intervaloMs);

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaRef.current >= intervaloMs) atualizar();
    };

    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("online", aoMudarVisibilidade);
    return () => {
      window.clearInterval(temporizador);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("online", aoMudarVisibilidade);
    };
  }, [intervaloMs, router]);

  return null;
}
