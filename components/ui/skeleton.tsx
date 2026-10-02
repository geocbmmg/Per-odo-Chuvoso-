import * as React from "react";

import { cn } from "@/lib/utils";

/** Bloco de carregamento: rgba(linha, .08) pulsando (parado com prefers-reduced-motion). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-[8px] bg-linha/8", className)}
      {...props}
    />
  );
}

export { Skeleton };
