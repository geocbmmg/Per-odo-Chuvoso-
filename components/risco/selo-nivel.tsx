import { CORES_NIVEL, type NivelRisco } from "@/lib/dominio/matrizes";
import { cn } from "@/lib/utils";

/**
 * Amostra quadrada na cor do nível (cor-dado: igual nos dois temas). Sem
 * nível: quadrado vazado e tracejado ("sem dado" / "sem alerta").
 */
export function AmostraNivel({ nivel, className }: { nivel: NivelRisco | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-3 shrink-0 rounded-[3px]",
        nivel ? "shadow-[inset_0_0_0_1px_rgba(10,14,20,.45)]" : "border border-dashed border-ink-2 bg-transparent",
        className,
      )}
      style={nivel ? { backgroundColor: CORES_NIVEL[nivel].fundo } : undefined}
    />
  );
}

/**
 * Nível em linha: amostra de cor + PALAVRA ("Laranja · Perigo"). A palavra usa
 * a tinta da interface (texto pequeno nunca é pintado na cor do nível).
 */
export function SeloNivel({
  nivel,
  texto,
  className,
}: {
  nivel: NivelRisco | null;
  /** "Laranja · Perigo", "Sem alerta"… */
  texto: string;
  className?: string;
}) {
  return (
    <span
      data-nivel={nivel ?? "sem-dado"}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-linha/20 bg-linha/5 px-2 py-[2px]",
        "text-[10.5px] font-extrabold uppercase leading-[1.25] tracking-[.06em] text-ink",
        className,
      )}
    >
      <AmostraNivel nivel={nivel} className="size-2.5 rounded-[2px]" />
      <span className="min-w-0 truncate">{texto}</span>
    </span>
  );
}
