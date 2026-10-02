"use client";

// O CSS do mapa entra com o esqueleto (carregado junto da página), para o
// estado de carregamento já aparecer estilizado antes do chunk do MapLibre.
import "./mapa.css";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { ALTURA_PADRAO_MAPA } from "./altura";
import { useTemaMapa } from "./hooks";

/** Altura do mapa e presença da legenda e da lista (o esqueleto do next/dynamic não recebe props). */
export const AlturaMapaContexto = createContext({ altura: ALTURA_PADRAO_MAPA, legenda: true, lista: true });

/** Ocupa o lugar do mapa enquanto o JavaScript do MapLibre carrega. */
export function EsqueletoMapa() {
  const tema = useTemaMapa();
  const { altura, legenda, lista } = useContext(AlturaMapaContexto);
  return (
    <div className="mapa-esqueleto" data-mapa-tema={tema} role="status">
      <div className={cn("mapa-esqueleto__mapa", altura)}>
        <span className="mapa-giro" aria-hidden="true" />
        <span className="mapa-carregando__texto">Carregando mapa</span>
      </div>
      {legenda ? <div className="mapa-esqueleto__legenda" aria-hidden="true" /> : null}
      {lista ? <div className="mapa-esqueleto__lista" aria-hidden="true" /> : null}
    </div>
  );
}
