import { identificadorDaConta, pseudonimoUsuario } from "./pseudonimo";
import { DURACAO_MAXIMA_SESSAO_S } from "./token";
import type { PapelSala, Sessao } from "./tipos";

/**
 * Perfis fictícios do modo demonstração (DADOS_EXEMPLO=1). A tela /entrar os
 * oferece em "Entrar como (demonstração)"; o login emite a MESMA sessão
 * assinada do login real, com `demonstracao: true`, sem chamar o GeoRescue.
 * Nomes e unidades são fictícios; nenhum CPF existe aqui. PURO.
 */

export const PERFIS_DEMONSTRACAO = ["operador-sala", "unidade", "leitura"] as const satisfies readonly PapelSala[];
export type PerfilDemonstracao = (typeof PERFIS_DEMONSTRACAO)[number];

interface ModeloPerfil {
  titulo: string;
  descricao: string;
  nome: string;
  posto: string | null;
  papelGeoRescue: string;
  cobs: string[];
  escopoGlobal: boolean;
  /** true: recebe o grupo da Sala (SALA_GRUPO_OPERADOR). */
  grupoSala: boolean;
  unidade: string | null;
}

const MODELOS: Record<PerfilDemonstracao, ModeloPerfil> = {
  "operador-sala": {
    titulo: "Operador da Sala",
    descricao: "Emite, edita, cancela e encerra alertas; vê o Estado inteiro.",
    nome: "Operador de demonstração",
    posto: null,
    papelGeoRescue: "operacional",
    cobs: [],
    escopoGlobal: true,
    grupoSala: true,
    unidade: "Sala de Situação",
  },
  unidade: {
    titulo: "Unidade — 3º COB / 4º BBM",
    descricao: "Vê os alertas do 3º COB, dá ciência e registra ação RRD.",
    nome: "Unidade de demonstração",
    posto: null,
    papelGeoRescue: "operador",
    cobs: ["3º COB"],
    escopoGlobal: false,
    grupoSala: false,
    unidade: "4BBM (JUIZ DE FORA)",
  },
  leitura: {
    titulo: "Leitura",
    descricao: "Só consulta a fila, recortada no 1º COB.",
    nome: "Leitura de demonstração",
    posto: null,
    papelGeoRescue: "visualizador",
    cobs: ["1º COB"],
    escopoGlobal: false,
    grupoSala: false,
    unidade: "1BBM (BELO HORIZONTE)",
  },
};

export interface OpcaoPerfilDemonstracao {
  id: PerfilDemonstracao;
  titulo: string;
  descricao: string;
}

/** O que a tela /entrar lista (sem dado de sessão). */
export const OPCOES_PERFIL_DEMONSTRACAO: readonly OpcaoPerfilDemonstracao[] = PERFIS_DEMONSTRACAO.map((id) => ({
  id,
  titulo: MODELOS[id].titulo,
  descricao: MODELOS[id].descricao,
}));

export function perfilDemonstracaoValido(valor: unknown): valor is PerfilDemonstracao {
  return typeof valor === "string" && (PERFIS_DEMONSTRACAO as readonly string[]).includes(valor);
}

/** Sessão do perfil fictício: mesmo formato da real, com `demonstracao: true`. */
export function sessaoDemonstracao(
  perfil: PerfilDemonstracao,
  opcoes: { sid: string; chavePseudonimo: string; grupoOperador: string; agoraMs?: number },
): Sessao {
  const m = MODELOS[perfil];
  const agoraMs = opcoes.agoraMs ?? Date.now();
  return {
    sid: opcoes.sid,
    usuarioId: pseudonimoUsuario(identificadorDaConta({ demonstracao: perfil }), opcoes.chavePseudonimo),
    nome: m.nome,
    posto: m.posto,
    bm: null,
    papel: perfil,
    papelGeoRescue: m.papelGeoRescue,
    cobs: [...m.cobs],
    escopoGlobal: m.escopoGlobal,
    grupos: m.grupoSala ? [opcoes.grupoOperador] : [],
    unidade: m.unidade,
    // Em segundos inteiros, como o `exp` do cookie: a resposta do login e a sessão relida coincidem.
    expiraEm: new Date(Math.floor(agoraMs / 1000) * 1000 + DURACAO_MAXIMA_SESSAO_S * 1000).toISOString(),
    demonstracao: true,
  };
}
