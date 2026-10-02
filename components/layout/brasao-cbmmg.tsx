"use client";

import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Brasão do CBMMG servido pelo portal ArcGIS da corporação (o mesmo item usado no
 * trilho do GeoRescue). Para servir localmente, coloque o arquivo em
 * public/marca/brasao-cbmmg.png e troque esta constante por "/marca/brasao-cbmmg.png".
 */
export const URL_BRASAO_CBMMG =
  "https://geoprocessamento.bombeiros.mg.gov.br/portal/sharing/rest/content/items/aa4b97dceacf4d11a8ada7232fe86a23/data";

/**
 * Brasão com reserva: se a imagem não carregar (portal fora do ar, rede bloqueada),
 * mostra o monograma textual "CBMMG". A checagem no ref cobre a falha que acontece
 * antes da hidratação, quando o onError do React ainda não estava ligado.
 */
export function BrasaoCbmmg({ className, classeMonograma }: { className?: string; classeMonograma?: string }) {
  const [falhou, setFalhou] = useState(false);

  const verificar = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFalhou(true);
  }, []);

  if (falhou) {
    return (
      <span
        role="img"
        aria-label="CBMMG"
        className={cn(
          "inline-flex aspect-square items-center justify-center rounded-[12px] border border-acc/34 bg-acc/12",
          "text-[13px] font-extrabold tracking-[.04em] text-acc-txt shadow-halo",
          classeMonograma,
        )}
      >
        CBMMG
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={verificar}
      src={URL_BRASAO_CBMMG}
      alt="Brasão do CBMMG"
      decoding="async"
      onError={() => setFalhou(true)}
      className={cn("w-auto max-w-full object-contain", className)}
    />
  );
}
