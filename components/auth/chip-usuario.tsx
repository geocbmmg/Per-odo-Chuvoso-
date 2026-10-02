import { unstable_rethrow } from "next/navigation";

import { obterSessaoComOrigem, type SessaoComOrigem } from "@/lib/auth/sessao";
import { ROTULOS_PAPEL_SALA } from "@/lib/auth/tipos";

import { MenuUsuario, type DadosChipUsuario } from "./menu-usuario";

function dadosDoChip({ sessao, origem }: SessaoComOrigem): DadosChipUsuario {
  return {
    nome: sessao.nome,
    posto: sessao.posto,
    rotuloPapel: ROTULOS_PAPEL_SALA[sessao.papel],
    escopo: sessao.escopoGlobal || sessao.cobs.length === 0 ? "Estado inteiro" : sessao.cobs.join(", "),
    unidade: sessao.unidade,
    expiraEm: sessao.expiraEm,
    demonstracao: sessao.demonstracao,
    implicita: origem === "demonstracao-implicita",
  };
}

/**
 * Chip do usuário para o cabeçalho (Server Component): lê a sessão do cookie
 * no servidor e entrega ao menu só o necessário para exibir — nada de sid,
 * pseudônimo ou CPF chega ao navegador por aqui. Falha ao ler a sessão vira
 * "não logado" (o cabeçalho nunca cai por causa do login).
 */
export async function ChipUsuario() {
  let atual: SessaoComOrigem | null = null;
  try {
    atual = await obterSessaoComOrigem();
  } catch (erro) {
    unstable_rethrow(erro);
    console.error("[cabecalho] não foi possível ler a sessão", erro instanceof Error ? erro.name : typeof erro);
  }
  return <MenuUsuario usuario={atual ? dadosDoChip(atual) : null} />;
}
