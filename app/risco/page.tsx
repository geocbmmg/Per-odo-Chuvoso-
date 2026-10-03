import type { Metadata } from "next";

import { PainelRisco } from "@/components/risco/painel-risco";
import { itemDaRota } from "@/lib/navegacao";

/*
 * Mapa de Risco — chuva prevista e camadas de risco por município no modelo
 * do GeoRisk (docs/fase-1.md §5 e §6). A seleção (?camada=…&janela=…&nivel=…)
 * mora na URL e é lida no navegador pelo PainelRisco (useSearchParams), que
 * também a grava ao trocar a pintura; os dados (/api/chuva, /api/risco) e a
 * malha municipal são lidos no navegador, e o painel se atualiza sozinho com a
 * aba visível. O mapa (MapLibre) carrega só no cliente.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/risco");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default function PaginaRisco() {
  return <PainelRisco />;
}
