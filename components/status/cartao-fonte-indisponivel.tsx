import Link from "next/link";
import { useId } from "react";
import { Activity, ChevronRight, CloudOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatarDataHora, formatarHora } from "@/lib/datas";
import { cn } from "@/lib/utils";

import { MarcadorEstado } from "./pilula-estado";

/**
 * Bloco de dados cuja fonte falhou SEM leitura anterior válida
 * (FonteIndisponivelError). Ocupa o lugar do bloco; o resto da página segue.
 * Mensagens das fontes são exibidas como texto puro.
 */
export function CartaoFonteIndisponivel({
  titulo,
  fonte,
  mensagem,
  ultimaTentativaEm,
  mostrarLinkStatus = true,
  className,
}: {
  /** Título do bloco que não pôde ser montado (ex.: "Avisos do INMET para Minas Gerais"). */
  titulo: string;
  /** Nome da fonte no catálogo (ex.: "INMET — Avisos meteorológicos"). */
  fonte: string;
  /** Mensagem do erro (texto). */
  mensagem: string;
  /** ISO da última tentativa de consulta, quando conhecida. */
  ultimaTentativaEm?: string | null;
  mostrarLinkStatus?: boolean;
  className?: string;
}) {
  const idTitulo = useId();
  return (
    <section
      aria-labelledby={idTitulo}
      data-slot="fonte-indisponivel"
      className={cn(
        "rounded-[14px] border border-perigo/40 border-l-[3px] border-l-perigo bg-superficie p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-perigo/40 bg-perigo/12 text-perigo-txt"
        >
          <CloudOff className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 id={idTitulo} className="text-[16px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
            {titulo}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="perigo">
              <span className="inline-flex">
                <MarcadorEstado estado="fora-do-ar" />
              </span>
              Fonte indisponível
            </Badge>
            <span className="text-[12.5px] font-semibold text-ink-2">{fonte}</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
        Não foi possível consultar a fonte agora e ainda não há uma leitura anterior válida para exibir. O restante
        da página continua funcionando; este bloco volta sozinho quando a fonte responder.
      </p>
      <p className="mt-2 break-words rounded-[9px] border border-perigo/26 bg-perigo/8 px-3 py-2 text-[12.5px] leading-snug text-ink-2">
        <span className="font-bold text-perigo-txt">Erro: </span>
        {mensagem}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px] text-mut">
        {ultimaTentativaEm ? (
          <span title={`${formatarDataHora(ultimaTentativaEm)} (horário de Brasília)`}>
            Última tentativa às{" "}
            <time dateTime={ultimaTentativaEm} className="font-semibold text-ink-2 tabular-nums">
              {formatarHora(ultimaTentativaEm)}
            </time>
          </span>
        ) : (
          <span>Sem leitura válida nesta instância.</span>
        )}
        {mostrarLinkStatus ? (
          <Link
            href="/status"
            className="relative alvo-toque inline-flex items-center gap-1.5 rounded-[8px] font-semibold text-acc-txt underline-offset-4 hover:underline"
          >
            <Activity aria-hidden="true" className="size-4" />
            Ver status das fontes
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
