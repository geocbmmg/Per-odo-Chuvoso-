import type { CamadaMapaId, SituacaoOcorrencia } from "@/lib/dominio/tipos";
import { CAMPO_DATA_DA_CAMADA, type ColecaoMapa } from "./dados";
import { ROTULOS_SITUACAO } from "./popups";
import { CAMADAS_PONTUAIS, ROTULOS_SINGULAR, type CamadaPontual } from "./simbologia";

/**
 * Registros do mapa em forma de lista (alternativa ao clique no canvas para
 * teclado e leitor de tela): os MESMOS pontos que o mapa desenha — camadas
 * de pontos ligadas, já filtradas pelo período e só com localização.
 */

export interface RegistroLista {
  /** Chave estável para o React (camada + id do registro). */
  chave: string;
  camada: CamadaPontual;
  /** "Alerta", "Ação RRD", "Ocorrência complexa". */
  tipo: string;
  /** Tipo de risco (alerta) ou situação (ocorrência). */
  detalhe: string | null;
  /** Só ocorrências: muda o símbolo (finalizada = cinza). */
  situacao: SituacaoOcorrencia | null;
  municipio: string | null;
  cob: string | null;
  ueop: string | null;
  fracao: string | null;
  /** ISO 8601 da data do registro (emissão, execução, início). */
  data: string | null;
  /** [longitude, latitude] do ponto no mapa. */
  coordenadas: [number, number];
  /** Propriedades originais (para abrir o mesmo balão do mapa). */
  propriedades: Record<string, unknown>;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  return t ? t : null;
}

function situacaoDe(valor: unknown): SituacaoOcorrencia {
  return valor === "em-andamento" || valor === "monitoramento" || valor === "finalizada" ? valor : "desconhecida";
}

function coordenadasDe(geometria: unknown): [number, number] | null {
  if (!geometria || typeof geometria !== "object") return null;
  const { type, coordinates } = geometria as { type?: unknown; coordinates?: unknown };
  if (type !== "Point" || !Array.isArray(coordinates)) return null;
  const [x, y] = coordinates as unknown[];
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function instante(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** "1º BBM · 2ª Cia", só a UEOp, só a fração ou null. */
export function rotuloUnidade(ueop: string | null, fracao: string | null): string | null {
  const partes = [texto(ueop), texto(fracao)].filter((p): p is string => Boolean(p));
  return partes.length ? partes.join(" · ") : null;
}

/** Quantos pontos o mapa desenha nas camadas de pontos ligadas. */
export function contarRegistrosNoMapa(
  colecoes: Partial<Record<CamadaMapaId, ColecaoMapa>>,
  visiveis: ReadonlySet<CamadaMapaId>,
): number {
  return CAMADAS_PONTUAIS.reduce(
    (soma, camada) => soma + (visiveis.has(camada) ? (colecoes[camada]?.features.length ?? 0) : 0),
    0,
  );
}

/**
 * Lista dos pontos das camadas ligadas, do mais recente ao mais antigo
 * (sem data por último). Empate: alertas, ações RRD, ocorrências; depois o
 * município.
 */
export function registrosParaLista(
  colecoes: Partial<Record<CamadaMapaId, ColecaoMapa>>,
  visiveis: ReadonlySet<CamadaMapaId>,
): RegistroLista[] {
  const lista: { registro: RegistroLista; ordemCamada: number; ms: number }[] = [];
  CAMADAS_PONTUAIS.forEach((camada, ordemCamada) => {
    if (!visiveis.has(camada)) return;
    const campoData = CAMPO_DATA_DA_CAMADA[camada];
    colecoes[camada]?.features.forEach((feicao, indice) => {
      const coordenadas = coordenadasDe(feicao.geometry);
      if (!coordenadas) return;
      const p = feicao.properties ?? {};
      const id = typeof p.id === "string" || typeof p.id === "number" ? p.id : (feicao.id ?? "");
      const situacao = camada === "ocorrencias-complexas" ? situacaoDe(p.situacao) : null;
      const data = campoData ? texto(p[campoData]) : null;
      lista.push({
        ordemCamada,
        ms: instante(data),
        registro: {
          chave: `${camada}:${indice}:${String(id)}`,
          camada,
          tipo: ROTULOS_SINGULAR[camada],
          detalhe: situacao ? ROTULOS_SITUACAO[situacao] : camada === "alertas" ? texto(p.tipoRisco) : null,
          situacao,
          municipio: texto(p.municipio),
          cob: texto(p.cob),
          ueop: texto(p.ueop),
          fracao: texto(p.fracao),
          data,
          coordenadas,
          propriedades: p,
        },
      });
    });
  });
  lista.sort(
    (a, b) =>
      b.ms - a.ms ||
      a.ordemCamada - b.ordemCamada ||
      (a.registro.municipio ?? "").localeCompare(b.registro.municipio ?? "", "pt-BR"),
  );
  return lista.map((item) => item.registro);
}
