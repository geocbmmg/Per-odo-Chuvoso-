import type { MultiPolygon, Polygon, Position } from "geojson";
import { interpretarDataHoraBrasilia } from "@/lib/datas";
import { gravidade, type NivelRisco } from "@/lib/dominio/matrizes";
import { agruparPorMunicipio, type CamadaRisco } from "@/lib/dominio/risco";
import type { SeveridadeInmet } from "@/lib/dominio/tipos";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { municipioPorIbge } from "@/lib/territorio/municipios";

/**
 * Parser dos avisos ATIVOS do INMET por município
 * (https://apiprevmet3.inmet.gov.br/avisos/ativos), base da camada
 * Meteorológico do mapa de risco (docs/fase-1.md §5).
 *
 * Formato (não documentado pelo INMET; conferido em código público de 2026 —
 * FinweeJur/controle-popular `etl/betim/etl/apis/inmet_avisos.py`,
 * visaodeempresa/mw-ha-leticia-weather `fontes/avisos_inmet.py`,
 * werlang/weather `src/clients/inmet_client.js`, Esl1h/climabr.app
 * `scripts/scrape-alertas.py`, debora-petry/family-dashboard `server/types/inmet.ts`):
 *
 *   {"hoje": [aviso, …], "futuro": [aviso, …]}
 *
 * Cada aviso traz, entre outros:
 * - `id` (o nº do RSS e do link avisos.inmet.gov.br/{id}), `id_aviso` e `id_sequencia`
 *   (versão do aviso alterado; `alterado`), `encerrado`;
 * - `descricao` = o EVENTO ("Chuvas Intensas"), `severidade` ("Perigo Potencial",
 *   "Perigo", "Grande Perigo"), `id_severidade`, `aviso_cor`;
 * - `inicio`/`fim` ("AAAA-MM-DD HH:MM", horário de Brasília) e também
 *   `data_inicio` ("AAAA-MM-DDT00:00:00.000Z" — o "Z" é falso, é só a data) com
 *   `hora_inicio` ("HH:MM", Brasília) à parte; idem para o fim;
 * - `geocodes`: TEXTO com os códigos IBGE separados por vírgula (não é lista);
 *   `municipios`: TEXTO "Nome - UF (IBGE7),…"; `estados`, `mesorregioes`…;
 * - `poligono`: GeoJSON dentro de uma STRING (às vezes já objeto);
 * - `riscos`/`instrucoes`: ora lista, ora texto.
 *
 * Armadilhas tratadas aqui: o mesmo aviso aparece em `hoje` e em `futuro`
 * (fica uma entrada por `id_aviso`, a de maior `id_sequencia`); o polígono
 * corta municípios vizinhos, então a atribuição vem da LISTA IBGE do aviso e o
 * polígono serve só de contorno.
 *
 * Estrito no essencial: resposta sem `hoje` em lista, ou com avisos dos quais
 * nenhum tem severidade e municípios reconhecíveis, é ERRO (o formato mudou),
 * para a Sala cair na última leitura válida em vez de mostrar um mapa vazio.
 * Módulo puro (sem rede).
 */

export const URL_AVISOS_ATIVOS_INMET = "https://apiprevmet3.inmet.gov.br/avisos/ativos";

/** Janela da camada: avisos vigentes agora ou que começam nas próximas N horas. */
export const HORAS_A_FRENTE_AVISOS_INMET = 24;

function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Eventos do período chuvoso
// ---------------------------------------------------------------------------------------------

/** Eventos do INMET que entram no mapa de risco do período chuvoso. */
export const EVENTOS_PERIODO_CHUVOSO = [
  "Chuvas Intensas",
  "Acumulado de Chuva",
  "Tempestade",
  "Vendaval",
  "Granizo",
] as const;

/** Eventos do INMET que NÃO entram (secos, frios ou costeiros). */
export const EVENTOS_FORA_DO_PERIODO_CHUVOSO = [
  "Baixa Umidade",
  "Onda de Calor",
  "Declínio de Temperatura",
  "Onda de Frio",
  "Geada",
  "Ventos Costeiros",
  "Ressaca",
  "Neve",
] as const;

/**
 * Termos que identificam evento do período chuvoso, para aceitar variações de
 * nome ("Chuva", "Chuvas Intensas e Granizo", "Temporal").
 */
const TERMOS_PERIODO_CHUVOSO = ["chuva", "tempestade", "temporal", "vendaval", "granizo"];
const FORA_DO_PERIODO = new Set<string>(EVENTOS_FORA_DO_PERIODO_CHUVOSO.map(chave));

/** O evento (campo `descricao` do aviso) pinta a camada Meteorológico? */
export function eventoDoPeriodoChuvoso(evento: string | null | undefined): boolean {
  const k = chave(evento ?? "");
  if (!k || FORA_DO_PERIODO.has(k)) return false;
  return TERMOS_PERIODO_CHUVOSO.some((t) => k.includes(t));
}

// ---------------------------------------------------------------------------------------------
// Severidade → nível da escala única
// ---------------------------------------------------------------------------------------------

export type SeveridadeAvisoInmet = Exclude<SeveridadeInmet, "desconhecida">;

/** Conversão adotada (docs/fase-1.md §5): o INMET não tem verde nem roxo. */
export const NIVEL_DA_SEVERIDADE_INMET: Readonly<Record<SeveridadeAvisoInmet, NivelRisco>> = {
  "perigo-potencial": "amarelo",
  perigo: "laranja",
  "grande-perigo": "vermelho",
};

const SEVERIDADES: Record<string, SeveridadeAvisoInmet> = {
  "perigo potencial": "perigo-potencial",
  perigo: "perigo",
  "grande perigo": "grande-perigo",
};

/** Só os três rótulos oficiais; qualquer outro texto é desconhecido (o aviso é descartado). */
export function severidadeDoAvisoAtivo(texto: unknown): SeveridadeAvisoInmet | null {
  return typeof texto === "string" ? (SEVERIDADES[chave(texto)] ?? null) : null;
}

// ---------------------------------------------------------------------------------------------
// Campos auxiliares
// ---------------------------------------------------------------------------------------------

/** `geocodes`, `estados`…: texto separado por vírgula ou, se a fonte mudar, lista. */
export function listaDeTexto(valor: unknown): string[] {
  if (valor === null || valor === undefined) return [];
  const partes = Array.isArray(valor) ? valor.map((v) => String(v ?? "")) : String(valor).split(",");
  return partes.map((p) => p.trim()).filter(Boolean);
}

/** Códigos IBGE (7 dígitos) de `geocodes` e dos parênteses de `municipios` ("Nome - UF (3106200)"). */
export function geocodesDoAviso(aviso: Record<string, unknown>): string[] {
  const codigos = new Set<string>();
  for (const parte of listaDeTexto(aviso.geocodes)) {
    if (/^\d{7}$/.test(parte)) codigos.add(parte);
  }
  const municipios = aviso.municipios;
  const texto = Array.isArray(municipios) ? municipios.join(",") : typeof municipios === "string" ? municipios : "";
  for (const m of texto.matchAll(/\((\d{7})\)/g)) codigos.add(m[1]);
  return [...codigos];
}

/** Código IBGE de município de MG conhecido (31xxxxx presente na malha). */
function ehMunicipioMg(ibge: string): boolean {
  return ibge.startsWith("31") && municipioPorIbge(ibge) !== null;
}

/**
 * Data/hora do INMET. Sem offset explícito vale o horário de Brasília — inclusive
 * com o "Z" final, que o INMET põe em horário local. Offset explícito ("-03:00") é respeitado.
 */
export function interpretarDataHoraInmet(texto: unknown): Date | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const limpo = texto.trim();
  if (/[+-]\d{2}:?\d{2}$/.test(limpo) && /\d[T ]\d{2}:\d{2}/.test(limpo)) {
    const data = new Date(limpo);
    return Number.isNaN(data.getTime()) ? null : data;
  }
  return interpretarDataHoraBrasilia(limpo.replace(/(\.\d+)?Z$/i, ""));
}

/** Início ou fim do aviso: `inicio`/`fim` e, na falta deles, `data_*` (só a data) + `hora_*`. */
function instanteDoAviso(aviso: Record<string, unknown>, qual: "inicio" | "fim"): string | null {
  const direto = interpretarDataHoraInmet(aviso[qual]);
  if (direto) return direto.toISOString();

  const dataBruta = aviso[`data_${qual}`];
  if (typeof dataBruta !== "string") return null;
  const data = dataBruta.trim().slice(0, 10);
  const horaBruta = aviso[`hora_${qual}`];
  const hora =
    typeof horaBruta === "string" && /^\d{1,2}:\d{2}/.test(horaBruta.trim())
      ? horaBruta.trim().padStart(5, "0").slice(0, 5)
      : qual === "inicio"
        ? "00:00"
        : "23:59";
  return interpretarDataHoraBrasilia(`${data} ${hora}`)?.toISOString() ?? null;
}

function verdadeiro(valor: unknown): boolean {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor === 1;
  if (typeof valor === "string") return ["1", "true", "s", "sim"].includes(chave(valor));
  return false;
}

/** Encerrado ou cancelado pela fonte. */
function encerrado(aviso: Record<string, unknown>): boolean {
  if (verdadeiro(aviso.encerrado) || verdadeiro(aviso.cancelado)) return true;
  return typeof aviso.status === "string" && /cancel|encerr/i.test(aviso.status);
}

function textoOuNull(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== "string") return null;
  return valor.trim() || null;
}

// Coordenadas com 3 casas decimais (~100 m): o polígono é só contorno e fica menor no cache.
const ESCALA_POLIGONO = 1000;

function posicao(valor: unknown): Position | null {
  if (!Array.isArray(valor) || valor.length < 2) return null;
  const [lon, lat] = valor;
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }
  return [Math.round(lon * ESCALA_POLIGONO) / ESCALA_POLIGONO, Math.round(lat * ESCALA_POLIGONO) / ESCALA_POLIGONO];
}

function anel(valor: unknown): Position[] | null {
  if (!Array.isArray(valor) || valor.length < 4) return null;
  const pontos = valor.map(posicao);
  return pontos.every((p): p is Position => p !== null) ? pontos : null;
}

function aneis(valor: unknown): Position[][] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const lista = valor.map(anel);
  return lista.every((a): a is Position[] => a !== null) ? lista : null;
}

/**
 * Polígono do aviso (GeoJSON em string ou objeto; Polygon, MultiPolygon ou
 * Feature). Ordem [lon, lat]. Inválido → null (o polígono não é essencial).
 */
export function interpretarPoligonoInmet(valor: unknown): Polygon | MultiPolygon | null {
  let geo: unknown = valor;
  if (typeof geo === "string") {
    if (!geo.trim()) return null;
    try {
      geo = JSON.parse(geo);
    } catch {
      return null;
    }
  }
  if (!geo || typeof geo !== "object") return null;
  const objeto = geo as { type?: unknown; coordinates?: unknown; geometry?: unknown };
  if (objeto.type === "Feature") return interpretarPoligonoInmet(objeto.geometry);
  if (objeto.type === "Polygon") {
    const coordinates = aneis(objeto.coordinates);
    return coordinates ? { type: "Polygon", coordinates } : null;
  }
  if (objeto.type === "MultiPolygon" && Array.isArray(objeto.coordinates) && objeto.coordinates.length > 0) {
    const partes = objeto.coordinates.map(aneis);
    return partes.every((p): p is Position[][] => p !== null) ? { type: "MultiPolygon", coordinates: partes } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Interpretação da resposta
// ---------------------------------------------------------------------------------------------

export interface AvisoInmetMunicipios {
  /** Nº do aviso (o mesmo do RSS e do link avisos.inmet.gov.br/{id}). */
  id: string;
  /** `id_aviso`: agrupa as versões de um aviso alterado. */
  idAviso: string | null;
  /** Evento (campo `descricao` do INMET): "Chuvas Intensas", "Tempestade"… */
  evento: string;
  severidade: SeveridadeAvisoInmet;
  /** Texto original da severidade. */
  severidadeRotulo: string;
  nivel: NivelRisco;
  /** ISO (UTC); null quando a fonte não informa (tratado como sem limite). */
  inicio: string | null;
  fim: string | null;
  /** Municípios de MG atingidos (código IBGE), pela lista oficial do aviso. */
  geocodes: string[];
  link: string | null;
  /** Contorno do aviso. Corta municípios vizinhos: nunca usar para atribuição. */
  poligono: Polygon | MultiPolygon | null;
}

/** Registros descartados, por motivo (exibidos em /status e na resposta da API). */
export interface DescartesAvisosInmet {
  /** Entrada que não é objeto. */
  invalidos: number;
  encerrados: number;
  severidadeDesconhecida: number;
  /** Aviso sem nenhum município de MG. */
  foraDeMg: number;
  /** Repetição do mesmo aviso (em `hoje` e `futuro`) ou versão anterior de aviso alterado. */
  repetidos: number;
}

export interface AvisosInmetAtivos {
  /** Entradas recebidas (hoje + futuro). */
  recebidos: number;
  /** Avisos que atingem MG, sem encerrados e com severidade reconhecida (todos os eventos). */
  avisos: AvisoInmetMunicipios[];
  descartados: DescartesAvisosInmet;
}

interface Candidato {
  aviso: AvisoInmetMunicipios;
  grupo: string;
  sequencia: number;
}

function numero(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  return Number.isFinite(n) ? n : -1;
}

/** Junta duas entradas do mesmo aviso: janela mais larga, municípios somados, maior severidade. */
function juntar(a: AvisoInmetMunicipios, b: AvisoInmetMunicipios): AvisoInmetMunicipios {
  const minimo = (x: string | null, y: string | null) => (x === null || y === null ? null : x < y ? x : y);
  const maximo = (x: string | null, y: string | null) => (x === null || y === null ? null : x > y ? x : y);
  const maisGrave = gravidade(b.nivel) > gravidade(a.nivel) ? b : a;
  return {
    ...a,
    severidade: maisGrave.severidade,
    severidadeRotulo: maisGrave.severidadeRotulo,
    nivel: maisGrave.nivel,
    inicio: minimo(a.inicio, b.inicio),
    fim: maximo(a.fim, b.fim),
    geocodes: [...new Set([...a.geocodes, ...b.geocodes])],
    poligono: a.poligono ?? b.poligono,
  };
}

/**
 * Interpreta a resposta de /avisos/ativos: só avisos com município de MG, não
 * encerrados e com severidade oficial. O filtro de evento e de janela fica em
 * `selecionarAvisosRisco`, aplicado a cada consulta (o cache guarda esta saída).
 */
export function interpretarAvisosAtivosInmet(corpo: unknown): AvisosInmetAtivos {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new Error("Resposta do INMET (avisos ativos) não é um objeto {hoje, futuro}");
  }
  const { hoje, futuro } = corpo as { hoje?: unknown; futuro?: unknown };
  if (!Array.isArray(hoje)) throw new Error("Resposta do INMET (avisos ativos) sem a lista \"hoje\"");
  if (futuro !== undefined && futuro !== null && !Array.isArray(futuro)) {
    throw new Error("Resposta do INMET (avisos ativos) com \"futuro\" que não é lista");
  }

  const entradas: unknown[] = [...hoje, ...((futuro as unknown[] | null | undefined) ?? [])];
  const descartados: DescartesAvisosInmet = {
    invalidos: 0,
    encerrados: 0,
    severidadeDesconhecida: 0,
    foraDeMg: 0,
    repetidos: 0,
  };
  let reconhecidos = 0;
  const candidatos: Candidato[] = [];

  entradas.forEach((entrada, i) => {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
      descartados.invalidos++;
      return;
    }
    const bruto = entrada as Record<string, unknown>;
    const severidade = severidadeDoAvisoAtivo(bruto.severidade);
    const todos = geocodesDoAviso(bruto);
    if (severidade && todos.length > 0) reconhecidos++;

    if (encerrado(bruto)) {
      descartados.encerrados++;
      return;
    }
    if (!severidade) {
      descartados.severidadeDesconhecida++;
      return;
    }
    const geocodes = todos.filter(ehMunicipioMg).sort();
    if (geocodes.length === 0) {
      descartados.foraDeMg++;
      return;
    }

    const id = textoOuNull(bruto.id) ?? textoOuNull(bruto.id_aviso) ?? `aviso-${i}`;
    const idAviso = textoOuNull(bruto.id_aviso);
    candidatos.push({
      grupo: idAviso ?? id,
      sequencia: numero(bruto.id_sequencia),
      aviso: {
        id,
        idAviso,
        evento: textoOuNull(bruto.descricao) ?? textoOuNull(bruto.evento) ?? "Aviso meteorológico",
        severidade,
        severidadeRotulo: String(bruto.severidade).trim(),
        nivel: NIVEL_DA_SEVERIDADE_INMET[severidade],
        inicio: instanteDoAviso(bruto, "inicio"),
        fim: instanteDoAviso(bruto, "fim"),
        geocodes,
        link: /^\d+$/.test(id) ? `https://avisos.inmet.gov.br/${id}` : null,
        poligono: interpretarPoligonoInmet(bruto.poligono),
      },
    });
  });

  if (entradas.length > 0 && reconhecidos === 0) {
    throw new Error(
      "Formato dos avisos ativos do INMET não reconhecido: nenhum aviso com severidade e municípios (IBGE)",
    );
  }

  // Uma entrada por aviso: a versão mais recente (maior id_sequencia); repetições dela são juntadas.
  const porGrupo = new Map<string, Candidato[]>();
  for (const c of candidatos) porGrupo.set(c.grupo, [...(porGrupo.get(c.grupo) ?? []), c]);
  const avisos: AvisoInmetMunicipios[] = [];
  for (const grupo of porGrupo.values()) {
    const ultima = Math.max(...grupo.map((c) => c.sequencia));
    const atuais = grupo.filter((c) => c.sequencia === ultima).map((c) => c.aviso);
    descartados.repetidos += grupo.length - 1;
    avisos.push(atuais.reduce(juntar));
  }
  avisos.sort((a, b) => gravidade(b.nivel) - gravidade(a.nivel) || (a.inicio ?? "").localeCompare(b.inicio ?? ""));

  return { recebidos: entradas.length, avisos, descartados };
}

// ---------------------------------------------------------------------------------------------
// Seleção para o mapa de risco e camada Meteorológico
// ---------------------------------------------------------------------------------------------

export interface AvisoInmetRisco extends AvisoInmetMunicipios {
  /** "vigente" agora ou "futuro" (começa dentro da janela; a UI diz "a partir de"). */
  vigencia: "vigente" | "futuro";
}

export interface DescartesSelecaoInmet extends DescartesAvisosInmet {
  /** Evento fora do período chuvoso (baixa umidade, onda de calor, geada…). */
  foraDoPeriodoChuvoso: number;
  /** Já terminou ou começa depois da janela. */
  foraDaJanela: number;
}

export interface AvisosInmetRisco {
  recebidos: number;
  avisos: AvisoInmetRisco[];
  descartados: DescartesSelecaoInmet;
}

/**
 * Situação do aviso na janela [agora, agora + horas]: vigente, futuro (começa
 * dentro da janela) ou null (fora). Bordas inclusivas; início/fim ausente = sem limite.
 */
export function vigenciaNaJanela(
  aviso: Pick<AvisoInmetMunicipios, "inicio" | "fim">,
  agora: Date,
  horas: number = HORAS_A_FRENTE_AVISOS_INMET,
): AvisoInmetRisco["vigencia"] | null {
  const t = agora.getTime();
  if (aviso.fim && new Date(aviso.fim).getTime() < t) return null;
  if (!aviso.inicio || new Date(aviso.inicio).getTime() <= t) return "vigente";
  return new Date(aviso.inicio).getTime() <= t + horas * 3_600_000 ? "futuro" : null;
}

/** Avisos do período chuvoso vigentes ou que começam nas próximas 24 h. */
export function selecionarAvisosRisco(dados: AvisosInmetAtivos, agora: Date): AvisosInmetRisco {
  const descartados: DescartesSelecaoInmet = { ...dados.descartados, foraDoPeriodoChuvoso: 0, foraDaJanela: 0 };
  const avisos: AvisoInmetRisco[] = [];
  for (const aviso of dados.avisos) {
    if (!eventoDoPeriodoChuvoso(aviso.evento)) {
      descartados.foraDoPeriodoChuvoso++;
      continue;
    }
    const vigencia = vigenciaNaJanela(aviso, agora);
    if (!vigencia) {
      descartados.foraDaJanela++;
      continue;
    }
    avisos.push({ ...aviso, vigencia });
  }
  return { recebidos: dados.recebidos, avisos, descartados };
}

export const COBERTURA_METEOROLOGICO =
  "Municípios na lista de um aviso do INMET de chuva, tempestade ou vendaval vigente ou que começa nas próximas 24 h. Sem aviso não quer dizer sem chuva.";

/** Camada Meteorológico: um item por aviso × município; vale o aviso mais grave. */
export function camadaMeteorologica(avisos: readonly AvisoInmetRisco[]): CamadaRisco {
  const itens = avisos.flatMap((a) =>
    a.geocodes.map((ibge) => ({
      ibge,
      nivel: a.nivel,
      titulo: `${a.evento} · ${a.severidadeRotulo}`,
      fonte: "INMET",
      inicio: a.inicio,
      fim: a.fim,
      ref: a.id,
    })),
  );
  return {
    id: "meteorologico",
    municipios: agruparPorMunicipio(itens),
    cobertura: COBERTURA_METEOROLOGICO,
    credito: CATALOGO_FONTES["inmet-municipios"].credito,
  };
}
