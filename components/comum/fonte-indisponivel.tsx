import { useId } from "react";
import Link from "next/link";
import { Activity, CloudOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { FonteIndisponivelError } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

export interface FonteIndisponivelProps {
  /** Nome do bloco que não pôde ser montado (ex.: "Avisos INMET para MG"). */
  titulo: string;
  /** O que aconteceu, em português (mensagem da fonte ou explicação genérica). */
  mensagem: string;
  /** Nome da fonte de dados (ex.: "INMET — Avisos meteorológicos"). */
  fonte?: string;
  className?: string;
}

/**
 * Cartão padrão de "fonte indisponível": ocupa o lugar de um bloco de dados
 * quando a fonte não respondeu e não há nenhuma leitura válida anterior.
 * O resto da página continua funcionando. Dois sinais além da cor: ícone de
 * nuvem cortada, pílula com marcador quadrado e a palavra "indisponível";
 * borda tracejada (sem dado) para diferenciar de um bloco com dados antigos.
 */
export function FonteIndisponivel({ titulo, mensagem, fonte, className }: FonteIndisponivelProps) {
  const idTitulo = useId();
  return (
    <section
      aria-labelledby={idTitulo}
      data-slot="fonte-indisponivel"
      className={cn(
        "flex flex-col gap-3 rounded-[14px] border border-dashed border-alerta/45 bg-alerta/6 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-alerta/35 bg-alerta/14 text-alerta-txt"
        >
          <CloudOff className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <Badge variant="alerta" marcador>
            Fonte indisponível
          </Badge>
          <h2
            id={idTitulo}
            className="mt-1.5 text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink-forte"
          >
            {titulo}
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-[13px] leading-snug">
        {fonte ? (
          <p className="text-ink-2">
            <span className="font-semibold text-ink">Fonte:</span> {fonte}
          </p>
        ) : null}
        <p className="break-words text-ink-2">{mensagem}</p>
        <p className="text-mut">Os demais blocos da página continuam atualizados normalmente.</p>
      </div>

      <Link
        href="/status"
        className="relative alvo-toque inline-flex w-fit items-center gap-1.5 rounded-[8px] text-[13px] font-semibold text-acc-txt underline-offset-4 hover:underline"
      >
        <Activity aria-hidden="true" className="size-4" />
        Ver status das fontes
      </Link>
    </section>
  );
}

/**
 * Traduz o motivo de uma Promise rejeitada em props do cartão. Para
 * FonteIndisponivelError usa o nome da fonte do catálogo; para qualquer outro
 * erro, uma mensagem genérica (sem detalhes internos).
 */
export function descreverFalhaFonte(
  motivo: unknown,
  fontePadrao?: string,
): Pick<FonteIndisponivelProps, "mensagem" | "fonte"> {
  if (motivo instanceof FonteIndisponivelError) {
    const nome = CATALOGO_FONTES[motivo.fonte]?.nome ?? fontePadrao;
    const detalhe = motivo.message?.trim();
    return {
      fonte: nome,
      mensagem: detalhe
        ? `A fonte não respondeu e não há leitura anterior válida. Detalhe: ${detalhe}`
        : "A fonte não respondeu e não há leitura anterior válida.",
    };
  }
  return {
    fonte: fontePadrao,
    mensagem: "Não foi possível montar este bloco agora. Tente novamente em alguns minutos.",
  };
}
