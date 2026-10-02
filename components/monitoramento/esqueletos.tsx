import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * Esqueletos dos blocos do Monitoramento, com a altura aproximada do bloco
 * pronto (sem pulo de layout quando o dado chega por streaming). Fallback de
 * cada <Suspense> em app/monitoramento/page.tsx e conteúdo do loading.tsx.
 */

function Carregando({ rotulo }: { rotulo: string }) {
  return (
    <span role="status" className="sr-only">
      {`Carregando ${rotulo}…`}
    </span>
  );
}

/** Cabeçalho de bloco: chip de 34px, título, descrição e carimbo (como CabecalhoBloco). */
function EsqueletoCabecalhoBloco() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-[11px]">
        <Skeleton className="size-[34px] shrink-0 rounded-[9px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-3 w-full max-w-[460px]" />
        </div>
      </div>
      <Skeleton className="h-3.5 w-48 max-w-full rounded-full" />
    </div>
  );
}

function EsqueletoRodape() {
  return (
    <CardFooter aria-hidden="true" className="justify-between">
      <Skeleton className="h-3 w-56 max-w-full" />
      <Skeleton className="h-3 w-36" />
    </CardFooter>
  );
}

/** "Avisos do INMET para Minas Gerais": contagem e dois cartões de aviso. */
export function EsqueletoBlocoAvisos() {
  return (
    <div>
      <Card className="gap-4">
        <Carregando rotulo="avisos do INMET" />
        <EsqueletoCabecalhoBloco />
        <CardContent aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-3 w-72 max-w-full" />
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-[236px] rounded-[14px]" />
            <Skeleton className="h-[236px] rounded-[14px] max-md:hidden" />
          </div>
        </CardContent>
        <EsqueletoRodape />
      </Card>
    </div>
  );
}

/** "Previsão de chuva por COB": tabela de 6 COBs, notas e gráfico de 72 h. */
export function EsqueletoBlocoPrevisao() {
  return (
    <div>
      <Card className="gap-4">
        <Carregando rotulo="previsão de chuva por COB" />
        <EsqueletoCabecalhoBloco />
        <CardContent aria-hidden="true" className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-[14px] border border-border">
            <div className="flex h-[34px] items-center gap-6 border-b border-acc/34 px-3">
              <Skeleton className="h-2.5 w-10" />
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2.5 w-16 max-sm:hidden" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-[52px] items-center gap-6 border-b border-linha/5 px-3 last:border-b-0">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-14 max-sm:hidden" />
              </div>
            ))}
          </div>
          <div className="-mt-2 flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-full max-w-[640px]" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
          <Skeleton className="h-[88px] rounded-[9px]" />
          <Skeleton className="h-[320px] rounded-[14px]" />
        </CardContent>
        <EsqueletoRodape />
      </Card>
    </div>
  );
}
