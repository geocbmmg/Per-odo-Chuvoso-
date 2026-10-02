/**
 * Matrizes de risco da Sala de Situação (CBMMG): configuração única, tipada e pura.
 *
 * Fontes:
 *  - Chuva (tipo Meteorológico): "Matriz de Níveis de Alerta e Mobilização", imagem enviada pelo
 *    usuário em 02/10/2026.
 *  - Geológico: índice de risco do GeoRisk/CEMADEN, imagem enviada pelo usuário em 02/10/2026.
 *  - Hidrológico: níveis de inundação do SACE (Serviço Geológico do Brasil), imagem enviada pelo
 *    usuário em 02/10/2026.
 *  - Limiares numéricos conferidos com as restrições (`constraint`) do XLSForm "Emissão de Alertas"
 *    (campos `mmh`, `mmpor` e `indice`). As notas do formulário exibem figuras chamadas
 *    `matriz.jpg`, `inundacao.png` e `geologico.png`.
 *
 * OS VALORES SÃO REFERÊNCIA E PODEM MUDAR (a cada período chuvoso ou por decisão do CBMMG).
 * Por isso todo número, texto e cor das matrizes fica só aqui. Mudou a matriz? Altere este
 * arquivo e `docs/metricas-risco.md`. `tests/matrizes.test.ts` acusa lacuna ou sobreposição
 * entre faixas.
 *
 * Textos transcritos sem resumir, com a grafia original das imagens (inclusive "periodo crítico",
 * "UEOPs", "CBMMG.." e "relevantes.Fazer"). Corrija na fonte oficial, não aqui.
 *
 * INCONSISTÊNCIAS ENCONTRADAS (detalhes em docs/metricas-risco.md):
 *  1. Chuva, 24 h, Amarelo: a imagem diz só "60 mm em 24h", sem operador nem teto. Adotado o
 *     formulário: >= 60 e <= 90.
 *  2. Chuva, 24 h, Laranja e Vermelho: a imagem só dá o piso ("> 90", "> 120"). Adotado o teto do
 *     formulário: Laranja <= 120, Vermelho < 170. Roxo ">= 170" (imagem e formulário concordam).
 *  3. Chuva, Verde: a imagem só traz o critério por hora (<= 6 mm/h). Adotado < 60 mm em 24 h
 *     (complemento do Amarelo).
 *  4. Chuva, Amarelo/Laranja/Vermelho: "> 6 mm e <= 30 mm/h". O piso está escrito em "mm", mas é
 *     lido como mm/h (é assim no formulário).
 *  5. Chuva: a matriz usa "ou" entre mm/h e mm em 24 h (basta um critério). O formulário valida os
 *     DOIS campos contra a faixa do MESMO nível. Assim, 5 mm/h com 130 mm/24 h (Vermelho pelo
 *     acumulado) não passa em nenhum nível. Aqui vale a matriz: classificarChuva usa o critério
 *     MAIS GRAVE.
 *  6. Geológico: "Moderado (1,00 até 1,80)" e "Alto (1,60 até 2,6)" se sobrepõem entre 1,60 e 1,80.
 *     O formulário aceita Laranja_Alto a partir de 1,6. Adotado o formulário: Moderado vai até
 *     1,60 (exclusivo) e Alto começa em 1,60 (inclusivo).
 *  7. Geológico: os valores 0,70, 1,00 e 2,60 aparecem como limite de duas linhas ("até 0,70" e
 *     "0,70 até"). Adotada a classe MAIS GRAVE no valor de fronteira. É um critério de precaução e
 *     segue o formulário, que aceita 1,6 como Alto e 2,6 como Muito alto. Exceção: 3,40 fica em
 *     Muito alto, porque a imagem define Extremamente alto como "maior que 3,40" e o formulário
 *     exige > 3,4 para Roxo.
 *  8. A palavra "Alerta" muda de cor conforme a matriz: é AMARELO na chuva ("Amarelo (Alerta)") e
 *     LARANJA na hidrológica ("Laranja (Alerta)"). Nunca converta pelo nome do alerta sozinho.
 *  9. O formulário só tem códigos a partir do nível em que se emite alerta. Chuva: a partir do
 *     Amarelo. Hidrológico: Laranja e Vermelho (não há "Atenção"). Geológico: a partir do Laranja.
 * 10. Erros de grafia nos rótulos do formulário: "Vermelho (Perigo Servero)", "Hidrológico
 *     (Inuncação)" e o código "Metereologico". O código é o valor gravado na feição, então é
 *     mantido. As conversões aceitam também a grafia correta.
 * 11. A matriz geológica tem 6 linhas (7 classes) e um "amarelo claro". A hidrológica não tem roxo.
 *     Baixo e Moderado → amarelo (Baixo com tom próprio). A hidrológica vai até vermelho.
 */

// ---------------------------------------------------------------------------------------------
// Escala única de níveis
// ---------------------------------------------------------------------------------------------

/** Escala de gravidade comum às três matrizes, do menos ao mais grave. */
export const NIVEIS_RISCO = ["verde", "amarelo", "laranja", "vermelho", "roxo"] as const;
export type NivelRisco = (typeof NIVEIS_RISCO)[number];

export function ehNivelRisco(valor: unknown): valor is NivelRisco {
  return typeof valor === "string" && (NIVEIS_RISCO as readonly string[]).includes(valor);
}

/** Posição na escala: 0 = verde … 4 = roxo. */
export function gravidade(nivel: NivelRisco): number {
  return NIVEIS_RISCO.indexOf(nivel);
}

/** O nível mais grave entre os informados (ignora null/undefined); null se nenhum. */
export function maisGrave(...niveis: (NivelRisco | null | undefined)[]): NivelRisco | null {
  let pior: NivelRisco | null = null;
  for (const nivel of niveis) {
    if (nivel && (pior === null || gravidade(nivel) > gravidade(pior))) pior = nivel;
  }
  return pior;
}

// ---------------------------------------------------------------------------------------------
// Cores-dado
// ---------------------------------------------------------------------------------------------

export interface CorNivel {
  /** Nome da cor como aparece na matriz. */
  readonly nome: string;
  /** Preenchimento (hex). Igual nos dois temas: a cor identifica o dado. */
  readonly fundo: string;
  /** Tinta para texto sobre `fundo`, com contraste WCAG >= 4,5:1 (conferido nos testes). */
  readonly tinta: string;
}

/** Tinta escura das cores-dado: a mesma `--tinta-fixa` do padrão visual. */
const TINTA_ESCURA = "#0A0E14";

/**
 * Tons da coluna "Nível do Alerta" da matriz de chuva, amostrados da imagem. As imagens
 * geológica e hidrológica usam as cores puras de planilha (#93C47D, #FFFF00, #FF9900, #FF0000,
 * #9900FF). Aqui as três usam a mesma escala, para que "laranja" seja a mesma cor em todo o painel.
 * O contraste da tinta sobre o fundo está anotado ao lado de cada cor.
 */
export const CORES_NIVEL: Readonly<Record<NivelRisco, CorNivel>> = {
  verde: { nome: "Verde", fundo: "#88C485", tinta: TINTA_ESCURA }, // 9,47:1
  amarelo: { nome: "Amarelo", fundo: "#EFE921", tinta: TINTA_ESCURA }, // 15,06:1
  laranja: { nome: "Laranja", fundo: "#F8982B", tinta: TINTA_ESCURA }, // 8,77:1
  // Branco sobre este vermelho dá só 4,11:1: a tinta é escura, como na própria matriz.
  vermelho: { nome: "Vermelho", fundo: "#EE312D", tinta: TINTA_ESCURA }, // 4,71:1
  roxo: { nome: "Roxo", fundo: "#5F4D9F", tinta: "#FFFFFF" }, // 6,89:1
};

/** "Baixo (amarelo claro)" da matriz geológica: tom próprio, mas nível amarelo. */
export const COR_AMARELO_CLARO: CorNivel = {
  nome: "Amarelo claro",
  fundo: "#FFF2CC",
  tinta: TINTA_ESCURA, // 17,34:1
};

// ---------------------------------------------------------------------------------------------
// Faixas numéricas
// ---------------------------------------------------------------------------------------------

/** Intervalo numérico com limites explícitos. `null` = sem limite daquele lado. */
export interface Faixa {
  readonly min: number | null;
  readonly minInclusivo: boolean;
  readonly max: number | null;
  readonly maxInclusivo: boolean;
}

export function dentroDaFaixa(valor: number, faixa: Faixa): boolean {
  if (faixa.min !== null && (faixa.minInclusivo ? valor < faixa.min : valor <= faixa.min)) {
    return false;
  }
  if (faixa.max !== null && (faixa.maxInclusivo ? valor > faixa.max : valor >= faixa.max)) {
    return false;
  }
  return true;
}

const FORMATO_NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/**
 * Texto da faixa para legendas: "> 6 e ≤ 30 mm/h", "≤ 6 mm/h", "≥ 170 mm".
 * O piso 0 inclusivo é o começo da escala e não é escrito.
 */
export function descreverFaixa(faixa: Faixa, unidade?: string): string {
  const partes: string[] = [];
  if (faixa.min !== null && !(faixa.min === 0 && faixa.minInclusivo)) {
    partes.push(`${faixa.minInclusivo ? "≥" : ">"} ${FORMATO_NUMERO.format(faixa.min)}`);
  }
  if (faixa.max !== null) {
    partes.push(`${faixa.maxInclusivo ? "≤" : "<"} ${FORMATO_NUMERO.format(faixa.max)}`);
  }
  const texto = partes.length > 0 ? partes.join(" e ") : "qualquer valor";
  return unidade ? `${texto} ${unidade}` : texto;
}

/** Número utilizável numa classificação: finito e não negativo. Fora disso = sem dado. */
function valorValido(valor: number | null | undefined): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

// ---------------------------------------------------------------------------------------------
// Matriz de chuva (tipo Meteorológico)
// ---------------------------------------------------------------------------------------------

export interface AcoesGerenciamentoRisco {
  readonly salaSituacao: string;
  readonly ueop: string;
  readonly cobCeb: string;
  readonly mobilizacaoTropa: string;
}

export interface NivelMatrizChuva {
  readonly nivel: NivelRisco;
  readonly cor: CorNivel;
  /** Nome do alerta: "Normalidade", "Alerta", "Perigo", "Perigo severo", "Desastre". */
  readonly alerta: string;
  /** Critério de classificação de risco: "Sem risco", "Baixo", "Moderado", "Elevado", "Crítico". */
  readonly classificacao: string;
  /** Intensidade da chuva no critério: "Chuva fraca", "Chuvas fortes"… */
  readonly chuva: string;
  /** Critério como escrito na matriz, para exibição. */
  readonly criterioTexto: string;
  /** Faixa de chuva máxima em mm/h. */
  readonly mmHora: Faixa;
  /** Faixa de acumulado em 24 h (mm). */
  readonly mm24h: Faixa;
  readonly cenario: string;
  readonly acoes: AcoesGerenciamentoRisco;
}

export const MATRIZ_CHUVA: Readonly<Record<NivelRisco, NivelMatrizChuva>> = {
  verde: {
    nivel: "verde",
    cor: CORES_NIVEL.verde,
    alerta: "Normalidade",
    classificacao: "Sem risco",
    chuva: "Chuva fraca",
    criterioTexto: "Previsão de chuvas fracas. Chuva fraca: ≤ 6 mm/h",
    mmHora: { min: 0, minInclusivo: true, max: 6, maxInclusivo: true },
    // Imagem não traz critério de 24 h para o verde: complemento do Amarelo (inconsistência 3).
    mm24h: { min: 0, minInclusivo: true, max: 60, maxInclusivo: false },
    cenario:
      "Condições meteorológicas, hidrológicas e geológicas dentro da normalidade, com demanda compatível com a capacidade operacional ordinária do CBMMG.",
    acoes: {
      salaSituacao: "Monitoramento de rotina; Emissão preventiva de avisos quando necessário.",
      ueop: "Acompanhamento de rotina; Execução de ações de GRD anteriores ao periodo crítico.",
      cobCeb: "Acompanhamento das ações das UEOp.",
      mobilizacaoTropa: "Serviço ordinário (1º esforço).",
    },
  },
  amarelo: {
    nivel: "amarelo",
    cor: CORES_NIVEL.amarelo,
    alerta: "Alerta",
    classificacao: "Baixo",
    chuva: "Chuvas fracas e moderadas",
    criterioTexto: "Chuvas fracas e moderadas: > 6 mm e ≤ 30 mm/h ou 60 mm em 24h",
    mmHora: { min: 6, minInclusivo: false, max: 30, maxInclusivo: true },
    mm24h: { min: 60, minInclusivo: true, max: 90, maxInclusivo: true },
    cenario:
      "Indícios de risco em formação: chuvas moderadas ou acumulados relevantes em 24h; ocorrência que acarretem desequilíbrio localizados.",
    acoes: {
      salaSituacao:
        "Intensificação do monitoramento através dos órgãos oficiais CEMADEN, INMET, CPTEC; Comunicação de assistência junto às UEOPs; Avisos preventivos ao menos 1 vez ao dia.",
      ueop: "Intensificar vistorias em locais vulneráveis. Avaliação para instalação de ponto base em locais prioritários de maior vulnerabilidade; Preparação de equipes para pronto atendimento a ocorrência típicas do período; Interlocução com COMPDECs.",
      cobCeb:
        "Acompanhamento e supervisão da execução do planejamento das UEOp. Ativar planos regionais",
      mobilizacaoTropa: "Serviço ordinário (1º esforço).",
    },
  },
  laranja: {
    nivel: "laranja",
    cor: CORES_NIVEL.laranja,
    alerta: "Perigo",
    classificacao: "Moderado",
    chuva: "Chuvas fortes",
    criterioTexto: "Chuvas fortes: > 30 mm e ≤ 70 mm/h ou > 90 mm em 24h",
    mmHora: { min: 30, minInclusivo: false, max: 70, maxInclusivo: true },
    mm24h: { min: 90, minInclusivo: false, max: 120, maxInclusivo: true },
    cenario:
      "Ocorrências significativas em andamento relacionadas aos critérios meteorológicos; Aumento da demanda dos serviços de bombeiros, que exigem esforços superiores à capacidade normal de resposta.",
    acoes: {
      salaSituacao:
        "Intensificação do monitoramento, ampliando a interlocução com CINDEC, com foco nos municípios com histórico de eventos hidrológicos e geológicos; Boletim diário com o panorama de risco para o Estado; Emissão de alertas específicos às UEOp.",
      ueop: "Ativação e acionamento da equipe do NAC; Disponibilização do efetivo administrativo para emprego operacional; Vigilância (ponto-base) em áreas de maior vulnerabilidade. Suporte aos municípios em situação de emergência.",
      cobCeb:
        "Monitoramento da situação na região e de possível acionamento das GU de referência com integrantes do NAC para apoio entre UEOp. Articulação e interlocução com as REDECs para monitoramento dos impactos na região. Avaliação quanto a necessidade de instalação de sala de situação regional",
      mobilizacaoTropa:
        "Serviço ordinário (1º esforço); NAC; Efetivo Administrativo (2º esforço). Possibilidade de empenho do 3º Esforço (COB e UEOp distintas)",
    },
  },
  vermelho: {
    nivel: "vermelho",
    cor: CORES_NIVEL.vermelho,
    alerta: "Perigo severo",
    classificacao: "Elevado",
    chuva: "Chuvas muito fortes",
    criterioTexto: "Chuvas muito fortes: > 70 mm e ≤ 90 mm/h ou > 120 mm em 24h",
    mmHora: { min: 70, minInclusivo: false, max: 90, maxInclusivo: true },
    mm24h: { min: 120, minInclusivo: false, max: 170, maxInclusivo: false },
    cenario:
      "Eventos de maior severidade, com desastres de impacto e necessidade de resposta ampliada simultânea; Aumento excessivo da demanda dos serviços de bombeiros, necessitando de apoio externo.",
    acoes: {
      salaSituacao:
        "Acompanhamento da situação nas UEOp com as salas de situação regionais instaladas; Intensificação da interlocução e integração com CINDEC. Emissão de avisos periódicos (3x ao dia)",
      ueop: "Ativação e acionamento da equipe do NAC; Redução significativa de atividades meio não essenciais. Ativação de Posto de Comando para gerenciamento das ocorrências. Possibilidade de adotar jornada extraordinária do serviço operacional (3x3 ou 5x5).",
      cobCeb:
        "Remanejamento dos NAC para atendimento em UEOp prioritárias. Instalação de Sala de Situação Regional no COB; Diretrizes para a redução das atividades meio não essenciais e jornada extraordinária do serviço operacional; Avaliar necessidade do apoio do serviço especializado.",
      mobilizacaoTropa:
        "Serviço ordinário (1º esforço); NAC; Reforço operacional (2º, 3º e 4º esforço); Possibilidade de recobrimento pelo BEMAD",
    },
  },
  roxo: {
    nivel: "roxo",
    cor: CORES_NIVEL.roxo,
    alerta: "Desastre",
    classificacao: "Crítico",
    chuva: "Chuvas extremas",
    criterioTexto: "Chuvas extremas: > 90 mm/h ou ≥ 170 mm em 24h",
    mmHora: { min: 90, minInclusivo: false, max: null, maxInclusivo: false },
    mm24h: { min: 170, minInclusivo: true, max: null, maxInclusivo: false },
    cenario:
      "Desastres de grande complexidade; Todos os esforços e apoios externos disponíveis são necessários para dar a resposta adequada à população.",
    acoes: {
      salaSituacao:
        "Trabalho integrado ao Gabinete de Crise Estadual; Articulação com as salas de situação regionais e centros operativos de outras forças e órgãos.",
      ueop: "Instalação/Integração ao Gabinete de Crise local com demais órgãos. Interrupção de atividades meio não essenciais.",
      cobCeb:
        "Solicitação do emprego do serviço especializado; Integração ao Gabinete de Crise local e regional",
      mobilizacaoTropa:
        "Emprego de serviço especializado interno e externo (BEMAD, LIGABOM); Suporte das FFAA; Acionamento de ajuda humanitária; Organização de serviços voluntários.",
    },
  },
};

export interface LeituraChuva {
  /** Maior intensidade horária observada ou prevista (mm/h). */
  mmHoraMax?: number | null;
  /** Acumulado em 24 h (mm). */
  mm24h?: number | null;
}

export interface ClassificacaoChuva {
  /** O mais grave entre os dois critérios; null quando não há dado válido. */
  nivel: NivelRisco | null;
  porHora: NivelRisco | null;
  por24h: NivelRisco | null;
}

function nivelDaChuvaPor(criterio: "mmHora" | "mm24h", valor: number | null | undefined) {
  if (!valorValido(valor)) return null;
  return NIVEIS_RISCO.find((nivel) => dentroDaFaixa(valor, MATRIZ_CHUVA[nivel][criterio])) ?? null;
}

/**
 * Nível de cada critério e o resultado (o mais grave).
 * Valor negativo, NaN ou infinito conta como sem dado.
 */
export function classificarChuvaDetalhada(leitura: LeituraChuva): ClassificacaoChuva {
  const porHora = nivelDaChuvaPor("mmHora", leitura.mmHoraMax);
  const por24h = nivelDaChuvaPor("mm24h", leitura.mm24h);
  return { nivel: maisGrave(porHora, por24h), porHora, por24h };
}

/**
 * Nível da matriz de chuva: o MAIS GRAVE entre mm/h e mm em 24 h (a matriz usa "ou").
 * null quando nenhum dos dois tem dado válido.
 */
export function classificarChuva(leitura: LeituraChuva): NivelRisco | null {
  return classificarChuvaDetalhada(leitura).nivel;
}

// ---------------------------------------------------------------------------------------------
// Matriz geológica (GeoRisk/CEMADEN)
// ---------------------------------------------------------------------------------------------

export const CLASSES_GEOLOGICAS = [
  "extremamente_baixo",
  "muito_baixo",
  "baixo",
  "moderado",
  "alto",
  "muito_alto",
  "extremamente_alto",
] as const;
export type ClasseGeologica = (typeof CLASSES_GEOLOGICAS)[number];

export interface ClasseMatrizGeologica {
  readonly classe: ClasseGeologica;
  /** Nome da classe: "Muito alto". */
  readonly rotulo: string;
  /** Célula "Nível do Alerta" da imagem (as duas primeiras classes dividem a mesma linha). */
  readonly nivelAlertaTexto: string;
  /** Faixa do índice como escrita na imagem. */
  readonly indiceTexto: string;
  /** Faixa adotada no código (ver inconsistências 6 e 7). */
  readonly indice: Faixa;
  readonly nivel: NivelRisco;
  readonly cor: CorNivel;
  /** Coluna "Atuação da sala de situação". */
  readonly atuacao: string;
}

const LINHA_VERDE_GEOLOGICA = "Extremamente baixo e muito baixo (verde)";
const ATUACAO_VERDE_GEOLOGICA =
  "Não há evidências suficientes para alegar que há possibilidade de deslizamentos de terra, sendo improvável que ocorram.";

export const MATRIZ_GEOLOGICA: Readonly<Record<ClasseGeologica, ClasseMatrizGeologica>> = {
  extremamente_baixo: {
    classe: "extremamente_baixo",
    rotulo: "Extremamente baixo",
    nivelAlertaTexto: LINHA_VERDE_GEOLOGICA,
    indiceTexto: "extremamente baixo (menor que 0,40)",
    indice: { min: 0, minInclusivo: true, max: 0.4, maxInclusivo: false },
    nivel: "verde",
    cor: CORES_NIVEL.verde,
    atuacao: ATUACAO_VERDE_GEOLOGICA,
  },
  muito_baixo: {
    classe: "muito_baixo",
    rotulo: "Muito baixo",
    nivelAlertaTexto: LINHA_VERDE_GEOLOGICA,
    indiceTexto: "muito baixo (0,40 até 0,70)",
    indice: { min: 0.4, minInclusivo: true, max: 0.7, maxInclusivo: false },
    nivel: "verde",
    cor: CORES_NIVEL.verde,
    atuacao: ATUACAO_VERDE_GEOLOGICA,
  },
  baixo: {
    classe: "baixo",
    rotulo: "Baixo",
    nivelAlertaTexto: "Baixo (amarelo claro)",
    indiceTexto: "(0,70 até 1,00)",
    indice: { min: 0.7, minInclusivo: true, max: 1, maxInclusivo: false },
    nivel: "amarelo",
    cor: COR_AMARELO_CLARO,
    atuacao:
      "Há pouca evidência sobre a possibilidade dos limiares serem alcançados, sendo pouco provável que ocorram deslizamentos de terra. Caso ocorram, devem ser pontuais, em áreas urbanas ou à margem de rodovias.",
  },
  moderado: {
    classe: "moderado",
    rotulo: "Moderado",
    nivelAlertaTexto: "Moderado (amarelo)",
    indiceTexto: "(1,00 até 1,80)",
    // Imagem diz até 1,80, mas o formulário já aceita Alto em 1,6 (inconsistência 6).
    indice: { min: 1, minInclusivo: true, max: 1.6, maxInclusivo: false },
    nivel: "amarelo",
    cor: CORES_NIVEL.amarelo,
    atuacao:
      "Há evidências suficientes para alegar a possibilidade de ocorrência de deslizamentos. É provável que ocorram de forma pontual dentro da região que apresenta este nível de risco, normalmente em áreas urbanas ou à margem de rodovias. Além disso, é pouco provável que ocorram eventos esparsos ou em encostas naturais.",
  },
  alto: {
    classe: "alto",
    rotulo: "Alto",
    nivelAlertaTexto: "Alto (laranja)",
    indiceTexto: "(1,60 até 2,6)",
    indice: { min: 1.6, minInclusivo: true, max: 2.6, maxInclusivo: false },
    nivel: "laranja",
    cor: CORES_NIVEL.laranja,
    atuacao:
      "Há muitas evidências sobre a possibilidade de ocorrência de deslizamentos de terra. São esperados deslizamentos em algumas localidades dentro da região que apresenta este nível de risco. Não se descarta a possibilidade de eventos esparsos ou em encostas naturais.",
  },
  muito_alto: {
    classe: "muito_alto",
    rotulo: "Muito alto",
    nivelAlertaTexto: "Muito alto (vermelho)",
    indiceTexto: "(de 2,60 até 3,40)",
    indice: { min: 2.6, minInclusivo: true, max: 3.4, maxInclusivo: true },
    nivel: "vermelho",
    cor: CORES_NIVEL.vermelho,
    atuacao:
      "É muito provável que ocorram deslizamentos de terra em várias localidades dentro da região que apresenta este nível de risco, com possibilidade de eventos generalizados e com alto potencial de impacto. Não se descarta a possibilidade de corridas de lama ou fluxo de detritos.",
  },
  extremamente_alto: {
    classe: "extremamente_alto",
    rotulo: "Extremamente alto",
    nivelAlertaTexto: "Extremamente alto (roxo)",
    indiceTexto: "(maior que 3,40)",
    indice: { min: 3.4, minInclusivo: false, max: null, maxInclusivo: false },
    nivel: "roxo",
    cor: CORES_NIVEL.roxo,
    atuacao:
      "Situação crítica, onde é quase certo que ocorram deslizamentos de terra em muitas localidades dentro da região que apresenta este nível de risco, com potencial de impacto muito alto associado. É provável que ocorram corridas de massa ou fluxo de detritos.",
  },
};

/** Classe do índice GeoRisk; null para índice ausente, negativo, NaN ou infinito. */
export function classificarIndiceGeologico(
  indice: number | null | undefined,
): ClasseGeologica | null {
  if (!valorValido(indice)) return null;
  return (
    CLASSES_GEOLOGICAS.find((classe) => dentroDaFaixa(indice, MATRIZ_GEOLOGICA[classe].indice)) ??
    null
  );
}

/** Nível da escala única para o índice GeoRisk. */
export function nivelDoIndiceGeologico(indice: number | null | undefined): NivelRisco | null {
  const classe = classificarIndiceGeologico(indice);
  return classe ? MATRIZ_GEOLOGICA[classe].nivel : null;
}

// ---------------------------------------------------------------------------------------------
// Matriz hidrológica (SACE/SGB)
// ---------------------------------------------------------------------------------------------

/**
 * Níveis de inundação. Não há limiar numérico global: cada estação do SACE tem as próprias cotas
 * (o formulário registra a cota em cm). "Inundação" é a cota em que o primeiro dano é observado.
 */
export const NIVEIS_HIDROLOGICOS = ["normal", "atencao", "alerta", "inundacao"] as const;
export type NivelHidrologico = (typeof NIVEIS_HIDROLOGICOS)[number];

export interface NivelMatrizHidrologica {
  readonly nivelHidrologico: NivelHidrologico;
  /** Coluna "Nível do Alerta": "Atenção". */
  readonly rotulo: string;
  readonly nivel: NivelRisco;
  readonly cor: CorNivel;
  readonly detalhamento: string;
  /** Coluna "Atuação da sala de situação". */
  readonly atuacao: string;
}

export const MATRIZ_HIDROLOGICA: Readonly<Record<NivelHidrologico, NivelMatrizHidrologica>> = {
  normal: {
    nivelHidrologico: "normal",
    rotulo: "Normal",
    nivel: "verde",
    cor: CORES_NIVEL.verde,
    detalhamento: "Condição de normalidade.",
    atuacao:
      "Condições meteorológicas, hidrológicas e geológicas dentro da normalidade, com demanda compatível com a capacidade operacional ordinária do CBMMG..",
  },
  atencao: {
    nivelHidrologico: "atencao",
    rotulo: "Atenção",
    nivel: "amarelo",
    cor: CORES_NIVEL.amarelo,
    detalhamento: "Possibilidade moderada de ocorrência de inundação.",
    atuacao:
      "Monitoramento/Emissão de alertas, se todos os demais radares de previsão metereológica convergirem para a mesma informação.",
  },
  alerta: {
    nivelHidrologico: "alerta",
    rotulo: "Alerta",
    nivel: "laranja",
    cor: CORES_NIVEL.laranja,
    detalhamento: "Possibilidade elevada de ocorrência de inundação.",
    atuacao:
      "Alerta com acompanhamento das ações locais. Consultar os relatórios e os mapas de inundação para assessorar as Unidades/frações com informações relevantes.Fazer contato telefônico com a Unidade/fração.",
  },
  inundacao: {
    nivelHidrologico: "inundacao",
    rotulo: "Inundação",
    nivel: "vermelho",
    cor: CORES_NIVEL.vermelho,
    detalhamento: "Cota em que o primeiro dano é observado no município",
    atuacao:
      "Alerta com acompanhamento das ações locais. Consultar os relatórios e os mapas de inundação para assessorar as Unidades/frações com informações relevantes. Fazer contato telefônico com a Unidade/fração",
  },
};

// ---------------------------------------------------------------------------------------------
// Códigos do Survey123 ("Emissão de Alertas")
// ---------------------------------------------------------------------------------------------

export const TIPOS_RISCO = ["meteorologico", "hidrologico", "geologico"] as const;
export type TipoRisco = (typeof TIPOS_RISCO)[number];

export interface OpcaoSurvey<T extends string> {
  /** Coluna `name` da lista no XLSForm: o valor gravado na feição. */
  readonly codigo: string;
  /** Coluna `label`, com a grafia original do formulário. */
  readonly rotulo: string;
  readonly valor: T;
}

/** Listas `tipo`, `nivel`, `inundacao` e `deslizamento` do XLSForm, como estão no formulário. */
export const OPCOES_SURVEY: {
  readonly tipo: readonly OpcaoSurvey<TipoRisco>[];
  readonly nivel: readonly OpcaoSurvey<NivelRisco>[];
  readonly inundacao: readonly OpcaoSurvey<NivelHidrologico>[];
  readonly deslizamento: readonly OpcaoSurvey<ClasseGeologica>[];
} = {
  tipo: [
    { codigo: "Metereologico", rotulo: "Metereológico (Chuva)", valor: "meteorologico" },
    { codigo: "Hidrologico", rotulo: "Hidrológico (Inuncação)", valor: "hidrologico" },
    { codigo: "Geologico", rotulo: "Geológico", valor: "geologico" },
  ],
  nivel: [
    { codigo: "Amarelo_Alerta", rotulo: "Amarelo (Alerta)", valor: "amarelo" },
    { codigo: "Laranja_Perigo", rotulo: "Laranja (Perigo)", valor: "laranja" },
    { codigo: "Vermelho_Perigo_Severo", rotulo: "Vermelho (Perigo Servero)", valor: "vermelho" },
    { codigo: "Roxo_Desastre", rotulo: "Roxo (Desastre)", valor: "roxo" },
  ],
  inundacao: [
    { codigo: "Laranja_Alerta", rotulo: "Laranja (Alerta)", valor: "alerta" },
    { codigo: "Vermelho_Inundacao", rotulo: "Vermelho (Inundação)", valor: "inundacao" },
  ],
  deslizamento: [
    { codigo: "Laranja_Alto", rotulo: "Laranja (Alto)", valor: "alto" },
    { codigo: "Vermelho_Muito_Alto", rotulo: "Vermelho (Muito Alto)", valor: "muito_alto" },
    {
      codigo: "Roxo_Extremamente_Alto",
      rotulo: "Roxo (Extremamente Alto)",
      valor: "extremamente_alto",
    },
  ],
};

/** Chave tolerante: sem acento, minúscula, tudo que não é letra/dígito vira "_". */
function chave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function indexar<T extends string>(pares: Iterable<readonly [string, T]>): ReadonlyMap<string, T> {
  const mapa = new Map<string, T>();
  for (const [texto, valor] of pares) mapa.set(chave(texto), valor);
  return mapa;
}

function paresDasOpcoes<T extends string, R extends string>(
  opcoes: readonly OpcaoSurvey<T>[],
  converter: (valor: T) => R,
): [string, R][] {
  return opcoes.flatMap((o): [string, R][] => [
    [o.codigo, converter(o.valor)],
    [o.rotulo, converter(o.valor)],
  ]);
}

const identidade = <T>(valor: T): T => valor;

const POR_TIPO = indexar<TipoRisco>([
  ...paresDasOpcoes(OPCOES_SURVEY.tipo, identidade),
  ["Meteorologico", "meteorologico"],
  ["Meteorológico (Chuva)", "meteorologico"],
  ["Hidrológico (Inundação)", "hidrologico"],
]);

const POR_NIVEL_HIDROLOGICO = indexar<NivelHidrologico>([
  ...paresDasOpcoes(OPCOES_SURVEY.inundacao, identidade),
  ...NIVEIS_HIDROLOGICOS.map((n) => [MATRIZ_HIDROLOGICA[n].rotulo, n] as const),
]);

const POR_CLASSE_GEOLOGICA = indexar<ClasseGeologica>([
  ...paresDasOpcoes(OPCOES_SURVEY.deslizamento, identidade),
  ...CLASSES_GEOLOGICAS.map((c) => [MATRIZ_GEOLOGICA[c].rotulo, c] as const),
]);

/**
 * Qualquer código ou rótulo das listas `nivel`, `inundacao` e `deslizamento`, o nome da cor sozinho
 * ("Laranja") e os nomes da matriz de chuva ("Verde (Normalidade)", "Vermelho (Perigo Severo)").
 * Nomes de alerta sem cor ("Alerta", "Perigo") ficam de fora: são ambíguos (inconsistência 8).
 */
const POR_NIVEL = indexar<NivelRisco>([
  ...paresDasOpcoes(OPCOES_SURVEY.nivel, identidade),
  ...paresDasOpcoes(OPCOES_SURVEY.inundacao, (n) => MATRIZ_HIDROLOGICA[n].nivel),
  ...paresDasOpcoes(OPCOES_SURVEY.deslizamento, (c) => MATRIZ_GEOLOGICA[c].nivel),
  ...NIVEIS_RISCO.map((n) => [CORES_NIVEL[n].nome, n] as const),
  ...NIVEIS_RISCO.map((n) => [`${CORES_NIVEL[n].nome} (${MATRIZ_CHUVA[n].alerta})`, n] as const),
]);

function buscar<T>(mapa: ReadonlyMap<string, T>, valor: unknown): T | null {
  if (typeof valor !== "string") return null;
  return mapa.get(chave(valor)) ?? null;
}

/**
 * Nível da escala única a partir do código ("Laranja_Perigo") ou do rótulo ("Laranja (Perigo)")
 * das listas `nivel`, `inundacao` e `deslizamento`. Ignora caixa, acento e pontuação.
 * Valor desconhecido → null.
 */
export function nivelDoCodigoSurvey(valor: unknown): NivelRisco | null {
  return buscar(POR_NIVEL, valor);
}

/** Tipo de risco ("Metereologico" → "meteorologico"); aceita o rótulo e a grafia correta. */
export function tipoRiscoDoCodigoSurvey(valor: unknown): TipoRisco | null {
  return buscar(POR_TIPO, valor);
}

/** Lista `inundacao` ("Laranja_Alerta" → "alerta") ou o nome do nível ("Atenção"). */
export function nivelHidrologicoDoCodigoSurvey(valor: unknown): NivelHidrologico | null {
  return buscar(POR_NIVEL_HIDROLOGICO, valor);
}

/** Lista `deslizamento` ("Vermelho_Muito_Alto" → "muito_alto") ou o nome da classe. */
export function classeGeologicaDoCodigoSurvey(valor: unknown): ClasseGeologica | null {
  return buscar(POR_CLASSE_GEOLOGICA, valor);
}
