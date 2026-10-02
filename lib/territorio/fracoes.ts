import type { RotuloCob } from "@/lib/dominio/tipos";
import dadosFracoes from "./fracoes-cbmmg.json";
import dadosMunicipios from "./municipios-formulario.json";

/**
 * Estrutura operacional do CBMMG usada no formulário Survey123 "Emissão de
 * Alertas" (lista de escolhas `ueop`, filtrada por COB): COB → BBM/Cia Ind →
 * Cia → Pel → PA, com a cidade da fração. Extraída do XLSForm enviado pelo
 * usuário em 02/10/2026; regenerar se o formulário mudar.
 */
export interface FracaoCbmmg {
  /** Código da escolha no formulário (valor gravado no ArcGIS). */
  codigo: string;
  /** Rótulo da escolha no formulário (ex.: "1 BBM/2CIA/1PEL (Ouro Preto)"). */
  rotulo: string;
  cob: RotuloCob;
  /** UEOp: "1º BBM", "5ª Cia Ind" ou o próprio COB ("1º COB"). */
  ueop: string;
  /** Fração abaixo da UEOp (ex.: "2ª Cia/1º Pel (Ouro Preto)"); null na sede. */
  fracao: string | null;
  cidade: string;
  sede: boolean;
}

export const FRACOES_CBMMG: readonly FracaoCbmmg[] = dadosFracoes as FracaoCbmmg[];

export interface MunicipioFormulario {
  codigo: string;
  nome: string;
}

export const MUNICIPIOS_FORMULARIO: readonly MunicipioFormulario[] = dadosMunicipios;

function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const fracaoPorChave = new Map<string, FracaoCbmmg>();
for (const f of FRACOES_CBMMG) {
  fracaoPorChave.set(chave(f.codigo), f);
  fracaoPorChave.set(chave(f.rotulo), f);
}

const municipioPorChave = new Map<string, string>();
for (const m of MUNICIPIOS_FORMULARIO) {
  municipioPorChave.set(chave(m.codigo), m.nome);
  municipioPorChave.set(chave(m.nome), m.nome);
}

/** Encontra a fração pelo código gravado ou pelo rótulo do formulário. */
export function buscarFracao(valor: unknown): FracaoCbmmg | null {
  if (valor === null || valor === undefined) return null;
  const k = chave(String(valor));
  return k ? (fracaoPorChave.get(k) ?? null) : null;
}

/** Nome do município a partir do código do formulário ("Acucena" → "Açucena") ou do próprio nome. */
export function nomeMunicipio(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  return municipioPorChave.get(chave(texto)) ?? texto.replace(/_/g, " ");
}

/** UEOps de cada COB, na ordem do formulário (para cascatas e agregações). */
export function ueopsDoCob(cob: RotuloCob): string[] {
  return [...new Set(FRACOES_CBMMG.filter((f) => f.cob === cob).map((f) => f.ueop))];
}
