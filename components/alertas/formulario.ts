import {
  CAP_CERTEZAS,
  CAP_URGENCIAS,
  COBS_FEICAO,
  EVENTOS,
  type CapCerteza,
  type CapResposta,
  type CapUrgencia,
  type EventoAlerta,
  type FonteGatilho,
  type Natureza,
  type ResultadoAcao,
  type SituacaoAlerta,
  type TipoAcao,
  type TipoRiscoSala,
} from "@/lib/alertas/codigos";
import {
  alertaVazio,
  aplicarCampos,
  areaPadrao,
  esquemaPedido,
  fracaoDoTerritorio,
  prazoPadrao,
  problemasDoZod,
  resolverTerritorio,
  sugerirNivel,
  validarEmissao,
  type AlertaSala,
  type CamposAlerta,
  type Destinatario,
  type Problema,
  type ValoresNivel,
} from "@/lib/alertas/dominio";
import { interpretarDataHoraBrasilia } from "@/lib/datas";
import {
  CORES_NIVEL,
  MATRIZ_CHUVA,
  MATRIZ_GEOLOGICA,
  MATRIZ_HIDROLOGICA,
  classificarChuvaDetalhada,
  classificarIndiceGeologico,
  type Faixa,
  type NivelHidrologico,
  type NivelRisco,
} from "@/lib/dominio/matrizes";
import { buscarFracao, FRACOES_CBMMG, type FracaoCbmmg } from "@/lib/territorio/fracoes";
import { municipioPorIbge, municipioPorNome, MUNICIPIOS_MG, type MunicipioMg } from "@/lib/territorio/municipios";

/**
 * Formulário de emissão de alertas e corpos das ações da fila (POST
 * /api/alertas). Puro: sem React. A validação ESPELHA a do servidor usando
 * os MESMOS esquemas de lib/alertas/dominio.ts (esquemaPedido, validarEmissao,
 * resolverTerritorio): o que a tela aprova o servidor aprova, e vice-versa.
 * Só acrescenta o que é da tela: máscara do nº da chamada, números digitados
 * com vírgula, justificativa do nível ajustado e datas no horário de Brasília.
 */

// ---------------------------------------------------------------------------------------------
// Datas no horário de Brasília (campos datetime-local)
// ---------------------------------------------------------------------------------------------

const HORA = 3_600_000;

/** ISO → "AAAA-MM-DDTHH:MM" de parede em Brasília (UTC−3 fixo), para <input type="datetime-local">. */
export function paraCampoBrasilia(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t - 3 * HORA).toISOString().slice(0, 16);
}

/** "AAAA-MM-DDTHH:MM" de Brasília → ISO UTC; null se vazio ou inválido. */
export function deCampoBrasilia(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor.trim())) return null;
  return interpretarDataHoraBrasilia(valor.trim())?.toISOString() ?? null;
}

// ---------------------------------------------------------------------------------------------
// Nº da chamada CAD e números digitados
// ---------------------------------------------------------------------------------------------

/** Formato do nº da chamada no CAD: AAAA-NNNNNNNN-N (ex.: 2026-12345678-9). */
export const PADRAO_NUMERO_CHAMADA = /^\d{4}-\d{8}-\d$/;

/**
 * Máscara do nº da chamada enquanto se digita: mantém só os dígitos (até 13)
 * e põe os hífens no lugar ("2026123456789" → "2026-12345678-9").
 */
export function mascararNumeroChamada(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 4) return d;
  if (d.length <= 12) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 12)}-${d.slice(12)}`;
}

/**
 * Número digitado ("45", "45,5", "1.234,5", " 12 "): null se vazio; NaN se
 * não for número (a validação acusa).
 */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}

/** Número para o campo de texto ("45,5"). */
export function numeroParaCampo(valor: number | null | undefined): string {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor).replace(".", ",") : "";
}

// ---------------------------------------------------------------------------------------------
// Território
// ---------------------------------------------------------------------------------------------

/** Frações de um COB, agrupadas por UEOp (na ordem da lista oficial). */
export function fracoesDoCob(cob: string): { ueop: string; fracoes: FracaoCbmmg[] }[] {
  const grupos = new Map<string, FracaoCbmmg[]>();
  for (const f of FRACOES_CBMMG) {
    if (f.cob !== cob) continue;
    const g = grupos.get(f.ueop) ?? [];
    g.push(f);
    grupos.set(f.ueop, g);
  }
  return [...grupos].map(([ueop, fracoes]) => ({ ueop, fracoes }));
}

/** Município sugerido para a fração: o da cidade da fração ("Barreiro/BH" → Belo Horizonte). */
export function municipioDaFracao(f: Pick<FracaoCbmmg, "cidade">): MunicipioMg | null {
  const direto = municipioPorNome(f.cidade);
  if (direto) return direto;
  for (const parte of f.cidade.split("/").reverse()) {
    const p = parte.trim();
    const m = p.toUpperCase() === "BH" ? municipioPorNome("Belo Horizonte") : municipioPorNome(p);
    if (m) return m;
  }
  return null;
}

/**
 * Fração sugerida para um município (atribuição APROXIMADA de MUNICIPIOS_MG:
 * a fração mais próxima dentro do COB). null quando não há entrada oficial.
 */
export function fracaoDoMunicipio(m: Pick<MunicipioMg, "cob" | "ueop" | "fracao">): FracaoCbmmg | null {
  return (
    FRACOES_CBMMG.find((f) => f.cob === m.cob && f.ueop === m.ueop && f.fracao === (m.fracao ?? null)) ??
    FRACOES_CBMMG.find((f) => f.cob === m.cob && f.ueop === m.ueop && f.fracao === null) ??
    null
  );
}

/** Município digitado (nome, com ou sem acento) ou código IBGE. */
export function resolverMunicipio(texto: string): MunicipioMg | null {
  const t = texto.trim();
  if (!t) return null;
  return /^31\d{5}$/.test(t) ? municipioPorIbge(t) : municipioPorNome(t);
}

/** Nomes para a lista de busca (<datalist>), em ordem alfabética. */
export const NOMES_MUNICIPIOS: readonly string[] = [...MUNICIPIOS_MG]
  .map((m) => m.nome)
  .sort((a, b) => a.localeCompare(b, "pt-BR"));

// ---------------------------------------------------------------------------------------------
// Sugestão de nível (explicada)
// ---------------------------------------------------------------------------------------------

export interface SugestaoExplicada {
  nivel: NivelRisco | null;
  /** "Laranja — Perigo" (nome da cor + nome do alerta na matriz do tipo). */
  titulo: string | null;
  /** "45 mm/h > 30" — o limiar que decidiu. */
  porque: string | null;
  /** Texto completo de sugerirNivel (o mesmo do aviso do servidor). */
  fundamento: string;
}

const FORMATO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** "45 mm/h > 30", "100 mm em 24 h > 90", "índice 2,1 ≥ 1,6", "5 mm/h ≤ 6". */
export function motivoDaFaixa(valor: number, faixa: Faixa, unidade: string, prefixo = ""): string {
  const v = `${prefixo}${FORMATO.format(valor)}${unidade ? ` ${unidade}` : ""}`;
  if (faixa.min !== null && !(faixa.min === 0 && faixa.minInclusivo)) {
    return `${v} ${faixa.minInclusivo ? "≥" : ">"} ${FORMATO.format(faixa.min)}`;
  }
  if (faixa.max !== null) return `${v} ${faixa.maxInclusivo ? "≤" : "<"} ${FORMATO.format(faixa.max)}`;
  return v;
}

/**
 * Sugestão da matriz oficial para os valores do formulário, com o "porquê"
 * curto para o operador. O nível e o fundamento são os de sugerirNivel (o
 * servidor usa a mesma função para avisar quando o nível escolhido difere).
 */
export function explicarSugestao(tipo: TipoRiscoSala | null, valores: ValoresNivel): SugestaoExplicada {
  if (!tipo) return { nivel: null, titulo: null, porque: null, fundamento: "Escolha o tipo de risco para a matriz sugerir o nível." };
  const s = sugerirNivel(tipo, valores);
  if (!s.nivel) return { nivel: null, titulo: null, porque: null, fundamento: s.fundamento };
  const nome = CORES_NIVEL[s.nivel].nome;

  if (tipo === "METEOROLOGICO") {
    const c = classificarChuvaDetalhada({ mmHoraMax: valores.mmHora, mm24h: valores.mm24h });
    const partes: string[] = [];
    if (c.porHora === s.nivel && typeof valores.mmHora === "number") {
      partes.push(motivoDaFaixa(valores.mmHora, MATRIZ_CHUVA[s.nivel].mmHora, "mm/h"));
    }
    if (c.por24h === s.nivel && typeof valores.mm24h === "number") {
      partes.push(motivoDaFaixa(valores.mm24h, MATRIZ_CHUVA[s.nivel].mm24h, "mm em 24 h"));
    }
    return { nivel: s.nivel, titulo: `${nome} — ${MATRIZ_CHUVA[s.nivel].alerta}`, porque: partes.join(" e ") || null, fundamento: s.fundamento };
  }
  if (tipo === "GEOLOGICO") {
    const classe = classificarIndiceGeologico(valores.indiceRisco);
    const linha = classe ? MATRIZ_GEOLOGICA[classe] : null;
    return {
      nivel: s.nivel,
      titulo: linha ? `${nome} — risco ${linha.rotulo.toLowerCase()}` : nome,
      porque: linha && typeof valores.indiceRisco === "number" ? motivoDaFaixa(valores.indiceRisco, linha.indice, "", "índice ") : null,
      fundamento: s.fundamento,
    };
  }
  if (tipo === "HIDROLOGICO" && valores.nivelHidrologico) {
    const linha = MATRIZ_HIDROLOGICA[valores.nivelHidrologico];
    return { nivel: s.nivel, titulo: `${nome} — ${linha.rotulo}`, porque: `estação em "${linha.rotulo}" no SACE`, fundamento: s.fundamento };
  }
  return { nivel: s.nivel, titulo: nome, porque: null, fundamento: s.fundamento };
}

// ---------------------------------------------------------------------------------------------
// Estado do formulário de emissão
// ---------------------------------------------------------------------------------------------

/** Unidade notificada além da principal: entrada da lista oficial ou o COB inteiro. */
export type DestinoAdicional = { tipo: "fracao"; codigo: string } | { tipo: "cob"; cob: string };

export interface FormularioAlerta {
  /** null = alerta novo. */
  alertaId: string | null;
  /** Versão lida (concorrência otimista). */
  alteradoEm: string | null;
  /** Situação do alerta editado (null = novo). Depois de emitido, território e destinatários travam. */
  situacao: SituacaoAlerta | null;
  /** Do alerta já emitido (não se editam): a validação do servidor compara com eles. */
  dataEmissao: string | null;
  inicioVigencia: string | null;
  natureza: Natureza;
  cob: string;
  /** Código da fração na lista oficial. */
  fracao: string;
  /** Nome digitado (ou escolhido na lista). */
  municipio: string;
  localReferencia: string;
  tipoRisco: TipoRiscoSala | "";
  evento: EventoAlerta | "";
  fonteGatilho: FonteGatilho | "";
  fonteRef: string;
  mmHora: string;
  mm24h: string;
  bacia: string;
  rio: string;
  cota: string;
  estacaoCodigo: string;
  /** Situação da estação no SACE: só alimenta a sugestão (não é gravada). */
  situacaoSace: NivelHidrologico | "";
  indiceRisco: string;
  /** Escolha explícita do operador; "" = segue a sugestão da matriz. */
  nivelEscolhido: NivelRisco | "";
  justificativaNivel: string;
  numeroChamada: string;
  /** Datas: "AAAA-MM-DDTHH:MM" de Brasília. */
  validoAte: string;
  /** "padrao": o servidor calcula pelo nível na emissão; "definido": usa prazoAcao. */
  prazoModo: "padrao" | "definido";
  prazoAcao: string;
  titulo: string;
  descricao: string;
  instrucao: string;
  areaDesc: string;
  capUrgencia: CapUrgencia;
  capCerteza: CapCerteza;
  capResposta: CapResposta | "";
  destinatarios: DestinoAdicional[];
}

/** Validade padrão de um alerta novo, em horas. */
export const VALIDADE_PADRAO_HORAS = 24;

/** Padrões CAP: a maioria dos alertas da Sala é de previsão para as próximas horas. */
export const URGENCIA_PADRAO: CapUrgencia = "Expected";
export const CERTEZA_PADRAO: CapCerteza = "Likely";

export const AJUDA_URGENCIA =
  "Quando agir. Imediata: agir já. Esperada: na próxima hora. Futura: num futuro próximo. Use Imediata quando o fenômeno já está acontecendo.";
export const AJUDA_CERTEZA =
  "Chance de o evento ocorrer. Observado: já ocorre. Provável: mais de 50%. Possível: menos de 50%.";

export function formularioVazio(agora: Date): FormularioAlerta {
  return {
    alertaId: null,
    alteradoEm: null,
    situacao: null,
    dataEmissao: null,
    inicioVigencia: null,
    natureza: "REAL",
    cob: "",
    fracao: "",
    municipio: "",
    localReferencia: "",
    tipoRisco: "",
    evento: "",
    fonteGatilho: "",
    fonteRef: "",
    mmHora: "",
    mm24h: "",
    bacia: "",
    rio: "",
    cota: "",
    estacaoCodigo: "",
    situacaoSace: "",
    indiceRisco: "",
    nivelEscolhido: "",
    justificativaNivel: "",
    numeroChamada: "",
    validoAte: paraCampoBrasilia(new Date(agora.getTime() + VALIDADE_PADRAO_HORAS * HORA).toISOString()),
    prazoModo: "padrao",
    prazoAcao: "",
    titulo: "",
    descricao: "",
    instrucao: "",
    areaDesc: "",
    capUrgencia: URGENCIA_PADRAO,
    capCerteza: CERTEZA_PADRAO,
    capResposta: "",
    destinatarios: [],
  };
}

const MARCADOR_JUSTIFICATIVA = "Justificativa do nível:";

/**
 * A justificativa do nível ajustado vai no fim da descrição do alerta (a
 * unidade lê por que o nível difere da matriz), num parágrafo marcado.
 * 🔔 Provisório até a camada ganhar um campo próprio (justificativa_nivel).
 */
export function juntarJustificativa(descricao: string, justificativa: string): string {
  const base = separarJustificativa(descricao).descricao;
  const j = justificativa.trim().replace(/\s+/g, " ");
  if (!j) return base;
  return base ? `${base}\n\n${MARCADOR_JUSTIFICATIVA} ${j}` : `${MARCADOR_JUSTIFICATIVA} ${j}`;
}

/** Separa a descrição do parágrafo de justificativa (inverso de juntarJustificativa). */
export function separarJustificativa(descricao: string): { descricao: string; justificativa: string } {
  const i = descricao.lastIndexOf(MARCADOR_JUSTIFICATIVA);
  if (i < 0 || (i > 0 && descricao[i - 1] !== "\n")) return { descricao: descricao.trim(), justificativa: "" };
  return { descricao: descricao.slice(0, i).trim(), justificativa: descricao.slice(i + MARCADOR_JUSTIFICATIVA.length).trim() };
}

/** Formulário preenchido a partir de um alerta (editar rascunho ou atualizar emitido). */
export function formularioDoAlerta(
  a: AlertaSala & { destinatarios?: readonly Destinatario[] },
  agora: Date,
): FormularioAlerta {
  const vazio = formularioVazio(agora);
  const fracao = fracaoDoTerritorio(a);
  const { descricao, justificativa } = separarJustificativa(a.descricao ?? "");
  const adicionais: DestinoAdicional[] = [];
  for (const d of a.destinatarios ?? []) {
    if (d.principal) continue;
    if (d.destNivel === "COB" && d.cob) {
      adicionais.push({ tipo: "cob", cob: d.cob });
      continue;
    }
    const f = FRACOES_CBMMG.find((x) => x.cob === d.cob && x.ueop === d.ueop && x.fracao === (d.fracao ?? null));
    if (f) adicionais.push({ tipo: "fracao", codigo: f.codigo });
  }
  return {
    ...vazio,
    alertaId: a.alertaId,
    alteradoEm: a.alteradoEm,
    situacao: a.situacao,
    dataEmissao: a.dataEmissao,
    inicioVigencia: a.inicioVigencia,
    natureza: a.natureza,
    cob: a.cob ?? fracao?.cob ?? "",
    fracao: fracao?.codigo ?? "",
    municipio: a.municipio ?? "",
    localReferencia: a.localReferencia ?? "",
    tipoRisco: a.tipoRisco ?? "",
    evento: a.evento ?? "",
    fonteGatilho: a.fonteGatilho ?? "",
    fonteRef: a.fonteRef ?? "",
    mmHora: numeroParaCampo(a.mmHora),
    mm24h: numeroParaCampo(a.mm24h),
    bacia: a.bacia ?? "",
    rio: a.rio ?? "",
    cota: numeroParaCampo(a.cota),
    estacaoCodigo: a.estacaoCodigo ?? "",
    indiceRisco: numeroParaCampo(a.indiceRisco),
    nivelEscolhido: a.nivelAlerta ?? "",
    justificativaNivel: justificativa,
    numeroChamada: a.numeroChamada ?? "",
    validoAte: a.validoAte ? paraCampoBrasilia(a.validoAte) : vazio.validoAte,
    prazoModo: a.prazoAcao ? "definido" : "padrao",
    prazoAcao: paraCampoBrasilia(a.prazoAcao),
    titulo: a.titulo ?? "",
    descricao,
    instrucao: a.instrucao ?? "",
    areaDesc: a.areaDesc ?? "",
    capUrgencia: a.capUrgencia ?? URGENCIA_PADRAO,
    capCerteza: a.capCerteza ?? CERTEZA_PADRAO,
    capResposta: a.capResposta ?? "",
    destinatarios: adicionais,
  };
}

/** Depois de emitido, território, natureza e destinatários não mudam (CAMPOS_TRAVADOS_APOS_EMISSAO). */
export function territorioTravado(f: Pick<FormularioAlerta, "situacao">): boolean {
  return f.situacao !== null && f.situacao !== "RASCUNHO";
}

/** Valores que a matriz usa, lidos do formulário (números inválidos contam como sem dado). */
export function valoresDoFormulario(f: FormularioAlerta): ValoresNivel {
  const n = (t: string) => {
    const v = lerNumero(t);
    return v === null || Number.isNaN(v) ? null : v;
  };
  return {
    mmHora: n(f.mmHora),
    mm24h: n(f.mm24h),
    indiceRisco: n(f.indiceRisco),
    cota: n(f.cota),
    nivelHidrologico: f.situacaoSace || null,
  };
}

/** Sugestão da matriz para o formulário atual. */
export function sugestaoDoFormulario(f: FormularioAlerta): SugestaoExplicada {
  return explicarSugestao(f.tipoRisco || null, valoresDoFormulario(f));
}

/** Nível que vai para o alerta: a escolha do operador ou, sem ela, a sugestão. */
export function nivelEfetivo(f: FormularioAlerta, sugestao: SugestaoExplicada = sugestaoDoFormulario(f)): NivelRisco | null {
  return f.nivelEscolhido || sugestao.nivel;
}

/** O operador escolheu um nível diferente do sugerido pela matriz (pede justificativa)? */
export function nivelAjustado(f: FormularioAlerta, sugestao: SugestaoExplicada = sugestaoDoFormulario(f)): boolean {
  return f.nivelEscolhido !== "" && sugestao.nivel !== null && f.nivelEscolhido !== sugestao.nivel;
}

/** Eventos do tipo de risco (cascata tipo → evento); "Outro" vale para todos. */
export function eventosDoTipo(tipo: TipoRiscoSala | ""): (typeof EVENTOS)[number][] {
  return EVENTOS.filter((e) => e.grupo === null || (tipo !== "" && e.grupo === tipo));
}

// ---------------------------------------------------------------------------------------------
// Corpo de salvar / emitir
// ---------------------------------------------------------------------------------------------

export type AcaoFormulario = "salvar" | "emitir";

function textoOuNulo(t: string): string | null {
  const v = t.trim();
  return v === "" ? null : v;
}

function numeroOuNulo(t: string): number | null {
  const v = lerNumero(t);
  return v === null || Number.isNaN(v) ? null : v;
}

/** Corpo de {acao: "salvar" | "emitir"} a partir do formulário (o que o servidor recebe). */
export function montarCorpoAlerta(f: FormularioAlerta, acao: AcaoFormulario): Record<string, unknown> {
  const sugestao = sugestaoDoFormulario(f);
  const tipo = f.tipoRisco || null;
  const corpo: Record<string, unknown> = { acao };
  if (f.alertaId) {
    corpo.alertaId = f.alertaId;
    if (f.alteradoEm) corpo.alteradoEm = f.alteradoEm;
  }
  if (!territorioTravado(f)) {
    corpo.natureza = f.natureza;
    corpo.fracao = f.fracao || null;
    const m = resolverMunicipio(f.municipio);
    // Sem correspondência, vai o nome: o servidor responde "Município não encontrado".
    if (m) corpo.codIbge = m.ibge;
    else {
      corpo.codIbge = null;
      corpo.municipio = textoOuNulo(f.municipio);
    }
    corpo.destinatarios = f.destinatarios.map((d) => (d.tipo === "cob" ? { cob: d.cob } : { fracao: d.codigo }));
  }
  const ajustado = nivelAjustado(f, sugestao);
  Object.assign(corpo, {
    fonteGatilho: f.fonteGatilho || null,
    fonteRef: textoOuNulo(f.fonteRef),
    tipoRisco: tipo,
    evento: f.evento || null,
    nivelAlerta: nivelEfetivo(f, sugestao),
    numeroChamada: textoOuNulo(f.numeroChamada),
    // Campos de outro tipo de risco são limpos (o tipo pode ter mudado).
    mmHora: tipo === "METEOROLOGICO" ? numeroOuNulo(f.mmHora) : null,
    mm24h: tipo === "METEOROLOGICO" ? numeroOuNulo(f.mm24h) : null,
    bacia: tipo === "HIDROLOGICO" ? textoOuNulo(f.bacia) : null,
    rio: tipo === "HIDROLOGICO" ? textoOuNulo(f.rio) : null,
    cota: tipo === "HIDROLOGICO" ? numeroOuNulo(f.cota) : null,
    estacaoCodigo: tipo === "HIDROLOGICO" ? textoOuNulo(f.estacaoCodigo) : null,
    indiceRisco: tipo === "GEOLOGICO" ? numeroOuNulo(f.indiceRisco) : null,
    localReferencia: textoOuNulo(f.localReferencia),
    titulo: textoOuNulo(f.titulo),
    descricao: textoOuNulo(juntarJustificativa(f.descricao, ajustado ? f.justificativaNivel : "")),
    instrucao: textoOuNulo(f.instrucao),
    areaDesc: textoOuNulo(f.areaDesc),
    capUrgencia: f.capUrgencia,
    capCerteza: f.capCerteza,
    capResposta: f.capResposta || null,
    validoAte: deCampoBrasilia(f.validoAte),
    // "Pelo nível": null e o servidor calcula na emissão. Já emitido, o prazo gravado fica (undefined = não mexe).
    prazoAcao: f.prazoModo === "definido" ? deCampoBrasilia(f.prazoAcao) : territorioTravado(f) ? undefined : null,
  });
  return corpo;
}

// ---------------------------------------------------------------------------------------------
// Validação (espelho do servidor)
// ---------------------------------------------------------------------------------------------

/** Campos do formulário que recebem erro (id do campo na tela: `campo-${nome}`). */
export type CampoFormulario =
  | "natureza"
  | "cob"
  | "fracao"
  | "municipio"
  | "localReferencia"
  | "tipoRisco"
  | "evento"
  | "fonteGatilho"
  | "fonteRef"
  | "mmHora"
  | "mm24h"
  | "bacia"
  | "rio"
  | "cota"
  | "estacaoCodigo"
  | "indiceRisco"
  | "nivel"
  | "justificativaNivel"
  | "numeroChamada"
  | "validoAte"
  | "prazoAcao"
  | "titulo"
  | "descricao"
  | "instrucao"
  | "areaDesc"
  | "capUrgencia"
  | "capCerteza"
  | "capResposta"
  | "destinatarios"
  | "geral";

/** Ordem dos campos na tela: o foco vai para o primeiro erro nesta ordem. */
export const ORDEM_CAMPOS: readonly CampoFormulario[] = [
  "geral",
  "natureza",
  "cob",
  "fracao",
  "municipio",
  "localReferencia",
  "tipoRisco",
  "evento",
  "fonteGatilho",
  "fonteRef",
  "mmHora",
  "mm24h",
  "bacia",
  "rio",
  "cota",
  "estacaoCodigo",
  "indiceRisco",
  "nivel",
  "justificativaNivel",
  "numeroChamada",
  "validoAte",
  "prazoAcao",
  "titulo",
  "descricao",
  "instrucao",
  "areaDesc",
  "capUrgencia",
  "capCerteza",
  "capResposta",
  "destinatarios",
];

/** Campo do pedido/do domínio (como o servidor devolve em `campos`) → campo da tela. */
export function campoDoFormulario(campo: string): CampoFormulario {
  const raiz = campo.split(".")[0];
  switch (raiz) {
    case "cob":
    case "ueop":
      return "fracao";
    case "codIbge":
    case "municipio":
      return "municipio";
    case "nivelAlerta":
      return "nivel";
    case "inicioVigencia":
      return "validoAte";
    case "dataEmissao":
    case "capIdentifier":
    case "alteradoEm":
    case "alertaId":
    case "mesmoLoteDe":
    case "pedido":
      return "geral";
    default:
      return (ORDEM_CAMPOS as readonly string[]).includes(raiz) ? (raiz as CampoFormulario) : "geral";
  }
}

export type ErrosFormulario = Partial<Record<CampoFormulario, string>>;

/**
 * Mensagem para a tela: o COB e a UEOp saem da fração, e o código IBGE sai do
 * município, então a falta deles é dita no campo que o operador preenche.
 */
function mensagemNaTela(p: Problema): string {
  const raiz = p.campo.split(".")[0];
  const obrigatorio = /obrigatório/.test(p.mensagem);
  if ((raiz === "cob" || raiz === "ueop") && obrigatorio) return "Escolha a fração responsável (o COB e a UEOp saem dela).";
  if ((raiz === "codIbge" || raiz === "municipio") && obrigatorio) return "Escolha o município.";
  // "Título: obrigatório para emitir." → "Obrigatório para emitir." (o rótulo já está no campo).
  const semRotulo = p.mensagem.match(/^[^:]{1,40}: (obrigatório para emitir|valor inválido)\.$/);
  if (semRotulo) return `${semRotulo[1][0].toUpperCase()}${semRotulo[1].slice(1)}.`;
  return p.mensagem;
}

/** Problemas → um erro por campo da tela (o primeiro de cada um). */
export function errosPorCampo(problemas: readonly Problema[]): ErrosFormulario {
  const erros: ErrosFormulario = {};
  for (const p of problemas) {
    const campo = campoDoFormulario(p.campo);
    erros[campo] ??= mensagemNaTela(p);
  }
  return erros;
}

/** Primeiro campo com erro, na ordem da tela (para o foco). */
export function primeiroErro(erros: ErrosFormulario): CampoFormulario | null {
  return ORDEM_CAMPOS.find((c) => erros[c]) ?? null;
}

/**
 * O alerta como ficaria ao ser emitido agora, montado do corpo do pedido,
 * como o servidor faz (aplicarCampos + território + padrões da emissão).
 */
function candidatoEmissao(corpo: Record<string, unknown>, f: FormularioAlerta, agora: Date): AlertaSala {
  const campos = corpo as CamposAlerta;
  let a = aplicarCampos({ ...alertaVazio(f.alertaId ?? "AL-00000000-0000"), natureza: f.natureza }, campos);
  const t = resolverTerritorio(
    { fracao: f.fracao || null, codIbge: (corpo.codIbge as string | null | undefined) ?? null, municipio: (corpo.municipio as string | null | undefined) ?? null },
    false,
  );
  a = { ...a, ...t.territorio };
  if (territorioTravado(f)) {
    // Território travado: vale o gravado (o formulário mostra, mas não envia).
    const m = resolverMunicipio(f.municipio);
    const fr = buscarFracao(f.fracao);
    a = { ...a, cob: fr?.cob ?? f.cob, ueop: fr?.ueop ?? null, fracao: fr?.fracao ?? null, municipio: m?.nome ?? null, codIbge: m?.ibge ?? null };
  }
  const agoraIso = agora.toISOString();
  return {
    ...a,
    situacao: "EMITIDO",
    dataEmissao: f.dataEmissao ?? agoraIso,
    inicioVigencia: f.inicioVigencia ?? a.inicioVigencia ?? agoraIso,
    prazoAcao: a.prazoAcao ?? (a.nivelAlerta ? prazoPadrao(a.nivelAlerta, agora) : null),
    areaDesc: a.areaDesc ?? (a.municipio ? areaPadrao(a.municipio, a.localReferencia) : null),
    capIdentifier: "conferencia",
  };
}

/**
 * Valida o formulário para `acao` com as regras do servidor (esquemaPedido e,
 * para emitir, validarEmissao e resolverTerritorio) e as da tela (máscara do
 * nº da chamada, números, datas de Brasília, justificativa do nível).
 */
export function validarFormulario(f: FormularioAlerta, acao: AcaoFormulario, agora: Date): ErrosFormulario {
  // Da tela (já com o campo da tela): têm precedência sobre os do servidor no mesmo campo.
  const locais: ErrosFormulario = {};
  const local = (campo: CampoFormulario, mensagem: string) => {
    locais[campo] ??= mensagem;
  };
  const problemas: Problema[] = [];
  const emitir = acao === "emitir" || territorioTravado(f);

  // Números, datas e máscara (antes do zod, que só veria null).
  const numeros: [CampoFormulario, string, TipoRiscoSala][] = [
    ["mmHora", f.mmHora, "METEOROLOGICO"],
    ["mm24h", f.mm24h, "METEOROLOGICO"],
    ["cota", f.cota, "HIDROLOGICO"],
    ["indiceRisco", f.indiceRisco, "GEOLOGICO"],
  ];
  for (const [campo, texto, tipo] of numeros) {
    if (f.tipoRisco === tipo && Number.isNaN(lerNumero(texto))) local(campo, "Número esperado (use vírgula para decimais).");
  }
  const chamada = f.numeroChamada.trim();
  if (chamada && !PADRAO_NUMERO_CHAMADA.test(chamada)) local("numeroChamada", "Use o formato AAAA-NNNNNNNN-N (ex.: 2026-12345678-9).");
  if (f.validoAte.trim() && !deCampoBrasilia(f.validoAte)) local("validoAte", "Data e hora inválidas.");
  if (f.prazoModo === "definido") {
    const prazo = deCampoBrasilia(f.prazoAcao);
    if (!prazo) local("prazoAcao", "Informe a data e a hora do prazo.");
    else if (emitir && !territorioTravado(f) && Date.parse(prazo) <= agora.getTime()) {
      local("prazoAcao", "O prazo da ação RRD precisa ser depois de agora.");
    }
  }
  if (f.municipio.trim() && !resolverMunicipio(f.municipio)) {
    local("municipio", "Município não encontrado em Minas Gerais. Escolha um nome da lista.");
  }
  const sugestao = sugestaoDoFormulario(f);
  if (emitir && nivelAjustado(f, sugestao) && f.justificativaNivel.trim().length < 5) {
    local("justificativaNivel", "Explique em poucas palavras por que o nível difere do sugerido.");
  }
  if (f.destinatarios.some((d) => d.tipo === "cob" && !(COBS_FEICAO as readonly string[]).includes(d.cob))) {
    local("destinatarios", "COB fora da lista.");
  }
  if (emitir && !territorioTravado(f) && !f.cob) local("cob", "Escolha o COB.");

  // Do servidor: o mesmo esquema do POST e a mesma conferência da emissão.
  const corpo = montarCorpoAlerta(f, acao);
  const analise = esquemaPedido.safeParse(corpo);
  if (!analise.success) problemas.push(...problemasDoZod(analise.error));
  else if (!territorioTravado(f)) {
    const t = resolverTerritorio({ fracao: f.fracao || null, codIbge: (corpo.codIbge as string | null) ?? null, municipio: null }, false);
    problemas.push(...t.erros);
  }
  if (emitir && analise.success) {
    problemas.push(...validarEmissao(candidatoEmissao(corpo, f, agora), agora, !territorioTravado(f)));
  }
  const doServidor = errosPorCampo(problemas);
  // Consequências de outro erro já apontado: a área sai do município; o prazo padrão, do nível.
  if (!resolverMunicipio(f.municipio)) delete doServidor.areaDesc;
  if (f.prazoModo === "padrao" && !nivelEfetivo(f, sugestao)) delete doServidor.prazoAcao;

  const erros: ErrosFormulario = {};
  for (const campo of ORDEM_CAMPOS) {
    const mensagem = locais[campo] ?? doServidor[campo];
    if (mensagem) erros[campo] = mensagem;
  }
  return erros;
}

/** Avisos que não bloqueiam (território aproximado), para mostrar antes de emitir. */
export function avisosDoFormulario(f: FormularioAlerta): string[] {
  const m = resolverMunicipio(f.municipio);
  if (!f.fracao || !m) return [];
  return resolverTerritorio({ fracao: f.fracao, codIbge: m.ibge, municipio: null }, false).avisos;
}

// ---------------------------------------------------------------------------------------------
// Corpos das ações do detalhe
// ---------------------------------------------------------------------------------------------

export interface FormularioAcaoRrd {
  tipoAcao: TipoAcao | "";
  resultado: ResultadoAcao | "";
  acaoExecutada: string;
  /** "AAAA-MM-DDTHH:MM" de Brasília. */
  dataAcao: string;
  ocorrenciaCad: string;
  localReferencia: string;
  pessoasOrientadas: string;
  pessoasRemovidas: string;
  imoveisVistoriados: string;
  imoveisInterditados: string;
  efetivoEmpregado: string;
  viaturasEmpregadas: string;
  /** "" = não respondido (nunca "não"). */
  compdecAcionada: "" | "S" | "N";
}

export const CONTAGENS_ACAO = [
  ["pessoasOrientadas", "Pessoas orientadas"],
  ["pessoasRemovidas", "Pessoas removidas"],
  ["imoveisVistoriados", "Imóveis vistoriados"],
  ["imoveisInterditados", "Imóveis interditados"],
  ["efetivoEmpregado", "Efetivo empregado"],
  ["viaturasEmpregadas", "Viaturas empregadas"],
] as const satisfies readonly (readonly [keyof FormularioAcaoRrd, string])[];

export function formularioAcaoVazio(agora: Date): FormularioAcaoRrd {
  return {
    tipoAcao: "",
    resultado: "",
    acaoExecutada: "",
    dataAcao: paraCampoBrasilia(agora.toISOString()),
    ocorrenciaCad: "",
    localReferencia: "",
    pessoasOrientadas: "",
    pessoasRemovidas: "",
    imoveisVistoriados: "",
    imoveisInterditados: "",
    efetivoEmpregado: "",
    viaturasEmpregadas: "",
    compdecAcionada: "",
  };
}

/** Corpo de {acao: "registrar_acao"}. Contagem vazia não vai (o servidor grava null). */
export function montarCorpoAcao(alertaId: string, alteradoEm: string | null, f: FormularioAcaoRrd): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    acao: "registrar_acao",
    alertaId,
    tipoAcao: f.tipoAcao || undefined,
    resultado: f.resultado || undefined,
    acaoExecutada: f.acaoExecutada,
    dataAcao: deCampoBrasilia(f.dataAcao),
    ocorrenciaCad: textoOuNulo(f.ocorrenciaCad),
    localReferencia: textoOuNulo(f.localReferencia),
    compdecAcionada: f.compdecAcionada === "" ? null : f.compdecAcionada === "S",
  };
  if (alteradoEm) corpo.alteradoEm = alteradoEm;
  for (const [campo] of CONTAGENS_ACAO) {
    const v = lerNumero(f[campo]);
    if (v !== null) corpo[campo] = v;
  }
  return corpo;
}

/** Erros do registro de ação, pelo mesmo esquema do servidor (+ data no futuro e números da tela). */
export function validarAcao(corpo: Record<string, unknown>, f: FormularioAcaoRrd, agora: Date): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const [campo] of CONTAGENS_ACAO) {
    const v = lerNumero(f[campo]);
    if (v !== null && (Number.isNaN(v) || !Number.isInteger(v) || v < 0)) erros[campo] = "Número inteiro, zero ou mais.";
  }
  if (!f.dataAcao.trim() || !deCampoBrasilia(f.dataAcao)) erros.dataAcao = "Informe a data e a hora da ação.";
  else if (Date.parse(deCampoBrasilia(f.dataAcao) as string) > agora.getTime() + 5 * 60_000) {
    erros.dataAcao = "A ação não pode estar no futuro.";
  }
  const analise = esquemaPedido.safeParse(corpo);
  if (!analise.success) {
    for (const p of problemasDoZod(analise.error)) {
      const campo = p.campo.split(".")[0];
      erros[campo] ??= campo === "tipoAcao" ? "Escolha o tipo de ação." : campo === "resultado" ? "Escolha o resultado." : p.mensagem;
    }
  }
  return erros;
}

/** {acao: "ciencia"}: sem destinatário escolhido, o servidor usa a unidade da sessão. */
export function montarCorpoCiencia(
  alertaId: string,
  alteradoEm: string | null,
  destinatario: number | null,
  observacao: string,
): Record<string, unknown> {
  const corpo: Record<string, unknown> = { acao: "ciencia", alertaId };
  if (alteradoEm) corpo.alteradoEm = alteradoEm;
  if (destinatario !== null) corpo.destinatario = destinatario;
  const obs = textoOuNulo(observacao);
  if (obs) corpo.observacao = obs;
  return corpo;
}

/** Tamanho mínimo do motivo do cancelamento (o mesmo do servidor). */
export const MINIMO_MOTIVO_CANCELAMENTO = 5;

export function montarCorpoCancelar(alertaId: string, alteradoEm: string, motivo: string): Record<string, unknown> {
  return { acao: "cancelar", alertaId, alteradoEm, motivo: motivo.trim() };
}

export function montarCorpoSimples(acao: "encerrar" | "apagar" | "emitir", alertaId: string, alteradoEm: string): Record<string, unknown> {
  return { acao, alertaId, alteradoEm };
}

/** Problemas do zod de um corpo qualquer (para cancelar/ciência), um por campo. */
export function errosDoCorpo(corpo: Record<string, unknown>): Record<string, string> {
  const erros: Record<string, string> = {};
  const analise = esquemaPedido.safeParse(corpo);
  if (!analise.success) for (const p of problemasDoZod(analise.error)) erros[p.campo.split(".")[0]] ??= p.mensagem;
  return erros;
}

/** Rótulos das opções CAP (para os selects com ajuda). */
export const OPCOES_URGENCIA = CAP_URGENCIAS;
export const OPCOES_CERTEZA = CAP_CERTEZAS;
