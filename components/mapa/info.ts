import { formatarHora } from "@/lib/datas";
import type { CamadaMapaId } from "@/lib/dominio/tipos";
import type { DadosCamada, MetaCamada } from "@/lib/mapa";
import type { EstadoCamada } from "./hooks";

/** Resumo de uma camada para o painel e a legenda (informação fora do canvas). */
export interface InfoCamada {
  estado: "carregando" | "ok" | "erro";
  /** Registros no período (inclui os sem localização); null = ainda sem dados. */
  total: number | null;
  /** Registros que não aparecem no mapa por falta de coordenadas. */
  semLocalizacao: number;
  /** Mensagem da última falha (pode haver dados antigos). */
  erro: string | null;
  meta: MetaCamada | null;
  /** Está buscando de novo (com dados anteriores na tela). */
  atualizando: boolean;
}

export function infoDaCamada(estado: EstadoCamada | undefined, dados: DadosCamada | null): InfoCamada {
  const meta = estado?.dados?.meta ?? null;
  if (!estado || (estado.carregando && !estado.dados)) {
    return { estado: "carregando", total: null, semLocalizacao: 0, erro: null, meta, atualizando: false };
  }
  if (estado.erro && !estado.dados) {
    return { estado: "erro", total: null, semLocalizacao: 0, erro: estado.erro, meta, atualizando: false };
  }
  return {
    estado: estado.erro ? "erro" : "ok",
    total: dados ? dados.propriedades.length : null,
    semLocalizacao: dados ? dados.semLocalizacao : 0,
    erro: estado.erro,
    meta,
    atualizando: estado.carregando,
  };
}

const ORIGEM: Record<MetaCamada["origem"], string> = {
  "ao-vivo": "ao vivo",
  cache: "",
  "ultima-valida": "última leitura válida",
  exemplo: "dados de exemplo",
};

/** "Atualizado às 14:35 · dados de exemplo". */
export function descreverLeitura(info: InfoCamada): string | null {
  if (info.atualizando) return "Atualizando…";
  if (!info.meta) return info.estado === "carregando" ? "Carregando…" : null;
  const origem = ORIGEM[info.meta.origem];
  const hora = `Atualizado às ${formatarHora(info.meta.atualizadoEm)}`;
  return origem ? `${hora} · ${origem}` : hora;
}

const formatoInteiro = new Intl.NumberFormat("pt-BR");

export function textoContagem(info: InfoCamada): string {
  if (info.total !== null) return formatoInteiro.format(info.total);
  return info.estado === "erro" ? "indisponível" : "…";
}

export function estadoPilula(info: InfoCamada): "ok" | "vazio" | "carregando" | "erro" {
  if (info.total === null) return info.estado === "erro" ? "erro" : "carregando";
  if (info.estado === "erro") return "erro";
  return info.total === 0 ? "vazio" : "ok";
}

/** Rótulo acessível da contagem ("26 registros", "camada indisponível"). */
export function rotuloContagem(info: InfoCamada, camada: CamadaMapaId): string {
  if (info.total === null) return info.estado === "erro" ? "camada indisponível" : "carregando";
  const unidade = camada === "cobs" ? (info.total === 1 ? "área" : "áreas") : info.total === 1 ? "registro" : "registros";
  const base = `${formatoInteiro.format(info.total)} ${unidade}`;
  return info.estado === "erro" ? `${base} (última leitura; a atualização falhou)` : base;
}
