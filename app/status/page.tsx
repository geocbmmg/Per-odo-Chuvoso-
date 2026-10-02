import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { BotaoAtualizar } from "@/components/status/botao-atualizar";
import { CartaoFonteIndisponivel } from "@/components/status/cartao-fonte-indisponivel";
import { ComoCalculado } from "@/components/status/como-calculado";
import { ConfiguracaoStatus } from "@/components/status/configuracao";
import { GRUPOS_FONTES, GrupoFontes } from "@/components/status/lista-fontes";
import { ResumoStatus } from "@/components/status/resumo-status";
import { obterPainelStatus, type PainelStatus } from "@/lib/dados/status";
import { itemDaRota } from "@/lib/navegacao";

/*
 * Status das fontes — estado de cada fonte de dados (ok, atrasada, fora do ar…),
 * com o diagnóstico de campos das camadas ArcGIS. Renderizada a cada requisição.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/status");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

async function lerPainel(): Promise<{ painel: PainelStatus } | { erro: string }> {
  try {
    return { painel: await obterPainelStatus() };
  } catch (erro) {
    console.error("[status] falha ao montar o painel de status", erro);
    return { erro: "Não foi possível montar o painel de status agora. Tente atualizar em instantes." };
  }
}

export default async function PaginaStatus() {
  const resultado = await lerPainel();
  const agora = new Date();

  return (
    <>
      <CabecalhoPagina
        titulo={modulo.rotulo}
        subtitulo="Estado de cada fonte de dados: ok, atrasada ou fora do ar"
        icone={modulo.icone}
        acoes={
          <>
            {"painel" in resultado ? (
              <CarimboAtualizacao
                atualizadoEm={resultado.painel.geradoEm}
                origem={resultado.painel.modoExemplo ? "exemplo" : "ao-vivo"}
                fonte="Verificação das fontes"
              />
            ) : null}
            <BotaoAtualizar href="/status" />
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
        {"painel" in resultado ? (
          <>
            {resultado.painel.modoExemplo ? (
              <p
                role="note"
                className="flex items-start gap-2.5 rounded-[9px] border border-info/30 bg-info/8 px-3.5 py-2.5 text-[13px] leading-snug text-ink-2"
              >
                <FlaskConical aria-hidden="true" className="mt-px size-4 shrink-0 text-info-txt" />
                <span>
                  <span className="font-bold text-info-txt">Modo de demonstração ativo (DADOS_EXEMPLO=1). </span>
                  As fontes implementadas não são consultadas: todas aparecem como EXEMPLO, e os diagnósticos
                  refletem os dados fictícios.
                </span>
              </p>
            ) : null}

            <ResumoStatus painel={resultado.painel} />

            <ConfiguracaoStatus configuracao={resultado.painel.configuracao} modoExemplo={resultado.painel.modoExemplo} />

            {GRUPOS_FONTES.map((g) => (
              <GrupoFontes
                key={g.grupo}
                grupo={g.grupo}
                icone={g.icone}
                descricao={g.descricao}
                fontes={resultado.painel.fontes.filter((f) => f.definicao.grupo === g.grupo)}
                agora={agora}
              />
            ))}

            <ComoCalculado />
          </>
        ) : (
          <>
            <CartaoFonteIndisponivel
              titulo="Painel de status"
              fonte="Verificação das fontes"
              mensagem={resultado.erro}
              mostrarLinkStatus={false}
            />
            <ComoCalculado />
          </>
        )}
      </div>
    </>
  );
}
