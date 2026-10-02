import { TriangleAlert } from "lucide-react";

import { formatarDataHora } from "@/lib/datas";
import type { OrigemLeitura } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

/**
 * Faixa visível (não só dica) quando o bloco exibe a ÚLTIMA LEITURA VÁLIDA
 * porque a fonte falhou agora. A dica do carimbo não abre por toque, então o
 * erro também aparece aqui, como texto. Não renderiza nada nas outras origens.
 */
export function AvisoUltimaValida({
  origem,
  atualizadoEm,
  erro,
  className,
}: {
  origem: OrigemLeitura;
  atualizadoEm: string;
  erro?: string;
  className?: string;
}) {
  if (origem !== "ultima-valida") return null;
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-[9px] border border-alerta/30 bg-alerta/9 px-3 py-2 text-[12.5px] leading-snug text-ink-2",
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-alerta-txt" />
      <span className="min-w-0 break-words">
        <span className="font-bold text-alerta-txt">Fonte indisponível agora. </span>
        Exibindo a última leitura válida, de{" "}
        <time dateTime={atualizadoEm} title="Horário de Brasília" className="font-semibold tabular-nums">
          {formatarDataHora(atualizadoEm)}
        </time>
        .{erro ? <> Erro: {erro}</> : null}
      </span>
    </p>
  );
}
