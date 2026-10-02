import type { NivelRisco } from "@/lib/dominio/matrizes";
import { agruparPorMunicipio, type CamadaRisco, type CamadaRiscoId } from "@/lib/dominio/risco";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { MUNICIPIOS_MG, municipioPorIbge, municipioPorNome, type MunicipioMg } from "@/lib/territorio/municipios";

/**
 * Parser dos alertas vigentes do Painel de Alertas do CEMADEN
 * (https://painelalertas.cemaden.gov.br/wsAlertas2), base das camadas
 * Geológico e Hidrológico do mapa de risco (docs/fase-1.md §5).
 *
 * O endpoint não é documentado: é o backend do painel e devolve o Brasil
 * inteiro num JSON só (não há rota por município). Formato conferido em código
 * público — lucassanascimento/cemaden-alerts (`ICemadenService.ts` e mock real
 * de 2022), carlos-claro2025/ClimaNow (`cemaden-proxy`, `docs/TECHNICAL.md`) e
 * AI-FIAP-2026/enterprise-challenge (`servicos/alertas_clima.py`, 2026):
 *
 *   {"atualizado": "DD-MM-AAAA HH:MM:SS UTC",
 *    "alertas": [{"cod_alerta": 919, "datahoracriacao": "14-02-2022 16:51:54",
 *                 "ult_atualizacao": "14-02-2022 16:51:54", "codibge": 3109402,
 *                 "evento": "Risco Hidrológico - Alto", "nivel": "Alto",
 *                 "status": 1, "uf": "MG", "municipio": "…"}]}
 *
 * - `evento`: "Movimentos de Massa - <nível>" → Geológico; "Risco Hidrológico -
 *   <nível>" (ou enxurrada, inundação, alagamento) → Hidrológico.
 * - `nivel`: Moderado, Alto ou Muito Alto. `status`: 1 = aberto.
 * - `codibge` (número ou texto) liga direto à malha municipal; `uf` e
 *   `municipio` nem sempre vêm.
 * - Datas: já apareceram em mais de um formato ("DD-MM-AAAA HH:MM:SS",
 *   "AAAA-MM-DD HH:MM:SS", "DD/MM/AAAA HH:MM"). Convenção adotada: sem fuso
 *   explícito, UTC (padrão do CEMADEN; confiança média — conferir no 1º deploy).
 *
 * Contrato validado: sem `alertas` em lista, ou com alertas dos quais nenhum
 * tem evento reconhecível, é ERRO (a fonte mudou) — a Sala mostra a última
 * leitura válida ou "fonte indisponível", nunca um mapa vazio por engano.
 * Módulo puro (sem rede).
 */

export const URL_ALERTAS_CEMADEN = "https://painelalertas.cemaden.gov.br/wsAlertas2";
/** Origem do painel: enviada como Origin/Referer, como faz o próprio painel. */
export const ORIGEM_PAINEL_CEMADEN = "https://painelalertas.cemaden.gov.br";

export type CamadaCemaden = Extract<CamadaRiscoId, "geologico" | "hidrologico">;

function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Evento e nível
// ---------------------------------------------------------------------------------------------

/**
 * Camada do alerta pelo texto do evento. Por radical, para tolerar acento
 * perdido na codificação ("HidrolÃ³gico") e variações ("Enxurrada").
 */
export function camadaDoEventoCemaden(evento: unknown): CamadaCemaden | null {
  if (typeof evento !== "string") return null;
  const k = chave(evento);
  if (/moviment|massa|desliza|geolog/.test(k)) return "geologico";
  if (/hidrol|enxurr|inunda|alaga/.test(k)) return "hidrologico";
  return null;
}

/**
 * Conversão ADOTADA dos níveis do CEMADEN para a escala única do CBMMG
 * (docs/fase-1.md §5): Moderado → amarelo, Alto → laranja, Muito Alto → vermelho.
 * O CEMADEN não usa roxo.
 */
export const NIVEL_DO_ALERTA_CEMADEN: Readonly<Record<string, { nivel: NivelRisco; rotulo: string }>> = {
  moderado: { nivel: "amarelo", rotulo: "Moderado" },
  alto: { nivel: "laranja", rotulo: "Alto" },
  "muito alto": { nivel: "vermelho", rotulo: "Muito Alto" },
};

/**
 * Nível pelo campo `nivel` ou, só quando ele não vem, pelo sufixo do evento
 * ("… - Alto"). `nivel` presente e desconhecido não é adivinhado: descarta.
 */
export function nivelDoAlertaCemaden(nivel: unknown, evento?: unknown): { nivel: NivelRisco; rotulo: string } | null {
  if (typeof nivel === "string" && nivel.trim()) return NIVEL_DO_ALERTA_CEMADEN[chave(nivel)] ?? null;
  if (typeof evento === "string") {
    const sufixo = evento.split(/\s+-\s+/).pop();
    if (sufixo && sufixo !== evento) return NIVEL_DO_ALERTA_CEMADEN[chave(sufixo)] ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------------------------

const OFFSET_BRASILIA_MS = -3 * 3_600_000;

function instante(a: number, m: number, d: number, h: number, min: number, s: number, offsetMs: number): Date | null {
  const t = Date.UTC(a, m - 1, d, h, min, s);
  const conferida = new Date(t);
  // Recusa datas que o Date "conserta" (31/02, 25:00…).
  if (
    conferida.getUTCFullYear() !== a ||
    conferida.getUTCMonth() !== m - 1 ||
    conferida.getUTCDate() !== d ||
    conferida.getUTCHours() !== h ||
    conferida.getUTCMinutes() !== min ||
    conferida.getUTCSeconds() !== s
  ) {
    return null;
  }
  return new Date(t - offsetMs);
}

/**
 * Data/hora do CEMADEN em ISO (UTC). Aceita "DD-MM-AAAA HH:MM:SS",
 * "DD/MM/AAAA HH:MM[:SS]", "DD/MM/AA HH:MM", "AAAA-MM-DD[ T]HH:MM[:SS[.f]]",
 * sufixo "UTC"/"GMT"/"Z" ou "BRT"/"-03:00", offset explícito e epoch (s ou ms).
 * Sem fuso explícito vale UTC (convenção do CEMADEN). Não reconhecida → null.
 */
export function interpretarDataCemaden(valor: unknown): string | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor <= 0) return null;
    const ms = valor > 1e12 ? valor : valor > 1e9 ? valor * 1000 : NaN;
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  if (typeof valor !== "string") return null;
  let texto = valor.trim();
  if (!texto) return null;

  let offsetMs = 0;
  const sigla = texto.match(/\s*(UTC|GMT|Z|BRT|BRST)$/i);
  // Offset numérico só depois da hora: em "02-10-2026" o "-2026" é o ano, não fuso.
  const offset = texto.match(/\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*([+-])(\d{2}):?(\d{2})$/);
  if (sigla) {
    if (/^BRS?T$/i.test(sigla[1])) offsetMs = OFFSET_BRASILIA_MS;
    texto = texto.slice(0, sigla.index).trim();
  } else if (offset) {
    const [, sinal, hh, mm] = offset;
    offsetMs = (sinal === "-" ? -1 : 1) * (Number(hh) * 60 + Number(mm)) * 60_000;
    texto = texto.replace(/\s*[+-]\d{2}:?\d{2}$/, "");
  }

  const dma = texto.match(/^(\d{2})[-/](\d{2})[-/](\d{4}|\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/);
  if (dma) {
    const [, d, m, a, h = "0", min = "0", s = "0"] = dma;
    const ano = a.length === 2 ? 2000 + Number(a) : Number(a);
    return instante(ano, Number(m), Number(d), Number(h), Number(min), Number(s), offsetMs)?.toISOString() ?? null;
  }
  const amd = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/);
  if (amd) {
    const [, a, m, d, h = "0", min = "0", s = "0"] = amd;
    return instante(Number(a), Number(m), Number(d), Number(h), Number(min), Number(s), offsetMs)?.toISOString() ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Interpretação da resposta
// ---------------------------------------------------------------------------------------------

export interface AlertaCemaden {
  /** `cod_alerta`. */
  cod: string;
  /** Código IBGE de 7 dígitos (município de MG). */
  ibge: string;
  camada: CamadaCemaden;
  nivel: NivelRisco;
  /** Nível como o CEMADEN escreve: "Moderado", "Alto", "Muito Alto". */
  nivelRotulo: string;
  /** Texto original do evento ("Movimentos de Massa - Alto"). */
  evento: string;
  /** ISO (UTC) da criação e da última atualização do alerta. */
  criadoEm: string | null;
  atualizadoEm: string | null;
}

/** Registros descartados, por motivo (exibidos em /status e na resposta da API). */
export interface DescartesCemaden {
  /** Entrada que não é objeto. */
  invalidos: number;
  /** `status` diferente de 1 (alerta fechado). */
  fechados: number;
  /** Alerta de outra UF. */
  outrasUfs: number;
  /** De MG, mas o município não foi reconhecido na malha. */
  municipioDesconhecido: number;
  eventoDesconhecido: number;
  nivelDesconhecido: number;
  /** Mesmo `cod_alerta` repetido (fica a atualização mais recente). */
  repetidos: number;
}

export interface AlertasCemaden {
  /** ISO do campo `atualizado` da fonte, quando reconhecido. */
  atualizadoNaFonte: string | null;
  /** Alertas recebidos (Brasil inteiro). */
  recebidos: number;
  /** Alertas abertos em MG, com camada e nível reconhecidos. */
  alertas: AlertaCemaden[];
  descartados: DescartesCemaden;
}

/** `status` 1 = aberto. Ausente conta como aberto (o endpoint lista os vigentes). */
export function alertaCemadenAberto(status: unknown): boolean {
  if (status === undefined || status === null) return true;
  if (typeof status === "number") return status === 1;
  if (typeof status === "boolean") return status;
  return ["1", "aberto", "ativo", "true"].includes(chave(String(status)));
}

/** Código IBGE de 7 dígitos; aceita também o de 6 dígitos (sem o verificador) de MG. */
const POR_IBGE6 = new Map(MUNICIPIOS_MG.map((m) => [m.ibge.slice(0, 6), m]));

function codigoIbge(valor: unknown): string | null {
  const texto = typeof valor === "number" ? String(Math.trunc(valor)) : typeof valor === "string" ? valor.trim() : "";
  return /^\d{6,7}$/.test(texto) ? texto : null;
}

function municipioDoAlerta(codigo: string | null, nome: unknown): MunicipioMg | null {
  if (codigo?.length === 7) return municipioPorIbge(codigo);
  if (codigo?.length === 6) return POR_IBGE6.get(codigo) ?? null;
  return municipioPorNome(nome);
}

function textoDe(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

export function interpretarAlertasCemaden(corpo: unknown): AlertasCemaden {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new Error("Resposta do CEMADEN não é um objeto {atualizado, alertas}");
  }
  const { alertas, atualizado } = corpo as { alertas?: unknown; atualizado?: unknown };
  if (!Array.isArray(alertas)) throw new Error("Resposta do CEMADEN sem a lista \"alertas\" (o formato mudou)");

  const descartados: DescartesCemaden = {
    invalidos: 0,
    fechados: 0,
    outrasUfs: 0,
    municipioDesconhecido: 0,
    eventoDesconhecido: 0,
    nivelDesconhecido: 0,
    repetidos: 0,
  };
  let reconhecidos = 0;
  const porCod = new Map<string, AlertaCemaden>();

  alertas.forEach((entrada, i) => {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
      descartados.invalidos++;
      return;
    }
    const bruto = entrada as Record<string, unknown>;
    const camada = camadaDoEventoCemaden(bruto.evento);
    if (camada) reconhecidos++;

    if (!alertaCemadenAberto(bruto.status)) {
      descartados.fechados++;
      return;
    }
    const codigo = codigoIbge(bruto.codibge);
    const uf = typeof bruto.uf === "string" ? bruto.uf.trim().toUpperCase() : null;
    // O código IBGE decide a UF; sem ele, vale o campo `uf`.
    if (codigo ? !codigo.startsWith("31") : uf !== "MG") {
      descartados.outrasUfs++;
      return;
    }
    const municipio = municipioDoAlerta(codigo, bruto.municipio);
    if (!municipio) {
      descartados.municipioDesconhecido++;
      return;
    }
    if (!camada) {
      descartados.eventoDesconhecido++;
      return;
    }
    const nivel = nivelDoAlertaCemaden(bruto.nivel, bruto.evento);
    if (!nivel) {
      descartados.nivelDesconhecido++;
      return;
    }

    const alerta: AlertaCemaden = {
      cod: textoDe(bruto.cod_alerta) ?? `alerta-${i}`,
      ibge: municipio.ibge,
      camada,
      nivel: nivel.nivel,
      nivelRotulo: nivel.rotulo,
      evento: String(bruto.evento).trim(),
      criadoEm: interpretarDataCemaden(bruto.datahoracriacao),
      atualizadoEm: interpretarDataCemaden(bruto.ult_atualizacao),
    };
    const anterior = porCod.get(alerta.cod);
    if (anterior) {
      descartados.repetidos++;
      if ((anterior.atualizadoEm ?? "") > (alerta.atualizadoEm ?? "")) return;
    }
    porCod.set(alerta.cod, alerta);
  });

  if (alertas.length > 0 && reconhecidos === 0) {
    throw new Error("Formato dos alertas do CEMADEN não reconhecido: nenhum alerta com evento conhecido");
  }

  return {
    atualizadoNaFonte: interpretarDataCemaden(atualizado),
    recebidos: alertas.length,
    alertas: [...porCod.values()].sort((a, b) => a.ibge.localeCompare(b.ibge) || a.cod.localeCompare(b.cod)),
    descartados,
  };
}

// ---------------------------------------------------------------------------------------------
// Camadas Geológico e Hidrológico
// ---------------------------------------------------------------------------------------------

const COBERTURA_CEMADEN =
  "O CEMADEN só emite alerta para os municípios que monitora: sem alerta não quer dizer sem risco.";

const TIPO_PADRAO: Record<CamadaCemaden, string> = {
  geologico: "Movimentos de Massa",
  hidrologico: "Risco Hidrológico",
};

/** "Movimentos de Massa - Alto" → "Movimentos de Massa · Alto". */
function tituloDoAlerta(alerta: AlertaCemaden): string {
  const tipo = alerta.evento.replace(/\s+-\s+(muito alto|alto|moderado)\s*$/i, "").trim();
  return `${tipo || TIPO_PADRAO[alerta.camada]} · ${alerta.nivelRotulo}`;
}

/** As duas camadas do CEMADEN: um item por alerta; vale o alerta mais grave do município. */
export function camadasCemaden(alertas: readonly AlertaCemaden[]): Record<CamadaCemaden, CamadaRisco> {
  const camada = (id: CamadaCemaden): CamadaRisco => ({
    id,
    municipios: agruparPorMunicipio(
      alertas
        .filter((a) => a.camada === id)
        .map((a) => ({
          ibge: a.ibge,
          nivel: a.nivel,
          titulo: tituloDoAlerta(a),
          fonte: "Cemaden/MCTI",
          // O alerta fica aberto até o CEMADEN fechá-lo: não há fim informado.
          inicio: a.criadoEm,
          fim: null,
          ref: a.cod,
        })),
    ),
    cobertura: COBERTURA_CEMADEN,
    credito: CATALOGO_FONTES["cemaden-alertas"].credito,
  });
  return { geologico: camada("geologico"), hidrologico: camada("hidrologico") };
}
