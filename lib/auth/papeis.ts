import type { RotuloCob } from "@/lib/dominio/tipos";
import { compararCobs, normalizarRotuloCob, SEDES_COBS } from "@/lib/territorio";

import type { PapelSala } from "./tipos";

/**
 * Papel da Sala a partir do que o login do GeoRescue devolve (docs/fase-1.md,
 * seção 3.3). PURO: sem rede, sem Next, sem segredo — a tabela inteira é
 * testada em tests/auth-papeis.test.ts.
 *
 * | Papel na Sala   | Regra (dados do login do GeoRescue)                                    |
 * |-----------------|------------------------------------------------------------------------|
 * | admin           | papel `administrador` (o de emergência, das variáveis do GeoRescue)    |
 * | operador-sala   | grupo SALA_GRUPO_OPERADOR + papel gerenciador, operador ou operacional |
 * | unidade         | papel operador (Gestor) ou operacional (Operador); COB pelos domínios  |
 * | leitura         | visualizador no(s) próprio(s) COB(s); gerenciador sem o grupo: Estado  |
 * | negado          | conta não ativa, troca de senha pendente, papel desconhecido, ou sem   |
 * |                 | domínio nem grupo (falha fechada)                                      |
 *
 * Decisões desta implementação (a confirmar com a equipe, seção 9):
 * - **Exceção do CEB:** Gestor/Operador com o domínio CEB alcança todos os COBs
 *   (`escopoGlobal`), a mesma regra do `op_total` do GeoRescue
 *   (`operacoes_total_do_cadastro`, acesso.py). Visualizador do CEB não ganha a
 *   exceção — no GeoRescue ela também é só de quem edita.
 * - **Domínio que não é COB** (CG, EMBM, DRH…) não dá recorte na Sala, que separa
 *   os alertas por COB. Sem nenhum COB (e sem escopo global), a conta é recusada
 *   com mensagem própria, em vez de entrar e não enxergar nada.
 * - **Visualizador com o grupo da Sala** entra como leitura do Estado inteiro: o
 *   grupo é o da própria Sala de Situação, que acompanha MG toda.
 *
 * Domínios chegam como NOME ("1º COB", derivado da unidade) ou como CÓDIGO
 * ("1COB", marcado na conta): os dois passam por `normalizarRotuloCob`.
 * ⚠️ No GeoRescue a chave `operador` aparece na tela como "Gestor" e a chave
 * `operacional` como "Operador" — aqui se compara sempre a CHAVE.
 */

export const PAPEIS_GEORESCUE = ["administrador", "gerenciador", "operador", "operacional", "visualizador"] as const;
export type PapelGeoRescue = (typeof PAPEIS_GEORESCUE)[number];

/** Rótulo que a TELA do GeoRescue mostra para cada chave (operador = Gestor; operacional = Operador). */
export const ROTULOS_PAPEL_GEORESCUE: Record<PapelGeoRescue, string> = {
  administrador: "Administrador",
  gerenciador: "Gerenciador",
  operador: "Gestor",
  operacional: "Operador",
  visualizador: "Visualizador",
};

/** Papéis do GeoRescue que editam (ver/editar/excluir em `PAPEIS`, acesso.py). */
const PAPEIS_DE_EDICAO: readonly PapelGeoRescue[] = ["gerenciador", "operador", "operacional"];

/** Domínio do GeoRescue com a exceção de operações em todo o Estado (`DOMINIO_OPERACOES_TOTAL`). */
export const DOMINIO_CEB = "CEB";

const COBS_MG = new Set<string>(SEDES_COBS.map((s) => s.cob));

export interface DadosAcessoGeoRescue {
  /** Chave do papel no GeoRescue (`papel` da resposta do login). */
  papel: string;
  /** Domínios TERRITORIAIS (`dominios` da resposta), em código ou nome. */
  dominios: readonly string[];
  /** Domínios de GRUPO (`gr_dgrupo` do token). */
  grupos: readonly string[];
  /** `gr_situacao` do token; ausente = ativo (o GeoRescue só emite token para conta ativa). */
  situacao?: string | null;
  /** `troca_senha` da resposta (ou `gr_troca` do token). */
  trocaSenha: boolean;
  /** `gr_optotal` do token: a exceção do CEB já derivada pelo GeoRescue. */
  operacoesTotal?: boolean;
}

export type MotivoNegado = "conta_inativa" | "troca_senha" | "papel_desconhecido" | "sem_dominio" | "sem_cob";

export type AcessoSala =
  | {
      ok: true;
      papel: PapelSala;
      /** COBs do escopo, no rótulo canônico e em ordem ("1º COB", "3º COB"). */
      cobs: RotuloCob[];
      escopoGlobal: boolean;
      /** Grupos do GeoRescue, sem repetição (inclui o da Sala quando houver). */
      grupos: string[];
      /** Qual linha da tabela decidiu (para teste e diagnóstico). */
      regra: string;
    }
  | { ok: false; motivo: MotivoNegado; mensagem: string };

export const MENSAGENS_NEGADO: Record<MotivoNegado, string> = {
  conta_inativa: "Sua conta no GeoRescue não está ativa. Procure o administrador do GeoRescue.",
  troca_senha: "Troque a senha no GeoRescue antes de entrar na Sala de Situação.",
  papel_desconhecido:
    "Sua conta no GeoRescue está sem um papel que a Sala reconheça. Procure o administrador do GeoRescue.",
  sem_dominio:
    "Sua conta no GeoRescue não tem domínio nem grupo de acesso. Procure o administrador do GeoRescue.",
  sem_cob:
    "Sua conta no GeoRescue não tem COB associado, e a Sala recorta os alertas por COB. " +
    "Procure o administrador do GeoRescue.",
};

/** Chave de comparação de domínio/grupo: sem acento, maiúscula, só letras e dígitos ("Sala " = "SALA"). */
export function chaveDominio(valor: string): string {
  return valor
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Papel do GeoRescue conhecido, ou null (papel vazio/desconhecido nega tudo, como o `pode()` do GeoRescue). */
export function papelGeoRescue(valor: string | null | undefined): PapelGeoRescue | null {
  const chave = String(valor ?? "").trim().toLowerCase();
  return (PAPEIS_GEORESCUE as readonly string[]).includes(chave) ? (chave as PapelGeoRescue) : null;
}

/** COBs de MG presentes nos domínios (código ou nome), sem repetição e em ordem. */
export function cobsDosDominios(dominios: readonly string[]): RotuloCob[] {
  const cobs = new Set<RotuloCob>();
  for (const d of dominios) {
    const cob = normalizarRotuloCob(d);
    if (cob && COBS_MG.has(cob)) cobs.add(cob);
  }
  return [...cobs].sort(compararCobs);
}

function semRepetir(valores: Iterable<string>): string[] {
  const vistos = new Map<string, string>();
  for (const v of valores) {
    const texto = v.trim();
    const chave = chaveDominio(texto);
    if (chave && !vistos.has(chave)) vistos.set(chave, texto);
  }
  return [...vistos.values()];
}

function negado(motivo: MotivoNegado): AcessoSala {
  return { ok: false, motivo, mensagem: MENSAGENS_NEGADO[motivo] };
}

/**
 * Aplica a tabela da seção 3.3. A ordem é a regra: situação e troca de senha
 * ANTES do papel (suspender tem de tirar tudo), papel desconhecido nega, e só
 * então grupo, papel e domínios.
 */
export function acessoNaSala(dados: DadosAcessoGeoRescue, config: { grupoOperador: string }): AcessoSala {
  const situacao = String(dados.situacao ?? "ativo").trim().toLowerCase();
  if (situacao !== "ativo") return negado("conta_inativa");
  if (dados.trocaSenha) return negado("troca_senha");

  const papel = papelGeoRescue(dados.papel);
  if (!papel) return negado("papel_desconhecido");

  // Grupo da Sala: em gr_dgrupo; por tolerância a um GeoRescue anterior à
  // separação territorial × grupo, também quando vier misturado em `dominios`.
  const chaveGrupo = chaveDominio(config.grupoOperador);
  const doGrupoNosDominios = dados.dominios.filter((d) => chaveDominio(d) === chaveGrupo);
  const grupos = semRepetir([...dados.grupos, ...doGrupoNosDominios]);
  const temGrupoSala = chaveGrupo !== "" && grupos.some((g) => chaveDominio(g) === chaveGrupo);

  const cobs = cobsDosDominios(dados.dominios);
  const temCeb = dados.dominios.some((d) => chaveDominio(d) === DOMINIO_CEB);
  const ok = (papelSala: PapelSala, escopoGlobal: boolean, regra: string): AcessoSala => ({
    ok: true,
    papel: papelSala,
    cobs,
    escopoGlobal,
    grupos,
    regra,
  });

  if (papel === "administrador") return ok("admin", true, "administrador");
  if (temGrupoSala && PAPEIS_DE_EDICAO.includes(papel)) return ok("operador-sala", true, "grupo-sala");
  if (papel === "gerenciador") return ok("leitura", true, "gerenciador-sem-grupo");

  const semNada = dados.dominios.every((d) => !d.trim()) && grupos.length === 0;

  if (papel === "operador" || papel === "operacional") {
    if (temCeb || dados.operacoesTotal === true) return ok("unidade", true, "unidade-ceb");
    if (cobs.length > 0) return ok("unidade", false, "unidade-cob");
    return negado(semNada ? "sem_dominio" : "sem_cob");
  }

  // visualizador
  if (temGrupoSala) return ok("leitura", true, "visualizador-grupo-sala");
  if (cobs.length > 0) return ok("leitura", false, "visualizador-cob");
  return negado(semNada ? "sem_dominio" : "sem_cob");
}
