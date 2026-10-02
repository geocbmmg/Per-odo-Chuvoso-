import { EsqueletoCabecalhoPagina } from "@/components/comum/esqueleto-cabecalho";
import { EsqueletoBlocoAvisos, EsqueletoBlocoPrevisao } from "@/components/monitoramento/esqueletos";

/**
 * Esqueleto do Monitoramento (no lugar do da Visão Geral, que é o da raiz):
 * cabeçalho com o botão Atualizar e os dois blocos, com os MESMOS esqueletos
 * dos <Suspense> da página.
 */
export default function CarregandoMonitoramento() {
  return (
    <div role="status" aria-live="polite" className="min-w-0">
      <span className="sr-only">Carregando o monitoramento…</span>

      <EsqueletoCabecalhoPagina acoes />

      {/* aria-hidden: os avisos "carregando" de cada bloco não se repetem aqui. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6" aria-hidden="true">
        <EsqueletoBlocoAvisos />
        <EsqueletoBlocoPrevisao />
      </div>
    </div>
  );
}
