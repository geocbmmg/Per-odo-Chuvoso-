import type { AcaoRrdSala, AlertaSala, Destinatario, EventoHistorico } from "./dominio";
import {
  acaoParaFeicao,
  alertaParaFeicao,
  atributosParaDestinatario,
  atributosParaEvento,
  destinatarioParaAtributos,
  eventoParaAtributos,
  feicaoParaAcao,
  feicaoParaAlerta,
  type AtributosEsri,
  type FeicaoPontoEsri,
} from "./feicao";
import {
  ErroConflito,
  ErroNaoEncontrado,
  maiorNumero,
  mesmaVersao,
  passaNoFiltro,
  type FiltroAlertas,
  type ListaAlertas,
  type RepositorioAlertas,
  type TipoNumeracao,
} from "./repositorio";

/**
 * Armazém em memória (modo demonstração e testes). Guarda as FEIÇÕES — o que o
 * ArcGIS receberia no applyEdits — e converte na leitura, para que memória,
 * Postgres e ArcGIS se comportem igual. Por instância: some num cold start.
 */

/** Conteúdo bruto das quatro camadas (sementes do modo exemplo e conferência nos testes). */
export interface ConteudoSala {
  alertas: FeicaoPontoEsri[];
  acoes: FeicaoPontoEsri[];
  destinatarios: AtributosEsri[];
  historico: AtributosEsri[];
}

export interface RepositorioMemoria extends RepositorioAlertas {
  /** Cópia do que está gravado, no formato da feição (testes de LGPD e de esquema). */
  conteudo(): ConteudoSala;
}

function copia<T>(valor: T): T {
  return structuredClone(valor);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor ? valor : null;
}

export function criarRepositorioMemoria(semente?: ConteudoSala): RepositorioMemoria {
  const dados: ConteudoSala = semente
    ? copia(semente)
    : { alertas: [], acoes: [], destinatarios: [], historico: [] };
  const proximoOid = { alertas: 1, acoes: 1, destinatarios: 1, historico: 1 };

  // Sementes sem objectid ganham um; o contador continua depois do maior.
  function numerar(lista: AtributosEsri[], chave: keyof typeof proximoOid) {
    for (const atributos of lista) {
      const oid = typeof atributos.objectid === "number" ? atributos.objectid : proximoOid[chave];
      atributos.objectid = oid;
      proximoOid[chave] = Math.max(proximoOid[chave], oid + 1);
    }
  }
  numerar(dados.alertas.map((f) => f.attributes), "alertas");
  numerar(dados.acoes.map((f) => f.attributes), "acoes");
  numerar(dados.destinatarios, "destinatarios");
  numerar(dados.historico, "historico");

  const indiceAlerta = (alertaId: string) => dados.alertas.findIndex((f) => f.attributes.alerta_id === alertaId);

  function cobsNotificados(alertaId: string): (string | null)[] {
    return dados.destinatarios.filter((d) => d.alerta_id === alertaId).map((d) => texto(d.cob));
  }

  function capRepetido(cap: string | null, alertaId: string): boolean {
    return cap !== null && dados.alertas.some((f) => f.attributes.cap_identifier === cap && f.attributes.alerta_id !== alertaId);
  }

  return {
    tipo: "memoria",

    async listar(filtro: FiltroAlertas, limite: number): Promise<ListaAlertas> {
      const todos = dados.alertas
        .map((f) => feicaoParaAlerta(copia(f)))
        .filter((a) => passaNoFiltro(a, cobsNotificados(a.alertaId), filtro))
        .sort((a, b) => (b.alteradoEm ?? "").localeCompare(a.alteradoEm ?? "") || b.alertaId.localeCompare(a.alertaId));
      return { alertas: todos.slice(0, limite), truncado: todos.length > limite };
    },

    async obter(alertaId) {
      const i = indiceAlerta(alertaId);
      return i < 0 ? null : feicaoParaAlerta(copia(dados.alertas[i]));
    },

    async proximoNumero(tipo: TipoNumeracao, prefixo: string) {
      // Alerta: inclui os ids que só restam no histórico (rascunho apagado não devolve o número).
      const ids =
        tipo === "alerta"
          ? [...dados.alertas.map((f) => texto(f.attributes.alerta_id)), ...dados.historico.map((h) => texto(h.alerta_id))]
          : dados.acoes.map((f) => texto(f.attributes.acao_id));
      return maiorNumero(ids.filter((id): id is string => id !== null), prefixo) + 1;
    },

    async criar(alerta: AlertaSala) {
      const usado =
        indiceAlerta(alerta.alertaId) >= 0 || dados.historico.some((h) => h.alerta_id === alerta.alertaId);
      if (usado) throw new ErroConflito(`O código ${alerta.alertaId} já existe.`);
      if (capRepetido(alerta.capIdentifier, alerta.alertaId)) {
        throw new ErroConflito(`O identificador CAP ${alerta.capIdentifier} já existe.`);
      }
      const feicao = alertaParaFeicao({ ...alerta, objectid: proximoOid.alertas++ });
      dados.alertas.push(feicao);
      return feicaoParaAlerta(copia(feicao));
    },

    async atualizar(alerta: AlertaSala, alteradoEmLido: string | null) {
      const i = indiceAlerta(alerta.alertaId);
      if (i < 0) throw new ErroNaoEncontrado(`Alerta ${alerta.alertaId} não encontrado.`);
      const gravado = feicaoParaAlerta(copia(dados.alertas[i]));
      if (!mesmaVersao(gravado.alteradoEm, alteradoEmLido)) {
        throw new ErroConflito("O alerta foi alterado por outra pessoa depois que você o abriu.", gravado.alteradoEm);
      }
      if (capRepetido(alerta.capIdentifier, alerta.alertaId)) {
        throw new ErroConflito(`O identificador CAP ${alerta.capIdentifier} já existe.`);
      }
      const feicao = alertaParaFeicao({ ...alerta, objectid: gravado.objectid });
      dados.alertas[i] = feicao;
      return feicaoParaAlerta(copia(feicao));
    },

    async apagarRascunho(alertaId: string, alteradoEmLido: string | null) {
      const i = indiceAlerta(alertaId);
      if (i < 0) throw new ErroNaoEncontrado(`Alerta ${alertaId} não encontrado.`);
      const gravado = feicaoParaAlerta(copia(dados.alertas[i]));
      if (!mesmaVersao(gravado.alteradoEm, alteradoEmLido)) {
        throw new ErroConflito("O alerta foi alterado por outra pessoa depois que você o abriu.", gravado.alteradoEm);
      }
      if (gravado.situacao !== "RASCUNHO") throw new ErroConflito("Só rascunho pode ser apagado.");
      dados.alertas.splice(i, 1);
      dados.destinatarios = dados.destinatarios.filter((d) => d.alerta_id !== alertaId);
    },

    async listarDestinatarios(alertaIds: readonly string[]) {
      const ids = new Set(alertaIds);
      return dados.destinatarios
        .filter((d) => ids.has(String(d.alerta_id)))
        .map((d) => atributosParaDestinatario(copia(d)));
    },

    async substituirDestinatarios(alertaId: string, destinatarios: readonly Destinatario[]) {
      dados.destinatarios = dados.destinatarios.filter((d) => d.alerta_id !== alertaId);
      const novos = destinatarios.map((d) =>
        destinatarioParaAtributos({ ...d, alertaId, objectid: proximoOid.destinatarios++ }),
      );
      dados.destinatarios.push(...novos);
      return novos.map((d) => atributosParaDestinatario(copia(d)));
    },

    async atualizarDestinatario(destinatario: Destinatario) {
      const i = dados.destinatarios.findIndex((d) => d.objectid === destinatario.objectid);
      if (i < 0 || destinatario.objectid === null) throw new ErroNaoEncontrado("Destinatário não encontrado.");
      dados.destinatarios[i] = destinatarioParaAtributos(destinatario);
      return atributosParaDestinatario(copia(dados.destinatarios[i]));
    },

    async listarAcoes(alertaIds: readonly string[]) {
      const ids = new Set(alertaIds);
      return dados.acoes
        .filter((f) => ids.has(String(f.attributes.alerta_id)))
        .map((f) => feicaoParaAcao(copia(f)));
    },

    async criarAcao(acao: AcaoRrdSala) {
      if (dados.acoes.some((f) => f.attributes.acao_id === acao.acaoId)) {
        throw new ErroConflito(`O código ${acao.acaoId} já existe.`);
      }
      const feicao = acaoParaFeicao({ ...acao, objectid: proximoOid.acoes++ });
      dados.acoes.push(feicao);
      return feicaoParaAcao(copia(feicao));
    },

    async listarHistorico(alertaId: string) {
      return dados.historico
        .filter((h) => h.alerta_id === alertaId)
        .map((h) => atributosParaEvento(copia(h)))
        .sort((a, b) => a.quando.localeCompare(b.quando) || (a.objectid ?? 0) - (b.objectid ?? 0));
    },

    async acrescentarHistorico(eventos: readonly EventoHistorico[]) {
      for (const evento of eventos) {
        dados.historico.push(eventoParaAtributos({ ...evento, objectid: proximoOid.historico++ }));
      }
    },

    conteudo() {
      return copia(dados);
    },
  };
}
