import {
  Activity,
  CloudRain,
  FileText,
  LayoutDashboard,
  MapIcon,
  ShieldAlert,
  Siren,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Mapa de navegação da Sala de Situação. Fonte única para o trilho lateral,
 * a gaveta do celular, os placeholders dos módulos e a página 404.
 */

/** "ativo": módulo funcionando nesta fase. "em-breve": placeholder de módulo futuro. */
export type SituacaoModulo = "ativo" | "em-breve";

export type GrupoNavegacao = "modulos" | "sistema";

export interface ItemNavegacao {
  /** Rota do App Router (sempre começa com "/"). */
  rota: string;
  rotulo: string;
  /** Uma frase, no imperativo/descritivo, usada em dicas e cartões. */
  descricao: string;
  icone: LucideIcon;
  situacao: SituacaoModulo;
  grupo: GrupoNavegacao;
}

export interface DefinicaoGrupo {
  id: GrupoNavegacao;
  /** Rótulo exibido acima do grupo no trilho (null = sem rótulo). */
  rotulo: string | null;
}

export const GRUPOS_NAVEGACAO: readonly DefinicaoGrupo[] = [
  { id: "modulos", rotulo: null },
  { id: "sistema", rotulo: "Sistema" },
];

export const NAVEGACAO: readonly ItemNavegacao[] = [
  {
    rota: "/",
    rotulo: "Visão Geral",
    descricao: "Mapa de Minas Gerais com COBs, alertas, ações RRD e ocorrências complexas, mais os indicadores do período.",
    icone: LayoutDashboard,
    situacao: "ativo",
    grupo: "modulos",
  },
  {
    rota: "/monitoramento",
    rotulo: "Monitoramento",
    descricao: "Avisos meteorológicos vigentes do INMET para MG e previsão de chuva por COB.",
    icone: CloudRain,
    situacao: "ativo",
    grupo: "modulos",
  },
  {
    rota: "/risco",
    rotulo: "Mapa de Risco",
    descricao:
      "Chuva prevista e riscos meteorológico, geológico e hidrológico por município, do COB ao município conforme o zoom (modelo GeoRisk).",
    icone: MapIcon,
    situacao: "ativo",
    grupo: "modulos",
  },
  {
    rota: "/alertas-acoes-rrd",
    rotulo: "Alertas & Ações RRD",
    descricao: "Emissão de alertas e acompanhamento das ações de Redução do Risco de Desastres.",
    icone: Siren,
    situacao: "ativo",
    grupo: "modulos",
  },
  {
    rota: "/nac",
    rotulo: "NAC",
    descricao: "Anúncio diário dos Núcleos de Atenção às Chuvas por COB e BBM.",
    icone: Users,
    situacao: "em-breve",
    grupo: "modulos",
  },
  {
    rota: "/ocorrencias-complexas",
    rotulo: "Ocorrências Complexas",
    descricao: "Ocorrências complexas na estrutura do Sistema de Comando de Incidentes (SCI).",
    icone: ShieldAlert,
    situacao: "em-breve",
    grupo: "modulos",
  },
  {
    rota: "/boletim",
    rotulo: "Boletim",
    descricao: "Boletim matinal da Sala de Situação gerado a partir do banco de dados.",
    icone: FileText,
    situacao: "em-breve",
    grupo: "modulos",
  },
  {
    rota: "/status",
    rotulo: "Status das fontes",
    descricao: "Estado de cada fonte de dados: ok, atrasada ou fora do ar.",
    icone: Activity,
    situacao: "ativo",
    grupo: "sistema",
  },
];

/** true se `pathname` está dentro da rota do item ("/" só casa com a raiz). */
export function rotaAtiva(pathname: string | null | undefined, rota: string): boolean {
  if (!pathname) return false;
  if (rota === "/") return pathname === "/";
  return pathname === rota || pathname.startsWith(`${rota}/`);
}

/** Item de navegação de uma rota exata (para títulos, ícones e descrições das páginas). */
export function itemDaRota(rota: string): ItemNavegacao {
  const item = NAVEGACAO.find((i) => i.rota === rota);
  if (!item) throw new Error(`Rota sem item de navegação: ${rota}`);
  return item;
}

export function itensDoGrupo(grupo: GrupoNavegacao): ItemNavegacao[] {
  return NAVEGACAO.filter((i) => i.grupo === grupo);
}
