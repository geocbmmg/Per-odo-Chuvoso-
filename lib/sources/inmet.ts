import { XMLParser } from "fast-xml-parser";
import { interpretarDataHoraBrasilia } from "@/lib/datas";
import type { AvisoInmet, SeveridadeInmet } from "@/lib/dominio/tipos";

/**
 * Parser do feed RSS de avisos do INMET (https://apiprevmet3.inmet.gov.br/avisos/rss).
 *
 * Cada <item> traz no <description> (CDATA) uma tabela HTML com as linhas
 * Status, Evento, Severidade, Início, Fim, Descrição, Área e Link Gráfico.
 * Início/Fim vêm em horário de Brasília sem offset ("2026-10-03 00:00:00.0").
 * A Área lista mesorregiões do IBGE ("Aviso para as Áreas: Zona da Mata, ...").
 * Este módulo é puro (sem rede) para ser testado com o fixture real.
 */

export const URL_AVISOS_INMET = "https://apiprevmet3.inmet.gov.br/avisos/rss";

/** As 12 mesorregiões geográficas de Minas Gerais (IBGE), como o INMET as escreve. */
export const MESORREGIOES_MG = [
  "Noroeste de Minas",
  "Norte de Minas",
  "Jequitinhonha",
  "Vale do Mucuri",
  "Triângulo Mineiro/Alto Paranaíba",
  "Central Mineira",
  "Metropolitana de Belo Horizonte",
  "Vale do Rio Doce",
  "Oeste de Minas",
  "Sul/Sudoeste de Minas",
  "Campo das Vertentes",
  "Zona da Mata",
] as const;

function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CHAVES_MG = new Set(MESORREGIOES_MG.map(chave));

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const DIACRITICOS: Record<string, string> = {
  acute: "\u0301",
  grave: "\u0300",
  circ: "\u0302",
  tilde: "\u0303",
  uml: "\u0308",
  cedil: "\u0327",
};

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&([a-z])(acute|grave|circ|tilde|uml|cedil);/gi, (_, letra: string, marca: string) =>
      (letra + DIACRITICOS[marca.toLowerCase()]).normalize("NFC"),
    )
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, corpo: string) => {
      if (corpo.startsWith("#x") || corpo.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(corpo.slice(2), 16));
      }
      if (corpo.startsWith("#")) return String.fromCodePoint(Number.parseInt(corpo.slice(1), 10));
      return ENTIDADES[corpo.toLowerCase()] ?? inteira;
    });
}

function textoPuro(html: string): string {
  return decodificarEntidades(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai pares rótulo → valor da tabela HTML do <description>. */
export function lerTabelaDescricao(html: string): Map<string, string> {
  const linhas = new Map<string, string>();
  const padrao = /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  for (const m of html.matchAll(padrao)) {
    linhas.set(chave(textoPuro(m[1])), textoPuro(m[2]));
  }
  return linhas;
}

export function classificarSeveridade(texto: string | null | undefined): SeveridadeInmet {
  const t = chave(texto ?? "");
  if (t.includes("grande perigo") || t === "extreme") return "grande-perigo";
  if (t.includes("perigo potencial") || t === "moderate") return "perigo-potencial";
  if (t.includes("perigo") || t === "severe") return "perigo";
  return "desconhecida";
}

function separarAreas(texto: string | undefined): string[] {
  if (!texto) return [];
  return texto
    .replace(/^aviso para as [aá]reas\s*:\s*/i, "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export function afetaMinasGerais(areas: string[]): boolean {
  return areas.some((a) => CHAVES_MG.has(chave(a)));
}

/** Mesorregiões de MG presentes na lista de áreas do aviso. */
export function mesorregioesMg(areas: string[]): string[] {
  return areas.filter((a) => CHAVES_MG.has(chave(a)));
}

function comoLista<T>(valor: T | T[] | undefined): T[] {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function textoDe(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "object" && "#text" in (valor as Record<string, unknown>)) {
    return textoDe((valor as Record<string, unknown>)["#text"]);
  }
  const texto = String(valor).trim();
  return texto || null;
}

function idDoLink(link: string | null, guid: string | null, indice: number): string {
  const fonte = guid ?? link ?? "";
  const m = fonte.match(/(\d+)\/?$/);
  return m ? m[1] : `aviso-${indice}`;
}

export interface AvisoInmetBruto extends AvisoInmet {
  /** Status do CAP ("Alert", "Update", "Cancel"). */
  status: string | null;
}

/** Interpreta o XML do RSS. Lança erro se não for um RSS de avisos. */
export function interpretarRssInmet(xml: string): AvisoInmetBruto[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    cdataPropName: false,
    processEntities: true,
    trimValues: true,
    parseTagValue: false,
  });
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const canal = doc?.rss?.channel;
  if (!canal) throw new Error("Resposta do INMET não é um RSS válido");

  return comoLista(canal.item as Record<string, unknown> | Record<string, unknown>[]).map((item, i) => {
    const titulo = textoDe(item.title);
    const link = textoDe(item.link);
    const guid = textoDe(item.guid);
    const tabela = lerTabelaDescricao(textoDe(item.description) ?? "");

    const severidadeRotulo =
      tabela.get("severidade") ?? titulo?.match(/Severidade Grau:\s*(.+)$/i)?.[1]?.trim() ?? "";
    const evento =
      tabela.get("evento") ?? titulo?.replace(/^Aviso de\s+/i, "").replace(/\.\s*Severidade.*$/i, "").trim() ?? "Aviso";
    const areas = separarAreas(tabela.get("area"));
    const linkGrafico = tabela.get("link grafico") ?? null;
    const publicado = textoDe(item.pubDate);
    const publicadoEm = publicado ? new Date(publicado) : null;

    return {
      id: idDoLink(link, guid, i),
      evento,
      severidade: classificarSeveridade(severidadeRotulo),
      severidadeRotulo: severidadeRotulo || "Não informada",
      inicio: interpretarDataHoraBrasilia(tabela.get("inicio"))?.toISOString() ?? null,
      fim: interpretarDataHoraBrasilia(tabela.get("fim"))?.toISOString() ?? null,
      descricao: tabela.get("descricao") ?? null,
      areas,
      link: linkGrafico ?? link,
      publicadoEm: publicadoEm && !Number.isNaN(publicadoEm.getTime()) ? publicadoEm.toISOString() : null,
      status: tabela.get("status") ?? null,
    };
  });
}

export type VigenciaAviso = "vigente" | "futuro" | "expirado";

export function vigenciaDoAviso(aviso: Pick<AvisoInmet, "inicio" | "fim">, agora: Date): VigenciaAviso {
  const t = agora.getTime();
  if (aviso.fim && new Date(aviso.fim).getTime() <= t) return "expirado";
  if (aviso.inicio && new Date(aviso.inicio).getTime() > t) return "futuro";
  return "vigente";
}

const ORDEM_SEVERIDADE: Record<SeveridadeInmet, number> = {
  "grande-perigo": 0,
  perigo: 1,
  "perigo-potencial": 2,
  desconhecida: 3,
};

/**
 * Avisos que afetam MG e ainda valem em `agora` (vigentes ou futuros),
 * sem cancelados, ordenados por severidade e início. Remove o problema do
 * boletim que exibia aviso expirado.
 */
export function filtrarAvisosMg(avisos: AvisoInmetBruto[], agora: Date): AvisoInmet[] {
  return avisos
    .filter((a) => !/cancel/i.test(a.status ?? ""))
    .filter((a) => afetaMinasGerais(a.areas))
    .filter((a) => vigenciaDoAviso(a, agora) !== "expirado")
    .sort(
      (a, b) =>
        ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade] ||
        (a.inicio ?? "").localeCompare(b.inicio ?? ""),
    )
    .map((a) => {
      const { status, ...aviso } = a;
      void status;
      return aviso;
    });
}
