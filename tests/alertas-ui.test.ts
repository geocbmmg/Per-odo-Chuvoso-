import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertaFila } from "@/lib/alertas/servico";
import type { Sessao } from "@/lib/auth/tipos";

import {
  abasVisiveis,
  contadores,
  contarAbas,
  detalheLegivel,
  diaBrasilia,
  filaDaAba,
  FILTROS_VAZIOS,
  formatarDuracao,
  prazoRelativo,
  rotuloAutoria,
  rotuloFracao,
  rotuloNivel,
  rotuloSituacao,
  tomSituacao,
  unidadeDoAlerta,
  validadeRelativa,
} from "@/components/alertas/apresentacao";
import { ehConflito, interpretarErro, interpretarFila, MENSAGEM_CONFLITO } from "@/components/alertas/api";
import {
  campoDoFormulario,
  deCampoBrasilia,
  errosPorCampo,
  explicarSugestao,
  formularioDoAlerta,
  formularioVazio,
  fracaoDoMunicipio,
  juntarJustificativa,
  lerNumero,
  mascararNumeroChamada,
  montarCorpoAcao,
  montarCorpoAlerta,
  montarCorpoCancelar,
  montarCorpoCiencia,
  municipioDaFracao,
  nivelAjustado,
  paraCampoBrasilia,
  primeiroErro,
  resolverMunicipio,
  separarJustificativa,
  validarAcao,
  validarFormulario,
  formularioAcaoVazio,
  type FormularioAlerta,
} from "@/components/alertas/formulario";

// Sessão fixa de operador da Sala: a tela consome o contrato, não a implementação do login.
const SESSAO: Sessao = {
  sid: "teste",
  usuarioId: "0".repeat(32),
  nome: "Operador de teste",
  posto: null,
  bm: null,
  papel: "operador-sala",
  papelGeoRescue: "operacional",
  cobs: [],
  escopoGlobal: true,
  grupos: ["SALA"],
  unidade: "Sala de Situação",
  expiraEm: "2099-01-01T00:00:00.000Z",
  demonstracao: true,
};
vi.mock("@/lib/auth/sessao", () => ({ obterSessao: async () => SESSAO }));

/** 02/10/2026 12:00 em Brasília. */
const AGORA = new Date("2026-10-02T15:00:00.000Z");
const H = 3_600_000;
const M = 60_000;
const iso = (deltaMs: number) => new Date(AGORA.getTime() + deltaMs).toISOString();

function alerta(parcial: Partial<AlertaFila>): AlertaFila {
  return {
    objectid: 1,
    alertaId: "AL-20261002-0001",
    loteId: null,
    situacao: "EMITIDO",
    natureza: "REAL",
    origemRegistro: "SALA",
    fonteGatilho: "INMET",
    fonteRef: null,
    tipoRisco: "METEOROLOGICO",
    evento: "CHUVA_INTENSA",
    nivelAlerta: "laranja",
    numeroChamada: "2026-12345678-9",
    mmHora: 45,
    mm24h: null,
    bacia: null,
    rio: null,
    cota: null,
    estacaoCodigo: null,
    indiceRisco: null,
    cob: "1º COB",
    ueop: "1º BBM",
    fracao: "2ª Cia/1º Pel (Ouro Preto)",
    municipio: "Ouro Preto",
    codIbge: "3146107",
    localReferencia: null,
    titulo: "Chuva forte",
    descricao: "Previsão de chuva forte.",
    instrucao: "Prontidão.",
    areaDesc: null,
    capIdentifier: null,
    capMsgType: "Alert",
    capEscopo: "Restricted",
    capUrgencia: "Expected",
    capCerteza: "Likely",
    capResposta: null,
    dataEmissao: iso(-H),
    inicioVigencia: iso(-H),
    validoAte: iso(20 * H),
    prazoAcao: iso(2 * H),
    encerradoEm: null,
    motivoCancelamento: null,
    idOp: null,
    criadoPorId: null,
    criadoEm: iso(-2 * H),
    emitidoPorId: null,
    emitidoPorDominio: "SALA",
    alteradoPorId: null,
    alteradoEm: iso(-H),
    longitude: null,
    latitude: null,
    pendente: true,
    vencido: false,
    vigenciaExpirada: false,
    fracaoCodigo: null,
    destinatarios: [],
    acoes: [],
    ...parcial,
  };
}

// ---------------------------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------------------------

describe("rótulos da fila", () => {
  it("nível e situação sempre com palavra; tom da pílula por situação", () => {
    expect(rotuloNivel("laranja")).toBe("Laranja");
    expect(rotuloNivel(null)).toBe("Sem nível");
    expect(rotuloSituacao("ACAO_REGISTRADA")).toBe("Ação RRD registrada");
    expect(rotuloSituacao("EM_ACAO")).toBe("Em ação");
    expect(tomSituacao("EMITIDO")).toBe("alerta");
    expect(tomSituacao("CIENTE")).toBe("info");
    expect(tomSituacao("ACAO_REGISTRADA")).toBe("ok");
    expect(tomSituacao("CANCELADO")).toBe("neutro");
  });

  it("território COB · UEOp · fração, sede e COB inteiro", () => {
    expect(unidadeDoAlerta({ cob: "1º COB", ueop: "1º BBM", fracao: "2ª Cia/1º Pel (Ouro Preto)" })).toEqual({
      linha1: "1º COB · 1º BBM",
      linha2: "2ª Cia/1º Pel (Ouro Preto)",
      texto: "1º COB · 1º BBM · 2ª Cia/1º Pel (Ouro Preto)",
    });
    expect(unidadeDoAlerta({ cob: "3º COB", ueop: "4º BBM", fracao: null }).texto).toBe("3º COB · 4º BBM · sede");
    expect(unidadeDoAlerta({ cob: "1º COB", ueop: "1º COB", fracao: null }).texto).toBe("1º COB · sede");
    expect(rotuloFracao({ cob: "1º COB", ueop: "1º BBM", fracao: null, cidade: "Belo Horizonte" })).toBe("1º BBM · sede (Belo Horizonte)");
    expect(rotuloFracao({ cob: "1º COB", ueop: "1º BBM", fracao: "2ª Cia/1º Pel (Ouro Preto)", cidade: "Ouro Preto" })).toBe(
      "1º BBM · 2ª Cia/1º Pel (Ouro Preto)",
    );
  });

  it("histórico com os códigos traduzidos", () => {
    expect(detalheLegivel("MONITORAMENTO · CONCLUIDA")).toBe("Monitoramento de área / cota de rio · Concluída");
    expect(detalheLegivel("3º COB · 4º BBM (principal) · SISTEMA")).toBe("3º COB · 4º BBM (principal) · Tela da Sala/GeoRescue");
    expect(detalheLegivel("Motivo: emitido por engano")).toBe("Motivo: emitido por engano");
  });

  it("autoria sem dado pessoal: domínio e 'você'", () => {
    expect(rotuloAutoria("abc", "SALA", "abc")).toBe("você (SALA)");
    expect(rotuloAutoria("abc", "1º COB", "xyz")).toBe("1º COB");
    expect(rotuloAutoria(null, null, null)).toBe("—");
  });

  it("abas: rascunhos só para quem emite; 'a encerrar' só para quem encerra", () => {
    expect(abasVisiveis({ emitir: true, encerrar: true }).map((a) => a.id)).toEqual(["pendentes", "a-encerrar", "rascunhos", "finalizados", "todos"]);
    expect(abasVisiveis({ emitir: false, encerrar: false }).map((a) => a.id)).toEqual(["pendentes", "finalizados", "todos"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Prazos relativos
// ---------------------------------------------------------------------------------------------

describe("prazo da ação e validade relativos", () => {
  it("formata durações em min, h e dias", () => {
    expect(formatarDuracao(35 * M)).toBe("35 min");
    expect(formatarDuracao(2 * H)).toBe("2 h");
    expect(formatarDuracao(2 * H + 15 * M + 59_000)).toBe("2 h 15 min");
    expect(formatarDuracao(30 * H + 10 * M)).toBe("30 h");
    expect(formatarDuracao(80 * H)).toBe("3 dias");
    expect(formatarDuracao(20_000)).toBe("menos de 1 min");
  });

  it('"vence em 2 h" e "vencido há 35 min"', () => {
    expect(prazoRelativo(alerta({ prazoAcao: iso(2 * H) }), AGORA)).toMatchObject({ estado: "no-prazo", texto: "vence em 2 h" });
    expect(prazoRelativo(alerta({ prazoAcao: iso(-35 * M) }), AGORA)).toMatchObject({
      estado: "vencido",
      texto: "vencido há 35 min",
      quando: "02/10/2026 11:25",
    });
    expect(prazoRelativo(alerta({ prazoAcao: iso(40 * M) }), AGORA)).toMatchObject({ estado: "proximo", texto: "vence em 40 min" });
  });

  it("vencido é recalculado com o relógio da tela, não o do servidor", () => {
    const a = alerta({ prazoAcao: iso(10 * M), vencido: false });
    expect(prazoRelativo(a, new Date(AGORA.getTime() + 20 * M)).estado).toBe("vencido");
  });

  it("rascunho mostra o prazo padrão do nível; finais não têm prazo", () => {
    expect(prazoRelativo(alerta({ situacao: "RASCUNHO", prazoAcao: null, nivelAlerta: "laranja" }), AGORA).texto).toBe("6 h após emitir");
    expect(prazoRelativo(alerta({ situacao: "ENCERRADO" }), AGORA)).toMatchObject({ estado: "nao-se-aplica", texto: "—" });
    expect(prazoRelativo(alerta({ situacao: "ACAO_REGISTRADA" }), AGORA).estado).toBe("nao-se-aplica");
  });

  it("validade: mesmo dia só a hora; outro dia com a data; expirada", () => {
    expect(validadeRelativa(alerta({ validoAte: iso(6 * H) }), AGORA)).toEqual({ texto: "até 18:00", expirada: false });
    expect(validadeRelativa(alerta({ validoAte: iso(20 * H) }), AGORA)).toEqual({ texto: "até 03/10 08:00", expirada: false });
    expect(validadeRelativa(alerta({ validoAte: iso(-H) }), AGORA)).toEqual({ texto: "expirou às 11:00", expirada: true });
  });

  it("dia de Brasília vira às 03:00 UTC", () => {
    expect(diaBrasilia("2026-10-03T02:59:00Z")).toBe("2026-10-02");
    expect(diaBrasilia("2026-10-03T03:00:00Z")).toBe("2026-10-03");
  });
});

// ---------------------------------------------------------------------------------------------
// Abas, filtros, ordenação e contadores
// ---------------------------------------------------------------------------------------------

describe("fila: abas, ordenação e contadores", () => {
  const lista = [
    alerta({ alertaId: "AL-20261002-0001", prazoAcao: iso(5 * H), nivelAlerta: "amarelo", cob: "1º COB" }),
    alerta({ alertaId: "AL-20261002-0002", prazoAcao: iso(-2 * H), nivelAlerta: "laranja", cob: "3º COB" }),
    alerta({ alertaId: "AL-20261002-0003", prazoAcao: iso(-30 * M), situacao: "CIENTE", cob: "1º COB" }),
    alerta({ alertaId: "AL-20261002-0004", prazoAcao: iso(H), situacao: "EM_ACAO", nivelAlerta: "vermelho", tipoRisco: "GEOLOGICO" }),
    alerta({ alertaId: "AL-20261002-0005", situacao: "RASCUNHO", dataEmissao: null, prazoAcao: null, alteradoEm: iso(-10 * M) }),
    alerta({ alertaId: "AL-20261002-0006", situacao: "ACAO_REGISTRADA" }),
    alerta({ alertaId: "AL-20261001-0001", situacao: "ENCERRADO", encerradoEm: iso(-20 * H), dataEmissao: iso(-30 * H) }),
    alerta({ alertaId: "AL-20261002-0007", situacao: "CANCELADO", encerradoEm: iso(-H) }),
  ];

  it("Pendentes: vencidos primeiro (o mais atrasado no topo), depois pelo prazo", () => {
    expect(filaDaAba(lista, "pendentes", FILTROS_VAZIOS, AGORA).map((a) => a.alertaId)).toEqual([
      "AL-20261002-0002",
      "AL-20261002-0003",
      "AL-20261002-0004",
      "AL-20261002-0001",
    ]);
  });

  it("Encerrados/cancelados pelo encerramento mais recente; Rascunhos e A encerrar", () => {
    expect(filaDaAba(lista, "finalizados", FILTROS_VAZIOS, AGORA).map((a) => a.alertaId)).toEqual(["AL-20261002-0007", "AL-20261001-0001"]);
    expect(filaDaAba(lista, "rascunhos", FILTROS_VAZIOS, AGORA).map((a) => a.alertaId)).toEqual(["AL-20261002-0005"]);
    expect(filaDaAba(lista, "a-encerrar", FILTROS_VAZIOS, AGORA).map((a) => a.alertaId)).toEqual(["AL-20261002-0006"]);
  });

  it("Todos: vencidos, pendentes, rascunhos, a encerrar e finais", () => {
    expect(filaDaAba(lista, "todos", FILTROS_VAZIOS, AGORA).map((a) => a.situacao)).toEqual([
      "EMITIDO",
      "CIENTE",
      "EM_ACAO",
      "EMITIDO",
      "RASCUNHO",
      "ACAO_REGISTRADA",
      "CANCELADO",
      "ENCERRADO",
    ]);
  });

  it("filtros por COB, tipo e nível (ou dentro do grupo, e entre grupos)", () => {
    const f = { cobs: ["1º COB"], tipos: [], niveis: [] };
    expect(filaDaAba(lista, "pendentes", f, AGORA).map((a) => a.alertaId)).toEqual(["AL-20261002-0003", "AL-20261002-0004", "AL-20261002-0001"]);
    expect(filaDaAba(lista, "pendentes", { ...f, tipos: ["GEOLOGICO"] }, AGORA).map((a) => a.alertaId)).toEqual(["AL-20261002-0004"]);
    expect(filaDaAba(lista, "pendentes", { cobs: [], tipos: [], niveis: ["laranja", "vermelho"] }, AGORA)).toHaveLength(3);
    expect(contarAbas(lista, f, AGORA)).toMatchObject({ pendentes: 3, todos: 7 });
  });

  it("contadores do topo: pendentes, vencidos, emitidos hoje (Brasília) e a encerrar", () => {
    expect(contadores(lista, AGORA)).toEqual({ pendentes: 4, vencidos: 2, emitidosHoje: 6, aEncerrar: 1 });
  });
});

// ---------------------------------------------------------------------------------------------
// Formulário: máscara, números, datas, sugestão
// ---------------------------------------------------------------------------------------------

describe("formulário de emissão: entrada", () => {
  it("máscara do nº da chamada AAAA-NNNNNNNN-N", () => {
    expect(mascararNumeroChamada("2026")).toBe("2026");
    expect(mascararNumeroChamada("20261234")).toBe("2026-1234");
    expect(mascararNumeroChamada("2026123456789")).toBe("2026-12345678-9");
    expect(mascararNumeroChamada("2026-12345678-9xx99")).toBe("2026-12345678-9");
    expect(mascararNumeroChamada("ab2026.1234")).toBe("2026-1234");
  });

  it("números com vírgula; inválido vira NaN", () => {
    expect(lerNumero("45")).toBe(45);
    expect(lerNumero("45,5")).toBe(45.5);
    expect(lerNumero("1.234,5")).toBe(1234.5);
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("abc")).toBeNaN();
  });

  it("datas de parede em Brasília ↔ ISO UTC", () => {
    expect(paraCampoBrasilia("2026-10-02T15:00:00.000Z")).toBe("2026-10-02T12:00");
    expect(deCampoBrasilia("2026-10-02T12:00")).toBe("2026-10-02T15:00:00.000Z");
    expect(deCampoBrasilia("02/10/2026")).toBeNull();
  });

  it('sugestão explicada: "Laranja — Perigo, porque 45 mm/h > 30"', () => {
    const s = explicarSugestao("METEOROLOGICO", { mmHora: 45, mm24h: null });
    expect(s).toMatchObject({ nivel: "laranja", titulo: "Laranja — Perigo", porque: "45 mm/h > 30" });
    expect(s.fundamento).toContain("Matriz de chuva");
    expect(explicarSugestao("METEOROLOGICO", { mmHora: 5, mm24h: 130 })).toMatchObject({
      nivel: "vermelho",
      porque: "130 mm em 24 h > 120",
    });
    expect(explicarSugestao("GEOLOGICO", { indiceRisco: 2.1 })).toMatchObject({ nivel: "laranja", porque: "índice 2,1 ≥ 1,6" });
    expect(explicarSugestao("HIDROLOGICO", { cota: 420, nivelHidrologico: "alerta" })).toMatchObject({ nivel: "laranja", titulo: "Laranja — Alerta" });
    expect(explicarSugestao("HIDROLOGICO", { cota: 420 }).nivel).toBeNull();
    expect(explicarSugestao("TECNOLOGICO", {}).nivel).toBeNull();
  });

  it("território: município da fração e fração sugerida do município", () => {
    expect(municipioDaFracao({ cidade: "Ouro Preto" })?.ibge).toBe("3146107");
    expect(municipioDaFracao({ cidade: "Barreiro/BH" })?.nome).toBe("Belo Horizonte");
    const op = resolverMunicipio("ouro preto");
    expect(op?.ibge).toBe("3146107");
    expect(resolverMunicipio("3146107")?.nome).toBe("Ouro Preto");
    expect(op && fracaoDoMunicipio(op)?.cob).toBe("1º COB");
  });

  it("justificativa do nível ajustado entra e sai da descrição", () => {
    const d = juntarJustificativa("Chuva forte prevista.", "solo encharcado");
    expect(d).toBe("Chuva forte prevista.\n\nJustificativa do nível: solo encharcado");
    expect(separarJustificativa(d)).toEqual({ descricao: "Chuva forte prevista.", justificativa: "solo encharcado" });
    expect(juntarJustificativa(d, "outra")).toBe("Chuva forte prevista.\n\nJustificativa do nível: outra");
    expect(juntarJustificativa(d, "")).toBe("Chuva forte prevista.");
  });
});

// ---------------------------------------------------------------------------------------------
// Formulário: corpo e validação espelhada
// ---------------------------------------------------------------------------------------------

function preenchido(agora = new Date()): FormularioAlerta {
  return {
    ...formularioVazio(agora),
    cob: "1º COB",
    fracao: "1_BBM_2CIA_1PEL_Ouro_Preto_1_COB",
    municipio: "Ouro Preto",
    tipoRisco: "METEOROLOGICO",
    evento: "CHUVA_INTENSA",
    fonteGatilho: "INMET",
    mmHora: "45",
    numeroChamada: "2026-12345678-9",
    titulo: "Chuva forte em Ouro Preto",
    descricao: "Previsão de 45 mm/h nas próximas horas.",
    instrucao: "Vistoria nas áreas de risco.",
    destinatarios: [{ tipo: "cob", cob: "1º COB" }],
  };
}

describe("formulário de emissão: corpo e validação", () => {
  it("monta o corpo com IBGE resolvido, nível sugerido e prazo padrão (null)", () => {
    const corpo = montarCorpoAlerta({ ...preenchido(AGORA), bacia: "esquecida" }, "emitir");
    expect(corpo).toMatchObject({
      acao: "emitir",
      natureza: "REAL",
      fracao: "1_BBM_2CIA_1PEL_Ouro_Preto_1_COB",
      codIbge: "3146107",
      nivelAlerta: "laranja",
      mmHora: 45,
      mm24h: null,
      bacia: null,
      prazoAcao: null,
      validoAte: "2026-10-03T15:00:00.000Z",
      capUrgencia: "Expected",
      capCerteza: "Likely",
      destinatarios: [{ cob: "1º COB" }],
    });
    expect(corpo).not.toHaveProperty("alertaId");
  });

  it("alerta já emitido: não manda território, natureza nem destinatários (CAP Update)", () => {
    const f = formularioDoAlerta(alerta({ alertaId: "AL-20261002-0009", situacao: "CIENTE" }), AGORA);
    const corpo = montarCorpoAlerta(f, "salvar");
    expect(corpo).toMatchObject({ acao: "salvar", alertaId: "AL-20261002-0009", alteradoEm: iso(-H) });
    for (const campo of ["fracao", "codIbge", "municipio", "natureza", "destinatarios"]) expect(corpo).not.toHaveProperty(campo);
  });

  it("formulário vazio: erros por campo na ordem da tela (foco no primeiro)", () => {
    const erros = validarFormulario(formularioVazio(AGORA), "emitir", AGORA);
    expect(Object.keys(erros)).toEqual(
      expect.arrayContaining(["cob", "fracao", "municipio", "tipoRisco", "evento", "fonteGatilho", "nivel", "numeroChamada", "titulo"]),
    );
    expect(erros.cob).toBe("Escolha o COB.");
    expect(erros.fracao).toBe("Escolha a fração responsável (o COB e a UEOp saem dela).");
    expect(erros.municipio).toBe("Escolha o município.");
    // Sem município não há área padrão, e sem nível não há prazo padrão: um erro só, no campo que causa.
    expect(erros).not.toHaveProperty("areaDesc");
    expect(erros).not.toHaveProperty("prazoAcao");
    expect(Object.keys(erros)[0]).toBe("cob");
    expect(primeiroErro(erros)).toBe("cob");
    // Rascunho aceita o formulário incompleto.
    expect(validarFormulario(formularioVazio(AGORA), "salvar", AGORA)).toEqual({});
  });

  it("formulário completo passa; máscara, município e justificativa são conferidos", () => {
    const agora = new Date();
    expect(validarFormulario(preenchido(agora), "emitir", agora)).toEqual({});
    expect(validarFormulario({ ...preenchido(agora), numeroChamada: "2026-1234" }, "emitir", agora).numeroChamada).toMatch(/AAAA-NNNNNNNN-N/);
    expect(validarFormulario({ ...preenchido(agora), municipio: "Gotham" }, "emitir", agora).municipio).toMatch(/não encontrado/);
    const ajustado = { ...preenchido(agora), nivelEscolhido: "vermelho" as const };
    expect(nivelAjustado(ajustado)).toBe(true);
    expect(validarFormulario(ajustado, "emitir", agora).justificativaNivel).toBeDefined();
    expect(validarFormulario({ ...ajustado, justificativaNivel: "solo encharcado" }, "emitir", agora)).toEqual({});
    expect(validarFormulario({ ...preenchido(agora), mmHora: "muito" }, "emitir", agora).mmHora).toMatch(/Número/);
  });

  it("erros do servidor (campos do domínio) caem no campo certo da tela", () => {
    expect(campoDoFormulario("cob")).toBe("fracao");
    expect(campoDoFormulario("codIbge")).toBe("municipio");
    expect(campoDoFormulario("nivelAlerta")).toBe("nivel");
    expect(campoDoFormulario("destinatarios.0.fracao")).toBe("destinatarios");
    expect(campoDoFormulario("pedido")).toBe("geral");
    expect(errosPorCampo([{ campo: "titulo", mensagem: "Título: obrigatório para emitir." }])).toEqual({ titulo: "Obrigatório para emitir." });
  });

  it("corpos das ações: ciência, ação RRD (contagens opcionais, data de Brasília) e cancelar", () => {
    expect(montarCorpoCiencia("AL-20261002-0001", "v1", null, "  ")).toEqual({ acao: "ciencia", alertaId: "AL-20261002-0001", alteradoEm: "v1" });
    expect(montarCorpoCiencia("AL-20261002-0001", null, 7, "ok")).toEqual({ acao: "ciencia", alertaId: "AL-20261002-0001", destinatario: 7, observacao: "ok" });

    const f = { ...formularioAcaoVazio(AGORA), tipoAcao: "VISTORIA" as const, resultado: "CONCLUIDA" as const, acaoExecutada: "Vistoria feita.", pessoasOrientadas: "12" };
    const corpo = montarCorpoAcao("AL-20261002-0001", "2026-10-02T14:00:00.000Z", f);
    expect(corpo).toMatchObject({
      acao: "registrar_acao",
      tipoAcao: "VISTORIA",
      resultado: "CONCLUIDA",
      dataAcao: "2026-10-02T15:00:00.000Z",
      pessoasOrientadas: 12,
      compdecAcionada: null,
    });
    expect(corpo).not.toHaveProperty("pessoasRemovidas");
    expect(validarAcao(corpo, f, AGORA)).toEqual({});
    expect(validarAcao(montarCorpoAcao("AL-20261002-0001", null, formularioAcaoVazio(AGORA)), formularioAcaoVazio(AGORA), AGORA)).toMatchObject({
      tipoAcao: "Escolha o tipo de ação.",
      resultado: "Escolha o resultado.",
    });
    expect(montarCorpoCancelar("AL-20261002-0001", "v1", "  emitido por engano  ")).toEqual({
      acao: "cancelar",
      alertaId: "AL-20261002-0001",
      alteradoEm: "v1",
      motivo: "emitido por engano",
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Contrato de erro e fluxo completo pela rota
// ---------------------------------------------------------------------------------------------

describe("cliente da API", () => {
  it("409 de concorrência vira a mensagem 'alguém alterou este alerta'", () => {
    const e = interpretarErro(409, { ok: false, erro: "O alerta foi alterado…", motivo: "conflito", alteradoEmAtual: "x" });
    expect(ehConflito(e)).toBe(true);
    expect(e.message).toBe(MENSAGEM_CONFLITO);
    expect(e.alteradoEmAtual).toBe("x");
    const v = interpretarErro(400, { ok: false, erro: "Faltam dados", motivo: "entrada_invalida", campos: [{ campo: "titulo", mensagem: "x" }, 3] });
    expect(v.campos).toEqual([{ campo: "titulo", mensagem: "x" }]);
    expect(interpretarErro(502, "<html>").message).toMatch(/servidor da Sala/);
    expect(() => interpretarFila({ ok: true })).toThrow();
  });
});

describe("fluxo completo com os corpos da tela: rascunho → emitir → ciência → ação → encerrar", () => {
  beforeEach(async () => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    vi.stubEnv("ARMAZEM_LEITURAS", "memoria");
    const { reiniciarEnv } = await import("@/lib/env");
    const { reiniciarAlertas } = await import("@/lib/alertas/config");
    reiniciarEnv();
    reiniciarAlertas();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { reiniciarEnv } = await import("@/lib/env");
    const { reiniciarAlertas } = await import("@/lib/alertas/config");
    reiniciarEnv();
    reiniciarAlertas();
  });

  async function post(corpo: Record<string, unknown>) {
    const { POST } = await import("@/app/api/alertas/route");
    const resposta = await POST(
      new Request("http://localhost:3000/api/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify(corpo),
      }),
    );
    return { status: resposta.status, corpo: await resposta.json() };
  }

  it("a validação da tela e a do servidor concordam em cada passo", async () => {
    const agora = new Date();
    const f = preenchido(agora);
    expect(validarFormulario(f, "salvar", agora)).toEqual({});
    const salvo = await post(montarCorpoAlerta(f, "salvar"));
    expect(salvo.status).toBe(200);
    expect(salvo.corpo.alerta).toMatchObject({ situacao: "RASCUNHO", nivelAlerta: "laranja", codIbge: "3146107", ueop: "1º BBM" });
    expect(salvo.corpo.alerta.destinatarios).toHaveLength(2);

    const edicao = formularioDoAlerta(salvo.corpo.alerta, agora);
    expect(edicao.destinatarios).toEqual([{ tipo: "cob", cob: "1º COB" }]);
    expect(validarFormulario(edicao, "emitir", agora)).toEqual({});
    const emitido = await post(montarCorpoAlerta(edicao, "emitir"));
    expect(emitido.status).toBe(200);
    const a = emitido.corpo.alerta;
    expect(a).toMatchObject({ situacao: "EMITIDO", nivelAlerta: "laranja" });
    // Prazo padrão do laranja: 6 h após a emissão.
    expect(Date.parse(a.prazoAcao) - Date.parse(a.dataEmissao)).toBe(6 * H);

    // Versão antiga → 409 com o contrato que a tela reconhece.
    const velho = await post(montarCorpoCiencia(a.alertaId, salvo.corpo.alerta.alteradoEm, null, ""));
    expect(velho.status).toBe(409);
    expect(ehConflito(interpretarErro(velho.status, velho.corpo))).toBe(true);

    const ciente = await post(montarCorpoCiencia(a.alertaId, a.alteradoEm, null, "Recebido."));
    expect(ciente.status).toBe(200);
    expect(ciente.corpo.alerta.situacao).toBe("CIENTE");

    const fAcao = { ...formularioAcaoVazio(new Date()), tipoAcao: "VISTORIA" as const, resultado: "CONCLUIDA" as const, acaoExecutada: "Vistoria nas encostas." };
    const corpoAcao = montarCorpoAcao(a.alertaId, ciente.corpo.alerta.alteradoEm, fAcao);
    expect(validarAcao(corpoAcao, fAcao, new Date())).toEqual({});
    const acao = await post(corpoAcao);
    expect(acao.status).toBe(200);
    expect(acao.corpo.alerta.situacao).toBe("ACAO_REGISTRADA");
    expect(acao.corpo.acaoId).toMatch(/^AC-/);

    const encerrado = await post({ acao: "encerrar", alertaId: a.alertaId, alteradoEm: acao.corpo.alerta.alteradoEm });
    expect(encerrado.status).toBe(200);
    expect(encerrado.corpo.alerta.situacao).toBe("ENCERRADO");
  });

  it("cancelar exige motivo; a tela e o servidor recusam o mesmo motivo curto", async () => {
    const agora = new Date();
    const emitido = await post(montarCorpoAlerta(preenchido(agora), "emitir"));
    expect(emitido.status).toBe(200);
    const a = emitido.corpo.alerta;
    const curto = await post(montarCorpoCancelar(a.alertaId, a.alteradoEm, "x"));
    expect(curto.status).toBe(400);
    const ok = await post(montarCorpoCancelar(a.alertaId, a.alteradoEm, "Emitido por engano."));
    expect(ok.status).toBe(200);
    expect(ok.corpo.alerta).toMatchObject({ situacao: "CANCELADO", motivoCancelamento: "Emitido por engano." });
  });
});
