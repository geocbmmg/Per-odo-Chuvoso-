import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Aviso de que a sessão é de DEMONSTRAÇÃO (DADOS_EXEMPLO=1): perfil fictício,
 * sem login no GeoRescue. Tom info, como a tarja de demonstração do layout —
 * é aviso, não alarme. Dois sinais: ícone + texto.
 */
export function AvisoSessaoDemonstracao({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-[10px] border border-info/40 bg-info/12 px-3 py-2 text-[12px] leading-snug text-info-txt",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="mt-px size-4 shrink-0" />
      <span>
        <strong className="font-extrabold">Sessão de demonstração.</strong>{" "}
        {children ?? "Perfil fictício, sem login no GeoRescue: nenhum dado aqui identifica uma pessoa real."}
      </span>
    </p>
  );
}
