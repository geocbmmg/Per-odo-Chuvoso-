import {
  CANAIS_NOTIFICACAO,
  EVENTOS,
  FONTES_GATILHO,
  NATUREZAS,
  RESULTADOS_ACAO,
  SITUACOES,
  SITUACOES_DESTINATARIO,
  TIPOS_ACAO,
  TIPOS_RISCO_SALA,
  rotuloDe,
  type EventoAlerta,
  type EventoHistoricoTipo,
  type FonteGatilho,
  type Natureza,
  type ResultadoAcao,
  type SituacaoAlerta,
  type SituacaoDestinatario,
  type TipoAcao,
  type TipoRiscoSala,
} from "@/lib/alertas/codigos";
import { estadosDerivados, PADRAO_ALERTA_ID, PRAZO_PADRAO_HORAS, type AlertaSala, type Destinatario } from "@/lib/alertas/dominio";
import type { AlertaFila } from "@/lib/alertas/servico";
import { formatarData, formatarDataHora, formatarHora } from "@/lib/datas";
import { CORES_NIVEL, gravidade, type NivelRisco } from "@/lib/dominio/matrizes";
import type { FracaoCbmmg } from "@/lib/territorio/fracoes";

/**
 * Apresentação da fila de alertas (/alertas-acoes-rrd): rótulos, abas,
 * filtros, ordenação, contadores e prazos relativos. Puro: sem React; o
 * "agora" é sempre parâmetro (a tela passa o relógio dela, que anda sozinho).
 *
 * Os estados derivados (pendente, vencido, vigência expirada) são RECALCULADOS
 * aqui com o relógio da tela (estadosDerivados, o mesmo do servidor): um
 * alerta que vence com a tela aberta muda de grupo sem esperar a próxima
 * leitura da fila.
 */

/** Variantes do Badge (components/ui/badge.tsx), repetidas para este módulo ficar sem React. */
export type TomSituacao = "neutro" | "ok" | "alerta" | "perigo" | "info";

// ---------------------------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------------------------

/** "Laranja"; sem nível: "Sem nível". A palavra acompanha SEMPRE a cor. */
export function rotuloNivel(nivel: NivelRisco | null): string {
  return nivel ? CORES_NIVEL[nivel].nome : "Sem nível";
}

export function rotuloSituacao(situacao: SituacaoAlerta): string {
  return rotuloDe(SITUACOES, situacao) ?? situacao;
}

/**
 * Tom da pílula de situação. Cada tom tem forma própria no Badge (marcador),
 * então a situação nunca depende só da cor: palavra + forma.
 */
export function tomSituacao(situacao: SituacaoAlerta): TomSituacao {
  switch (situacao) {
    case "EMITIDO":
      return "alerta";
    case "CIENTE":
    case "EM_ACAO":
      return "info";
    case "ACAO_REGISTRADA":
      return "ok";
    case "RASCUNHO":
    case "ENCERRADO":
    case "CANCELADO":
      return "neutro";
  }
}

export function rotuloTipo(tipo: TipoRiscoSala | null): string {
  return tipo ? (rotuloDe(TIPOS_RISCO_SALA, tipo) ?? tipo) : "Tipo não informado";
}

export function rotuloEvento(evento: EventoAlerta | null): string | null {
  return evento ? (rotuloDe(EVENTOS, evento) ?? evento) : null;
}

export function rotuloFonte(fonte: FonteGatilho | null): string | null {
  return fonte ? (rotuloDe(FONTES_GATILHO, fonte) ?? fonte) : null;
}

/** Natureza só aparece quando NÃO é real (exercício e teste ficam fora do mapa e dos indicadores). */
export function rotuloNatureza(natureza: Natureza): string | null {
  return natureza === "REAL" ? null : (rotuloDe(NATUREZAS, natureza) ?? natureza);
}

export function rotuloTipoAcao(tipo: TipoAcao): string {
  return rotuloDe(TIPOS_ACAO, tipo) ?? tipo;
}

export function rotuloResultado(resultado: ResultadoAcao): string {
  return rotuloDe(RESULTADOS_ACAO, resultado) ?? resultado;
}

export function rotuloSituacaoDestinatario(situacao: SituacaoDestinatario): string {
  return rotuloDe(SITUACOES_DESTINATARIO, situacao) ?? situacao;
}

const ROTULOS_EVENTO_HISTORICO: Record<EventoHistoricoTipo, string> = {
  CRIADO: "Rascunho criado",
  EMITIDO: "Alerta emitido",
  NOTIFICADO: "Unidade notificada",
  CIENTE: "Ciência registrada",
  EM_ACAO: "Ação RRD em andamento",
  ACAO_REGISTRADA: "Ação RRD registrada",
  ACAO_EDITADA: "Ação RRD editada",
  ATUALIZADO: "Alerta atualizado",
  PRAZO_ALTERADO: "Prazo da ação alterado",
  ENCERRADO: "Alerta encerrado",
  CANCELADO: "Alerta cancelado",
  APAGADO: "Rascunho apagado",
};

export function rotuloEventoHistorico(evento: EventoHistoricoTipo): string {
  return ROTULOS_EVENTO_HISTORICO[evento] ?? evento;
}

const CODIGOS_LEGIVEIS = new Map<string, string>(
  [...TIPOS_ACAO, ...RESULTADOS_ACAO, ...CANAIS_NOTIFICACAO].map((o) => [o.codigo as string, o.rotulo]),
);

/**
 * Detalhe do histórico com os códigos traduzidos: o servidor grava
 * "VISTORIA · CONCLUIDA" e "… (principal) · SISTEMA"; a tela mostra
 * "Vistoria preventiva… · Concluída" e "… · Tela da Sala/GeoRescue".
 */
export function detalheLegivel(detalhe: string): string {
  return detalhe
    .split(" · ")
    .map((parte) => CODIGOS_LEGIVEIS.get(parte.trim()) ?? parte)
    .join(" · ");
}

/**
 * Autoria visível na tela, sem dado pessoal (LGPD): o domínio de quem fez
 * (ex.: "SALA", "1º COB") e "você" quando o pseudônimo é o da sessão. O
 * pseudônimo em si (32 hex) não diz nada a ninguém e não é mostrado.
 */
export function rotuloAutoria(porId: string | null, porDominio: string | null, proprio: string | null): string {
  const voce = proprio !== null && porId !== null && porId === proprio;
  if (voce) return porDominio ? `você (${porDominio})` : "você";
  return porDominio ?? "—";
}

// ---------------------------------------------------------------------------------------------
// Território
// ---------------------------------------------------------------------------------------------

/** "1º COB · 1º BBM" e a fração ("2ª Cia/1º Pel (Ouro Preto)", ou "sede"). */
export function unidadeDoAlerta(a: Pick<AlertaSala, "cob" | "ueop" | "fracao">): {
  linha1: string;
  linha2: string | null;
  texto: string;
} {
  const cob = a.cob ?? "Sem COB";
  const linha1 = a.ueop && a.ueop !== a.cob ? `${cob} · ${a.ueop}` : cob;
  const linha2 = a.fracao ?? (a.ueop ? "sede" : null);
  return { linha1, linha2, texto: linha2 ? `${linha1} · ${linha2}` : linha1 };
}

/**
 * Rótulo legível de uma entrada da lista oficial de frações (o do formulário
 * é "1 BBM/2CIA/1PEL (Ouro Preto)"): "1º BBM · 2ª Cia/1º Pel (Ouro Preto)",
 * "1º BBM · sede (Belo Horizonte)", "1º COB · sede (Belo Horizonte)".
 */
export function rotuloFracao(f: Pick<FracaoCbmmg, "cob" | "ueop" | "fracao" | "cidade">): string {
  if (f.fracao) return `${f.ueop} · ${f.fracao}`;
  return `${f.ueop} · sede (${f.cidade})`;
}

/** Destinatário: "1º COB · 1º BBM · 2ª Cia/1º Pel (Ouro Preto)" (o COB inteiro: "1º COB"). */
export function rotuloDestinatario(d: Pick<Destinatario, "cob" | "ueop" | "fracao">): string {
  return [d.cob, d.ueop, d.fracao].filter(Boolean).join(" · ") || "Unidade não informada";
}

// ---------------------------------------------------------------------------------------------
// Prazos e validade
// ---------------------------------------------------------------------------------------------

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/**
 * Duração legível: "35 min", "2 h", "2 h 15 min" (abaixo de 6 h os minutos
 * contam), "30 h", "3 dias". Arredonda para baixo, em minutos inteiros.
 */
export function formatarDuracao(ms: number): string {
  const minutos = Math.floor(Math.abs(ms) / MINUTO);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 6) return resto ? `${horas} h ${resto} min` : `${horas} h`;
  if (horas < 48) return `${horas} h`;
  return `${Math.floor(horas / 24)} dias`;
}

/** Estado do prazo da ação RRD, para cor + ícone + palavra. */
export type EstadoPrazo = "vencido" | "proximo" | "no-prazo" | "sem-prazo" | "nao-se-aplica";

export interface PrazoRelativo {
  estado: EstadoPrazo;
  /** "vence em 2 h", "vencido há 35 min", "sem prazo", "—". */
  texto: string;
  /** "02/10/2026 15:00" (Brasília), quando há prazo. */
  quando: string | null;
}

/** Abaixo disto o prazo é "próximo" (atenção, antes de vencer). */
export const LIMITE_PRAZO_PROXIMO_MS = HORA;

/**
 * Prazo da ação RRD relativo a `agora`. Só conta para alerta pendente
 * (emitido, ciente, em ação); rascunho mostra o prazo padrão do nível; os
 * demais, "—".
 */
export function prazoRelativo(
  a: Pick<AlertaSala, "situacao" | "prazoAcao" | "nivelAlerta" | "validoAte">,
  agora: Date,
): PrazoRelativo {
  const quando = a.prazoAcao ? formatarDataHora(a.prazoAcao) : null;
  if (a.situacao === "RASCUNHO") {
    if (a.prazoAcao) return { estado: "nao-se-aplica", texto: `definido: ${quando}`, quando };
    return {
      estado: "nao-se-aplica",
      texto: a.nivelAlerta ? `${PRAZO_PADRAO_HORAS[a.nivelAlerta]} h após emitir` : "pelo nível, ao emitir",
      quando: null,
    };
  }
  const { pendente } = estadosDerivados(a, agora);
  if (!pendente) return { estado: "nao-se-aplica", texto: "—", quando };
  const t = a.prazoAcao ? Date.parse(a.prazoAcao) : Number.NaN;
  if (Number.isNaN(t)) return { estado: "sem-prazo", texto: "sem prazo", quando: null };
  const falta = t - agora.getTime();
  if (falta < 0) return { estado: "vencido", texto: `vencido há ${formatarDuracao(falta)}`, quando };
  return {
    estado: falta <= LIMITE_PRAZO_PROXIMO_MS ? "proximo" : "no-prazo",
    texto: `vence em ${formatarDuracao(falta)}`,
    quando,
  };
}

/** Dia de Brasília ("2026-10-02") de um instante (UTC−3 fixo desde 2019). */
export function diaBrasilia(instante: Date | string): string {
  const t = typeof instante === "string" ? Date.parse(instante) : instante.getTime();
  return Number.isNaN(t) ? "" : new Date(t - 3 * HORA).toISOString().slice(0, 10);
}

/**
 * Validade ("válido até"): "até 15:00" no mesmo dia de Brasília, "até
 * 03/10 15:00" em outro dia; passada, "expirou às…".
 */
export function validadeRelativa(
  a: Pick<AlertaSala, "situacao" | "prazoAcao" | "validoAte">,
  agora: Date,
): { texto: string; expirada: boolean } {
  if (!a.validoAte || Number.isNaN(Date.parse(a.validoAte))) return { texto: "—", expirada: false };
  const { vigenciaExpirada } = estadosDerivados(a, agora);
  const mesmoDia = diaBrasilia(a.validoAte) === diaBrasilia(agora);
  const quando = mesmoDia ? formatarHora(a.validoAte) : `${formatarData(a.validoAte).slice(0, 5)} ${formatarHora(a.validoAte)}`;
  return { texto: vigenciaExpirada ? `expirou ${mesmoDia ? "às" : "em"} ${quando}` : `até ${quando}`, expirada: vigenciaExpirada };
}

// ---------------------------------------------------------------------------------------------
// Abas, filtros e ordenação
// ---------------------------------------------------------------------------------------------

export type AbaFila = "pendentes" | "a-encerrar" | "rascunhos" | "finalizados" | "todos";

export interface DefinicaoAba {
  id: AbaFila;
  rotulo: string;
  /** Texto para leitores de tela e dica: o que entra na aba. */
  descricao: string;
  /** Só aparece para quem emite (rascunhos) ou encerra (a encerrar). */
  exige: "emitir" | "encerrar" | null;
}

export const ABAS_FILA: readonly DefinicaoAba[] = [
  {
    id: "pendentes",
    rotulo: "Pendentes",
    descricao: "Emitidos, cientes ou em ação: aguardam a unidade. Vencidos primeiro, depois pelo prazo.",
    exige: null,
  },
  {
    id: "a-encerrar",
    rotulo: "A encerrar",
    descricao: "Ação RRD registrada: aguardam a Sala encerrar.",
    exige: "encerrar",
  },
  { id: "rascunhos", rotulo: "Rascunhos", descricao: "Alertas ainda não emitidos.", exige: "emitir" },
  { id: "finalizados", rotulo: "Encerrados/cancelados", descricao: "Alertas encerrados ou cancelados.", exige: null },
  { id: "todos", rotulo: "Todos", descricao: "Todos os alertas do seu escopo.", exige: null },
];

export function ehAbaFila(valor: unknown): valor is AbaFila {
  return typeof valor === "string" && ABAS_FILA.some((a) => a.id === valor);
}

// ---------------------------------------------------------------------------------------------
// URL da fila (?alerta=AL-…&aba=…) e volta do login
// ---------------------------------------------------------------------------------------------

/** Caminho da fila, sem busca. */
export const CAMINHO_FILA = "/alertas-acoes-rrd";

export const ABA_PADRAO: AbaFila = "pendentes";

/** Nomes dos parâmetros: /alertas-acoes-rrd?alerta=AL-20261002-0001&aba=todos */
export const PARAMETROS_URL_FILA = { alerta: "alerta", aba: "aba" } as const;

/** searchParams da página (objeto) ou URLSearchParams do navegador. */
export type ParametrosBuscaFila = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;

function lerParametroFila(params: ParametrosBuscaFila, nome: string): string | null {
  const bruto = params instanceof URLSearchParams ? params.get(nome) : params[nome];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  return typeof valor === "string" ? valor.trim() : null;
}

/**
 * ?alerta= e ?aba= da URL — a URL é a única fonte do detalhe aberto e da aba.
 * Alerta fora do padrão AL-… vira null (nada abre); aba desconhecida cai na padrão.
 */
export function lerBuscaDaFila(params: ParametrosBuscaFila): { alerta: string | null; aba: AbaFila } {
  const alerta = lerParametroFila(params, PARAMETROS_URL_FILA.alerta);
  const aba = lerParametroFila(params, PARAMETROS_URL_FILA.aba);
  return {
    alerta: alerta !== null && PADRAO_ALERTA_ID.test(alerta) ? alerta : null,
    aba: ehAbaFila(aba) ? aba : ABA_PADRAO,
  };
}

/**
 * Query string da fila preservando os outros parâmetros da URL atual. Sem
 * alerta aberto e na aba padrão a URL fica limpa (link curto).
 */
export function buscaDaFila(alerta: string | null, aba: AbaFila, atual: string | URLSearchParams = ""): string {
  const params = new URLSearchParams(atual);
  if (alerta) params.set(PARAMETROS_URL_FILA.alerta, alerta);
  else params.delete(PARAMETROS_URL_FILA.alerta);
  if (aba !== ABA_PADRAO) params.set(PARAMETROS_URL_FILA.aba, aba);
  else params.delete(PARAMETROS_URL_FILA.aba);
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

/** Caminho completo da fila com a busca (o "voltar" do login). */
export function caminhoDaFila(alerta: string | null, aba: AbaFila): string {
  return `${CAMINHO_FILA}${buscaDaFila(alerta, aba)}`;
}

/**
 * Link de entrar que devolve a pessoa a `voltar` — um caminho interno da Sala
 * COM a busca (ex.: "/alertas-acoes-rrd?alerta=AL-…&aba=todos"), para o link
 * compartilhado abrir o detalhe depois do login. A página /entrar confere o
 * caminho (lib/auth/voltar.ts); aqui ele só é codificado.
 */
export function rotaEntrar(voltar: string = CAMINHO_FILA): string {
  return `/entrar?voltar=${encodeURIComponent(voltar)}`;
}

/** Abas que a sessão vê (rascunhos só para quem emite; "a encerrar" só para quem encerra). */
export function abasVisiveis(capacidades: { emitir: boolean; encerrar: boolean }): DefinicaoAba[] {
  return ABAS_FILA.filter((a) => a.exige === null || capacidades[a.exige]);
}

type AlertaParaFila = Pick<
  AlertaFila,
  "situacao" | "prazoAcao" | "validoAte" | "alteradoEm" | "encerradoEm" | "cob" | "tipoRisco" | "nivelAlerta"
>;

/** O alerta entra na aba? (com o relógio da tela) */
export function naAba(a: AlertaParaFila, aba: AbaFila, agora: Date): boolean {
  switch (aba) {
    case "pendentes":
      return estadosDerivados(a, agora).pendente;
    case "a-encerrar":
      return a.situacao === "ACAO_REGISTRADA";
    case "rascunhos":
      return a.situacao === "RASCUNHO";
    case "finalizados":
      return a.situacao === "ENCERRADO" || a.situacao === "CANCELADO";
    case "todos":
      return true;
  }
}

export interface FiltrosFila {
  /** Vazio = todos. */
  cobs: readonly string[];
  tipos: readonly TipoRiscoSala[];
  /** "sem" = alerta ainda sem nível (rascunho). */
  niveis: readonly (NivelRisco | "sem")[];
}

export const FILTROS_VAZIOS: FiltrosFila = { cobs: [], tipos: [], niveis: [] };

export function filtrosAtivos(f: FiltrosFila): number {
  return f.cobs.length + f.tipos.length + f.niveis.length;
}

/** Filtros de COB, tipo e nível (cada grupo vazio = sem filtro; dentro do grupo, "ou"). */
export function passaFiltros(a: AlertaParaFila, f: FiltrosFila): boolean {
  if (f.cobs.length && !f.cobs.includes(a.cob ?? "")) return false;
  if (f.tipos.length && (!a.tipoRisco || !f.tipos.includes(a.tipoRisco))) return false;
  if (f.niveis.length && !f.niveis.includes(a.nivelAlerta ?? "sem")) return false;
  return true;
}

/** Liga/desliga um valor num grupo de filtro (chips). */
export function alternar<T>(lista: readonly T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

function instante(iso: string | null): number {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Mais recente primeiro (sem data, por último). */
function maisRecente(a: string | null, b: string | null): number {
  const ta = a ? Date.parse(a) : Number.NaN;
  const tb = b ? Date.parse(b) : Number.NaN;
  return (Number.isNaN(tb) ? -Infinity : tb) - (Number.isNaN(ta) ? -Infinity : ta);
}

/** Prioridade na aba "Todos" (a mesma do servidor): vencidos, pendentes, rascunhos, a encerrar, finais. */
function prioridade(a: AlertaParaFila, agora: Date): number {
  const d = estadosDerivados(a, agora);
  if (d.vencido) return 0;
  if (d.pendente) return 1;
  if (a.situacao === "RASCUNHO") return 2;
  if (a.situacao === "ACAO_REGISTRADA") return 3;
  return 4;
}

/**
 * Comparador da fila: pendentes por prazo (vencidos primeiro, o mais antigo
 * no topo; sem prazo por último), empate pelo nível mais grave; finais pelo
 * encerramento mais recente; o resto pela última alteração.
 */
export function compararNaFila(a: AlertaParaFila, b: AlertaParaFila, agora: Date): number {
  const p = prioridade(a, agora) - prioridade(b, agora);
  if (p !== 0) return p;
  const da = estadosDerivados(a, agora);
  const db = estadosDerivados(b, agora);
  if (da.pendente && db.pendente) {
    const porPrazo = instante(a.prazoAcao) - instante(b.prazoAcao);
    if (porPrazo !== 0 && !Number.isNaN(porPrazo)) return porPrazo;
    return (b.nivelAlerta ? gravidade(b.nivelAlerta) : -1) - (a.nivelAlerta ? gravidade(a.nivelAlerta) : -1);
  }
  if ((a.situacao === "ENCERRADO" || a.situacao === "CANCELADO") && (b.situacao === "ENCERRADO" || b.situacao === "CANCELADO")) {
    return maisRecente(a.encerradoEm ?? a.alteradoEm, b.encerradoEm ?? b.alteradoEm);
  }
  return maisRecente(a.alteradoEm, b.alteradoEm);
}

/** A fila da aba, filtrada e ordenada (não altera a lista recebida). */
export function filaDaAba<T extends AlertaParaFila>(alertas: readonly T[], aba: AbaFila, filtros: FiltrosFila, agora: Date): T[] {
  return alertas
    .filter((a) => naAba(a, aba, agora) && passaFiltros(a, filtros))
    .sort((a, b) => compararNaFila(a, b, agora));
}

/** Quantos alertas cada aba tem com os filtros atuais (para os números nas abas). */
export function contarAbas(alertas: readonly AlertaParaFila[], filtros: FiltrosFila, agora: Date): Record<AbaFila, number> {
  const contagem: Record<AbaFila, number> = { pendentes: 0, "a-encerrar": 0, rascunhos: 0, finalizados: 0, todos: 0 };
  for (const a of alertas) {
    if (!passaFiltros(a, filtros)) continue;
    for (const aba of ABAS_FILA) if (naAba(a, aba.id, agora)) contagem[aba.id]++;
  }
  return contagem;
}

export interface ContadoresFila {
  pendentes: number;
  vencidos: number;
  /** Emitidos no dia de hoje (Brasília), em qualquer situação. */
  emitidosHoje: number;
  aEncerrar: number;
}

/** Contadores do topo, sobre a fila inteira do escopo (sem os filtros da tela). */
export function contadores(
  alertas: readonly Pick<AlertaFila, "situacao" | "prazoAcao" | "validoAte" | "dataEmissao">[],
  agora: Date,
): ContadoresFila {
  const hoje = diaBrasilia(agora);
  const c: ContadoresFila = { pendentes: 0, vencidos: 0, emitidosHoje: 0, aEncerrar: 0 };
  for (const a of alertas) {
    const d = estadosDerivados(a, agora);
    if (d.pendente) c.pendentes++;
    if (d.vencido) c.vencidos++;
    if (a.situacao === "ACAO_REGISTRADA") c.aEncerrar++;
    if (a.dataEmissao && a.situacao !== "RASCUNHO" && diaBrasilia(a.dataEmissao) === hoje) c.emitidosHoje++;
  }
  return c;
}

/** "3 alertas", "1 alerta", "nenhum alerta". */
export function contarAlertas(n: number): string {
  if (n === 0) return "nenhum alerta";
  return n === 1 ? "1 alerta" : `${n} alertas`;
}
