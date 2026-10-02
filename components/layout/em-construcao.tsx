import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRightLeft, Check, Construction } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Bloco de módulo futuro — cartão-módulo .cap-mod do GeoRescue (Index.html:3775):
 * sup-2, raio 16, chip de ícone de 52px no acento. Diz o que o módulo vai entregar e
 * qual parte da plataforma atual ele substitui (e o que usar enquanto isso).
 */
export function EmConstrucao({
  icone: Icone,
  titulo,
  descricao,
  entregas,
  substitui,
  enquantoIsso,
  fase = "Em construção",
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao?: string;
  /** O que o módulo vai entregar (uma frase por item). */
  entregas: readonly string[];
  /** Parte da plataforma atual que ele substitui. */
  substitui: string;
  /** Orientação para hoje (ex.: qual aba do painel atual continuar usando). */
  enquantoIsso?: string;
  /** Rótulo da pílula de situação. */
  fase?: string;
  className?: string;
}) {
  const idTitulo = useId();
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn("rounded-[16px] border border-linha/12 bg-sup-2 px-5 py-[22px] max-md:px-4", className)}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-[52px] shrink-0 place-items-center rounded-[14px] border border-acc/34 bg-acc/12 text-acc-txt shadow-halo"
        >
          <Icone className="size-6" />
        </span>
        <div className="min-w-0 flex-1 basis-60">
          <Badge variant="acento">
            <Construction aria-hidden="true" />
            {fase}
          </Badge>
          <h2
            id={idTitulo}
            className="mt-2 text-[16px] font-bold uppercase leading-tight tracking-[.03em] text-ink-forte"
          >
            {titulo}
          </h2>
          {descricao ? <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{descricao}</p> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[.18em] text-faint">O que este módulo vai entregar</h3>
          <ul className="mt-2.5 flex flex-col gap-2">
            {entregas.map((entrega) => (
              <li key={entrega} className="flex gap-2.5 text-[13.5px] leading-snug text-ink-2">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-acc-txt" />
                <span>{entrega}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 md:border-l md:border-border md:pl-5">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[.18em] text-faint">Substitui na plataforma atual</h3>
            <p className="mt-2.5 flex gap-2.5 text-[13.5px] leading-snug text-ink">
              <ArrowRightLeft aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mut" />
              <span>{substitui}</span>
            </p>
          </div>
          {enquantoIsso ? (
            <p className="rounded-[9px] border border-info/30 bg-info/8 px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
              <span className="font-bold text-info-txt">Enquanto isso: </span>
              {enquantoIsso}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
