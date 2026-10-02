import type { SituacaoAlerta, TipoRiscoSala } from "./codigos";
import type { AcaoRrdSala, AlertaSala, Destinatario, EventoHistorico } from "./dominio";

/**
 * Repositório da fila de alertas (docs/fase-1.md §4.4): uma interface, três
 * armazéns. Todos guardam a MESMA feição (feicao.ts), então trocar o armazém
 * não muda a tela nem a API.
 *
 * | Armazém   | Quando                                                          |
 * |-----------|-----------------------------------------------------------------|
 * | memoria   | modo demonstração e testes                                      |
 * | postgres  | enquanto as camadas do ArcGIS não existem                       |
 * | arcgis    | depois de criadas as camadas e autorizada a escrita (DESLIGADA) |
 *
 * Concorrência otimista: `alteradoEm` é a versão do alerta. `atualizar` e
 * `apagarRascunho` recebem a versão lida; se outra pessoa gravou antes, lançam
 * ErroConflito (a API responde 409).
 */

export interface FiltroAlertas {
  /**
   * Escopo por COB: null = Estado inteiro. Com lista, entram os alertas do
   * COB E os que notificam alguma unidade desses COBs (destinatário).
   * Alerta "Sem COB" só aparece no escopo do Estado.
   */
  cobs: readonly string[] | null;
  /** Rascunhos só para quem emite (operador da Sala). */
  incluirRascunhos: boolean;
  /** Filtros da tela. */
  cob?: string | null;
  tipo?: TipoRiscoSala | null;
  situacoes?: readonly SituacaoAlerta[] | null;
}

export interface ListaAlertas {
  alertas: AlertaSala[];
  /** O armazém tinha mais do que o limite pedido. */
  truncado: boolean;
}

export type TipoNumeracao = "alerta" | "acao";

export interface RepositorioAlertas {
  readonly tipo: "memoria" | "postgres" | "arcgis";

  /** Alertas do escopo, do mais recente ao mais antigo (alteradoEm), até `limite`. */
  listar(filtro: FiltroAlertas, limite: number): Promise<ListaAlertas>;
  obter(alertaId: string): Promise<AlertaSala | null>;
  /**
   * Próximo número livre para o prefixo ("AL-20261002-" → 1, 2…). Duas
   * requisições podem receber o mesmo número: `criar` recusa a repetida
   * (índice único) e o serviço tenta o seguinte.
   */
  proximoNumero(tipo: TipoNumeracao, prefixo: string): Promise<number>;
  /** Grava um alerta novo. ErroConflito se o alerta_id ou o cap_identifier já existir. */
  criar(alerta: AlertaSala): Promise<AlertaSala>;
  /** Regrava o alerta se a versão gravada ainda for `alteradoEmLido`. */
  atualizar(alerta: AlertaSala, alteradoEmLido: string | null): Promise<AlertaSala>;
  /** Apaga um RASCUNHO (e os seus destinatários). O histórico fica. */
  apagarRascunho(alertaId: string, alteradoEmLido: string | null): Promise<void>;

  listarDestinatarios(alertaIds: readonly string[]): Promise<Destinatario[]>;
  /** Troca todos os destinatários de um alerta (só no rascunho). */
  substituirDestinatarios(alertaId: string, destinatarios: readonly Destinatario[]): Promise<Destinatario[]>;
  /** Regrava um destinatário existente (pelo objectid). */
  atualizarDestinatario(destinatario: Destinatario): Promise<Destinatario>;

  listarAcoes(alertaIds: readonly string[]): Promise<AcaoRrdSala[]>;
  criarAcao(acao: AcaoRrdSala): Promise<AcaoRrdSala>;

  listarHistorico(alertaId: string): Promise<EventoHistorico[]>;
  /** Só acrescenta (a camada não tem Update/Delete). */
  acrescentarHistorico(eventos: readonly EventoHistorico[]): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------------------------

export class ErroRepositorio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroRepositorio";
  }
}

/** Outra pessoa gravou antes (versão diferente) ou chave única repetida → 409. */
export class ErroConflito extends ErroRepositorio {
  constructor(
    mensagem: string,
    /** Versão gravada no momento do conflito (para a tela mostrar "alterado às HH:MM"). */
    public readonly alteradoEmAtual: string | null = null,
  ) {
    super(mensagem);
    this.name = "ErroConflito";
  }
}

export class ErroNaoEncontrado extends ErroRepositorio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroNaoEncontrado";
  }
}

/** Escrita no ArcGIS desligada nesta fase (→ 503). */
export class ErroEscritaDesligada extends ErroRepositorio {
  constructor() {
    super(
      "Escrita no ArcGIS desligada nesta fase: as camadas da Sala ainda não foram criadas nem autorizada a gravação (docs/fase-1.md §4.3). Use ALERTAS_ARMAZEM=postgres.",
    );
    this.name = "ErroEscritaDesligada";
  }
}

/** Armazém fora do ar ou mal configurado (→ 502/503). */
export class ErroArmazem extends ErroRepositorio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroArmazem";
  }
}

// ---------------------------------------------------------------------------------------------
// Regras comuns aos armazéns
// ---------------------------------------------------------------------------------------------

/** Mesma versão? (compara o instante, não o texto ISO). */
export function mesmaVersao(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}

/** O alerta passa no filtro? `cobsDosDestinatarios` = COBs notificados pelo alerta. */
export function passaNoFiltro(
  alerta: Pick<AlertaSala, "cob" | "situacao" | "tipoRisco">,
  cobsDosDestinatarios: readonly (string | null)[],
  filtro: FiltroAlertas,
): boolean {
  if (!filtro.incluirRascunhos && alerta.situacao === "RASCUNHO") return false;
  if (filtro.cobs !== null) {
    const noEscopo = (cob: string | null) => cob !== null && filtro.cobs!.includes(cob);
    if (!noEscopo(alerta.cob) && !cobsDosDestinatarios.some(noEscopo)) return false;
  }
  if (filtro.cob && alerta.cob !== filtro.cob) return false;
  if (filtro.tipo && alerta.tipoRisco !== filtro.tipo) return false;
  if (filtro.situacoes && filtro.situacoes.length > 0 && !filtro.situacoes.includes(alerta.situacao)) return false;
  return true;
}

/** Maior número já usado com o prefixo ("AL-20261002-0007" → 7). */
export function maiorNumero(ids: readonly string[], prefixo: string): number {
  let maior = 0;
  for (const id of ids) {
    if (!id.startsWith(prefixo)) continue;
    const n = Number.parseInt(id.slice(prefixo.length), 10);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior;
}
