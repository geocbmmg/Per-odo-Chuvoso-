import { EsqueletoCabecalhoPagina } from "@/components/comum/esqueleto-cabecalho";
import { ALTURA_MAPA_RISCO } from "@/components/risco/altura";
import { EsqueletoPainelRisco } from "@/components/risco/esqueletos";

/**
 * Esqueleto do Mapa de Risco (no lugar do da Visão Geral, que é o da raiz):
 * cabeçalho com a faixa do seletor de camada, o mapa e a lista, com as MESMAS alturas.
 */
export default function CarregandoRisco() {
  return (
    <div role="status" aria-live="polite" className="min-w-0">
      <span className="sr-only">Carregando o mapa de risco…</span>
      <EsqueletoCabecalhoPagina faixa />
      <EsqueletoPainelRisco altura={ALTURA_MAPA_RISCO} />
    </div>
  );
}
