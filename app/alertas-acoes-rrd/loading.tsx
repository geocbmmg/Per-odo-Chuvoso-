import { EsqueletoFilaAlertas } from "@/components/alertas/esqueletos";
import { EsqueletoCabecalhoPagina } from "@/components/comum/esqueleto-cabecalho";

/**
 * Esqueleto de Alertas & Ações RRD (no lugar do da Visão Geral): cabeçalho
 * com os botões, contadores, abas, filtros e a lista, com as MESMAS alturas.
 */
export default function CarregandoAlertas() {
  return (
    <div role="status" aria-live="polite" className="min-w-0">
      <span className="sr-only">Carregando a fila de alertas…</span>
      <EsqueletoCabecalhoPagina acoes />
      <EsqueletoFilaAlertas />
    </div>
  );
}
