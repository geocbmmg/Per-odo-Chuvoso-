import { DIAS_MUNICIPIOS, type PontoMunicipio } from "@/lib/sources/open-meteo/parser-municipios";

/**
 * Resposta fictícia da Open-Meteo para as 853 sedes municipais (modo exemplo),
 * no formato BRUTO da API (o mesmo de um POST /v1/forecast com hourly=precipitation,
 * timezone=America/Sao_Paulo e forecast_days=5): array de blocos com latitude,
 * longitude, utc_offset_seconds, location_id (a partir do 2º) e hourly.time em
 * hora local. Passa pelo mesmo parser da produção.
 *
 * Determinística (sem Math.random): a chuva é soma de "células" gaussianas no
 * espaço e no tempo, algumas se deslocando. O cenário é contado a partir da
 * hora cheia corrente, então fica sempre "à frente" de agora; as pancadas de
 * fim de tarde seguem o relógio de Brasília. Cenário de período chuvoso:
 *  - Zona da Mata: faixa de chuva persistente (tipo ZCAS) com núcleo sobre Juiz
 *    de Fora no 2º dia — vermelho em alguns municípios e roxo em poucos (72 h);
 *  - Região Metropolitana de BH: temporal nas próximas horas, laranja/amarelo;
 *  - Sul de Minas: chuva moderada contínua, amarelo;
 *  - Triângulo/Alto Paranaíba: pancadas isoladas de fim de tarde;
 *  - Norte de Minas: seco (verde).
 */

interface Celula {
  /** Centro no instante do pico (graus). */
  lat: number;
  lon: number;
  /** Deslocamento do centro (graus por hora). */
  vLat: number;
  vLon: number;
  /** Desvio-padrão (graus) ao longo do eixo maior e perpendicular a ele. */
  sigmaEixo: number;
  sigmaTransv: number;
  /** Direção do eixo maior, em graus a partir do leste (anti-horário). */
  rumo: number;
  /** Chuva no centro, no pico (mm/h). */
  picoMmH: number;
  /** Instante do pico, em horas a partir da hora cheia corrente. */
  tPico: number;
  /** Desvio-padrão no tempo (h). */
  duracao: number;
}

const HORA_MS = 3_600_000;
const OFFSET_SEGUNDOS = -10800;

function celula(c: Partial<Celula> & Pick<Celula, "lat" | "lon" | "picoMmH" | "tPico" | "duracao">): Celula {
  return { vLat: 0, vLon: 0, sigmaEixo: 0.12, sigmaTransv: 0.12, rumo: 0, ...c };
}

/** Sistemas contados da hora cheia corrente. */
const SISTEMAS: Celula[] = [
  // Zona da Mata: faixa SO–NE persistente, pico no 2º dia, derivando devagar para NE.
  celula({ lat: -21.3, lon: -42.9, vLat: 0.004, vLon: 0.005, sigmaEixo: 1.0, sigmaTransv: 0.35, rumo: 40, picoMmH: 8, tPico: 32, duracao: 7 }),
  // Núcleo convectivo quase parado sobre Juiz de Fora.
  celula({ lat: -21.75, lon: -43.37, sigmaEixo: 0.1, sigmaTransv: 0.1, picoMmH: 9, tPico: 30, duracao: 6 }),
  // Temporal na Região Metropolitana de BH, andando para leste.
  celula({ lat: -19.95, lon: -44.05, vLon: 0.02, sigmaEixo: 0.35, sigmaTransv: 0.28, picoMmH: 12, tPico: 14, duracao: 3.5 }),
  // Sul de Minas: chuva moderada e contínua, andando para NE.
  celula({ lat: -21.9, lon: -45.6, vLat: 0.01, vLon: 0.02, sigmaEixo: 0.9, sigmaTransv: 0.55, rumo: 20, picoMmH: 5, tPico: 20, duracao: 8 }),
];

/** Pancadas isoladas de fim de tarde no Triângulo e Alto Paranaíba: [lat, lon, dia, pico mm/h]. */
const PANCADAS: [number, number, number, number][] = [
  [-18.93, -48.29, 0, 22], // Uberlândia
  [-18.6, -46.5, 0, 18], // Patos de Minas
  [-19.77, -47.9, 1, 24], // Uberaba
  [-18.98, -49.43, 1, 16], // Ituiutaba
  [-18.67, -48.17, 2, 20], // Araguari
  [-20.03, -48.92, 2, 26], // Frutal
];

function chuvaDaCelula(c: Celula, lat: number, lon: number, t: number): number {
  const dt = t - c.tPico;
  const fatorTempo = Math.exp(-0.5 * (dt / c.duracao) ** 2);
  if (fatorTempo < 1e-4) return 0;
  const dLat = lat - (c.lat + c.vLat * dt);
  const dLon = lon - (c.lon + c.vLon * dt);
  const r = (c.rumo * Math.PI) / 180;
  const eixo = dLon * Math.cos(r) + dLat * Math.sin(r);
  const transv = -dLon * Math.sin(r) + dLat * Math.cos(r);
  return c.picoMmH * fatorTempo * Math.exp(-0.5 * ((eixo / c.sigmaEixo) ** 2 + (transv / c.sigmaTransv) ** 2));
}

/** Garoa de fim de tarde no centro-sul (≤ 0,6 mm/h); nada ao norte de 17,5° S. */
function fundo(lat: number, horaLocal: number): number {
  const tarde = horaLocal >= 12 && horaLocal <= 20 ? Math.sin(((horaLocal - 12) / 8) * Math.PI) : 0;
  const mascara = Math.min(1, Math.max(0, (-17.5 - lat) / 3));
  return 0.6 * tarde * mascara;
}

export function respostaExemploMunicipios(pontos: readonly PontoMunicipio[], agora: Date): unknown[] {
  const offsetMs = OFFSET_SEGUNDOS * 1000;
  // Eixo como o da API: da 00:00 local do dia corrente, 24 registros por dia.
  const local = new Date(agora.getTime() + offsetMs);
  const meiaNoiteLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const total = DIAS_MUNICIPIOS * 24;
  const time = Array.from({ length: total }, (_, k) => new Date(meiaNoiteLocal + k * HORA_MS).toISOString().slice(0, 16));

  const horaCheia = agora.getTime() - (agora.getTime() % HORA_MS);
  const horaLocalBase = new Date(horaCheia + offsetMs).getUTCHours();
  // Pancadas às 16:30 (hora de Brasília) do dia 0, 1 ou 2 contado da hora corrente.
  const celulas = [
    ...SISTEMAS,
    ...PANCADAS.map(([lat, lon, dia, pico]) =>
      celula({ lat, lon, picoMmH: pico, tPico: ((16.5 - horaLocalBase + 24) % 24) + 24 * dia, duracao: 1 }),
    ),
  ];

  return pontos.map((p, i) => {
    const precipitation = time.map((_, k) => {
      // O registro k cobre a hora anterior ao seu rótulo: avalia no meio dela.
      const rotuloUtc = meiaNoiteLocal + k * HORA_MS - offsetMs;
      const t = (rotuloUtc - horaCheia) / HORA_MS - 0.5;
      const horaLocal = (k + 23.5) % 24;
      let mm = fundo(p.latitude, horaLocal);
      for (const c of celulas) mm += chuvaDaCelula(c, p.latitude, p.longitude, t);
      return Math.round(mm * 10) / 10;
    });
    return {
      // A API devolve o centro da célula do modelo, não a coordenada pedida.
      latitude: Math.round(p.latitude * 10) / 10,
      longitude: Math.round(p.longitude * 10) / 10,
      generationtime_ms: 0.4,
      utc_offset_seconds: OFFSET_SEGUNDOS,
      timezone: "America/Sao_Paulo",
      timezone_abbreviation: "GMT-3",
      ...(i > 0 ? { location_id: i } : {}),
      hourly_units: { time: "iso8601", precipitation: "mm" },
      hourly: { time, precipitation },
    };
  });
}
