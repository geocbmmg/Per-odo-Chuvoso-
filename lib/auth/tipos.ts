/**
 * Sessão e papéis da Sala de Situação (docs/fase-1.md, seção 3).
 *
 * O login é federado no GeoRescue: a Sala repassa CPF e senha ao
 * `/api/login` do GeoRescue, de servidor para servidor, e emite sessão própria
 * em cookie HttpOnly. O CPF nunca entra na sessão: o usuário é identificado
 * por um pseudônimo (HMAC). Puro: sem React, Next ou server-only.
 */

/**
 * Papéis da Sala, derivados do papel, dos domínios e dos grupos do GeoRescue:
 * - `operador-sala`: grupo da Sala (SALA_GRUPO_OPERADOR) com papel de edição;
 *   emite, edita, cancela e encerra alertas e vê o Estado inteiro;
 * - `unidade`: Gestor/Operador de um COB; vê os alertas do próprio COB, dá
 *   ciência e registra ação RRD;
 * - `leitura`: visualizador (ou gerenciador sem o grupo); só lê;
 * - `admin`: administrador de emergência do GeoRescue.
 */
export const PAPEIS_SALA = ["admin", "operador-sala", "unidade", "leitura"] as const;
export type PapelSala = (typeof PAPEIS_SALA)[number];

export const ROTULOS_PAPEL_SALA: Record<PapelSala, string> = {
  admin: "Administrador",
  "operador-sala": "Operador da Sala",
  unidade: "Unidade (COB/UEOp)",
  leitura: "Leitura",
};

export interface Capacidades {
  /** Criar rascunho, editar e emitir alertas. */
  emitir: boolean;
  /** Cancelar e encerrar alertas. */
  encerrar: boolean;
  /** Dar ciência como unidade destinatária. */
  darCiencia: boolean;
  /** Registrar ação RRD. */
  registrarAcao: boolean;
  /** Ver alertas de todos os COBs (sem isso, só os COBs da sessão). */
  verTodosCobs: boolean;
}

export function capacidadesDoPapel(papel: PapelSala): Capacidades {
  switch (papel) {
    case "admin":
    case "operador-sala":
      return { emitir: true, encerrar: true, darCiencia: true, registrarAcao: true, verTodosCobs: true };
    case "unidade":
      return { emitir: false, encerrar: false, darCiencia: true, registrarAcao: true, verTodosCobs: false };
    case "leitura":
      return { emitir: false, encerrar: false, darCiencia: false, registrarAcao: false, verTodosCobs: false };
  }
}

export interface Sessao {
  /** Identificador desta sessão (aleatório). */
  sid: string;
  /** Pseudônimo estável do usuário: HMAC-SHA256 do CPF com SALA_PSEUDO_SEGREDO (32 hex). Nunca o CPF. */
  usuarioId: string;
  /** Nome para exibir ao próprio usuário e para a autoria visível na fila. */
  nome: string;
  posto: string | null;
  bm: string | null;
  papel: PapelSala;
  /** Papel original no GeoRescue (gerenciador, operador, operacional, visualizador, administrador). */
  papelGeoRescue: string;
  /** COBs do escopo territorial, no rótulo canônico ("1º COB"). */
  cobs: string[];
  /** true quando o escopo alcança todos os COBs (gerenciador, administrador, exceção do CEB). */
  escopoGlobal: boolean;
  /** Domínios de grupo do GeoRescue (ex.: "SALA"). */
  grupos: string[];
  /** Unidade principal do militar no GeoRescue (ex.: "1BBM (BELO HORIZONTE)"). */
  unidade: string | null;
  /** ISO (UTC) do fim da sessão. */
  expiraEm: string;
  /** Sessão do modo demonstração (DADOS_EXEMPLO=1), sem login real. */
  demonstracao: boolean;
}

/** O que o navegador recebe de GET /api/auth/sessao: sem o sid. */
export type SessaoPublica = Omit<Sessao, "sid"> & { capacidades: Capacidades };

/** Resposta de GET /api/auth/sessao. */
export type RespostaSessao = { ok: true; sessao: SessaoPublica | null };

export function sessaoPublica(sessao: Sessao): SessaoPublica {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sid, ...resto } = sessao;
  return { ...resto, capacidades: capacidadesDoPapel(sessao.papel) };
}

/** A sessão alcança o COB? (escopo global ou COB no escopo; "Sem COB" só no global). */
export function alcancaCob(sessao: Pick<Sessao, "papel" | "cobs" | "escopoGlobal">, cob: string | null): boolean {
  if (sessao.escopoGlobal || capacidadesDoPapel(sessao.papel).verTodosCobs) return true;
  return cob !== null && sessao.cobs.includes(cob);
}
