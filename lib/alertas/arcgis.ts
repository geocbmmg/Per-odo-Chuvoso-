import "server-only";
import {
  consultarTodas,
  montarUrlCamada,
  type ParametrosConsulta,
  type RespostaConsultaEsri,
} from "@/lib/sources/arcgis/cliente";
import { feicaoParaAcao, feicaoParaAlerta, atributosParaDestinatario, atributosParaEvento } from "./feicao";
import { PADRAO_ALERTA_ID } from "./dominio";
import {
  ErroArmazem,
  ErroEscritaDesligada,
  maiorNumero,
  passaNoFiltro,
  type FiltroAlertas,
  type RepositorioAlertas,
} from "./repositorio";

/**
 * Armazém ArcGIS da fila (camadas SalaSituacao_AlertasRRD,
 * scripts/arcgis/criar_camadas_sala.py) — PRÉ-DESENHADO E DESLIGADO.
 *
 * SOMENTE LEITURA nesta fase: as consultas usam o cliente REST da Sala, que
 * só monta URLs de /query. TODA escrita lança ErroEscritaDesligada (503) —
 * não existe applyEdits aqui. Para ligar a escrita: criar as camadas, criar a
 * conta de serviço da Sala, autorizar a gravação (docs/fase-1.md §9) e
 * implementar as escritas com applyEdits usando as MESMAS conversões de
 * feicao.ts (alertaParaFeicao etc.), com revisão específica.
 *
 * ⚠️ O serviço nasce RESTRITO (só o grupo de editores): a leitura também vai
 * precisar de token gerado no servidor (ARCGIS_USER/ARCGIS_PASS), ainda não
 * implementado no cliente. Sem token, o portal recusa e a fila responde 502.
 */

export const SERVICO_ALERTAS_SALA = "SalaSituacao_AlertasRRD";
/** Ids pedidos pelo script (as camadas de ponto vêm antes das tabelas). Conferir em /status ao criar. */
export const CAMADAS_SERVICO_SALA = { alertas: 0, acoes: 1, destinatarios: 2, historico: 3 } as const;

export interface OpcoesArcgisAlertas {
  baseServicos: string;
  servico?: string;
  timeoutMs?: number;
  /** Injetável nos testes. Padrão: consultarTodas (só /query). */
  consultar?: (urlCamada: string, parametros: ParametrosConsulta) => Promise<RespostaConsultaEsri>;
}

/** Literal SQL do ArcGIS com aspas escapadas. */
function literal(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

function lista(valores: readonly string[]): string {
  return `(${valores.map(literal).join(",")})`;
}

export function criarRepositorioArcgis(opcoes: OpcoesArcgisAlertas): RepositorioAlertas {
  const servico = opcoes.servico ?? SERVICO_ALERTAS_SALA;
  const consultar =
    opcoes.consultar ??
    ((url: string, parametros: ParametrosConsulta) => consultarTodas(url, parametros, { timeoutMs: opcoes.timeoutMs }));

  async function ler(camada: keyof typeof CAMADAS_SERVICO_SALA, where: string, geometria: boolean) {
    try {
      const url = montarUrlCamada(opcoes.baseServicos, servico, CAMADAS_SERVICO_SALA[camada]);
      const resposta = await consultar(url, { where, outFields: "*", returnGeometry: geometria });
      return resposta.features;
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroArmazem(`ArcGIS (${servico}/${CAMADAS_SERVICO_SALA[camada]}): ${motivo}`);
    }
  }

  const desligada = async (): Promise<never> => {
    throw new ErroEscritaDesligada();
  };

  function idsValidos(ids: readonly string[]): string[] {
    return ids.filter((id) => PADRAO_ALERTA_ID.test(id));
  }

  return {
    tipo: "arcgis",

    async listar(filtro: FiltroAlertas, limite: number) {
      const condicoes: string[] = [];
      if (!filtro.incluirRascunhos) condicoes.push("situacao <> 'RASCUNHO'");
      let notificados: string[] = [];
      if (filtro.cobs !== null) {
        if (filtro.cobs.length === 0) return { alertas: [], truncado: false };
        // ArcGIS não garante subconsulta no where: os alertas notificados vêm numa consulta à parte.
        const dest = await ler("destinatarios", `cob IN ${lista(filtro.cobs)}`, false);
        notificados = idsValidos([...new Set(dest.map((d) => String(d.attributes.alerta_id ?? "")))]);
        condicoes.push(
          notificados.length
            ? `(cob IN ${lista(filtro.cobs)} OR alerta_id IN ${lista(notificados)})`
            : `cob IN ${lista(filtro.cobs)}`,
        );
      }
      const feicoes = await ler("alertas", condicoes.length ? condicoes.join(" AND ") : "1=1", true);
      const alertas = feicoes
        .map((f) => feicaoParaAlerta(f))
        .filter((a) => passaNoFiltro(a, notificados.includes(a.alertaId) ? (filtro.cobs ?? []) : [], filtro))
        .sort((a, b) => (b.alteradoEm ?? "").localeCompare(a.alteradoEm ?? ""));
      return { alertas: alertas.slice(0, limite), truncado: alertas.length > limite };
    },

    async obter(alertaId) {
      if (!PADRAO_ALERTA_ID.test(alertaId)) return null;
      const [feicao] = await ler("alertas", `alerta_id = ${literal(alertaId)}`, true);
      return feicao ? feicaoParaAlerta(feicao) : null;
    },

    async proximoNumero(tipo, prefixo) {
      if (!/^A[LC]-\d{8}-$/.test(prefixo)) throw new ErroArmazem("Prefixo de numeração inválido.");
      const campo = tipo === "alerta" ? "alerta_id" : "acao_id";
      const feicoes = await ler(tipo === "alerta" ? "alertas" : "acoes", `${campo} LIKE ${literal(`${prefixo}%`)}`, false);
      const ids = feicoes.map((f) => String(f.attributes[campo] ?? ""));
      return maiorNumero(ids, prefixo) + 1;
    },

    async listarDestinatarios(alertaIds) {
      const ids = idsValidos(alertaIds);
      if (ids.length === 0) return [];
      const feicoes = await ler("destinatarios", `alerta_id IN ${lista(ids)}`, false);
      return feicoes.map((f) => atributosParaDestinatario(f.attributes));
    },

    async listarAcoes(alertaIds) {
      const ids = idsValidos(alertaIds);
      if (ids.length === 0) return [];
      const feicoes = await ler("acoes", `alerta_id IN ${lista(ids)}`, true);
      return feicoes.map((f) => feicaoParaAcao(f));
    },

    async listarHistorico(alertaId) {
      if (!PADRAO_ALERTA_ID.test(alertaId)) return [];
      const feicoes = await ler("historico", `alerta_id = ${literal(alertaId)}`, false);
      return feicoes.map((f) => atributosParaEvento(f.attributes)).sort((a, b) => a.quando.localeCompare(b.quando));
    },

    // ESCRITA DESLIGADA nesta fase: nenhuma destas chama o ArcGIS.
    criar: desligada,
    atualizar: desligada,
    apagarRascunho: desligada,
    substituirDestinatarios: desligada,
    atualizarDestinatario: desligada,
    criarAcao: desligada,
    acrescentarHistorico: desligada,
  };
}
