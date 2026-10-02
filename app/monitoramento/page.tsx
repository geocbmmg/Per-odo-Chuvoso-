import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { BlocoAvisos, TITULO_BLOCO_AVISOS } from "@/components/monitoramento/bloco-avisos";
import { BlocoPrevisao, TITULO_BLOCO_PREVISAO } from "@/components/monitoramento/bloco-previsao";
import type { AvisoVisao } from "@/components/monitoramento/tipos";
import { BotaoAtualizar } from "@/components/status/botao-atualizar";
import { CartaoFonteIndisponivel } from "@/components/status/cartao-fonte-indisponivel";
import { descreverFalha } from "@/components/status/falha";
import { linkSeguro } from "@/components/status/formatos";
import { itemDaRota } from "@/lib/navegacao";
import { mesorregioesMg, obterAvisosInmet, type AvisoInmetVigente } from "@/lib/sources/inmet";
import { obterPrevisaoCobs } from "@/lib/sources/open-meteo";

/*
 * Monitoramento — avisos do INMET e previsão de chuva por COB.
 * Cada bloco é independente: se uma fonte falhar sem leitura anterior
 * (FonteIndisponivelError), só aquele bloco vira o cartão "fonte indisponível".
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/monitoramento");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

function paraVisao(aviso: AvisoInmetVigente): AvisoVisao {
  const mesorregioes = mesorregioesMg(aviso.areas);
  return {
    id: aviso.id,
    evento: aviso.evento,
    severidade: aviso.severidade,
    severidadeRotulo: aviso.severidadeRotulo,
    vigencia: aviso.vigencia,
    inicio: aviso.inicio,
    fim: aviso.fim,
    descricao: aviso.descricao,
    mesorregioes,
    areasForaDeMg: Math.max(0, aviso.areas.length - mesorregioes.length),
    link: linkSeguro(aviso.link),
  };
}

export default async function PaginaMonitoramento() {
  const agora = new Date();
  const [avisos, previsao] = await Promise.allSettled([obterAvisosInmet(agora), obterPrevisaoCobs(agora)]);

  return (
    <>
      <CabecalhoPagina
        titulo={modulo.rotulo}
        subtitulo="Avisos meteorológicos e previsão de chuva por COB"
        icone={modulo.icone}
        acoes={<BotaoAtualizar href="/monitoramento" />}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {avisos.status === "fulfilled" ? (
          <BlocoAvisos
            avisos={avisos.value.dados.map(paraVisao)}
            atualizadoEm={avisos.value.atualizadoEm}
            origem={avisos.value.origem}
            erro={avisos.value.erro}
          />
        ) : (
          <CartaoFonteIndisponivel titulo={TITULO_BLOCO_AVISOS} {...descreverFalha(avisos.reason, "inmet-avisos")} />
        )}

        {previsao.status === "fulfilled" ? (
          <BlocoPrevisao
            previsoes={previsao.value.dados}
            atualizadoEm={previsao.value.atualizadoEm}
            origem={previsao.value.origem}
            erro={previsao.value.erro}
            agora={agora}
          />
        ) : (
          <CartaoFonteIndisponivel
            titulo={TITULO_BLOCO_PREVISAO}
            {...descreverFalha(previsao.reason, "open-meteo-previsao")}
          />
        )}
      </div>
    </>
  );
}
