import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLASSES_GEOLOGICAS,
  CORES_NIVEL,
  MATRIZ_CHUVA,
  MATRIZ_GEOLOGICA,
  MATRIZ_HIDROLOGICA,
  NIVEIS_HIDROLOGICOS,
  NIVEIS_RISCO,
  OPCOES_SURVEY,
  classeGeologicaDoCodigoSurvey,
  classificarChuva,
  classificarChuvaDetalhada,
  classificarIndiceGeologico,
  dentroDaFaixa,
  descreverFaixa,
  ehNivelRisco,
  gravidade,
  maisGrave,
  nivelDoCodigoSurvey,
  nivelDoIndiceGeologico,
  nivelHidrologicoDoCodigoSurvey,
  tipoRiscoDoCodigoSurvey,
  type CorNivel,
  type Faixa,
  type NivelRisco,
} from "@/lib/dominio/matrizes";

/** Contraste WCAG 2.x entre duas cores hex (#RRGGBB). */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const canal = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  };
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Faixas em ordem devem se encostar sem lacuna nem sobreposição, do 0 ao infinito. */
function esperarContiguas(faixas: Faixa[]) {
  expect(faixas[0]).toMatchObject({ min: 0, minInclusivo: true });
  expect(faixas.at(-1)?.max).toBeNull();
  for (let i = 1; i < faixas.length; i++) {
    const anterior = faixas[i - 1];
    const atual = faixas[i];
    expect(atual.min).toBe(anterior.max);
    // Exatamente um dos lados fica com o valor de fronteira.
    expect(anterior.maxInclusivo).not.toBe(atual.minInclusivo);
  }
}

describe("escala de níveis", () => {
  it("ordena do verde ao roxo", () => {
    expect(NIVEIS_RISCO.map(gravidade)).toEqual([0, 1, 2, 3, 4]);
  });

  it("maisGrave ignora ausentes e devolve null sem nível", () => {
    expect(maisGrave("amarelo", null, "vermelho", undefined, "laranja")).toBe("vermelho");
    expect(maisGrave(null, undefined)).toBeNull();
    expect(maisGrave()).toBeNull();
  });

  it("ehNivelRisco", () => {
    expect(ehNivelRisco("roxo")).toBe(true);
    expect(ehNivelRisco("Roxo")).toBe(false);
    expect(ehNivelRisco(3)).toBe(false);
  });
});

describe("cores-dado", () => {
  type Caso = [string, CorNivel];
  const todas: Caso[] = [
    ...NIVEIS_RISCO.map((n): Caso => [`nível ${n}`, CORES_NIVEL[n]]),
    ...CLASSES_GEOLOGICAS.map((c): Caso => [`geológico ${c}`, MATRIZ_GEOLOGICA[c].cor]),
    ...NIVEIS_HIDROLOGICOS.map((n): Caso => [`hidrológico ${n}`, MATRIZ_HIDROLOGICA[n].cor]),
  ];

  it.each(todas)("%s: tinta com contraste >= 4,5:1", (_, cor) => {
    expect(cor.fundo).toMatch(/^#[0-9A-F]{6}$/);
    expect(contraste(cor.fundo, cor.tinta)).toBeGreaterThanOrEqual(4.5);
  });

  it("matrizes geológica e hidrológica usam a escala única (exceto o amarelo claro)", () => {
    for (const c of CLASSES_GEOLOGICAS) {
      if (c === "baixo") continue;
      expect(MATRIZ_GEOLOGICA[c].cor).toBe(CORES_NIVEL[MATRIZ_GEOLOGICA[c].nivel]);
    }
    expect(MATRIZ_GEOLOGICA.baixo.cor.nome).toBe("Amarelo claro");
    for (const n of NIVEIS_HIDROLOGICOS) {
      expect(MATRIZ_HIDROLOGICA[n].cor).toBe(CORES_NIVEL[MATRIZ_HIDROLOGICA[n].nivel]);
    }
  });
});

describe("faixas", () => {
  it("dentroDaFaixa respeita inclusivo/exclusivo", () => {
    const f: Faixa = { min: 6, minInclusivo: false, max: 30, maxInclusivo: true };
    expect(dentroDaFaixa(6, f)).toBe(false);
    expect(dentroDaFaixa(6.01, f)).toBe(true);
    expect(dentroDaFaixa(30, f)).toBe(true);
    expect(dentroDaFaixa(30.01, f)).toBe(false);
  });

  it("chuva por hora, chuva em 24 h e índice geológico não têm lacuna nem sobreposição", () => {
    esperarContiguas(NIVEIS_RISCO.map((n) => MATRIZ_CHUVA[n].mmHora));
    esperarContiguas(NIVEIS_RISCO.map((n) => MATRIZ_CHUVA[n].mm24h));
    esperarContiguas(CLASSES_GEOLOGICAS.map((c) => MATRIZ_GEOLOGICA[c].indice));
  });

  it("descreverFaixa usa os símbolos da matriz e vírgula decimal", () => {
    expect(descreverFaixa(MATRIZ_CHUVA.verde.mmHora, "mm/h")).toBe("≤ 6 mm/h");
    expect(descreverFaixa(MATRIZ_CHUVA.amarelo.mmHora, "mm/h")).toBe("> 6 e ≤ 30 mm/h");
    expect(descreverFaixa(MATRIZ_CHUVA.vermelho.mm24h, "mm")).toBe("> 120 e < 170 mm");
    expect(descreverFaixa(MATRIZ_CHUVA.roxo.mm24h, "mm")).toBe("≥ 170 mm");
    expect(descreverFaixa(MATRIZ_GEOLOGICA.muito_alto.indice)).toBe("≥ 2,6 e ≤ 3,4");
    expect(descreverFaixa(MATRIZ_GEOLOGICA.extremamente_baixo.indice)).toBe("< 0,4");
  });
});

describe("classificarChuva — bordas mm/h", () => {
  it.each<[number, NivelRisco]>([
    [0, "verde"],
    [6, "verde"],
    [6.01, "amarelo"],
    [30, "amarelo"],
    [30.01, "laranja"],
    [70, "laranja"],
    [70.01, "vermelho"],
    [90, "vermelho"],
    [90.01, "roxo"],
    [250, "roxo"],
  ])("%s mm/h → %s", (mmHoraMax, nivel) => {
    expect(classificarChuva({ mmHoraMax })).toBe(nivel);
  });
});

describe("classificarChuva — bordas mm em 24 h", () => {
  it.each<[number, NivelRisco]>([
    [0, "verde"],
    [59.99, "verde"],
    [60, "amarelo"],
    [90, "amarelo"],
    [90.01, "laranja"],
    [120, "laranja"],
    [120.01, "vermelho"],
    [169.9, "vermelho"],
    [170, "roxo"],
    [400, "roxo"],
  ])("%s mm/24 h → %s", (mm24h, nivel) => {
    expect(classificarChuva({ mm24h })).toBe(nivel);
  });
});

describe("classificarChuva — os dois critérios", () => {
  it("vale o mais grave entre mm/h e mm em 24 h", () => {
    expect(classificarChuva({ mmHoraMax: 5, mm24h: 130 })).toBe("vermelho");
    expect(classificarChuva({ mmHoraMax: 95, mm24h: 10 })).toBe("roxo");
    expect(classificarChuva({ mmHoraMax: 31, mm24h: 61 })).toBe("laranja");
    expect(classificarChuva({ mmHoraMax: 6, mm24h: 59 })).toBe("verde");
  });

  it("detalha o nível de cada critério", () => {
    expect(classificarChuvaDetalhada({ mmHoraMax: 5, mm24h: 130 })).toEqual({
      nivel: "vermelho",
      porHora: "verde",
      por24h: "vermelho",
    });
  });

  it("null quando não há dado; um critério sozinho basta", () => {
    expect(classificarChuva({})).toBeNull();
    expect(classificarChuva({ mmHoraMax: null, mm24h: null })).toBeNull();
    expect(classificarChuva({ mmHoraMax: null, mm24h: 100 })).toBe("laranja");
    expect(classificarChuva({ mmHoraMax: 40, mm24h: undefined })).toBe("laranja");
  });

  it("NaN, infinito e negativo contam como sem dado", () => {
    expect(classificarChuva({ mmHoraMax: Number.NaN })).toBeNull();
    expect(classificarChuva({ mm24h: Number.POSITIVE_INFINITY })).toBeNull();
    expect(classificarChuva({ mmHoraMax: -1 })).toBeNull();
    expect(classificarChuva({ mmHoraMax: -1, mm24h: 75 })).toBe("amarelo");
  });

  it("os limiares batem com as restrições do XLSForm (campos mmh e mmpor)", () => {
    // Copiadas do constraint do formulário "Emissão de Alertas".
    const formulario: Record<Exclude<NivelRisco, "verde">, { mmh: Faixa; mmpor: Faixa }> = {
      amarelo: {
        mmh: { min: 6, minInclusivo: false, max: 30, maxInclusivo: true },
        mmpor: { min: 60, minInclusivo: true, max: 90, maxInclusivo: true },
      },
      laranja: {
        mmh: { min: 30, minInclusivo: false, max: 70, maxInclusivo: true },
        mmpor: { min: 90, minInclusivo: false, max: 120, maxInclusivo: true },
      },
      vermelho: {
        mmh: { min: 70, minInclusivo: false, max: 90, maxInclusivo: true },
        mmpor: { min: 120, minInclusivo: false, max: 170, maxInclusivo: false },
      },
      roxo: {
        mmh: { min: 90, minInclusivo: false, max: null, maxInclusivo: false },
        mmpor: { min: 170, minInclusivo: true, max: null, maxInclusivo: false },
      },
    };
    for (const [nivel, { mmh, mmpor }] of Object.entries(formulario)) {
      expect(MATRIZ_CHUVA[nivel as NivelRisco].mmHora).toEqual(mmh);
      expect(MATRIZ_CHUVA[nivel as NivelRisco].mm24h).toEqual(mmpor);
    }
  });
});

describe("classificarIndiceGeologico — bordas", () => {
  it.each<[number, string, NivelRisco]>([
    [0, "extremamente_baixo", "verde"],
    [0.39, "extremamente_baixo", "verde"],
    [0.4, "muito_baixo", "verde"],
    [0.69, "muito_baixo", "verde"],
    [0.7, "baixo", "amarelo"],
    [0.99, "baixo", "amarelo"],
    [1.0, "moderado", "amarelo"],
    [1.59, "moderado", "amarelo"],
    [1.6, "alto", "laranja"],
    [1.8, "alto", "laranja"],
    [2.59, "alto", "laranja"],
    [2.6, "muito_alto", "vermelho"],
    [3.4, "muito_alto", "vermelho"],
    [3.41, "extremamente_alto", "roxo"],
  ])("índice %s → %s (%s)", (indice, classe, nivel) => {
    expect(classificarIndiceGeologico(indice)).toBe(classe);
    expect(nivelDoIndiceGeologico(indice)).toBe(nivel);
  });

  it("null para ausente, NaN e negativo", () => {
    expect(classificarIndiceGeologico(null)).toBeNull();
    expect(classificarIndiceGeologico(undefined)).toBeNull();
    expect(classificarIndiceGeologico(Number.NaN)).toBeNull();
    expect(classificarIndiceGeologico(-0.1)).toBeNull();
    expect(nivelDoIndiceGeologico(null)).toBeNull();
  });

  it("toda faixa aceita pelo formulário cai na classe do código escolhido", () => {
    // constraint do campo indice: Laranja_Alto 1,6–2,6; Vermelho_Muito_Alto 2,6–3,4; Roxo > 3,4.
    // O formulário aceita 2,6 nos dois; aqui fica no mais grave (inconsistência 7).
    expect(classificarIndiceGeologico(1.6)).toBe(classeGeologicaDoCodigoSurvey("Laranja_Alto"));
    expect(classificarIndiceGeologico(2.6)).toBe(classeGeologicaDoCodigoSurvey("Vermelho_Muito_Alto"));
    expect(classificarIndiceGeologico(3.4)).toBe(classeGeologicaDoCodigoSurvey("Vermelho_Muito_Alto"));
    expect(classificarIndiceGeologico(3.41)).toBe(classeGeologicaDoCodigoSurvey("Roxo_Extremamente_Alto"));
  });
});

describe("conversões dos códigos do Survey123", () => {
  it.each<[string, NivelRisco]>([
    ["Amarelo_Alerta", "amarelo"],
    ["Laranja_Perigo", "laranja"],
    ["Vermelho_Perigo_Severo", "vermelho"],
    ["Roxo_Desastre", "roxo"],
    ["Laranja_Alerta", "laranja"],
    ["Vermelho_Inundacao", "vermelho"],
    ["Laranja_Alto", "laranja"],
    ["Vermelho_Muito_Alto", "vermelho"],
    ["Roxo_Extremamente_Alto", "roxo"],
  ])("código %s → %s", (codigo, nivel) => {
    expect(nivelDoCodigoSurvey(codigo)).toBe(nivel);
  });

  it.each<[string, NivelRisco]>([
    ["Amarelo (Alerta)", "amarelo"],
    ["Laranja (Perigo)", "laranja"],
    ["Vermelho (Perigo Servero)", "vermelho"], // grafia do formulário
    ["Vermelho (Perigo Severo)", "vermelho"],
    ["Roxo (Desastre)", "roxo"],
    ["Laranja (Alerta)", "laranja"],
    ["Vermelho (Inundação)", "vermelho"],
    ["Laranja (Alto)", "laranja"],
    ["Vermelho (Muito Alto)", "vermelho"],
    ["Roxo (Extremamente Alto)", "roxo"],
    ["Verde (Normalidade)", "verde"],
    ["VERMELHO (PERIGO SEVERO)", "vermelho"],
    ["  laranja_perigo ", "laranja"],
    ["Laranja", "laranja"],
    ["verde", "verde"],
  ])("rótulo %j → %s", (rotulo, nivel) => {
    expect(nivelDoCodigoSurvey(rotulo)).toBe(nivel);
  });

  it("desconhecido, ambíguo ou não texto → null", () => {
    expect(nivelDoCodigoSurvey("Alerta")).toBeNull();
    expect(nivelDoCodigoSurvey("Perigo")).toBeNull();
    expect(nivelDoCodigoSurvey("Azul_Qualquer")).toBeNull();
    expect(nivelDoCodigoSurvey("")).toBeNull();
    expect(nivelDoCodigoSurvey(null)).toBeNull();
    expect(nivelDoCodigoSurvey(undefined)).toBeNull();
    expect(nivelDoCodigoSurvey(2)).toBeNull();
  });

  it("a cor do código é a cor do nível convertido", () => {
    const { nivel, inundacao, deslizamento } = OPCOES_SURVEY;
    const opcoes = [...nivel, ...inundacao, ...deslizamento];
    for (const { codigo } of opcoes) {
      const convertido = nivelDoCodigoSurvey(codigo);
      expect(convertido, codigo).not.toBeNull();
      expect(codigo.split("_")[0]).toBe(CORES_NIVEL[convertido as NivelRisco].nome);
    }
  });

  it("tipo de risco", () => {
    expect(tipoRiscoDoCodigoSurvey("Metereologico")).toBe("meteorologico");
    expect(tipoRiscoDoCodigoSurvey("Metereológico (Chuva)")).toBe("meteorologico");
    expect(tipoRiscoDoCodigoSurvey("Meteorológico")).toBe("meteorologico");
    expect(tipoRiscoDoCodigoSurvey("Hidrologico")).toBe("hidrologico");
    expect(tipoRiscoDoCodigoSurvey("Hidrológico (Inuncação)")).toBe("hidrologico");
    expect(tipoRiscoDoCodigoSurvey("Hidrológico (Inundação)")).toBe("hidrologico");
    expect(tipoRiscoDoCodigoSurvey("Geologico")).toBe("geologico");
    expect(tipoRiscoDoCodigoSurvey("Geológico")).toBe("geologico");
    expect(tipoRiscoDoCodigoSurvey("Sísmico")).toBeNull();
  });

  it("lista inundacao → nível hidrológico", () => {
    expect(nivelHidrologicoDoCodigoSurvey("Laranja_Alerta")).toBe("alerta");
    expect(nivelHidrologicoDoCodigoSurvey("Vermelho (Inundação)")).toBe("inundacao");
    expect(nivelHidrologicoDoCodigoSurvey("Atenção")).toBe("atencao");
    expect(nivelHidrologicoDoCodigoSurvey("Normal")).toBe("normal");
    expect(nivelHidrologicoDoCodigoSurvey("Laranja_Perigo")).toBeNull();
  });

  it("lista deslizamento → classe geológica", () => {
    expect(classeGeologicaDoCodigoSurvey("Laranja_Alto")).toBe("alto");
    expect(classeGeologicaDoCodigoSurvey("Vermelho (Muito Alto)")).toBe("muito_alto");
    expect(classeGeologicaDoCodigoSurvey("Roxo_Extremamente_Alto")).toBe("extremamente_alto");
    expect(classeGeologicaDoCodigoSurvey("Moderado")).toBe("moderado");
    expect(classeGeologicaDoCodigoSurvey("Vermelho_Inundacao")).toBeNull();
  });
});

describe("textos das matrizes", () => {
  it("todo nível de chuva tem cenário e as quatro ações preenchidos", () => {
    for (const n of NIVEIS_RISCO) {
      const linha = MATRIZ_CHUVA[n];
      expect(linha.nivel).toBe(n);
      expect(linha.cenario.length).toBeGreaterThan(30);
      for (const texto of Object.values(linha.acoes)) expect(texto.length).toBeGreaterThan(10);
    }
  });

  it("transcrição integral (amostras)", () => {
    expect(MATRIZ_CHUVA.roxo.acoes.mobilizacaoTropa).toBe(
      "Emprego de serviço especializado interno e externo (BEMAD, LIGABOM); Suporte das FFAA; Acionamento de ajuda humanitária; Organização de serviços voluntários.",
    );
    expect(MATRIZ_CHUVA.vermelho.acoes.ueop).toBe(
      "Ativação e acionamento da equipe do NAC; Redução significativa de atividades meio não essenciais. Ativação de Posto de Comando para gerenciamento das ocorrências. Possibilidade de adotar jornada extraordinária do serviço operacional (3x3 ou 5x5).",
    );
    expect(MATRIZ_CHUVA.laranja.alerta).toBe("Perigo");
    expect(MATRIZ_CHUVA.vermelho.classificacao).toBe("Elevado");
    expect(MATRIZ_HIDROLOGICA.inundacao.detalhamento).toBe(
      "Cota em que o primeiro dano é observado no município",
    );
    expect(MATRIZ_GEOLOGICA.alto.indiceTexto).toBe("(1,60 até 2,6)");
  });
});

describe("tokens CSS da escala de risco", () => {
  it("app/globals.css repete exatamente CORES_NIVEL", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    for (const nivel of NIVEIS_RISCO) {
      const fundo = new RegExp(`--risco-${nivel}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1];
      const tinta = new RegExp(`--risco-${nivel}-tinta:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1];
      expect(fundo?.toUpperCase(), nivel).toBe(CORES_NIVEL[nivel].fundo.toUpperCase());
      expect(tinta?.toUpperCase(), nivel).toBe(CORES_NIVEL[nivel].tinta.toUpperCase());
    }
  });
});
