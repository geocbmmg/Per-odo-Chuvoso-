"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GRUPOS_NAVEGACAO, itensDoGrupo, rotaAtiva, type ItemNavegacao } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

/**
 * Itens do trilho (Index.html:3363-3376): 40px de altura, ícone de 20px, rótulo
 * começando em 52px. Item ativo com TRÊS sinais — fundo acento .12, barra de 3px
 * à esquerda e peso 650 — marcado por aria-current="page" ("só cor não serve").
 * Na gaveta do celular os itens têm 44px (alvo de toque).
 */
export function ListaNavegacao({
  variante,
  recolhido = false,
  aoNavegar,
}: {
  variante: "trilho" | "gaveta";
  /** Trilho recolhido (64px): rótulos viram dica. Só afeta a variante "trilho". */
  recolhido?: boolean;
  aoNavegar?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="flex flex-col">
      {GRUPOS_NAVEGACAO.map((grupo) => {
        const itens = itensDoGrupo(grupo.id);
        if (itens.length === 0) return null;
        const idRotulo = `nav-grupo-${variante}-${grupo.id}`;
        return (
          <div key={grupo.id} className="flex flex-col">
            {grupo.rotulo ? (
              <>
                <p
                  id={idRotulo}
                  className="px-5 pt-4 pb-1.5 text-[10.5px] font-bold uppercase tracking-[.12em] text-faint trilho-mini:sr-only"
                >
                  {grupo.rotulo}
                </p>
                <span aria-hidden="true" className="mx-4 my-2.5 hidden h-px bg-border trilho-mini:block" />
              </>
            ) : null}
            <ul aria-labelledby={grupo.rotulo ? idRotulo : undefined} className="flex flex-col">
              {itens.map((item) => (
                <li key={item.rota}>
                  <ItemLink
                    item={item}
                    ativo={rotaAtiva(pathname, item.rota)}
                    variante={variante}
                    recolhido={variante === "trilho" && recolhido}
                    aoNavegar={aoNavegar}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ItemLink({
  item,
  ativo,
  variante,
  recolhido,
  aoNavegar,
}: {
  item: ItemNavegacao;
  ativo: boolean;
  variante: "trilho" | "gaveta";
  recolhido: boolean;
  aoNavegar?: () => void;
}) {
  const Icone = item.icone;
  const emBreve = item.situacao === "em-breve";

  const link = (
    <Link
      href={item.rota}
      aria-current={ativo ? "page" : undefined}
      onClick={aoNavegar}
      className={cn(
        "group/item relative flex items-center gap-3 pr-3 pl-5 text-[13.5px] font-medium text-ink-2 transition-colors",
        "hover:bg-linha/6 hover:text-ink-forte",
        "aria-[current=page]:bg-acc/12 aria-[current=page]:font-[650] aria-[current=page]:text-acc-txt",
        "before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:hidden before:w-[3px] before:rounded-r-[3px] before:bg-primary",
        "aria-[current=page]:before:block",
        variante === "trilho" ? "h-10 trilho-mini:pr-0 trilho-mini:pl-[22px]" : "h-11",
      )}
    >
      <Icone
        aria-hidden="true"
        className="size-5 shrink-0 text-mut transition-colors group-hover/item:text-ink-2 group-aria-[current=page]/item:text-acc-txt"
      />
      <span className="min-w-0 flex-1 truncate trilho-mini:sr-only">{item.rotulo}</span>
      {emBreve ? (
        <span
          className={cn(
            "shrink-0 rounded-full border border-linha/16 bg-linha/5 px-1.5 py-px",
            "text-[9.5px] font-bold uppercase tracking-[.06em] text-mut trilho-mini:sr-only",
          )}
        >
          em breve
        </span>
      ) : null}
    </Link>
  );

  if (!recolhido) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.rotulo}
        {emBreve ? <span className="ml-1.5 text-mut">· em breve</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
