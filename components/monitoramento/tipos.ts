import type { SeveridadeInmet } from "@/lib/dominio/tipos";

/**
 * Aviso do INMET já preparado no servidor para a tela (dados serializáveis,
 * sem depender de módulos server-only no navegador).
 */
export interface AvisoVisao {
  id: string;
  evento: string;
  severidade: SeveridadeInmet;
  /** Texto original da severidade no feed. */
  severidadeRotulo: string;
  vigencia: "vigente" | "futuro";
  inicio: string | null;
  fim: string | null;
  descricao: string | null;
  /** Mesorregiões de MG presentes nas áreas do aviso. */
  mesorregioes: string[];
  /** Quantas áreas do aviso ficam fora de MG. */
  areasForaDeMg: number;
  /** Link http(s) do aviso no INMET (já validado). */
  link: string | null;
}

/** Linha do gráfico de chuva prevista por COB. */
export interface LinhaChuvaCob {
  cob: string;
  municipio: string;
  /** "1º COB · Belo Horizonte" */
  rotulo: string;
  mm: number | null;
}
