import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Tarja fixa de modo de demonstração (DADOS_EXEMPLO=1), no formato da
 * #painelTarjaSimulado do GeoRescue (painel.html:2610-2657), mas em tom INFO —
 * não é um alarme, é um aviso de que nada aqui é real.
 */
export function AvisoDadosExemplo({ ativo, className }: { ativo: boolean; className?: string }) {
  if (!ativo) return null;

  return (
    <div
      role="note"
      aria-label="Modo de demonstração"
      className={cn(
        "sticky top-0 z-30 border-b border-info/40 bg-sup-1 text-info-txt",
        "bg-[linear-gradient(rgba(var(--info-rgb),.16),rgba(var(--info-rgb),.16))]",
        className,
      )}
    >
      <p className="flex items-center justify-center gap-2 px-3 py-[7px] text-center text-[11.5px] font-bold leading-snug md:text-[12px]">
        <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
        <span>
          <strong className="font-extrabold uppercase tracking-[.18em] max-md:tracking-[.1em]">
            Modo de demonstração
          </strong>{" "}
          — dados de exemplo, não use para decisão operacional
        </span>
      </p>
    </div>
  );
}
