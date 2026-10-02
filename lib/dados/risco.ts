import "server-only";
import { alertasDaSalaParaRisco, filaDaSalaNoMapa } from "@/lib/alertas/config";
import { combinarMetas, metaDaLeitura, type MetaLeitura } from "@/lib/api/respostas";
import { CAMADAS_RISCO, ROTULOS_CAMADA_RISCO, type CamadaRisco, type CamadaRiscoId } from "@/lib/dominio/risco";
import type { Alerta } from "@/lib/dominio/tipos";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { FonteIndisponivelError, type FonteId, type Leitura, type OrigemLeitura } from "@/lib/fontes/tipos";
import { obterCamada } from "@/lib/sources/arcgis";
import { camadasCemaden, obterAlertasCemaden } from "@/lib/sources/cemaden";
import { camadaMeteorologica, obterAvisosInmetMunicipios } from "@/lib/sources/inmet/ativos";
import { MUNICIPIOS_MG } from "@/lib/territorio/municipios";
import {
  areasDeRisco,
  camadaDaSelecaoCbmmg,
  combinarCamadas,
  selecionarAlertasCbmmg,
  type AreasRisco,
  type RiscoMunicipioCombinado,
} from "./camadas-risco";

export { camadaAlertasCbmmg } from "./camadas-risco";

/**
 * Mapa de risco por município (docs/fase-1.md §5): as quatro camadas —
 * Meteorológico (INMET), Geológico e Hidrológico (CEMADEN) e Alertas do CBMMG —,
 * a combinada (pior nível por município) e o resumo por COB e por UEOp.
 *
 * As fontes são lidas em paralelo, cada uma com cache e última leitura válida.
 * Uma fonte fora do ar sem leitura válida deixa só a SUA camada como
 * indisponível (`camada: null` + `erro`); as outras continuam. Somente leitura.
 */

/** Uma origem de alertas do CBMMG, já no tipo de domínio `Alerta`. */
export type FonteAlertasCbmmg = (agora: Date) => Promise<Leitura<Alerta[]>>;

/** Alertas do formulário Survey123 "Emissão de Alertas" (camada ArcGIS, somente leitura). */
export const alertasDoFormulario: FonteAlertasCbmmg = async () => {
  const leitura = await obterCamada("alertas");
  return { ...leitura, dados: leitura.dados.feicoes.features.map((f) => f.properties) };
};

/**
 * Alertas da fila da Sala (docs/fase-1.md §4.4): EMITIDO, CIENTE e EM_AÇÃO,
 * só os reais, sem cache (dado do usuário). nivelAlerta → nível; município →
 * IBGE pela própria camada. Usa a FonteId do formulário até a Sala ganhar
 * uma própria no catálogo.
 */
export const alertasDaSala: FonteAlertasCbmmg = (agora) => alertasDaSalaParaRisco(agora);

/**
 * Origens fixas da camada "Alertas do CBMMG" (o formulário Survey123).
 * A camada junta as origens e deduplica pelo nº da chamada (§4.6); se uma
 * origem falhar, as outras continuam e o erro vai para o carimbo.
 */
export const FONTES_ALERTAS_CBMMG: readonly FonteAlertasCbmmg[] = [alertasDoFormulario];

/**
 * Origens em uso: a fila da Sala entra quando está ativa (modo exemplo ou
 * ALERTAS_ARMAZEM persistente). Ela vem PRIMEIRO: com a mesma FonteId, o
 * carimbo fica com o do formulário (o mais antigo ou com erro), nunca o
 * contrário.
 */
export function fontesAlertasCbmmg(): readonly FonteAlertasCbmmg[] {
  return filaDaSalaNoMapa() ? [alertasDaSala, ...FONTES_ALERTAS_CBMMG] : FONTES_ALERTAS_CBMMG;
}

export interface MetaCamadaRisco {
  /** Fontes que alimentam a camada. */
  fontes: FonteId[];
  /** Leitura mais antiga e pior origem entre as fontes (combinarMetas). */
  atualizadoEm: string;
  origem: OrigemLeitura;
  /** Falha recente (exibindo última leitura válida) ou origem que ficou de fora. */
  erro?: string;
}

export interface CamadaRiscoMapa {
  id: CamadaRiscoId;
  rotulo: string;
  /** null quando nenhuma fonte da camada tem leitura válida. */
  camada: CamadaRisco | null;
  meta: MetaCamadaRisco | null;
  /** Motivo da indisponibilidade (quando `camada` é null). */
  erro: string | null;
  areas: AreasRisco | null;
  /** Registros da fonte deixados de fora, por motivo (conferência em /status). */
  descartados: Record<string, number>;
}

export interface RiscoCombinado {
  municipios: RiscoMunicipioCombinado[];
  areas: AreasRisco;
  /** Camadas que entraram na combinação. */
  camadas: CamadaRiscoId[];
  /** Camadas fora do ar (sem leitura válida): a combinação está incompleta. */
  indisponiveis: CamadaRiscoId[];
}

export interface MapaRisco {
  /** ISO do instante usado para as janelas de vigência. */
  geradoEm: string;
  camadas: Record<CamadaRiscoId, CamadaRiscoMapa>;
  combinado: RiscoCombinado;
  /** Carimbo combinado de todas as fontes lidas; null se nenhuma fonte respondeu. */
  meta: Omit<MetaCamadaRisco, "fontes"> | null;
}

export interface OpcoesRisco {
  /** Substitui as origens da camada "Alertas do CBMMG" (testes ou novas origens). */
  fontesAlertasCbmmg?: readonly FonteAlertasCbmmg[];
}

type Tentativa<T> = { ok: true; valor: T } | { ok: false; erro: string };

async function tentar<T>(ler: () => Promise<T>): Promise<Tentativa<T>> {
  try {
    return { ok: true, valor: await ler() };
  } catch (erro) {
    if (erro instanceof FonteIndisponivelError) {
      return { ok: false, erro: `${CATALOGO_FONTES[erro.fonte].nome} indisponível e sem leitura anterior (${erro.message})` };
    }
    console.error("[risco] falha inesperada ao ler a fonte", erro);
    return { ok: false, erro: "Falha inesperada ao ler a fonte." };
  }
}

interface EntradaCamada {
  camada: CamadaRisco | null;
  metas: MetaLeitura[];
  erros: string[];
  descartados: Record<string, number>;
}

function semDuplicatas(metas: readonly MetaLeitura[]): MetaLeitura[] {
  return [...new Map(metas.map((m) => [m.fonte, m])).values()];
}

/** combinarMetas + as falhas de quem ficou de fora. */
function carimbo(metas: readonly MetaLeitura[], erros: readonly string[]): Omit<MetaCamadaRisco, "fontes"> | null {
  const unicas = semDuplicatas(metas);
  if (unicas.length === 0) return null;
  const combinada = combinarMetas(unicas);
  const erro = [combinada.erro, ...erros].filter(Boolean).join(" · ");
  return erro ? { ...combinada, erro } : { atualizadoEm: combinada.atualizadoEm, origem: combinada.origem };
}

function montarCamada(id: CamadaRiscoId, entrada: EntradaCamada): CamadaRiscoMapa {
  const meta = entrada.camada ? carimbo(entrada.metas, entrada.erros) : null;
  return {
    id,
    rotulo: ROTULOS_CAMADA_RISCO[id],
    camada: entrada.camada,
    meta: meta ? { fontes: semDuplicatas(entrada.metas).map((m) => m.fonte), ...meta } : null,
    erro: entrada.camada ? null : entrada.erros.join(" · ") || "Fonte indisponível.",
    areas: entrada.camada ? areasDeRisco(MUNICIPIOS_MG, entrada.camada.municipios) : null,
    descartados: entrada.descartados,
  };
}

/**
 * Lê as fontes em paralelo e monta as camadas, a combinada e os resumos por
 * área. Não lança por fonte fora do ar: quando NENHUMA responde, `meta` é null
 * (a rota devolve 503).
 */
export async function obterRisco(agora: Date = new Date(), opcoes: OpcoesRisco = {}): Promise<MapaRisco> {
  const fontesAlertas = opcoes.fontesAlertasCbmmg ?? fontesAlertasCbmmg();
  const [inmet, cemaden, alertas] = await Promise.all([
    tentar(() => obterAvisosInmetMunicipios(agora)),
    tentar(() => obterAlertasCemaden(agora)),
    Promise.all(fontesAlertas.map((fonte) => tentar(() => fonte(agora)))),
  ]);

  const fora = (erro: string): EntradaCamada => ({ camada: null, metas: [], erros: [erro], descartados: {} });

  const meteorologico: EntradaCamada = inmet.ok
    ? {
        camada: camadaMeteorologica(inmet.valor.dados.avisos),
        metas: [metaDaLeitura(inmet.valor)],
        erros: [],
        descartados: { ...inmet.valor.dados.descartados },
      }
    : fora(inmet.erro);

  // Uma leitura do CEMADEN alimenta duas camadas (Geológico e Hidrológico).
  let geologico: EntradaCamada;
  let hidrologico: EntradaCamada;
  if (cemaden.ok) {
    const doCemaden = camadasCemaden(cemaden.valor.dados.alertas);
    const comum = {
      metas: [metaDaLeitura(cemaden.valor)],
      erros: [],
      descartados: { ...cemaden.valor.dados.descartados },
    };
    geologico = { ...comum, camada: doCemaden.geologico };
    hidrologico = { ...comum, camada: doCemaden.hidrologico };
  } else {
    geologico = fora(cemaden.erro);
    hidrologico = fora(cemaden.erro);
  }

  // Alertas do CBMMG: junta as origens que responderam; as que falharam vão para o carimbo.
  const lidos: Leitura<Alerta[]>[] = [];
  const errosAlertas: string[] = [];
  for (const a of alertas) {
    if (a.ok) lidos.push(a.valor);
    else errosAlertas.push(a.erro);
  }
  const selecao = selecionarAlertasCbmmg(
    lidos.flatMap((l) => l.dados),
    agora,
  );
  const alertasCbmmg: EntradaCamada =
    lidos.length > 0
      ? {
          camada: camadaDaSelecaoCbmmg(selecao),
          metas: lidos.map(metaDaLeitura),
          erros: errosAlertas,
          descartados: { ...selecao.descartados },
        }
      : { camada: null, metas: [], erros: errosAlertas, descartados: {} };

  const entradas: Record<CamadaRiscoId, EntradaCamada> = {
    meteorologico,
    geologico,
    hidrologico,
    "alertas-cbmmg": alertasCbmmg,
  };

  const camadas = Object.fromEntries(CAMADAS_RISCO.map((id) => [id, montarCamada(id, entradas[id])])) as Record<
    CamadaRiscoId,
    CamadaRiscoMapa
  >;
  const disponiveis: CamadaRisco[] = [];
  for (const id of CAMADAS_RISCO) {
    const camada = camadas[id].camada;
    if (camada) disponiveis.push(camada);
  }
  const municipios = combinarCamadas(disponiveis);
  const errosGerais = CAMADAS_RISCO.flatMap((id) =>
    entradas[id].erros.map((erro) => `${ROTULOS_CAMADA_RISCO[id]}: ${erro}`),
  );

  return {
    geradoEm: agora.toISOString(),
    camadas,
    combinado: {
      municipios,
      areas: areasDeRisco(MUNICIPIOS_MG, municipios),
      camadas: disponiveis.map((c) => c.id),
      indisponiveis: CAMADAS_RISCO.filter((id) => camadas[id].camada === null),
    },
    meta: carimbo(
      CAMADAS_RISCO.flatMap((id) => entradas[id].metas),
      errosGerais,
    ),
  };
}
