import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { itemDaRota, NAVEGACAO } from "@/lib/navegacao";

/*
 * PROVISÓRIO: a Visão Geral definitiva (mapa de MG + indicadores) substitui esta página.
 * Por ora ela só apresenta os módulos da Sala.
 */
const modulo = itemDaRota("/");

export default function PaginaVisaoGeral() {
  const outros = NAVEGACAO.filter((item) => item.rota !== "/");

  return (
    <>
      <CabecalhoPagina titulo={modulo.rotulo} subtitulo={modulo.descricao} icone={modulo.icone} />
      <section aria-labelledby="modulos-titulo" className="mx-auto w-full max-w-6xl">
        <h2 id="modulos-titulo" className="mb-3 text-[12px] font-bold uppercase tracking-[.18em] text-faint">
          Módulos da Sala
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {outros.map((item) => {
            const Icone = item.icone;
            return (
              <li key={item.rota}>
                <Link
                  href={item.rota}
                  className="group flex h-full items-start gap-3.5 rounded-[14px] border border-border bg-superficie p-4 transition-[border-color,background-color] hover:border-acc/34 hover:bg-acc/4"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-acc/34 bg-acc/12 text-acc-txt"
                  >
                    <Icone className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-ink-forte">{item.rotulo}</span>
                      {item.situacao === "em-breve" ? <Badge variant="neutro">Em breve</Badge> : null}
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-snug text-mut">{item.descricao}</span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-2.5 size-4 shrink-0 text-mut transition-colors group-hover:text-acc-txt"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
