"use client";

/**
 * Ponto de entrada do mapa para as páginas.
 *
 * `MapaSituacao` carrega o componente MapLibre só no navegador (next/dynamic
 * com ssr: false — no Next 16 isso só é permitido dentro de um Client
 * Component, por isso este módulo é "use client"). Enquanto o chunk chega,
 * mostra um esqueleto com a mesma altura. Pode ser usado direto numa página
 * Server Component, desde que sem `onMeta` (funções não atravessam essa
 * fronteira); para receber o carimbo, use-o dentro de um Client Component.
 */

import dynamic from "next/dynamic";
import { createElement } from "react";
import { ALTURA_PADRAO_MAPA } from "./altura";
import { AlturaMapaContexto, EsqueletoMapa } from "./esqueleto-mapa";
import type { PropsMapaSituacao } from "./mapa-situacao";

const MapaDinamico = dynamic(() => import("./mapa-situacao"), {
  ssr: false,
  loading: () => createElement(EsqueletoMapa),
});

export function MapaSituacao(props: PropsMapaSituacao) {
  return createElement(
    AlturaMapaContexto.Provider,
    {
      value: {
        altura: props.altura ?? ALTURA_PADRAO_MAPA,
        legenda: props.mostrarLegenda ?? true,
        lista: props.mostrarLista ?? true,
      },
    },
    createElement(MapaDinamico, props),
  );
}

export { LegendaMapa } from "./legenda-mapa";
export type { PropsLegendaMapa } from "./legenda-mapa";
export type { PropsMapaSituacao } from "./mapa-situacao";
export type { InfoCamada } from "./info";
