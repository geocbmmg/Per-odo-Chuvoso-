import type { SeveridadeInmet } from "@/lib/dominio/tipos";
import { cn } from "@/lib/utils";

import { ESTILO_SEVERIDADE } from "./severidade";

/**
 * Medidor de nível (1 a 3 barras crescentes) — sinal de FORMA do nível de
 * severidade, independente da cor. Pintado com a tinta de texto atual.
 */
export function MedidorNivel({ nivel, className }: { nivel: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width="13" height="11" viewBox="0 0 13 11" className={cn("shrink-0", className)}>
      {[0, 1, 2].map((i) => {
        const altura = 4 + i * 3.5;
        const cheia = i < nivel;
        return (
          <rect
            key={i}
            x={i * 4.5}
            y={11 - altura}
            width="3.5"
            height={altura}
            rx="0.8"
            fill={cheia ? "currentColor" : "none"}
            stroke="currentColor"
            strokeOpacity={cheia ? 1 : 0.45}
            strokeWidth={cheia ? 0 : 1}
          />
        );
      })}
    </svg>
  );
}

/** Amostra quadrada na cor oficial do nível (com filete escuro para o amarelo aparecer no tema claro). */
export function AmostraSeveridade({ severidade, className }: { severidade: SeveridadeInmet; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.35)]", className)}
      style={{ backgroundColor: ESTILO_SEVERIDADE[severidade].cor }}
    />
  );
}

/**
 * Nível de severidade do INMET em linha: amostra de cor + medidor + NOME.
 * Usado na tabela de previsão (classificação indicativa do acumulado).
 */
export function MarcaSeveridade({
  severidade,
  className,
  prefixoSr,
}: {
  severidade: SeveridadeInmet;
  className?: string;
  /** Texto só para leitores de tela antes do nome (ex.: "Classificação indicativa:"). */
  prefixoSr?: string;
}) {
  const estilo = ESTILO_SEVERIDADE[severidade];
  return (
    <span
      data-severidade={severidade}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-linha/20 bg-linha/5 px-2 py-[2px]",
        "text-[10.5px] font-extrabold uppercase leading-[1.25] tracking-[.06em] text-ink",
        className,
      )}
    >
      <AmostraSeveridade severidade={severidade} />
      <MedidorNivel nivel={estilo.nivel} className="text-ink-2" />
      {prefixoSr ? <span className="sr-only">{prefixoSr} </span> : null}
      {estilo.rotulo}
    </span>
  );
}
