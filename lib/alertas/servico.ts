import { alcancaCob, capacidadesDoPapel, ROTULOS_PAPEL_SALA, type Capacidades, type PapelSala, type Sessao } from "@/lib/auth/tipos";
import { buscarFracao } from "@/lib/territorio/fracoes";
import { dominioDaSessao, pseudonimoDaSessao } from "./autoria";
import { identificadorCap, identificadorMensagem, montarMensagemCap } from "./cap";
import { CODIGOS_SITUACAO, COBS_FEICAO, type SituacaoAlerta, type TipoRiscoSala } from "./codigos";
import { obterRepositorioAlertas, segredoPseudonimo } from "./config";
import {
  aceitaCienciaOuAcao,
  alertaVazio,
  aplicarCampos,
  aplicarPassos,
  areaPadrao,
  CAMPOS_TRAVADOS_APOS_EMISSAO,
  camposAlterados,
  destinatarioDaFracao,
  destinatarioDoCob,
  esquemaPedido,
  estadosDerivados,
  fracaoDoTerritorio,
  mesmaUnidade,
  passosDoRegistroDeAcao,
  podeApagar,
  podeEditar,
  prazoPadrao,
  problemasDoZod,
  resolverTerritorio,
  sugerirNivel,
  transicao,
  ueopDaUnidade,
  validarEmissao,
  type AcaoRrdSala,
  type AlertaSala,
  type CamposAlerta,
  type Destinatario,
  type EstadosDerivados,
  type EventoHistorico,
  type Pedido,
  type Problema,
} from "./dominio";
import { ErroAlertas, traduzirErro } from "./erros";
import { ErroConflito, mesmaVersao, type RepositorioAlertas, type TipoNumeracao } from "./repositorio";

/**
 * Serviço da fila de alertas: permissões, escopo de COB, autoria, numeração,
 * transições e trilha de auditoria. A rota /api/alertas só traduz HTTP.
 *
 * Regras de segurança (docs/fase-1.md §3.3, §4):
 * - capacidades pelo papel (lib/auth/tipos.ts) e escopo pelo COB (alcancaCob);
 * - autoria SEMPRE do servidor, a partir da sessão, como pseudônimo (HMAC);
 *   nada de autoria vem do corpo do pedido;
 * - alertaId, cap_identifier, datas de emissão e encerramento: do servidor;
 * - histórico só acrescenta: um evento por transição e por edição;
 * - pseudônimos de outras pessoas só para o operador da Sala.
 */

/** No máximo isto na resposta da fila (o resumo conta tudo do escopo). */
export const LIMITE_FILA = 500;
/** No máximo isto lido do armazém por consulta. */
export const LIMITE_LEITURA = 5000;
const TENTATIVAS_NUMERACAO = 5;

export interface ContextoServico {
  repositorio: RepositorioAlertas;
  agora: Date;
  /** Segredo do pseudônimo; null = não configurado (escrita recusada, pseudônimos ocultos). */
  segredo: string | null;
}

function contexto(parcial?: Partial<ContextoServico>): ContextoServico {
  const agora = parcial?.agora ?? new Date();
  return {
    agora,
    repositorio: parcial?.repositorio ?? obterRepositorioAlertas(agora),
    segredo: parcial && "segredo" in parcial ? (parcial.segredo ?? null) : segredoPseudonimo(),
  };
}

// ---------------------------------------------------------------------------------------------
// Visão do alerta para quem pediu
// ---------------------------------------------------------------------------------------------

/** O alerta como a fila mostra: com os estados derivados, destinatários e ações. */
export interface AlertaFila extends AlertaSala, EstadosDerivados {
  /** Código da fração na lista oficial (para a tela preselecionar); derivado. */
  fracaoCodigo: string | null;
  destinatarios: Destinatario[];
  acoes: AcaoRrdSala[];
  /** Só quando a fila é pedida para um alerta (?id=). */
  historico?: EventoHistorico[];
}

export interface PerfilFila {
  papel: PapelSala;
  rotulo: string;
  cobs: string[];
  escopoGlobal: boolean;
  unidade: string | null;
  demonstracao: boolean;
  /** O PRÓPRIO pseudônimo (para a tela marcar "você"); null sem segredo configurado. */
  pseudonimo: string | null;
}

export interface ResumoFila {
  total: number;
  porSituacao: Record<SituacaoAlerta, number>;
  pendentes: number;
  vencidos: number;
  vigenciaExpirada: number;
}

/** Corpo de GET /api/alertas (sem o `ok`, que a rota acrescenta). */
export interface RespostaFila {
  perfil: PerfilFila;
  capacidades: Capacidades;
  alertas: AlertaFila[];
  resumo: ResumoFila;
  truncado: boolean;
}

function vePseudonimos(sessao: Sessao): boolean {
  return sessao.papel === "admin" || sessao.papel === "operador-sala";
}

/** Esconde pseudônimos de OUTRAS pessoas de quem não é operador (o próprio continua). */
function ocultar(valor: string | null, sessao: Sessao, proprio: string | null): string | null {
  if (valor === null || vePseudonimos(sessao)) return valor;
  return proprio !== null && valor === proprio ? valor : null;
}

function visao(
  alerta: AlertaSala,
  destinatarios: readonly Destinatario[],
  acoes: readonly AcaoRrdSala[],
  sessao: Sessao,
  ctx: ContextoServico,
  historico?: readonly EventoHistorico[],
): AlertaFila {
  const proprio = ctx.segredo ? pseudonimoDaSessao(sessao, ctx.segredo) : null;
  const o = (v: string | null) => ocultar(v, sessao, proprio);
  const fila: AlertaFila = {
    ...alerta,
    criadoPorId: o(alerta.criadoPorId),
    emitidoPorId: o(alerta.emitidoPorId),
    alteradoPorId: o(alerta.alteradoPorId),
    ...estadosDerivados(alerta, ctx.agora),
    fracaoCodigo: fracaoDoTerritorio(alerta)?.codigo ?? null,
    destinatarios: destinatarios.map((d) => ({ ...d, cientePorId: o(d.cientePorId) })),
    acoes: acoes.map((a) => ({ ...a, registradoPorId: o(a.registradoPorId), alteradoPorId: o(a.alteradoPorId) })),
  };
  if (historico) fila.historico = historico.map((e) => ({ ...e, porId: o(e.porId) }));
  return fila;
}

/** Ordem da fila: vencidos, pendentes (prazo mais curto primeiro), rascunhos, ação registrada, finais. */
function prioridade(a: AlertaFila): number {
  if (a.vencido) return 0;
  if (a.pendente) return 1;
  if (a.situacao === "RASCUNHO") return 2;
  if (a.situacao === "ACAO_REGISTRADA") return 3;
  return 4;
}

function compararNaFila(a: AlertaFila, b: AlertaFila): number {
  const p = prioridade(a) - prioridade(b);
  if (p !== 0) return p;
  if (a.pendente && b.pendente) return (a.prazoAcao ?? "").localeCompare(b.prazoAcao ?? "");
  return (b.alteradoEm ?? "").localeCompare(a.alteradoEm ?? "");
}

function resumir(alertas: readonly AlertaFila[]): ResumoFila {
  const porSituacao = Object.fromEntries(CODIGOS_SITUACAO.map((s) => [s, 0])) as Record<SituacaoAlerta, number>;
  let pendentes = 0;
  let vencidos = 0;
  let vigenciaExpirada = 0;
  for (const a of alertas) {
    porSituacao[a.situacao]++;
    if (a.pendente) pendentes++;
    if (a.vencido) vencidos++;
    if (a.vigenciaExpirada && a.situacao !== "RASCUNHO" && a.situacao !== "ENCERRADO" && a.situacao !== "CANCELADO") {
      vigenciaExpirada++;
    }
  }
  return { total: alertas.length, porSituacao, pendentes, vencidos, vigenciaExpirada };
}

function perfil(sessao: Sessao, ctx: ContextoServico): PerfilFila {
  return {
    papel: sessao.papel,
    rotulo: ROTULOS_PAPEL_SALA[sessao.papel],
    cobs: sessao.cobs,
    escopoGlobal: sessao.escopoGlobal,
    unidade: sessao.unidade,
    demonstracao: sessao.demonstracao,
    pseudonimo: ctx.segredo ? pseudonimoDaSessao(sessao, ctx.segredo) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Leitura da fila
// ---------------------------------------------------------------------------------------------

/** Situações aceitas no filtro, além das gravadas: os estados derivados. */
export const FILTROS_DERIVADOS = ["PENDENTE", "VENCIDO"] as const;
export type FiltroSituacao = SituacaoAlerta | (typeof FILTROS_DERIVADOS)[number];

export interface ConsultaFila {
  so?: "fila" | "contagem";
  situacoes?: readonly FiltroSituacao[];
  cob?: string | null;
  tipo?: TipoRiscoSala | null;
  /** Um alerta só, com o histórico. */
  id?: string | null;
}

function exigirSessao(sessao: Sessao | null): Sessao {
  if (!sessao) throw new ErroAlertas(401, "sessao", "Entre com o seu usuário do GeoRescue para ver e emitir alertas.");
  return sessao;
}

function escopoDaSessao(sessao: Sessao): readonly string[] | null {
  return sessao.escopoGlobal || capacidadesDoPapel(sessao.papel).verTodosCobs ? null : sessao.cobs;
}

/** O alerta está no escopo da sessão (pelo COB do alerta ou de algum destinatário)? */
function alcancaAlerta(sessao: Sessao, alerta: AlertaSala, destinatarios: readonly Destinatario[]): boolean {
  if (alerta.situacao === "RASCUNHO" && !capacidadesDoPapel(sessao.papel).emitir) return false;
  return alcancaCob(sessao, alerta.cob) || destinatarios.some((d) => d.cob !== null && alcancaCob(sessao, d.cob));
}

function agruparPorAlerta<T extends { alertaId: string | null }>(lista: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of lista) {
    if (!item.alertaId) continue;
    const grupo = mapa.get(item.alertaId) ?? [];
    grupo.push(item);
    mapa.set(item.alertaId, grupo);
  }
  return mapa;
}

/**
 * GET /api/alertas: a fila no escopo da sessão, com estados derivados e o
 * resumo (contagens do escopo e dos filtros de COB/tipo, antes do filtro de
 * situação, para as abas da tela).
 */
export async function listarFila(
  sessaoOuNula: Sessao | null,
  consulta: ConsultaFila = {},
  parcial?: Partial<ContextoServico>,
): Promise<RespostaFila> {
  const sessao = exigirSessao(sessaoOuNula);
  try {
    const ctx = contexto(parcial);
    const capacidades = capacidadesDoPapel(sessao.papel);
    const repo = ctx.repositorio;

    let lidos: AlertaSala[];
    let truncado = false;
    if (consulta.id) {
      const alerta = await repo.obter(consulta.id);
      lidos = alerta ? [alerta] : [];
    } else {
      const lista = await repo.listar(
        {
          cobs: escopoDaSessao(sessao),
          incluirRascunhos: capacidades.emitir,
          cob: consulta.cob ?? null,
          tipo: consulta.tipo ?? null,
        },
        LIMITE_LEITURA,
      );
      lidos = lista.alertas;
      truncado = lista.truncado;
    }

    const ids = lidos.map((a) => a.alertaId);
    const [destinatarios, acoes] = await Promise.all([repo.listarDestinatarios(ids), repo.listarAcoes(ids)]);
    const destPorAlerta = agruparPorAlerta(destinatarios);
    const acoesPorAlerta = agruparPorAlerta(acoes);

    // Defesa em profundidade: o armazém já recorta, o serviço confere de novo.
    const visiveis = lidos.filter((a) => alcancaAlerta(sessao, a, destPorAlerta.get(a.alertaId) ?? []));
    if (consulta.id && visiveis.length === 0) {
      throw new ErroAlertas(404, "nao_encontrado", "Alerta não encontrado no seu escopo.");
    }
    const historico = consulta.id ? await repo.listarHistorico(consulta.id) : undefined;
    const fila = visiveis.map((a) =>
      visao(a, destPorAlerta.get(a.alertaId) ?? [], acoesPorAlerta.get(a.alertaId) ?? [], sessao, ctx, historico),
    );

    const resumo = resumir(fila);
    if (consulta.so === "contagem") {
      return { perfil: perfil(sessao, ctx), capacidades, alertas: [], resumo, truncado };
    }
    const situacoes = consulta.situacoes ?? [];
    const filtrada = fila.filter(
      (a) =>
        situacoes.length === 0 ||
        situacoes.some((s) => (s === "PENDENTE" ? a.pendente : s === "VENCIDO" ? a.vencido : a.situacao === s)),
    );
    filtrada.sort(compararNaFila);
    return {
      perfil: perfil(sessao, ctx),
      capacidades,
      alertas: filtrada.slice(0, LIMITE_FILA),
      resumo,
      truncado: truncado || filtrada.length > LIMITE_FILA,
    };
  } catch (erro) {
    throw traduzirErro(erro);
  }
}

// ---------------------------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------------------------

export interface ResultadoAcao {
  /** alertaId afetado. */
  id: string;
  /** O alerta depois da ação (null quando o rascunho foi apagado). */
  alerta: AlertaFila | null;
  /** Avisos que não bloqueiam (território aproximado, nível diferente da matriz). */
  avisos: string[];
  /** Código da ação RRD criada (registrar_acao). */
  acaoId?: string;
}

interface Autor {
  id: string;
  dominio: string | null;
}

/** "AAAAMMDD" no horário de Brasília (sem horário de verão desde 2019: UTC−3). */
export function diaBrasilia(agora: Date): string {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** Nova versão: o instante atual, sempre maior que a anterior (duas gravações no mesmo ms). */
function proximaVersao(anterior: string | null, agora: Date): string {
  const minimo = anterior ? Date.parse(anterior) + 1 : 0;
  return new Date(Math.max(agora.getTime(), Number.isNaN(minimo) ? 0 : minimo)).toISOString();
}

async function comNumeracao<T>(
  repo: RepositorioAlertas,
  tipo: TipoNumeracao,
  agora: Date,
  criar: (id: string) => Promise<T>,
): Promise<T> {
  const prefixo = `${tipo === "alerta" ? "AL" : "AC"}-${diaBrasilia(agora)}-`;
  for (let tentativa = 0; tentativa < TENTATIVAS_NUMERACAO; tentativa++) {
    const numero = await repo.proximoNumero(tipo, prefixo);
    try {
      return await criar(`${prefixo}${String(numero).padStart(4, "0")}`);
    } catch (erro) {
      if (!(erro instanceof ErroConflito)) throw erro;
    }
  }
  throw new ErroAlertas(409, "conflito", "Não foi possível numerar o registro agora (muitas gravações simultâneas). Tente de novo.");
}

function exigir(condicao: boolean, status: 403 | 409, motivo: string, mensagem: string): void {
  if (!condicao) throw new ErroAlertas(status, motivo, mensagem);
}

function evento(
  alertaId: string,
  autor: Autor,
  agora: Date,
  dados: Partial<EventoHistorico> & Pick<EventoHistorico, "evento">,
): EventoHistorico {
  return {
    objectid: null,
    alertaId,
    alvoTipo: "ALERTA",
    alvoId: alertaId,
    situacaoDe: null,
    situacaoPara: null,
    quando: agora.toISOString(),
    porId: autor.id,
    porDominio: autor.dominio,
    capIdentifier: null,
    capMsgType: null,
    capJson: null,
    camposAlterados: [],
    detalhe: null,
    ...dados,
  };
}

function rotuloUnidade(d: Pick<Destinatario, "cob" | "ueop" | "fracao">): string {
  return [d.cob, d.ueop, d.fracao].filter(Boolean).join(" · ");
}

/** "antes → depois" dos campos curtos (textos longos só pelo nome do campo). Sem dado pessoal. */
function detalheDaMudanca(antes: AlertaSala, depois: AlertaSala, campos: readonly string[]): string | null {
  const curtos = campos.filter((c) => !["descricao", "instrucao", "titulo", "areaDesc"].includes(c));
  if (curtos.length === 0) return null;
  const valor = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v).slice(0, 60));
  const a = antes as unknown as Record<string, unknown>;
  const d = depois as unknown as Record<string, unknown>;
  return curtos.map((c) => `${c}: ${valor(a[c])} → ${valor(d[c])}`).join("; ");
}

/** Carrega o alerta e confere se a sessão o enxerga. */
async function carregar(
  ctx: ContextoServico,
  sessao: Sessao,
  alertaId: string,
): Promise<{ alerta: AlertaSala; destinatarios: Destinatario[] }> {
  const alerta = await ctx.repositorio.obter(alertaId);
  if (!alerta) throw new ErroAlertas(404, "nao_encontrado", `Alerta ${alertaId} não encontrado.`);
  const destinatarios = await ctx.repositorio.listarDestinatarios([alertaId]);
  if (alerta.situacao === "RASCUNHO" && !capacidadesDoPapel(sessao.papel).emitir) {
    throw new ErroAlertas(404, "nao_encontrado", `Alerta ${alertaId} não encontrado.`);
  }
  if (!alcancaAlerta(sessao, alerta, destinatarios)) {
    throw new ErroAlertas(403, "escopo", "Este alerta é de um COB fora do seu escopo.");
  }
  return { alerta, destinatarios };
}

async function visaoAtual(ctx: ContextoServico, sessao: Sessao, alertaId: string): Promise<AlertaFila | null> {
  const alerta = await ctx.repositorio.obter(alertaId);
  if (!alerta) return null;
  const [destinatarios, acoes] = await Promise.all([
    ctx.repositorio.listarDestinatarios([alertaId]),
    ctx.repositorio.listarAcoes([alertaId]),
  ]);
  return visao(alerta, destinatarios, acoes, sessao, ctx);
}

// ----- território e destinatários (rascunho) -----

interface TerritorioDoPedido {
  campos: Pick<AlertaSala, "cob" | "ueop" | "fracao" | "municipio" | "codIbge">;
  destinatarios: Destinatario[];
  avisos: string[];
}

/**
 * Resolve o território e a lista de destinatários do rascunho: a principal
 * sai da fração; os adicionais, da lista oficial ou do COB.
 */
function territorioDoPedido(atual: AlertaSala, campos: CamposAlerta, destinatariosAtuais: readonly Destinatario[]): TerritorioDoPedido {
  const fracaoAtual = fracaoDoTerritorio(atual)?.codigo ?? null;
  const resolvido = resolverTerritorio(
    {
      fracao: campos.fracao !== undefined ? campos.fracao : fracaoAtual,
      codIbge: campos.codIbge !== undefined ? campos.codIbge : campos.municipio !== undefined ? null : atual.codIbge,
      municipio: campos.municipio !== undefined ? campos.municipio : null,
    },
    false,
  );
  const erros: Problema[] = [...resolvido.erros];

  const principal = resolvido.fracaoOficial ? destinatarioDaFracao(atual.alertaId, resolvido.fracaoOficial, true) : null;
  let adicionais: Destinatario[];
  if (campos.destinatarios !== undefined) {
    adicionais = [];
    campos.destinatarios.forEach((d, i) => {
      if (d.fracao) {
        const f = buscarFracao(d.fracao);
        if (!f) erros.push({ campo: `destinatarios.${i}.fracao`, mensagem: "Fração fora da lista oficial do CBMMG." });
        else adicionais.push(destinatarioDaFracao(atual.alertaId, f, false));
      } else if (d.cob && (COBS_FEICAO as readonly string[]).includes(d.cob)) {
        adicionais.push(destinatarioDoCob(atual.alertaId, d.cob));
      }
    });
  } else {
    adicionais = destinatariosAtuais.filter((d) => !d.principal).map((d) => ({ ...d, objectid: null }));
  }
  if (erros.length) throw new ErroAlertas(400, "entrada_invalida", "Confira o território do alerta.", erros);

  // Sem repetir unidade (a principal vence).
  const lista: Destinatario[] = principal ? [principal] : [];
  for (const d of adicionais) if (!lista.some((x) => mesmaUnidade(x, d))) lista.push(d);
  return { campos: resolvido.territorio, destinatarios: lista, avisos: resolvido.avisos };
}

function mesmosDestinatarios(a: readonly Destinatario[], b: readonly Destinatario[]): boolean {
  const chave = (d: Destinatario) => `${d.cob}|${d.ueop}|${d.fracao}|${d.principal}|${d.destNivel}`;
  return JSON.stringify(a.map(chave).sort()) === JSON.stringify(b.map(chave).sort());
}

function avisoDeNivel(alerta: AlertaSala): string | null {
  if (!alerta.tipoRisco || !alerta.nivelAlerta) return null;
  const sugestao = sugerirNivel(alerta.tipoRisco, alerta);
  if (sugestao.nivel && sugestao.nivel !== alerta.nivelAlerta) {
    return `O nível escolhido (${alerta.nivelAlerta}) difere do sugerido pela matriz (${sugestao.nivel}). ${sugestao.fundamento}`;
  }
  return null;
}

// ----- salvar (criar / editar) -----

type PedidoSalvar = Extract<Pedido, { acao: "salvar" | "emitir" }>;

function camposDoPedido(p: PedidoSalvar): CamposAlerta {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { acao, alertaId, alteradoEm, ...campos } = p;
  return campos;
}

async function criarRascunho(
  p: PedidoSalvar,
  sessao: Sessao,
  ctx: ContextoServico,
  autor: Autor,
): Promise<{ alerta: AlertaSala; avisos: string[] }> {
  const campos = camposDoPedido(p);
  const repo = ctx.repositorio;
  let loteId: string | null = null;
  if (campos.mesmoLoteDe) {
    const outro = await repo.obter(campos.mesmoLoteDe);
    if (!outro) throw new ErroAlertas(400, "entrada_invalida", "O alerta do lote informado não existe.", [
      { campo: "mesmoLoteDe", mensagem: "Alerta não encontrado." },
    ]);
    loteId = outro.loteId ?? outro.alertaId;
  }
  const base = aplicarCampos(alertaVazio(""), campos);
  const territorio = territorioDoPedido(base, campos, []);
  exigir(
    territorio.campos.cob === null || alcancaCob(sessao, territorio.campos.cob),
    403,
    "escopo",
    "A fração escolhida é de um COB fora do seu escopo.",
  );
  const agoraIso = ctx.agora.toISOString();

  const gravado = await comNumeracao(repo, "alerta", ctx.agora, (alertaId) =>
    repo.criar({
      ...base,
      ...territorio.campos,
      alertaId,
      loteId: loteId ?? alertaId,
      situacao: "RASCUNHO",
      origemRegistro: "SALA",
      capIdentifier: null,
      capMsgType: null,
      criadoPorId: autor.id,
      criadoEm: agoraIso,
      alteradoPorId: autor.id,
      alteradoEm: agoraIso,
    }),
  );
  if (territorio.destinatarios.length > 0) {
    await repo.substituirDestinatarios(
      gravado.alertaId,
      territorio.destinatarios.map((d) => ({ ...d, alertaId: gravado.alertaId, criadoEm: agoraIso, alteradoEm: agoraIso })),
    );
  }
  const preenchidos = camposAlterados(alertaVazio(gravado.alertaId), gravado, [
    "objectid",
    "alertaId",
    "loteId",
    "criadoPorId",
    "criadoEm",
    "alteradoPorId",
    "alteradoEm",
    "longitude",
    "latitude",
  ]);
  await repo.acrescentarHistorico([
    evento(gravado.alertaId, autor, ctx.agora, { evento: "CRIADO", situacaoPara: "RASCUNHO", camposAlterados: preenchidos }),
  ]);
  return { alerta: gravado, avisos: territorio.avisos };
}

async function editar(
  atual: AlertaSala,
  destinatariosAtuais: readonly Destinatario[],
  p: PedidoSalvar,
  versaoLida: string,
  ctx: ContextoServico,
  autor: Autor,
): Promise<{ alerta: AlertaSala; avisos: string[] }> {
  exigir(podeEditar(atual.situacao), 409, "transicao_invalida", `Um alerta ${atual.situacao.toLowerCase()} não pode ser editado.`);
  const campos = camposDoPedido(p);
  const repo = ctx.repositorio;
  const emitido = atual.situacao !== "RASCUNHO";
  if (campos.mesmoLoteDe) {
    throw new ErroAlertas(400, "entrada_invalida", "O lote só é escolhido na criação do alerta.", [
      { campo: "mesmoLoteDe", mensagem: "Só na criação." },
    ]);
  }

  let novo = aplicarCampos(atual, campos);
  let destinatarios: Destinatario[] | null = null;
  let avisos: string[] = [];
  if (emitido) {
    const travados = CAMPOS_TRAVADOS_APOS_EMISSAO.filter((c) => {
      if (campos[c] === undefined) return false;
      if (c === "destinatarios") return true;
      if (c === "natureza") return campos.natureza !== atual.natureza;
      if (c === "codIbge") return campos.codIbge !== atual.codIbge;
      if (c === "municipio") return campos.municipio !== atual.municipio;
      return buscarFracao(campos.fracao)?.codigo !== fracaoDoTerritorio(atual)?.codigo;
    });
    if (travados.length > 0) {
      throw new ErroAlertas(
        400,
        "campo_travado",
        "Depois de emitido, território, destinatários e natureza não mudam: cancele este alerta e emita outro.",
        travados.map((c) => ({ campo: c, mensagem: "Não pode mudar depois da emissão." })),
      );
    }
  } else if (
    campos.fracao !== undefined ||
    campos.codIbge !== undefined ||
    campos.municipio !== undefined ||
    campos.destinatarios !== undefined
  ) {
    const territorio = territorioDoPedido(atual, campos, destinatariosAtuais);
    novo = { ...novo, ...territorio.campos };
    avisos = territorio.avisos;
    if (!mesmosDestinatarios(territorio.destinatarios, destinatariosAtuais)) destinatarios = territorio.destinatarios;
  }

  const alterados = camposAlterados(atual, novo, ["alteradoEm", "alteradoPorId"]);
  if (destinatarios) alterados.push("destinatarios");
  if (alterados.length === 0) return { alerta: atual, avisos };

  novo = { ...novo, alteradoPorId: autor.id, alteradoEm: proximaVersao(atual.alteradoEm, ctx.agora) };
  let capIdentifier: string | null = null;
  let capJson: string | null = null;
  if (emitido) {
    // Atualização de alerta emitido = mensagem CAP Update; o alerta precisa continuar completo.
    const problemas = validarEmissao(novo, ctx.agora, false);
    if (problemas.length) throw new ErroAlertas(400, "entrada_invalida", "A atualização deixaria o alerta incompleto.", problemas);
    const anteriores = (await repo.listarHistorico(atual.alertaId)).filter((e) => e.capMsgType === "Update").length;
    capIdentifier = identificadorMensagem(atual.alertaId, "Update", anteriores + 1);
    novo = { ...novo, capMsgType: "Update" };
    capJson = JSON.stringify(
      montarMensagemCap(novo, "Update", capIdentifier, novo.alteradoEm ?? ctx.agora.toISOString(), {
        identificador: novo.capIdentifier ?? identificadorCap(atual.alertaId),
        enviadoEm: novo.dataEmissao,
      }),
    );
  }

  const gravado = await repo.atualizar(novo, versaoLida);
  if (destinatarios) {
    const agoraIso = ctx.agora.toISOString();
    await repo.substituirDestinatarios(
      atual.alertaId,
      destinatarios.map((d) => ({ ...d, criadoEm: d.criadoEm ?? agoraIso, alteradoEm: agoraIso })),
    );
  }
  const soPrazo = emitido && alterados.length === 1 && alterados[0] === "prazoAcao";
  await repo.acrescentarHistorico([
    evento(atual.alertaId, autor, ctx.agora, {
      evento: soPrazo ? "PRAZO_ALTERADO" : "ATUALIZADO",
      situacaoDe: atual.situacao,
      situacaoPara: gravado.situacao,
      camposAlterados: alterados,
      detalhe: detalheDaMudanca(atual, gravado, alterados),
      capIdentifier,
      capMsgType: capIdentifier ? "Update" : null,
      capJson,
    }),
  ]);
  return { alerta: gravado, avisos };
}

// ----- emitir -----

/** O alerta como fica ao ser emitido agora: datas, prazo e área padrão, CAP e autoria do servidor. */
function versaoEmitida(atual: AlertaSala, agora: Date, autor: Autor): AlertaSala {
  const agoraIso = agora.toISOString();
  return {
    ...atual,
    situacao: "EMITIDO",
    dataEmissao: agoraIso,
    inicioVigencia: atual.inicioVigencia ?? agoraIso,
    prazoAcao: atual.prazoAcao ?? (atual.nivelAlerta ? prazoPadrao(atual.nivelAlerta, agora) : null),
    areaDesc: atual.areaDesc ?? (atual.municipio ? areaPadrao(atual.municipio, atual.localReferencia) : null),
    capIdentifier: identificadorCap(atual.alertaId),
    capMsgType: "Alert",
    emitidoPorId: autor.id,
    emitidoPorDominio: autor.dominio,
    alteradoPorId: autor.id,
    alteradoEm: proximaVersao(atual.alteradoEm, agora),
  };
}

/**
 * Confere a emissão ANTES de gravar qualquer coisa: um "emitir" reprovado não
 * deixa rascunho criado nem edição gravada pela metade.
 */
function conferirEmissaoPrevia(
  base: AlertaSala,
  destinatarios: readonly Destinatario[],
  campos: CamposAlerta,
  ctx: ContextoServico,
  autor: Autor,
): void {
  if (!transicao(base.situacao, "emitir")) {
    throw new ErroAlertas(409, "transicao_invalida", `Só rascunho pode ser emitido (este está ${base.situacao.toLowerCase()}).`);
  }
  let candidato = aplicarCampos(base, campos);
  if (campos.fracao !== undefined || campos.codIbge !== undefined || campos.municipio !== undefined) {
    candidato = { ...candidato, ...territorioDoPedido(base, campos, destinatarios).campos };
  }
  const problemas = validarEmissao(versaoEmitida(candidato, ctx.agora, autor), ctx.agora);
  if (problemas.length) throw new ErroAlertas(400, "entrada_invalida", "Faltam dados para emitir o alerta.", problemas);
}

async function emitirRascunho(
  atual: AlertaSala,
  versaoLida: string | null,
  ctx: ContextoServico,
  autor: Autor,
): Promise<{ alerta: AlertaSala; avisos: string[] }> {
  const para = transicao(atual.situacao, "emitir");
  if (!para) {
    throw new ErroAlertas(409, "transicao_invalida", `Só rascunho pode ser emitido (este está ${atual.situacao.toLowerCase()}).`);
  }
  const repo = ctx.repositorio;
  const agoraIso = ctx.agora.toISOString();
  const novo = versaoEmitida(atual, ctx.agora, autor);
  const problemas = validarEmissao(novo, ctx.agora);
  if (problemas.length) throw new ErroAlertas(400, "entrada_invalida", "Faltam dados para emitir o alerta.", problemas);
  const avisos: string[] = [];
  const nivel = avisoDeNivel(novo);
  if (nivel) avisos.push(nivel);
  if (atual.cob && atual.codIbge) {
    // Mesmo aviso do rascunho: a atribuição município → COB é aproximada.
    const t = resolverTerritorio({ fracao: fracaoDoTerritorio(atual)?.codigo ?? null, codIbge: atual.codIbge, municipio: null });
    avisos.push(...t.avisos);
  }

  const gravado = await repo.atualizar(novo, versaoLida);

  // Notifica os destinatários (a principal sai da fração, se faltar).
  let destinatarios = await repo.listarDestinatarios([atual.alertaId]);
  if (destinatarios.length === 0) {
    const f = fracaoDoTerritorio(atual);
    if (f) destinatarios = await repo.substituirDestinatarios(atual.alertaId, [destinatarioDaFracao(atual.alertaId, f, true)]);
  }
  const notificados: Destinatario[] = [];
  for (const d of destinatarios) {
    notificados.push(
      await repo.atualizarDestinatario({
        ...d,
        situacaoDest: "AGUARDANDO",
        canalNotificacao: "SISTEMA",
        notificadoEm: agoraIso,
        criadoEm: d.criadoEm ?? agoraIso,
        alteradoEm: agoraIso,
      }),
    );
  }

  const capJson = JSON.stringify(montarMensagemCap(gravado, "Alert", gravado.capIdentifier ?? identificadorCap(atual.alertaId), agoraIso));
  await repo.acrescentarHistorico([
    evento(atual.alertaId, autor, ctx.agora, {
      evento: "EMITIDO",
      situacaoDe: atual.situacao,
      situacaoPara: para,
      capIdentifier: gravado.capIdentifier,
      capMsgType: "Alert",
      capJson,
    }),
    ...notificados.map((d) =>
      evento(atual.alertaId, autor, ctx.agora, {
        evento: "NOTIFICADO",
        alvoTipo: "DESTINATARIO",
        alvoId: d.objectid === null ? null : String(d.objectid),
        detalhe: `${rotuloUnidade(d)}${d.principal ? " (principal)" : ""} · SISTEMA`,
      }),
    ),
  ]);
  return { alerta: gravado, avisos };
}

// ----- ciência -----

/**
 * Destinatário da unidade da sessão: o que casa com a UEOp da sessão; senão o
 * principal; senão o primeiro do escopo. Só os que aguardam ciência.
 */
function escolherDestinatario(candidatos: readonly Destinatario[], sessao: Sessao): Destinatario | null {
  if (candidatos.length === 0) return null;
  const ueop = ueopDaUnidade(sessao.unidade);
  return (
    (ueop ? candidatos.find((d) => d.ueop === ueop) : undefined) ??
    candidatos.find((d) => d.principal) ??
    candidatos[0]
  );
}

/**
 * Destinatário que recebe a ciência: o pedido (`escolhidoId`) ou a unidade da
 * sessão. `obrigatorio` = sem candidato é erro (ação "ciencia"); no registro
 * de ação, a ciência implícita é só se houver.
 */
function destinatarioParaCiencia(
  sessao: Sessao,
  destinatarios: readonly Destinatario[],
  escolhidoId: number | undefined,
  obrigatorio: boolean,
): Destinatario | null {
  const noEscopo = destinatarios.filter((d) => d.cob !== null && alcancaCob(sessao, d.cob));
  if (escolhidoId !== undefined) {
    const d = destinatarios.find((x) => x.objectid === escolhidoId);
    if (!d) throw new ErroAlertas(404, "nao_encontrado", "Destinatário não encontrado neste alerta.");
    exigir(noEscopo.includes(d), 403, "escopo", "Este destinatário é de um COB fora do seu escopo.");
    exigir(d.situacaoDest === "AGUARDANDO", 409, "ja_ciente", "Esta unidade já deu ciência.");
    return d;
  }
  const escolhido = escolherDestinatario(noEscopo.filter((d) => d.situacaoDest === "AGUARDANDO"), sessao);
  if (!escolhido && obrigatorio) {
    exigir(noEscopo.length > 0, 403, "escopo", "Nenhuma unidade do seu escopo foi notificada por este alerta.");
    throw new ErroAlertas(409, "ja_ciente", "A sua unidade já deu ciência deste alerta.");
  }
  return escolhido;
}

function gravarCiencia(
  ctx: ContextoServico,
  autor: Autor,
  destinatario: Destinatario,
  observacao: string | null | undefined,
): Promise<Destinatario> {
  const agoraIso = ctx.agora.toISOString();
  return ctx.repositorio.atualizarDestinatario({
    ...destinatario,
    situacaoDest: "CIENTE",
    cienteEm: agoraIso,
    cientePorId: autor.id,
    cientePorDominio: autor.dominio,
    observacao: observacao ?? destinatario.observacao,
    alteradoEm: agoraIso,
  });
}

/** A versão que o cliente leu ainda é a gravada? (senão 409 antes de qualquer gravação) */
function conferirVersao(alerta: AlertaSala, lida: string | undefined): void {
  if (lida !== undefined && !mesmaVersao(alerta.alteradoEm, lida)) {
    throw new ErroAlertas(
      409,
      "conflito",
      "O alerta foi alterado por outra pessoa depois que você o abriu. Recarregue e tente de novo.",
      undefined,
      alerta.alteradoEm,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------------------------------

function capacidadeDa(acao: Pedido["acao"]): keyof Capacidades {
  switch (acao) {
    case "salvar":
    case "emitir":
    case "apagar":
      return "emitir";
    case "encerrar":
    case "cancelar":
      return "encerrar";
    case "ciencia":
      return "darCiencia";
    case "registrar_acao":
      return "registrarAcao";
  }
}

const MENSAGEM_CAPACIDADE: Record<keyof Capacidades, string> = {
  emitir: "Só o operador da Sala cria, edita, emite e apaga alertas.",
  encerrar: "Só o operador da Sala encerra ou cancela alertas.",
  darCiencia: "O seu perfil não dá ciência de alertas.",
  registrarAcao: "O seu perfil não registra ação RRD.",
  verTodosCobs: "",
};

/**
 * POST /api/alertas: executa `acao` com os `dados` do corpo, em nome da sessão.
 * Lança ErroAlertas (status do contrato); a rota traduz para HTTP.
 */
export async function executar(
  acao: unknown,
  dados: Record<string, unknown>,
  sessaoOuNula: Sessao | null,
  parcial?: Partial<ContextoServico>,
): Promise<ResultadoAcao> {
  const sessao = exigirSessao(sessaoOuNula);
  const analise = esquemaPedido.safeParse({ ...dados, acao });
  if (!analise.success) {
    throw new ErroAlertas(400, "entrada_invalida", "Pedido inválido.", problemasDoZod(analise.error));
  }
  const p = analise.data;
  const capacidade = capacidadeDa(p.acao);
  exigir(capacidadesDoPapel(sessao.papel)[capacidade], 403, "permissao", MENSAGEM_CAPACIDADE[capacidade]);

  try {
    const ctx = contexto(parcial);
    if (!ctx.segredo) {
      throw new ErroAlertas(503, "configuracao", "Autoria indisponível: SALA_PSEUDO_SEGREDO não configurado no servidor.");
    }
    const autor: Autor = { id: pseudonimoDaSessao(sessao, ctx.segredo), dominio: dominioDaSessao(sessao) };
    return await despachar(p, sessao, ctx, autor);
  } catch (erro) {
    throw traduzirErro(erro);
  }
}

async function despachar(p: Pedido, sessao: Sessao, ctx: ContextoServico, autor: Autor): Promise<ResultadoAcao> {
  const repo = ctx.repositorio;
  const agoraIso = ctx.agora.toISOString();

  switch (p.acao) {
    case "salvar":
    case "emitir": {
      let alerta: AlertaSala;
      let avisos: string[];
      if (!p.alertaId) {
        if (p.acao === "emitir") conferirEmissaoPrevia(alertaVazio("AL-00000000-0000"), [], camposDoPedido(p), ctx, autor);
        ({ alerta, avisos } = await criarRascunho(p, sessao, ctx, autor));
      } else {
        if (!p.alteradoEm) {
          throw new ErroAlertas(400, "entrada_invalida", "Informe a versão lida (alteradoEm) para editar.", [
            { campo: "alteradoEm", mensagem: "Obrigatório para editar." },
          ]);
        }
        const carregado = await carregar(ctx, sessao, p.alertaId);
        conferirVersao(carregado.alerta, p.alteradoEm);
        if (p.acao === "emitir") conferirEmissaoPrevia(carregado.alerta, carregado.destinatarios, camposDoPedido(p), ctx, autor);
        ({ alerta, avisos } = await editar(carregado.alerta, carregado.destinatarios, p, p.alteradoEm, ctx, autor));
      }
      if (p.acao === "emitir") {
        const emitido = await emitirRascunho(alerta, alerta.alteradoEm, ctx, autor);
        alerta = emitido.alerta;
        avisos = [...new Set([...avisos, ...emitido.avisos])];
      }
      return { id: alerta.alertaId, alerta: await visaoAtual(ctx, sessao, alerta.alertaId), avisos };
    }

    case "ciencia": {
      const { alerta, destinatarios } = await carregar(ctx, sessao, p.alertaId);
      conferirVersao(alerta, p.alteradoEm);
      exigir(aceitaCienciaOuAcao(alerta.situacao), 409, "transicao_invalida", `Não cabe ciência num alerta ${alerta.situacao.toLowerCase()}.`);
      const escolhido = destinatarioParaCiencia(sessao, destinatarios, p.destinatario, true) as Destinatario;
      // A ciência do destinatário PRINCIPAL leva o alerta de EMITIDO a CIENTE.
      // O alerta é gravado primeiro: se outra pessoa gravou antes, o 409 sai sem efeito colateral.
      const situacaoPara = escolhido.principal ? (transicao(alerta.situacao, "ciencia") ?? alerta.situacao) : alerta.situacao;
      if (situacaoPara !== alerta.situacao) {
        await repo.atualizar(
          { ...alerta, situacao: situacaoPara, alteradoPorId: autor.id, alteradoEm: proximaVersao(alerta.alteradoEm, ctx.agora) },
          alerta.alteradoEm,
        );
      }
      const marcado = await gravarCiencia(ctx, autor, escolhido, p.observacao);
      await repo.acrescentarHistorico([
        evento(alerta.alertaId, autor, ctx.agora, {
          evento: "CIENTE",
          alvoTipo: "DESTINATARIO",
          alvoId: marcado.objectid === null ? null : String(marcado.objectid),
          situacaoDe: situacaoPara !== alerta.situacao ? alerta.situacao : null,
          situacaoPara: situacaoPara !== alerta.situacao ? situacaoPara : null,
          detalhe: `${rotuloUnidade(marcado)}${marcado.principal ? " (principal)" : ""}`,
        }),
      ]);
      return { id: alerta.alertaId, alerta: await visaoAtual(ctx, sessao, alerta.alertaId), avisos: [] };
    }

    case "registrar_acao": {
      const { alerta, destinatarios } = await carregar(ctx, sessao, p.alertaId);
      conferirVersao(alerta, p.alteradoEm);
      exigir(
        aceitaCienciaOuAcao(alerta.situacao),
        409,
        "transicao_invalida",
        `Não cabe ação RRD num alerta ${alerta.situacao.toLowerCase()}.`,
      );
      const passos = passosDoRegistroDeAcao(alerta.situacao, p.resultado);
      const situacaoFinal = aplicarPassos(alerta.situacao, passos);
      if (situacaoFinal !== alerta.situacao) {
        await repo.atualizar(
          { ...alerta, situacao: situacaoFinal, alteradoPorId: autor.id, alteradoEm: proximaVersao(alerta.alteradoEm, ctx.agora) },
          alerta.alteradoEm,
        );
      }
      const acao = await comNumeracao(repo, "acao", ctx.agora, (acaoId) =>
        repo.criarAcao({
          objectid: null,
          acaoId,
          alertaId: alerta.alertaId,
          numeroChamada: alerta.numeroChamada,
          ocorrenciaCad: p.ocorrenciaCad ?? null,
          natureza: alerta.natureza,
          origemRegistro: "SALA",
          tipoRisco: alerta.tipoRisco,
          tipoAcao: p.tipoAcao,
          resultado: p.resultado,
          acaoExecutada: p.acaoExecutada,
          dataAcao: p.dataAcao ?? agoraIso,
          cob: alerta.cob,
          ueop: alerta.ueop,
          fracao: alerta.fracao,
          municipio: alerta.municipio,
          codIbge: alerta.codIbge,
          localReferencia: p.localReferencia ?? alerta.localReferencia,
          pessoasOrientadas: p.pessoasOrientadas ?? null,
          pessoasRemovidas: p.pessoasRemovidas ?? null,
          imoveisVistoriados: p.imoveisVistoriados ?? null,
          imoveisInterditados: p.imoveisInterditados ?? null,
          efetivoEmpregado: p.efetivoEmpregado ?? null,
          viaturasEmpregadas: p.viaturasEmpregadas ?? null,
          compdecAcionada: p.compdecAcionada ?? null,
          registradoPorId: autor.id,
          registradoPorDominio: autor.dominio,
          criadoEm: agoraIso,
          alteradoPorId: autor.id,
          alteradoEm: agoraIso,
          longitude: p.longitude ?? null,
          latitude: p.latitude ?? null,
        }),
      );

      const eventos: EventoHistorico[] = [];
      let situacao = alerta.situacao;
      for (const passo of passos) {
        const para = transicao(situacao, passo) as SituacaoAlerta;
        if (passo === "ciencia") {
          // Ciência implícita: quem registra a ação sabe do alerta.
          const candidato = destinatarioParaCiencia(sessao, destinatarios, undefined, false);
          const marcado = candidato ? await gravarCiencia(ctx, autor, candidato, null) : null;
          eventos.push(
            evento(alerta.alertaId, autor, ctx.agora, {
              evento: "CIENTE",
              alvoTipo: marcado ? "DESTINATARIO" : "ALERTA",
              alvoId: marcado?.objectid ? String(marcado.objectid) : alerta.alertaId,
              situacaoDe: situacao,
              situacaoPara: para,
              detalhe: `Ciência implícita no registro da ação ${acao.acaoId}.`,
            }),
          );
        }
        situacao = para;
      }
      const transicaoDaAcao = passos.filter((x) => x !== "ciencia").length > 0;
      eventos.push(
        evento(alerta.alertaId, autor, ctx.agora, {
          evento: situacaoFinal === "EM_ACAO" && transicaoDaAcao ? "EM_ACAO" : "ACAO_REGISTRADA",
          alvoTipo: "ACAO",
          alvoId: acao.acaoId,
          situacaoDe: transicaoDaAcao ? (passos.includes("ciencia") ? "CIENTE" : alerta.situacao) : null,
          situacaoPara: transicaoDaAcao ? situacaoFinal : null,
          detalhe: `${acao.tipoAcao} · ${acao.resultado}`,
        }),
      );
      await repo.acrescentarHistorico(eventos);
      return { id: alerta.alertaId, alerta: await visaoAtual(ctx, sessao, alerta.alertaId), avisos: [], acaoId: acao.acaoId };
    }

    case "encerrar":
    case "cancelar": {
      const { alerta } = await carregar(ctx, sessao, p.alertaId);
      conferirVersao(alerta, p.alteradoEm);
      const para = transicao(alerta.situacao, p.acao);
      if (!para) {
        const motivo =
          p.acao === "encerrar"
            ? "Só se encerra alerta com ação RRD registrada; sem ação, cancele com motivo."
            : alerta.situacao === "RASCUNHO"
              ? "Rascunho não se cancela: apague-o."
              : `Um alerta ${alerta.situacao.toLowerCase()} não pode ser cancelado.`;
        throw new ErroAlertas(409, "transicao_invalida", motivo);
      }
      let novo: AlertaSala = {
        ...alerta,
        situacao: para,
        encerradoEm: agoraIso,
        alteradoPorId: autor.id,
        alteradoEm: proximaVersao(alerta.alteradoEm, ctx.agora),
      };
      let capIdentifier: string | null = null;
      let capJson: string | null = null;
      if (p.acao === "cancelar") {
        novo = { ...novo, motivoCancelamento: p.motivo, capMsgType: "Cancel" };
        capIdentifier = identificadorMensagem(alerta.alertaId, "Cancel");
        capJson = JSON.stringify(
          montarMensagemCap(novo, "Cancel", capIdentifier, agoraIso, {
            identificador: alerta.capIdentifier ?? identificadorCap(alerta.alertaId),
            enviadoEm: alerta.dataEmissao,
          }),
        );
      }
      await repo.atualizar(novo, p.alteradoEm);
      await repo.acrescentarHistorico([
        evento(alerta.alertaId, autor, ctx.agora, {
          evento: p.acao === "encerrar" ? "ENCERRADO" : "CANCELADO",
          situacaoDe: alerta.situacao,
          situacaoPara: para,
          capIdentifier,
          capMsgType: capIdentifier ? "Cancel" : null,
          capJson,
          detalhe: p.acao === "cancelar" ? `Motivo: ${p.motivo}` : null,
        }),
      ]);
      return { id: alerta.alertaId, alerta: await visaoAtual(ctx, sessao, alerta.alertaId), avisos: [] };
    }

    case "apagar": {
      const { alerta } = await carregar(ctx, sessao, p.alertaId);
      conferirVersao(alerta, p.alteradoEm);
      exigir(podeApagar(alerta.situacao), 409, "transicao_invalida", "Depois de emitido, o alerta não se apaga: cancele com motivo.");
      await repo.apagarRascunho(alerta.alertaId, p.alteradoEm);
      await repo.acrescentarHistorico([
        evento(alerta.alertaId, autor, ctx.agora, { evento: "APAGADO", situacaoDe: "RASCUNHO", detalhe: "Rascunho apagado." }),
      ]);
      return { id: alerta.alertaId, alerta: null, avisos: [] };
    }
  }
}
