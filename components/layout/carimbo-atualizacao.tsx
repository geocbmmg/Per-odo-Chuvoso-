import { Clock, FlaskConical, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatarDataHora, formatarHora } from "@/lib/datas";
import type { OrigemLeitura } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

import { IdadeRelativa } from "./idade-relativa";

export interface CarimboAtualizacaoProps {
  /** Instante ISO 8601 da leitura válida (Leitura.atualizadoEm / meta.atualizadoEm). */
  atualizadoEm: string;
  origem: OrigemLeitura;
  /** Erro mais recente da fonte (quando origem = "ultima-valida"). */
  erro?: string;
  /** Nome da fonte, para a dica e leitores de tela (ex.: "Avisos INMET"). */
  fonte?: string;
  /** Mostra o nome da fonte antes do horário. */
  mostrarFonte?: boolean;
  className?: string;
}

/**
 * Carimbo "Atualizado às HH:MM · há 3 min" de todo bloco de dados (horário de Brasília).
 * - "ultima-valida": pílula de alerta "Fonte indisponível · última leitura válida"
 *   com o erro na dica (e também para leitores de tela).
 * - "exemplo": pílula info "Dados de exemplo".
 * Pode ser usado em componentes de servidor e de cliente.
 */
export function CarimboAtualizacao({
  atualizadoEm,
  origem,
  erro,
  fonte,
  mostrarFonte = false,
  className,
}: CarimboAtualizacaoProps) {
  const dataHora = formatarDataHora(atualizadoEm);
  const titulo = `${fonte ? `${fonte} — ` : ""}atualizado em ${dataHora} (horário de Brasília)`;
  const mensagemErro = erro?.trim() || "A fonte não respondeu na última tentativa.";

  return (
    <div
      data-slot="carimbo-atualizacao"
      data-origem={origem}
      className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] leading-tight text-mut", className)}
    >
      <span className="inline-flex items-center gap-1.5" title={titulo}>
        <Clock aria-hidden="true" className="size-3.5 shrink-0" />
        {mostrarFonte && fonte ? <span className="font-semibold text-ink-2">{fonte} ·</span> : null}
        <span>
          Atualizado às{" "}
          <time dateTime={atualizadoEm} className="font-semibold text-ink-2 tabular-nums">
            {formatarHora(atualizadoEm)}
          </time>
        </span>
        {fonte && !mostrarFonte ? <span className="sr-only">{`(${fonte})`}</span> : null}
        <IdadeRelativa iso={atualizadoEm} className="before:mr-1.5 before:content-['·']" />
      </span>

      {origem === "ultima-valida" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="relative alvo-toque inline-flex cursor-help rounded-full">
              <Badge variant="alerta">
                <TriangleAlert aria-hidden="true" />
                Fonte indisponível · última leitura válida
              </Badge>
              <span className="sr-only">{`Erro: ${mensagemErro}`}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[320px]">
            <span className="block font-semibold text-alerta-txt">Exibindo a última leitura válida</span>
            <span className="mt-0.5 block text-ink-2">{mensagemErro}</span>
          </TooltipContent>
        </Tooltip>
      ) : null}

      {origem === "exemplo" ? (
        <Badge variant="info">
          <FlaskConical aria-hidden="true" />
          Dados de exemplo
        </Badge>
      ) : null}
    </div>
  );
}
