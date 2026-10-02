import type { Metadata } from "next";

import { PainelRisco } from "@/components/risco/painel-risco";
import { lerSelecaoDaUrl } from "@/lib/mapa/risco";
import { itemDaRota } from "@/lib/navegacao";

/*
 * Mapa de Risco — chuva prevista e camadas de risco por município no modelo
 * do GeoRisk (docs/fase-1.md §5 e §6). A página só lê a seleção da URL
 * (?camada=…&janela=…&nivel=…); os dados (/api/chuva, /api/risco) e a malha
 * municipal são lidos no navegador pelo PainelRisco, que se atualiza sozinho
 * com a aba visível. O mapa (MapLibre) carrega só no cliente.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/risco");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default async function PaginaRisco({ searchParams }: PageProps<"/risco">) {
  const selecao = lerSelecaoDaUrl(await searchParams);
  return <PainelRisco selecaoInicial={selecao} />;
}
