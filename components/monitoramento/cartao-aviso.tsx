import { useId } from "react";
import { CalendarClock, Clock, ExternalLink, MapPin, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatarData, formatarDataHora, formatarHora } from "@/lib/datas";
import { cn } from "@/lib/utils";

import { MedidorNivel } from "./marca-severidade";
import { ESTILO_SEVERIDADE } from "./severidade";
import type { AvisoVisao } from "./tipos";

/** "02/10 23:59" no horário de Brasília (via lib/datas). */
function diaMesHora(iso: string): string {
  return `${formatarData(iso).slice(0, 5)} ${formatarHora(iso)}`;
}

function textoVigencia(aviso: AvisoVisao): string {
  if (aviso.vigencia === "futuro") {
    return aviso.inicio ? `Começa em ${diaMesHora(aviso.inicio)}` : "Começa em breve";
  }
  return aviso.fim ? `Vigente até ${diaMesHora(aviso.fim)}` : "Vigente · sem fim informado";
}

/**
 * Cartão de aviso do INMET: faixa lateral e chip na COR OFICIAL do nível,
 * mais o NOME do nível e o medidor de 1–3 barras (cor + palavra + forma).
 * Todo texto vindo do feed é renderizado como texto.
 */
export function CartaoAviso({ aviso, className }: { aviso: AvisoVisao; className?: string }) {
  const estilo = ESTILO_SEVERIDADE[aviso.severidade];
  const idTitulo = useId();

  return (
    <article
      aria-labelledby={idTitulo}
      data-severidade={aviso.severidade}
      className={cn(
        "relative flex h-full flex-col gap-3 overflow-hidden rounded-[14px] border border-border bg-superficie py-4 pl-[22px] pr-4",
        className,
      )}
    >
      {/* Faixa lateral na cor oficial do nível (cor-dado, não segue o tema). */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[6px] shadow-[inset_-1px_0_0_rgba(0,0,0,.25)]"
        style={{ backgroundColor: estilo.cor }}
      />

      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[10px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.3)]"
          style={{ backgroundColor: estilo.cor, color: estilo.tinta }}
        >
          <TriangleAlert className="size-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-extrabold uppercase leading-tight tracking-[.12em] text-ink">
            <MedidorNivel nivel={estilo.nivel} className="text-ink-2" />
            <span>
              <span className="sr-only">Severidade: </span>
              {estilo.rotulo}
            </span>
            {estilo.nivel > 0 ? (
              <span className="font-semibold normal-case tracking-normal text-mut">nível {estilo.nivel} de 3</span>
            ) : null}
          </p>
          <h3 id={idTitulo} className="mt-1 text-[15px] font-bold leading-snug text-ink-forte">
            {aviso.evento}
          </h3>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {aviso.vigencia === "vigente" ? (
          <Badge variant="acento">
            <Clock aria-hidden="true" />
            {textoVigencia(aviso)}
          </Badge>
        ) : (
          <Badge variant="neutro" className="border-dashed">
            <CalendarClock aria-hidden="true" />
            {textoVigencia(aviso)}
          </Badge>
        )}
        {aviso.inicio && aviso.fim ? (
          <span className="text-[11.5px] text-mut tabular-nums" title="Horário de Brasília">
            {formatarDataHora(aviso.inicio)} → {formatarDataHora(aviso.fim)}
          </span>
        ) : null}
      </div>

      {aviso.descricao ? (
        <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">{aviso.descricao}</p>
      ) : null}

      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-[.16em] text-mut">Mesorregiões de MG afetadas</p>
        {aviso.mesorregioes.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {aviso.mesorregioes.map((m) => (
              <li
                key={m}
                className="inline-flex items-center gap-1 rounded-full border border-linha/20 bg-linha/6 px-2.5 py-1 text-[12.5px] font-semibold leading-tight text-ink"
              >
                <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-mut" />
                {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12.5px] text-mut">Nenhuma mesorregião de MG identificada.</p>
        )}
        {aviso.areasForaDeMg > 0 ? (
          <p className="mt-1.5 text-[12px] text-mut tabular-nums">
            +{aviso.areasForaDeMg} {aviso.areasForaDeMg === 1 ? "área fora de MG" : "áreas fora de MG"}
          </p>
        ) : null}
      </div>

      {aviso.link ? (
        <div className="mt-auto pt-1">
          <a
            href={aviso.link}
            target="_blank"
            rel="noopener noreferrer"
            className="relative alvo-toque inline-flex items-center gap-1.5 rounded-[8px] text-[13px] font-semibold text-acc-txt underline-offset-4 hover:underline"
          >
            Abrir no INMET
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        </div>
      ) : null}
    </article>
  );
}
