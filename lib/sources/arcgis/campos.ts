import { interpretarDataHoraBrasilia } from "@/lib/datas";
import type { CampoEsri, DominioCodificado } from "./cliente";

/**
 * Resolução de campos por candidatos.
 *
 * Os formulários Survey123 nomeiam campos a partir das perguntas do XLSForm,
 * então o nome exato varia entre serviços. Cada atributo lógico (ex.: "cob",
 * "numeroChamada") tem uma lista de candidatos; o primeiro que casar com o
 * NOME ou com o ALIAS do campo (ignorando caixa, acentos e pontuação) vence.
 * Candidatos terminados em "*" casam por prefixo preservando separadores
 * (ex.: "cob_*" casa "cob_responsavel", mas não "cobrade").
 *
 * O resultado da resolução é exposto em /status para conferência humana.
 */

export function normalizarIdentificador(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[º°ª]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Como normalizarIdentificador, mas mantém fronteiras de palavra como "_". */
function normalizarComSeparador(texto: string, manterSeparadorFinal = false): string {
  const normalizado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[º°ª]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "");
  return manterSeparadorFinal ? normalizado : normalizado.replace(/_+$/, "");
}

function casa(candidato: string, valor: string | undefined): boolean {
  if (!valor) return false;
  if (candidato.endsWith("*")) {
    const prefixo = normalizarComSeparador(candidato.slice(0, -1), true);
    return prefixo.length > 0 && normalizarComSeparador(valor).startsWith(prefixo);
  }
  return normalizarIdentificador(candidato) === normalizarIdentificador(valor);
}

/**
 * Encontra o campo para uma lista de candidatos, NA ORDEM DA LISTA: para cada
 * candidato tenta o nome e depois o alias. Assim um alias específico
 * ("Data de emissão") vence um nome genérico listado depois (CreationDate).
 */
export function resolverCampo(campos: CampoEsri[], candidatos: readonly string[]): CampoEsri | null {
  for (const candidato of candidatos) {
    const campo =
      campos.find((c) => casa(candidato, c.name)) ?? campos.find((c) => casa(candidato, c.alias));
    if (campo) return campo;
  }
  return null;
}

export type MapaCampos<K extends string> = Record<K, CampoEsri | null>;

export function resolverCampos<K extends string>(
  campos: CampoEsri[],
  candidatos: Record<K, readonly string[]>,
): MapaCampos<K> {
  const resultado = {} as MapaCampos<K>;
  for (const chave of Object.keys(candidatos) as K[]) {
    resultado[chave] = resolverCampo(campos, candidatos[chave]);
  }
  return resultado;
}

/** Resumo legível da resolução: atributo lógico → nome do campo (ou null). */
export function resumoResolucao<K extends string>(mapa: MapaCampos<K>): Record<K, string | null> {
  const resumo = {} as Record<K, string | null>;
  for (const chave of Object.keys(mapa) as K[]) {
    resumo[chave] = mapa[chave]?.name ?? null;
  }
  return resumo;
}

function ehDominioCodificado(dominio: CampoEsri["domain"]): dominio is DominioCodificado {
  return !!dominio && dominio.type === "codedValue" && Array.isArray((dominio as DominioCodificado).codedValues);
}

/**
 * Lê o valor bruto de um atributo, traduzindo códigos de domínio
 * (select_one do Survey123 grava o "name" da escolha; o rótulo está no domínio).
 * Escolhas múltiplas (select_multiple) chegam como "a,b,c" e são traduzidas item a item.
 */
export function lerAtributo(atributos: Record<string, unknown>, campo: CampoEsri | null): unknown {
  if (!campo) return null;
  const bruto = atributos[campo.name];
  if (bruto === null || bruto === undefined) return null;
  if (!ehDominioCodificado(campo.domain)) return bruto;

  const rotulos = new Map(campo.domain.codedValues.map((cv) => [String(cv.code), cv.name]));
  const direto = rotulos.get(String(bruto));
  if (direto !== undefined) return direto;
  if (typeof bruto === "string" && bruto.includes(",")) {
    return bruto
      .split(",")
      .map((parte) => rotulos.get(parte.trim()) ?? parte.trim())
      .join(", ");
  }
  return bruto;
}

export function comoTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).replace(/\s+/g, " ").trim();
  if (!texto || /^(null|undefined|n\/a|-+)$/i.test(texto)) return null;
  return texto;
}

export function comoNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const limpo = valor.trim().replace(/\s/g, "");
    if (!limpo) return null;
    // "1.234,5" (pt-BR) → 1234.5 ; "1234.5" → 1234.5
    const normalizado = /,\d+$/.test(limpo) ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
    const n = Number(normalizado);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Datas do ArcGIS:
 * - esriFieldTypeDate: epoch em ms (UTC);
 * - esriFieldTypeDateOnly ("AAAA-MM-DD"): dia civil de Brasília (00:00 -03:00),
 *   não meia-noite UTC (que cairia no dia anterior);
 * - texto sem offset ("AAAA-MM-DD HH:MM", "DD/MM/AAAA HH:MM"): horário de Brasília,
 *   independentemente do fuso do servidor; com Z/offset (TimestampOffset): como veio;
 * - número em texto: 10 dígitos = epoch em segundos; 11–13 = epoch em ms.
 */
export function comoDataIso(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return new Date(valor).toISOString();
  }
  if (typeof valor === "string") {
    const texto = valor.trim();
    if (/^\d{10}$/.test(texto)) return comoDataIso(Number(texto) * 1000);
    if (/^\d{11,13}$/.test(texto)) return comoDataIso(Number(texto));
    const soData = /^(\d{4}-\d{2}-\d{2})$/.exec(texto);
    const data = soData ? new Date(`${soData[1]}T00:00:00-03:00`) : interpretarDataHoraBrasilia(texto);
    return data && !Number.isNaN(data.getTime()) ? data.toISOString() : null;
  }
  return null;
}

/** Nº de chamada CAD normalizado para comparação (só dígitos; sem zeros à esquerda). */
export function normalizarNumeroChamada(valor: unknown): string | null {
  const texto = comoTexto(valor);
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, "").replace(/^0+/, "");
  return digitos.length >= 3 ? digitos : null;
}
