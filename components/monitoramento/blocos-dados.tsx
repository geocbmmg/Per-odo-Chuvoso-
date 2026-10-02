import type { Resultado } from "@/components/comum/resultado";
import { CartaoFonteIndisponivel } from "@/components/status/cartao-fonte-indisponivel";
import { descreverFalha } from "@/components/status/falha";
import { linkSeguro } from "@/components/status/formatos";
import type { PrevisaoLocal } from "@/lib/dominio/tipos";
import type { Leitura } from "@/lib/fontes/tipos";
import { mesorregioesMg, type AvisoInmetVigente } from "@/lib/sources/inmet";

import { BlocoAvisos, TITULO_BLOCO_AVISOS } from "./bloco-avisos";
import { BlocoPrevisao, TITULO_BLOCO_PREVISAO } from "./bloco-previsao";
import type { AvisoVisao } from "./tipos";

/*
 * Blocos do Monitoramento como Server Components async: cada um espera só a
 * promessa da SUA fonte (iniciada pela página) dentro do próprio <Suspense>.
 * Se a fonte falhar sem leitura anterior (FonteIndisponivelError), só aquele
 * bloco vira o cartão "fonte indisponível".
 */

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

export async function BlocoAvisosDados({
  resultado,
}: {
  resultado: Promise<Resultado<Leitura<AvisoInmetVigente[]>>>;
}) {
  const r = await resultado;
  if (!r.ok) {
    return <CartaoFonteIndisponivel titulo={TITULO_BLOCO_AVISOS} {...descreverFalha(r.motivo, "inmet-avisos")} />;
  }
  const leitura = r.valor;
  return (
    <BlocoAvisos
      avisos={leitura.dados.map(paraVisao)}
      atualizadoEm={leitura.atualizadoEm}
      origem={leitura.origem}
      erro={leitura.erro}
    />
  );
}

export async function BlocoPrevisaoDados({
  resultado,
  agora,
}: {
  resultado: Promise<Resultado<Leitura<PrevisaoLocal[]>>>;
  agora: Date;
}) {
  const r = await resultado;
  if (!r.ok) {
    return (
      <CartaoFonteIndisponivel titulo={TITULO_BLOCO_PREVISAO} {...descreverFalha(r.motivo, "open-meteo-previsao")} />
    );
  }
  const leitura = r.valor;
  return (
    <BlocoPrevisao
      previsoes={leitura.dados}
      atualizadoEm={leitura.atualizadoEm}
      origem={leitura.origem}
      erro={leitura.erro}
      agora={agora}
    />
  );
}
