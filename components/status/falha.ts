import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { statusDaFonte } from "@/lib/fontes/leituras";
import { FonteIndisponivelError, type FonteId } from "@/lib/fontes/tipos";

export interface DescricaoFalha {
  fonte: string;
  mensagem: string;
  ultimaTentativaEm: string | null;
}

/**
 * Converte o motivo de uma promessa rejeitada (Promise.allSettled) nas props de
 * <CartaoFonteIndisponivel>. FonteIndisponivelError traz a mensagem da fonte;
 * qualquer outro erro vira uma mensagem genérica (o detalhe vai só para o log).
 * Uso no servidor (páginas).
 */
export function descreverFalha(motivo: unknown, fontePadrao: FonteId): DescricaoFalha {
  if (motivo instanceof FonteIndisponivelError) {
    return {
      fonte: CATALOGO_FONTES[motivo.fonte]?.nome ?? motivo.fonte,
      mensagem: motivo.message || "A fonte não respondeu.",
      ultimaTentativaEm: statusDaFonte(motivo.fonte).ultimaTentativaEm,
    };
  }
  console.error(`[pagina] erro inesperado ao montar o bloco de ${fontePadrao}`, motivo);
  return {
    fonte: CATALOGO_FONTES[fontePadrao].nome,
    mensagem: "Erro inesperado ao montar este bloco. Tente atualizar a página em instantes.",
    ultimaTentativaEm: statusDaFonte(fontePadrao).ultimaTentativaEm,
  };
}
