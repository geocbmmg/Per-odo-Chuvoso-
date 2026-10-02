import { dentroDoPeriodo } from "@/lib/dominio/periodo";
import {
  SEM_COB,
  type AcaoRrd,
  type Alerta,
  type ContagemPorCob,
  type Indicadores,
  type OcorrenciaComplexa,
  type Periodo,
  type SituacaoOcorrencia,
} from "@/lib/dominio/tipos";
import { normalizarNumeroChamada } from "@/lib/sources/arcgis/campos";
import { compararCobs } from "@/lib/territorio";

/**
 * Indicadores da Visão Geral, calculados dos registros normalizados.
 *
 * Regra de "pendente" (configurável aqui, documentada no README): um alerta
 * do período é pendente quando NÃO existe nenhuma ação RRD — de qualquer
 * data — com o mesmo nº de chamada CAD. Alertas sem nº de chamada não podem
 * ser vinculados: entram como pendentes e também em `alertasSemNumeroChamada`.
 */
export function calcularIndicadores(
  periodo: Periodo,
  alertas: Alerta[],
  acoes: AcaoRrd[],
  ocorrencias: OcorrenciaComplexa[] | null,
): Indicadores {
  const alertasPeriodo = alertas.filter((a) => dentroDoPeriodo(a.emitidoEm, periodo));
  const acoesPeriodo = acoes.filter((a) => dentroDoPeriodo(a.executadaEm, periodo));

  const chamadasComAcao = new Set(
    acoes.map((a) => normalizarNumeroChamada(a.numeroChamada)).filter((n): n is string => n !== null),
  );

  const porCob = new Map<string, ContagemPorCob>();
  const linha = (cob: string | null): ContagemPorCob => {
    const chave = cob ?? SEM_COB;
    let item = porCob.get(chave);
    if (!item) {
      item = { cob: chave, alertas: 0, acoesRrd: 0, pendentes: 0 };
      porCob.set(chave, item);
    }
    return item;
  };

  let pendentes = 0;
  let semNumero = 0;
  const porTipo = new Map<string, number>();

  for (const alerta of alertasPeriodo) {
    const item = linha(alerta.cob);
    item.alertas++;
    const numero = normalizarNumeroChamada(alerta.numeroChamada);
    if (!numero) semNumero++;
    if (!numero || !chamadasComAcao.has(numero)) {
      pendentes++;
      item.pendentes++;
    }
    const tipo = alerta.tipoRisco ?? "Não informado";
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }

  for (const acao of acoesPeriodo) {
    linha(acao.cob).acoesRrd++;
  }

  let situacoes: Record<SituacaoOcorrencia, number> | null = null;
  if (ocorrencias) {
    situacoes = { "em-andamento": 0, monitoramento: 0, finalizada: 0, desconhecida: 0 };
    for (const o of ocorrencias) {
      // Ocorrências em andamento/monitoramento contam sempre; finalizadas só no período.
      if (o.situacao === "finalizada" && !dentroDoPeriodo(o.iniciadaEm, periodo)) continue;
      situacoes[o.situacao]++;
    }
  }

  return {
    periodo,
    totalAlertas: alertasPeriodo.length,
    totalAcoesRrd: acoesPeriodo.length,
    alertasPendentes: pendentes,
    alertasSemNumeroChamada: semNumero,
    porCob: [...porCob.values()].sort((a, b) => compararCobs(a.cob, b.cob)),
    porTipoRisco: [...porTipo.entries()]
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo, "pt-BR")),
    ocorrenciasComplexas: situacoes,
  };
}
