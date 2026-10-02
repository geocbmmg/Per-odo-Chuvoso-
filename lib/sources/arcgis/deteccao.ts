import { resolverCampo, resolverCampos, type MapaCampos } from "./campos";
import type { CamadasServicoEsri, CampoEsri, MetadadosCamadaEsri } from "./cliente";

/**
 * Escolha automática da camada de um formulário Survey123.
 *
 * Um serviço de formulário pode ter mais de uma camada ou tabela (camada
 * principal, repetições, versões antigas). O índice configurado em camadas.ts
 * é só a preferência: vence a camada ou tabela que resolver mais atributos-chave
 * do formulário. Empate fica com o índice configurado, depois com camadas antes
 * de tabelas. O resultado aparece em /status.
 */

export interface CamadaEscolhida {
  metadados: MetadadosCamadaEsri;
  tipo: "camada" | "tabela";
  /** Atributos-chave resolvidos nesta camada. */
  pontuacao: number;
  /** Total de atributos-chave considerados. */
  total: number;
  /** true quando a escolha difere do índice configurado. */
  diferenteDaConfigurada: boolean;
}

type Entrada = { metadados: MetadadosCamadaEsri; tipo: "camada" | "tabela" };

function entradas(servico: CamadasServicoEsri): Entrada[] {
  return [
    ...servico.layers.map((metadados) => ({ metadados, tipo: "camada" as const })),
    ...servico.tables.map((metadados) => ({ metadados, tipo: "tabela" as const })),
  ];
}

function pontuar<K extends string>(campos: CampoEsri[], candidatos: Record<K, readonly string[]>, chaves: readonly K[]) {
  const mapa: MapaCampos<K> = resolverCampos(campos, candidatos);
  return chaves.filter((k) => mapa[k] !== null).length;
}

export function escolherCamada<K extends string>(
  servico: CamadasServicoEsri,
  opcoes: {
    preferida: number;
    candidatos: Record<K, readonly string[]>;
    chaves: readonly K[];
    /** Índices que não podem ser a camada principal (ex.: a tabela de repetição). */
    excluir?: readonly number[];
  },
): CamadaEscolhida | null {
  const lista = entradas(servico).filter((e) => !opcoes.excluir?.includes(e.metadados.id));
  if (lista.length === 0) return null;
  const pontuadas = lista.map((e) => ({ ...e, pontuacao: pontuar(e.metadados.fields, opcoes.candidatos, opcoes.chaves) }));
  pontuadas.sort(
    (a, b) =>
      b.pontuacao - a.pontuacao ||
      Number(b.metadados.id === opcoes.preferida) - Number(a.metadados.id === opcoes.preferida) ||
      Number(b.tipo === "camada") - Number(a.tipo === "camada") ||
      a.metadados.id - b.metadados.id,
  );
  const melhor = pontuadas[0];
  return {
    metadados: melhor.metadados,
    tipo: melhor.tipo,
    pontuacao: melhor.pontuacao,
    total: opcoes.chaves.length,
    diferenteDaConfigurada: melhor.metadados.id !== opcoes.preferida,
  };
}

const CAMPO_PAI = ["parentglobalid", "parent_globalid", "parentrowid", "parent_guid"] as const;

/**
 * Tabela de repetição (repeat do XLSForm) ligada à camada principal: tem o
 * campo `parentglobalid` e resolve o atributo de conteúdo pedido (ex.: a
 * descrição da ação). Devolve também o campo de ligação.
 */
export function encontrarRepeticao<K extends string>(
  servico: CamadasServicoEsri,
  opcoes: { principal: number; candidatos: Record<K, readonly string[]>; conteudo: K },
): { metadados: MetadadosCamadaEsri; campoPai: CampoEsri } | null {
  for (const { metadados } of entradas(servico)) {
    if (metadados.id === opcoes.principal) continue;
    const campoPai = resolverCampo(metadados.fields, CAMPO_PAI);
    if (!campoPai) continue;
    if (resolverCampo(metadados.fields, opcoes.candidatos[opcoes.conteudo]) === null) continue;
    return { metadados, campoPai };
  }
  return null;
}

/** GlobalID comparável: sem chaves, maiúsculas ("{ab-..}" = "AB-.."). */
export function normalizarGuid(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().replace(/^\{|\}$/g, "").toUpperCase();
  return limpo || null;
}
