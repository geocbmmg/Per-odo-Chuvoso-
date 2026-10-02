import { cn } from "@/lib/utils";

/**
 * Rodapé discreto (11px, --gr-faint), no espírito do .gr-tr-ver/.gr-login-foot do
 * GeoRescue: créditos das fontes de dados (exigência dos termos de uso) e a assinatura.
 */
export function RodapeCreditos({ creditos, className }: { creditos: readonly string[]; className?: string }) {
  const unicos = Array.from(new Set(creditos.map((c) => c.trim()).filter(Boolean)));

  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-border px-5 py-3.5 text-[11px] leading-snug text-faint max-md:px-3",
        className,
      )}
    >
      {unicos.length > 0 ? (
        <p className="min-w-0">
          <span className="font-bold uppercase tracking-[.08em]">Fontes:</span> {unicos.join(" · ")}
        </p>
      ) : null}
      <p className="shrink-0">CBMMG · Sala de Situação</p>
    </footer>
  );
}
