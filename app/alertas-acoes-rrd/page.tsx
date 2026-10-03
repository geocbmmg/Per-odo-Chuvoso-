import type { Metadata } from "next";

import { caminhoDaFila, lerBuscaDaFila } from "@/components/alertas/apresentacao";
import { CartaoEntrar } from "@/components/alertas/cartao-entrar";
import { PainelAlertas } from "@/components/alertas/painel-alertas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { obterSessao } from "@/lib/auth/sessao";
import { sessaoPublica } from "@/lib/auth/tipos";
import { itemDaRota } from "@/lib/navegacao";

/*
 * Alertas & Ações RRD — fila e emissão de alertas da Sala (docs/fase-1.md §4).
 *
 * A sessão é lida no servidor (contrato de lib/auth/sessao.ts; o navegador
 * recebe só a parte pública, sem o sid). Sem sessão, nenhuma fila: só o
 * convite para entrar pelo GeoRescue — que devolve a pessoa a ESTA URL, com
 * ?alerta= e ?aba=, para o link compartilhado abrir o detalhe depois do login.
 * Com sessão, o PainelAlertas lê /api/alertas no navegador (sem cache: dado
 * recortado por usuário) e oferece só as ações que as capacidades da sessão
 * permitem; o servidor confere tudo de novo. ?alerta=AL-… abre o detalhe e
 * ?aba=… escolhe a aba: o painel lê os dois da URL (useSearchParams), que é a
 * única fonte desse estado.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/alertas-acoes-rrd");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default async function PaginaAlertasAcoesRrd({ searchParams }: PageProps<"/alertas-acoes-rrd">) {
  const [sessao, busca] = await Promise.all([obterSessao(), searchParams]);

  if (!sessao) {
    const { alerta, aba } = lerBuscaDaFila(busca);
    return (
      <>
        <CabecalhoPagina titulo={modulo.rotulo} subtitulo={modulo.descricao} icone={modulo.icone} />
        <CartaoEntrar voltar={caminhoDaFila(alerta, aba)} />
      </>
    );
  }

  return <PainelAlertas sessao={sessaoPublica(sessao)} />;
}
