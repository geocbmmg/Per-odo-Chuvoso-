import { EsqueletoCabecalhoPagina } from "@/components/comum/esqueleto-cabecalho";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EsqueletoAvisosInmet,
  EsqueletoGraficos,
  EsqueletoKpis,
} from "@/components/visao-geral/esqueletos";

/**
 * Esqueleto de carregamento (Visão Geral). Como fica na raiz de app/, também
 * aparece ao navegar para uma página sem loading próprio — por isso o desenho é
 * genérico: cabeçalho, faixa de indicadores e blocos. Usa os MESMOS esqueletos
 * dos <Suspense> da página, então a troca para o streaming por bloco não pula.
 * Pulsa só sem prefers-reduced-motion (o Skeleton para sozinho).
 */
export default function Carregando() {
  return (
    <div role="status" aria-live="polite" className="min-w-0">
      <span className="sr-only">Carregando dados da página…</span>

      <EsqueletoCabecalhoPagina faixa />

      {/* aria-hidden: os avisos "carregando" de cada bloco não se repetem aqui. */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5" aria-hidden="true">
        <EsqueletoKpis />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="flex flex-col gap-2.5 xl:col-span-8">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[60svh] min-h-[340px] w-full rounded-[14px] md:h-[560px] md:min-h-0" />
          </div>
          <EsqueletoAvisosInmet className="xl:col-span-4" />
        </div>

        <EsqueletoGraficos />
      </div>
    </div>
  );
}
