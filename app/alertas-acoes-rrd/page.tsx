import type { Metadata } from "next";

import { CartaoEntrar } from "@/components/alertas/cartao-entrar";
import { ehAbaFila } from "@/components/alertas/apresentacao";
import { PainelAlertas } from "@/components/alertas/painel-alertas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { PADRAO_ALERTA_ID } from "@/lib/alertas/dominio";
import { obterSessao } from "@/lib/auth/sessao";
import { sessaoPublica } from "@/lib/auth/tipos";
import { itemDaRota } from "@/lib/navegacao";

/*
 * Alertas & Ações RRD — fila e emissão de alertas da Sala (docs/fase-1.md §4).
 *
 * A sessão é lida no servidor (contrato de lib/auth/sessao.ts; o navegador
 * recebe só a parte pública, sem o sid). Sem sessão, nenhuma fila: só o
 * convite para entrar pelo GeoRescue. Com sessão, o PainelAlertas lê
 * /api/alertas no navegador (sem cache: dado recortado por usuário) e
 * oferece só as ações que as capacidades da sessão permitem; o servidor
 * confere tudo de novo. ?alerta=AL-… abre o detalhe; ?aba=… escolhe a aba.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/alertas-acoes-rrd");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

function primeiro(valor: string | string[] | undefined): string | null {
  return (Array.isArray(valor) ? valor[0] : valor) ?? null;
}

export default async function PaginaAlertasAcoesRrd({ searchParams }: PageProps<"/alertas-acoes-rrd">) {
  const [sessao, busca] = await Promise.all([obterSessao(), searchParams]);

  if (!sessao) {
    return (
      <>
        <CabecalhoPagina titulo={modulo.rotulo} subtitulo={modulo.descricao} icone={modulo.icone} />
        <CartaoEntrar />
      </>
    );
  }

  const alerta = primeiro(busca.alerta);
  const aba = primeiro(busca.aba);
  return (
    <PainelAlertas
      sessao={sessaoPublica(sessao)}
      alertaInicial={alerta && PADRAO_ALERTA_ID.test(alerta) ? alerta : null}
      abaInicial={ehAbaFila(aba) ? aba : null}
    />
  );
}
