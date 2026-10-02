import { Badge, type VarianteBadge } from "@/components/ui/badge";
import type { EstadoFonte } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

/**
 * Estado de uma fonte com TRÊS sinais: cor (variante da pílula), forma do
 * marcador e palavra. Nunca só a cor (docs/padrao-visual.md §4, regra 1).
 *
 * | estado            | forma                         | palavra           |
 * |-------------------|-------------------------------|-------------------|
 * | ok                | ponto cheio (verde)           | OK                |
 * | atrasada          | triângulo cheio (âmbar)       | ATRASADA          |
 * | fora-do-ar        | quadrado cheio (vermelho)     | FORA DO AR        |
 * | nao-implementada  | losango vazado, borda tracejada (cinza) | NÃO IMPLEMENTADA |
 * | exemplo           | círculo com ponto (info)      | EXEMPLO           |
 * | desconhecida      | círculo vazado (cinza)        | SEM LEITURA       |
 */

export const ROTULO_ESTADO: Record<EstadoFonte, string> = {
  ok: "OK",
  atrasada: "Atrasada",
  "fora-do-ar": "Fora do ar",
  "nao-implementada": "Não implementada",
  exemplo: "Exemplo",
  desconhecida: "Sem leitura",
};

export const VARIANTE_ESTADO: Record<EstadoFonte, VarianteBadge> = {
  ok: "ok",
  atrasada: "alerta",
  "fora-do-ar": "perigo",
  "nao-implementada": "neutro",
  exemplo: "info",
  desconhecida: "neutro",
};

/** Cor do marcador/faixa por estado (classe de texto: o marcador usa currentColor). */
export const COR_ESTADO: Record<EstadoFonte, string> = {
  ok: "text-ok-txt",
  atrasada: "text-alerta-txt",
  "fora-do-ar": "text-perigo-txt",
  "nao-implementada": "text-mut",
  exemplo: "text-info-txt",
  desconhecida: "text-mut",
};

/** Ordem de leitura: do mais grave ao neutro. */
export const ORDEM_ESTADOS: readonly EstadoFonte[] = [
  "fora-do-ar",
  "atrasada",
  "ok",
  "desconhecida",
  "exemplo",
  "nao-implementada",
];

/** Forma do estado em SVG (8×8 por padrão), pintada com currentColor. */
export function MarcadorEstado({
  estado,
  tamanho = 8,
  className,
}: {
  estado: EstadoFonte;
  tamanho?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 10 10"
      className={cn("shrink-0 overflow-visible", className)}
    >
      {estado === "ok" ? <circle cx="5" cy="5" r="4.5" fill="currentColor" /> : null}
      {estado === "atrasada" ? <polygon points="5,0.3 9.8,9.4 0.2,9.4" fill="currentColor" /> : null}
      {estado === "fora-do-ar" ? <rect x="0.6" y="0.6" width="8.8" height="8.8" rx="1" fill="currentColor" /> : null}
      {estado === "nao-implementada" ? (
        <polygon points="5,0.6 9.4,5 5,9.4 0.6,5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      ) : null}
      {estado === "exemplo" ? (
        <>
          <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="5" cy="5" r="1.8" fill="currentColor" />
        </>
      ) : null}
      {estado === "desconhecida" ? (
        <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      ) : null}
    </svg>
  );
}

/** Pílula de estado (Badge) com forma + cor + palavra em caixa alta. */
export function PilulaEstado({ estado, className }: { estado: EstadoFonte; className?: string }) {
  return (
    <Badge
      variant={VARIANTE_ESTADO[estado]}
      data-estado={estado}
      className={cn(estado === "nao-implementada" && "border-dashed", className)}
    >
      <span className="inline-flex">
        <MarcadorEstado estado={estado} />
      </span>
      {ROTULO_ESTADO[estado]}
    </Badge>
  );
}
