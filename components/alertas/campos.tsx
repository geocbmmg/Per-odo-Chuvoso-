import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Peças de formulário da fila de alertas no padrão GeoRescue (input de raio
 * 9px, borda linha .12, foco no acento forte). Altura 40px (44px de alvo em
 * tela de toque); erro = borda --perigo + ícone + texto ligado por
 * aria-describedby (nunca só a cor).
 */

export const CLASSE_ENTRADA = cn(
  "block h-10 w-full min-w-0 rounded-[9px] border border-input bg-sup-1 px-3 text-[14px] text-ink",
  "placeholder:text-faint disabled:cursor-not-allowed disabled:bg-linha/5 disabled:text-mut",
  "aria-invalid:border-perigo aria-invalid:bg-perigo/6",
  "pointer-coarse:h-11",
);

export const CLASSE_SELECAO = cn(CLASSE_ENTRADA, "pr-8");

export const CLASSE_TEXTO_LONGO = cn(
  "block min-h-24 w-full min-w-0 rounded-[9px] border border-input bg-sup-1 px-3 py-2.5 text-[14px] leading-snug text-ink",
  "placeholder:text-faint disabled:cursor-not-allowed disabled:bg-linha/5 disabled:text-mut",
  "aria-invalid:border-perigo aria-invalid:bg-perigo/6",
);

/** Rótulo de campo: 12.5px/700, com marca de obrigatório para emitir. */
export function RotuloCampo({ htmlFor, children, obrigatorio }: { htmlFor?: string; children: ReactNode; obrigatorio?: boolean }) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-bold leading-tight text-ink">
      {children}
      {obrigatorio ? (
        <span className="ml-1 font-semibold text-mut">
          <span aria-hidden="true">*</span>
          <span className="sr-only">(obrigatório para emitir)</span>
        </span>
      ) : null}
    </Tag>
  );
}

/** Mensagem de erro do campo (id = `erro-${nome}`). */
export function ErroCampo({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug text-perigo-txt">
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{mensagem}</span>
    </p>
  );
}

/** Texto de ajuda (id = `ajuda-${nome}`). */
export function AjudaCampo({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-[12px] leading-snug text-mut">
      {children}
    </p>
  );
}

/** ids e atributos de acessibilidade de um campo: `campo-x`, `ajuda-x`, `erro-x`. */
export function idsCampo(nome: string, erro: string | undefined, temAjuda: boolean) {
  const descritores = [temAjuda ? `ajuda-${nome}` : null, erro ? `erro-${nome}` : null].filter(Boolean).join(" ");
  return {
    id: `campo-${nome}`,
    "aria-invalid": erro ? (true as const) : undefined,
    "aria-describedby": descritores || undefined,
  };
}

/**
 * Campo completo: rótulo, controle, ajuda e erro. `children` recebe os
 * atributos (id, aria-invalid, aria-describedby) para espalhar no controle.
 */
export function Campo({
  nome,
  rotulo,
  obrigatorio,
  ajuda,
  erro,
  className,
  children,
}: {
  nome: string;
  rotulo: ReactNode;
  obrigatorio?: boolean;
  ajuda?: ReactNode;
  erro?: string;
  className?: string;
  children: (atributos: ReturnType<typeof idsCampo>) => ReactNode;
}) {
  const atributos = idsCampo(nome, erro, !!ajuda);
  return (
    <div className={cn("min-w-0", className)}>
      <RotuloCampo htmlFor={atributos.id} obrigatorio={obrigatorio}>
        {rotulo}
      </RotuloCampo>
      {children(atributos)}
      <AjudaCampo id={`ajuda-${nome}`}>{ajuda}</AjudaCampo>
      <ErroCampo id={`erro-${nome}`} mensagem={erro} />
    </div>
  );
}

/** Grupo de campos com legenda no estilo de rótulo de seção (11–12px/700/.18em). */
export function SecaoFormulario({ titulo, descricao, children, className }: { titulo: string; descricao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 border-t border-border pt-4", className)}>
      <legend className="float-left mb-3 w-full text-[11.5px] font-bold uppercase tracking-[.18em] text-faint">{titulo}</legend>
      {descricao ? <p className="clear-both mb-3 text-[12.5px] leading-snug text-mut">{descricao}</p> : null}
      <div className="clear-both grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Opção de rádio em chip (alvo ≥ 44px no toque; ativa com fundo e moldura de acento + peso). */
export const CLASSE_OPCAO_CHIP = cn(
  "relative alvo-toque flex min-h-10 cursor-pointer items-center gap-2 rounded-[9px] border px-3 py-2 text-[13px] leading-tight",
  "transition-[background-color,border-color,color]",
  "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-acc-forte",
  "has-[input:checked]:border-acc/42 has-[input:checked]:bg-acc/16 has-[input:checked]:font-bold has-[input:checked]:text-acc-txt",
  "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60",
  "border-linha/16 bg-linha/4 font-semibold text-ink-2 hover:bg-linha/8 hover:text-ink-forte",
);

/** Rádio nativo escondido: setas trocam a opção; o rótulo é o alvo. */
export const CLASSE_RADIO_OCULTO = "pointer-events-none absolute size-px opacity-0";
