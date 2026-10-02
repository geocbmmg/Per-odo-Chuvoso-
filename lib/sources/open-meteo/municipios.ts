import "server-only";
import { env } from "@/lib/env";
import { obterLeituraServidor } from "@/lib/fontes/armazem-servidor";
import { buscarJson, ErroHttpFonte } from "@/lib/fontes/http";
import { FonteIndisponivelError, type Leitura } from "@/lib/fontes/tipos";
import { respostaExemploMunicipios } from "@/lib/sources/exemplos/open-meteo-municipios";
import { MUNICIPIOS_MG } from "@/lib/territorio/municipios";
import { erroOpenMeteo, URL_OPEN_METEO } from "./parser";
import {
  compactarRespostaMunicipios,
  ehCacheChuvaMunicipios,
  montarConsultaMunicipios,
  type CacheChuvaMunicipios,
  type PontoMunicipio,
} from "./parser-municipios";

/** As 853 sedes municipais de MG, na ordem de MUNICIPIOS_MG. */
export const PONTOS_MUNICIPIOS: readonly PontoMunicipio[] = MUNICIPIOS_MG.map((m) => ({
  ibge: m.ibge,
  latitude: m.lat,
  longitude: m.lon,
}));

/** Chave no armazém de leituras (com versão do formato do cache compacto). */
const CHAVE = "sedes-municipais-v1";

/**
 * Cada consulta gasta 853 chamadas da cota gratuita (10.000/dia por IP) mesmo
 * quando estoura o tempo do nosso lado. Por isso, depois de uma falha, a fonte
 * só é consultada de novo após 30 min (a tela segue com a última leitura válida).
 */
const ESPERA_APOS_FALHA_SEGUNDOS = 30 * 60;

/** A resposta tem ~2,5 MB: mais folga que o timeout padrão das fontes. */
const TIMEOUT_MINIMO_MS = 30_000;

/** Troca o "HTTP 429" genérico pelo motivo que a Open-Meteo manda no corpo. */
function explicarErro(erro: unknown): unknown {
  if (!(erro instanceof ErroHttpFonte) || !erro.corpo) return erro;
  try {
    const motivo = erroOpenMeteo(JSON.parse(erro.corpo));
    return motivo ? new Error(`Open-Meteo: ${motivo} (HTTP ${erro.status})`) : erro;
  } catch {
    return erro;
  }
}

async function carregar(agora: Date): Promise<CacheChuvaMunicipios> {
  let corpo: unknown;
  try {
    // POST em formulário com as 853 coordenadas numa só requisição (ver parser-municipios.ts).
    corpo = await buscarJson<unknown>(URL_OPEN_METEO, {
      corpo: montarConsultaMunicipios(PONTOS_MUNICIPIOS),
      timeoutMs: Math.max(env().FONTES_TIMEOUT_MS, TIMEOUT_MINIMO_MS),
    });
  } catch (erro) {
    throw explicarErro(erro);
  }
  // Valida e compacta já na carga: resposta inválida nunca vira "última leitura válida".
  return compactarRespostaMunicipios(corpo, PONTOS_MUNICIPIOS, agora);
}

/**
 * Série horária de chuva prevista nas 853 sedes (Open-Meteo), no formato
 * compacto. O cache vale 3 h (catálogo); as janelas são calculadas por quem lê
 * (lib/dados/chuva.ts). No modo exemplo, a resposta fictícia passa pelo mesmo
 * parser da produção.
 */
export async function obterSeriesChuvaMunicipios(agora: Date = new Date()): Promise<Leitura<CacheChuvaMunicipios>> {
  const leitura = await obterLeituraServidor("open-meteo-municipios", CHAVE, () => carregar(agora), {
    esperaAposFalhaSegundos: ESPERA_APOS_FALHA_SEGUNDOS,
    exemplo: () => compactarRespostaMunicipios(respostaExemploMunicipios(PONTOS_MUNICIPIOS, agora), PONTOS_MUNICIPIOS, agora),
  });
  if (!ehCacheChuvaMunicipios(leitura.dados)) {
    // Ex.: leitura antiga no Postgres com outro formato. Vira 503, como fonte sem leitura.
    throw new FonteIndisponivelError("open-meteo-municipios", "leitura guardada fora do formato esperado");
  }
  return leitura;
}
