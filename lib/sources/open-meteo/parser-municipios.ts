import { resumirChuva, type ChuvaPorMunicipio } from "@/lib/dominio/chuva";
import { erroOpenMeteo, numeroOuNull, primeiroRegistroDaJanela } from "./parser";

/**
 * Chuva prevista nas 853 sedes municipais (Open-Meteo, docs/fase-1.md §6). Puro.
 *
 * Consulta: POST /v1/forecast com o corpo em formulário
 * (application/x-www-form-urlencoded) e os MESMOS parâmetros do GET. Conferido
 * no código da Open-Meteo (github.com/open-meteo/open-meteo, ramo main, 10/2026):
 *  - Sources/App/routes.swift: `getAndPost` registra GET e POST na mesma rota,
 *    com corpo de até 128 KB; Controllers/ForecastapiController.swift usa
 *    `getAndPost("forecast", ...)`;
 *  - Helper/Vapor/ApiKeyManager.swift, `parseApiParams`: POST → `content.decode`,
 *    GET → `query.decode`. No Vapor 4.122 (ContentConfiguration.swift) os dois
 *    usam o mesmo `URLEncodedFormDecoder()` (listas separadas por vírgula);
 *  - a API gratuita aceita POST sem chave (só recusa POST COM chave no host
 *    gratuito); o cliente oficial em Python (open-meteo/python-requests,
 *    Client.py) envia o POST como formulário (`data=params`);
 *  - até 1.000 locais por requisição no plano gratuito (configure.swift,
 *    LOCATIONS_LIMIT). A cota conta 1 chamada por local (853 por consulta).
 * O corpo tem ~19 KB e substitui uma URL que passaria dos 8 KB.
 *
 * Resposta: um ARRAY de blocos, um por ponto, na ordem pedida (objeto único se
 * houver um só ponto). A partir do 2º bloco a API inclui `location_id` = índice
 * do ponto. Com timezone=America/Sao_Paulo, `hourly.time` vem em hora local sem
 * offset ("2026-10-02T14:00") e `utc_offset_seconds` dá o deslocamento.
 * Erro: HTTP 400 com {"error": true, "reason": "..."}.
 *
 * A resposta bruta tem ~2,5 MB. A "última leitura válida" (que pode ir para o
 * Postgres) guarda só o CACHE COMPACTO: um eixo de tempo comum e uma série de mm
 * por hora para cada município, já sem as horas passadas. As janelas de 24 h e
 * 72 h são recalculadas a cada requisição a partir de "agora".
 */

export const MODELO_MUNICIPIOS = "best_match";

/**
 * Dias pedidos. A série começa à 00:00 local do dia da consulta; com 5 dias
 * (120 h) a janela de 72 h fica completa por pelo menos 24 h depois da consulta,
 * mais que o limite "fora do ar" da fonte (1 dia).
 */
export const DIAS_MUNICIPIOS = 5;

/** Horas da maior janela (72 h). */
export const HORAS_JANELA = 72;

/** Distância máxima (graus) entre o ponto pedido e a célula devolvida: acima disso, a ordem não confere. */
const TOLERANCIA_COORDENADA = 0.5;

const HORA_MS = 3_600_000;

export interface PontoMunicipio {
  /** Código IBGE de 7 dígitos. */
  ibge: string;
  latitude: number;
  longitude: number;
}

/** Cache compacto: o que vira "última leitura válida". */
export interface CacheChuvaMunicipios {
  /**
   * ISO (UTC) do primeiro registro guardado. O registro k tem o rótulo
   * primeiraHoraIso + k horas e traz a chuva da hora ANTERIOR ao rótulo.
   */
  primeiraHoraIso: string;
  /** `utc_offset_seconds` da resposta (-10800 em Brasília). */
  offsetSegundos: number;
  /** Modelo pedido à Open-Meteo (para o crédito). */
  modelo: string;
  /** Chuva (mm) de cada registro, por código IBGE. null = hora sem dado. */
  series: Record<string, (number | null)[]>;
}

/** Parâmetros da consulta (corpo do POST; também valem como query string de um GET). */
export function montarConsultaMunicipios(pontos: readonly PontoMunicipio[], dias = DIAS_MUNICIPIOS): URLSearchParams {
  return new URLSearchParams({
    latitude: pontos.map((p) => p.latitude.toFixed(4)).join(","),
    longitude: pontos.map((p) => p.longitude.toFixed(4)).join(","),
    hourly: "precipitation",
    timezone: "America/Sao_Paulo",
    forecast_days: String(dias),
  });
}

interface BlocoMunicipio {
  latitude?: unknown;
  longitude?: unknown;
  location_id?: unknown;
  utc_offset_seconds?: unknown;
  hourly?: { time?: unknown; precipitation?: unknown };
}

const RE_HORA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00)?$/;

/** "2026-10-02T14:00" (hora local) + offset → instante em ms; NaN se o formato não confere. */
function instanteDoRotulo(rotulo: unknown, offsetSegundos: number): number {
  const m = typeof rotulo === "string" ? RE_HORA_LOCAL.exec(rotulo) : null;
  if (!m) return Number.NaN;
  const [, a, mes, d, h, min] = m.map(Number);
  return Date.UTC(a, mes - 1, d, h, min) - offsetSegundos * 1000;
}

/** mm por hora: número finito e não negativo, com 2 casas; qualquer outra coisa é hora sem dado. */
function chuvaDaHora(valor: unknown): number | null {
  const n = numeroOuNull(valor);
  return n === null || n < 0 ? null : Math.round(n * 100) / 100;
}

/**
 * Valida a resposta e devolve o cache compacto, sem os registros que já
 * passaram em `agoraCarga` (anteriores ao 1º registro da janela). Lança erro em
 * qualquer inconsistência: resposta inválida nunca vira leitura válida.
 */
export function compactarRespostaMunicipios(
  corpo: unknown,
  pontos: readonly PontoMunicipio[],
  agoraCarga: Date,
): CacheChuvaMunicipios {
  const erro = erroOpenMeteo(corpo);
  if (erro) throw new Error(`Open-Meteo: ${erro}`);
  if (!corpo || typeof corpo !== "object") throw new Error("Open-Meteo: resposta vazia ou fora do formato");

  const blocos = (Array.isArray(corpo) ? corpo : [corpo]) as BlocoMunicipio[];
  if (blocos.length !== pontos.length) {
    throw new Error(`Open-Meteo devolveu ${blocos.length} pontos, esperados ${pontos.length}`);
  }
  if (blocos.length === 0) throw new Error("Open-Meteo: nenhum ponto consultado");

  // Eixo de tempo: o do 1º bloco, conferido hora a hora; os demais têm de ser iguais.
  const primeiro = blocos[0];
  const offsetSegundos = typeof primeiro.utc_offset_seconds === "number" ? primeiro.utc_offset_seconds : -10800;
  const tempos = primeiro.hourly?.time;
  if (!Array.isArray(tempos) || tempos.length === 0) throw new Error("Open-Meteo: resposta sem hourly.time");
  const inicio = instanteDoRotulo(tempos[0], offsetSegundos);
  tempos.forEach((t, k) => {
    if (instanteDoRotulo(t, offsetSegundos) !== inicio + k * HORA_MS) {
      throw new Error(`Open-Meteo: horário fora da sequência horária (${String(t)})`);
    }
  });

  // Corta o que já passou: a janela nunca volta para trás.
  const corte = Math.max(0, Math.ceil((primeiroRegistroDaJanela(agoraCarga) - inicio) / HORA_MS));
  if (tempos.length - corte < HORAS_JANELA) {
    throw new Error(`Open-Meteo: previsão com ${Math.max(0, tempos.length - corte)} h à frente, mínimo ${HORAS_JANELA} h`);
  }

  const series: Record<string, (number | null)[]> = {};
  let algumValor = false;
  blocos.forEach((bloco, i) => {
    const ponto = pontos[i];
    if (!bloco || typeof bloco !== "object") throw new Error(`Open-Meteo: ponto ${i} fora do formato`);
    // A partir do 2º bloco a API informa location_id = índice: confere a ordem.
    if (bloco.location_id !== undefined && bloco.location_id !== i) {
      throw new Error(`Open-Meteo: ponto ${i} veio com location_id ${String(bloco.location_id)}`);
    }
    if (
      typeof bloco.latitude !== "number" ||
      typeof bloco.longitude !== "number" ||
      Math.abs(bloco.latitude - ponto.latitude) > TOLERANCIA_COORDENADA ||
      Math.abs(bloco.longitude - ponto.longitude) > TOLERANCIA_COORDENADA
    ) {
      throw new Error(`Open-Meteo: coordenadas do ponto ${i} não conferem com ${ponto.ibge} (ordem trocada?)`);
    }
    const offset = typeof bloco.utc_offset_seconds === "number" ? bloco.utc_offset_seconds : -10800;
    const t = bloco.hourly?.time;
    const chuva = bloco.hourly?.precipitation;
    if (
      offset !== offsetSegundos ||
      !Array.isArray(t) ||
      t.length !== tempos.length ||
      t[0] !== tempos[0] ||
      t[t.length - 1] !== tempos[tempos.length - 1]
    ) {
      throw new Error(`Open-Meteo: eixo de tempo do ponto ${i} difere do primeiro`);
    }
    if (!Array.isArray(chuva) || chuva.length !== tempos.length) {
      throw new Error(`Open-Meteo: ponto ${i} sem hourly.precipitation completo`);
    }
    const serie = chuva.slice(corte).map(chuvaDaHora);
    if (!algumValor) algumValor = serie.some((v) => v !== null);
    series[ponto.ibge] = serie;
  });
  if (!algumValor) throw new Error("Open-Meteo: nenhuma hora com chuva prevista válida");

  return {
    primeiraHoraIso: new Date(inicio + corte * HORA_MS).toISOString(),
    offsetSegundos,
    modelo: MODELO_MUNICIPIOS,
    series,
  };
}

/** Confere a forma do cache lido do armazém (ex.: Postgres com formato antigo). */
export function ehCacheChuvaMunicipios(dados: unknown): dados is CacheChuvaMunicipios {
  if (!dados || typeof dados !== "object") return false;
  const c = dados as Partial<CacheChuvaMunicipios>;
  return (
    typeof c.primeiraHoraIso === "string" &&
    !Number.isNaN(Date.parse(c.primeiraHoraIso)) &&
    typeof c.offsetSegundos === "number" &&
    typeof c.modelo === "string" &&
    !!c.series &&
    typeof c.series === "object" &&
    Object.values(c.series).every(Array.isArray)
  );
}

/**
 * Início da janela em `agora`: a hora cheia corrente (ISO, UTC) e o índice,
 * no cache, do 1º registro usado (o de floor(agora)+1h, que traz a chuva da
 * hora em curso). Se o relógio desta instância estiver atrás do da instância
 * que gravou o cache (a janela "começaria antes do cache"), vale o 1º registro
 * guardado: um segundo de diferença não pode apagar o mapa inteiro.
 */
export function inicioDaJanela(cache: CacheChuvaMunicipios, agora: Date): { inicioJanela: string; indice: number } {
  const primeiroCache = Date.parse(cache.primeiraHoraIso);
  const primeiro = Math.max(primeiroRegistroDaJanela(agora), primeiroCache);
  return {
    inicioJanela: new Date(primeiro - HORA_MS).toISOString(),
    indice: Math.max(0, Math.ceil((primeiro - primeiroCache) / HORA_MS)),
  };
}

/** `horas` registros a partir de `indice`; o que falta (antes ou depois da série) é null. */
export function horasDaJanela(
  serie: readonly (number | null)[] | undefined,
  indice: number,
  horas = HORAS_JANELA,
): (number | null)[] {
  return Array.from({ length: horas }, (_, k) => serie?.[indice + k] ?? null);
}

/**
 * Resume o cache nas janelas de 24 h e 72 h a partir de `agora`, na ordem de
 * `ibges`. Município sem série fica com todos os valores e níveis null.
 */
export function resumirCacheChuva(
  cache: CacheChuvaMunicipios,
  ibges: readonly string[],
  agora: Date,
): ChuvaPorMunicipio {
  const { inicioJanela, indice } = inicioDaJanela(cache, agora);
  return {
    inicioJanela,
    modelo: cache.modelo,
    municipios: ibges.map((ibge) => resumirChuva(ibge, horasDaJanela(cache.series[ibge], indice))),
  };
}
