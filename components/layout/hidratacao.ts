"use client";

import { useCallback, useSyncExternalStore } from "react";

function semAssinatura() {
  return () => {};
}

/**
 * false no HTML do servidor e durante a hidratação; true depois. Use para mostrar
 * algo que só o navegador sabe (tema escolhido, hora local) sem mismatch de hidratação.
 */
export function useMontado(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );
}

/**
 * Media query reativa. No servidor (e na hidratação) devolve `valorServidor`;
 * depois acompanha a janela.
 */
export function useMediaQuery(consulta: string, valorServidor = false): boolean {
  const assinar = useCallback(
    (avisar: () => void) => {
      const mql = window.matchMedia(consulta);
      mql.addEventListener("change", avisar);
      return () => mql.removeEventListener("change", avisar);
    },
    [consulta],
  );
  const ler = useCallback(() => window.matchMedia(consulta).matches, [consulta]);
  return useSyncExternalStore(assinar, ler, () => valorServidor);
}
