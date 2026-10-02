import { describe, expect, it } from "vitest";
import { CODIGOS_SITUACAO, type SituacaoAlerta } from "@/lib/alertas/codigos";
import {
  aplicarPassos,
  esquemaPedido,
  estadosDerivados,
  nivelHidrologicoPelaCota,
  passosDoRegistroDeAcao,
  podeApagar,
  prazoPadrao,
  PRAZO_PADRAO_HORAS,
  resolverTerritorio,
  sugerirNivel,
  transicao,
  TRANSICOES,
  ueopDaUnidade,
  validarEmissao,
  alertaVazio,
  type AlertaSala,
  type PassoFluxo,
} from "@/lib/alertas/dominio";
import { identificadorCap, identificadorMensagem, isoBrasilia, montarMensagemCap } from "@/lib/alertas/cap";
import { pseudonimo, dominioDaSessao } from "@/lib/alertas/autoria";

const AGORA = new Date("2026-10-02T15:00:00.000Z");

describe("máquina de estados (tabela explícita)", () => {
  it("o fluxo feliz RASCUNHO → EMITIDO → CIENTE → EM_AÇÃO → AÇÃO_REGISTRADA → ENCERRADO", () => {
    const passos: PassoFluxo[] = ["emitir", "ciencia", "iniciar_acao", "concluir_acao", "encerrar"];
    expect(aplicarPassos("RASCUNHO", passos)).toBe("ENCERRADO");
    expect(transicao("CIENTE", "concluir_acao")).toBe("ACAO_REGISTRADA");
  });

  it("cancelar vale de qualquer situação emitida e não final; rascunho não se cancela, apaga-se", () => {
    for (const s of ["EMITIDO", "CIENTE", "EM_ACAO", "ACAO_REGISTRADA"] as SituacaoAlerta[]) {
      expect(transicao(s, "cancelar"), s).toBe("CANCELADO");
    }
    expect(transicao("RASCUNHO", "cancelar")).toBeNull();
    expect(podeApagar("RASCUNHO")).toBe(true);
    expect(podeApagar("EMITIDO")).toBe(false);
  });

  it("transições inválidas são recusadas (finais não saem; não se pula etapa; não regride)", () => {
    for (const final of ["ENCERRADO", "CANCELADO"] as SituacaoAlerta[]) {
      for (const passo of ["emitir", "ciencia", "iniciar_acao", "concluir_acao", "encerrar", "cancelar"] as PassoFluxo[]) {
        expect(transicao(final, passo), `${final} --${passo}`).toBeNull();
      }
    }
    expect(transicao("RASCUNHO", "ciencia")).toBeNull();
    expect(transicao("EMITIDO", "encerrar")).toBeNull(); // encerrar exige ação registrada
    expect(transicao("EMITIDO", "emitir")).toBeNull();
    expect(transicao("ACAO_REGISTRADA", "iniciar_acao")).toBeNull();
    expect(() => aplicarPassos("RASCUNHO", ["ciencia"])).toThrow(/Transição inexistente/);
    // Toda transição parte e chega em situações conhecidas.
    for (const t of TRANSICOES) {
      expect(CODIGOS_SITUACAO).toContain(t.de);
      expect(CODIGOS_SITUACAO).toContain(t.para);
    }
  });

  it("registrar ação: ciência implícita, em andamento → EM_AÇÃO, concluída/parcial → AÇÃO_REGISTRADA", () => {
    expect(passosDoRegistroDeAcao("EMITIDO", "CONCLUIDA")).toEqual(["ciencia", "concluir_acao"]);
    expect(passosDoRegistroDeAcao("EMITIDO", "EM_ANDAMENTO")).toEqual(["ciencia", "iniciar_acao"]);
    expect(passosDoRegistroDeAcao("CIENTE", "PARCIAL")).toEqual(["concluir_acao"]);
    expect(passosDoRegistroDeAcao("EM_ACAO", "EM_ANDAMENTO")).toEqual([]);
    expect(passosDoRegistroDeAcao("EM_ACAO", "CONCLUIDA")).toEqual(["concluir_acao"]);
    expect(passosDoRegistroDeAcao("ACAO_REGISTRADA", "EM_ANDAMENTO")).toEqual([]); // não regride
    expect(passosDoRegistroDeAcao("CIENTE", "NAO_REALIZADA")).toEqual([]); // segue pendente
    expect(aplicarPassos("EMITIDO", passosDoRegistroDeAcao("EMITIDO", "PARCIAL"))).toBe("ACAO_REGISTRADA");
  });
});

describe("estados derivados (calculados na leitura)", () => {
  const base = { prazoAcao: "2026-10-02T14:00:00.000Z", validoAte: "2026-10-02T16:00:00.000Z" };

  it("pendente = EMITIDO, CIENTE ou EM_AÇÃO; vencido = pendente com prazo passado", () => {
    expect(estadosDerivados({ ...base, situacao: "EMITIDO" }, AGORA)).toEqual({ pendente: true, vencido: true, vigenciaExpirada: false });
    expect(estadosDerivados({ ...base, situacao: "EM_ACAO" }, AGORA).vencido).toBe(true);
    expect(estadosDerivados({ ...base, situacao: "ACAO_REGISTRADA" }, AGORA)).toEqual({
      pendente: false,
      vencido: false,
      vigenciaExpirada: false,
    });
    expect(estadosDerivados({ ...base, situacao: "RASCUNHO" }, AGORA).pendente).toBe(false);
  });

  it("borda: no instante exato do prazo ainda não venceu; vigência expira depois do válido até", () => {
    const noPrazo = { situacao: "CIENTE" as const, prazoAcao: AGORA.toISOString(), validoAte: AGORA.toISOString() };
    expect(estadosDerivados(noPrazo, AGORA)).toEqual({ pendente: true, vencido: false, vigenciaExpirada: false });
    const depois = new Date(AGORA.getTime() + 1);
    expect(estadosDerivados(noPrazo, depois)).toEqual({ pendente: true, vencido: true, vigenciaExpirada: true });
    expect(estadosDerivados({ situacao: "EMITIDO", prazoAcao: null, validoAte: null }, AGORA)).toEqual({
      pendente: true,
      vencido: false,
      vigenciaExpirada: false,
    });
  });

  it("prazo padrão da ação RRD por nível (proposta a confirmar)", () => {
    expect(PRAZO_PADRAO_HORAS).toEqual({ verde: 24, amarelo: 12, laranja: 6, vermelho: 2, roxo: 2 });
    expect(prazoPadrao("laranja", AGORA)).toBe("2026-10-02T21:00:00.000Z");
    expect(prazoPadrao("roxo", AGORA)).toBe("2026-10-02T17:00:00.000Z");
  });
});

describe("sugestão de nível pela matriz oficial (o operador confirma)", () => {
  it("meteorológico: limites da matriz de chuva, vale o critério mais grave", () => {
    const n = (mmHora: number | null, mm24h: number | null) => sugerirNivel("METEOROLOGICO", { mmHora, mm24h }).nivel;
    expect(n(6, null)).toBe("verde");
    expect(n(6.01, null)).toBe("amarelo");
    expect(n(30, null)).toBe("amarelo");
    expect(n(30.1, null)).toBe("laranja");
    expect(n(70, null)).toBe("laranja");
    expect(n(90, null)).toBe("vermelho");
    expect(n(90.1, null)).toBe("roxo");
    expect(n(null, 59.9)).toBe("verde");
    expect(n(null, 60)).toBe("amarelo");
    expect(n(null, 90)).toBe("amarelo");
    expect(n(null, 120)).toBe("laranja");
    expect(n(null, 169.9)).toBe("vermelho");
    expect(n(null, 170)).toBe("roxo");
    expect(n(5, 130)).toBe("vermelho"); // "ou": o acumulado decide
    expect(n(null, null)).toBeNull();
    expect(sugerirNivel("METEOROLOGICO", { mmHora: 35, mm24h: 80 }).fundamento).toMatch(/35 mm\/h → laranja; 80 mm em 24 h → amarelo/);
  });

  it("geológico: limites do índice GeoRisk (fronteira vai para a classe mais grave)", () => {
    const n = (indice: number) => sugerirNivel("GEOLOGICO", { indiceRisco: indice }).nivel;
    expect(n(0.69)).toBe("verde");
    expect(n(0.7)).toBe("amarelo");
    expect(n(1.59)).toBe("amarelo");
    expect(n(1.6)).toBe("laranja");
    expect(n(2.6)).toBe("vermelho");
    expect(n(3.4)).toBe("vermelho");
    expect(n(3.41)).toBe("roxo");
    expect(sugerirNivel("GEOLOGICO", {}).nivel).toBeNull();
  });

  it("hidrológico: pelo nível do SACE ou pela cota frente às cotas da estação; sem referência, não sugere", () => {
    expect(sugerirNivel("HIDROLOGICO", { nivelHidrologico: "alerta" }).nivel).toBe("laranja");
    expect(sugerirNivel("HIDROLOGICO", { nivelHidrologico: "inundacao" }).nivel).toBe("vermelho");
    const ref = { atencao: 300, alerta: 400, inundacao: 500 };
    expect(nivelHidrologicoPelaCota(299, ref)).toBe("normal");
    expect(nivelHidrologicoPelaCota(300, ref)).toBe("atencao");
    expect(nivelHidrologicoPelaCota(400, ref)).toBe("alerta");
    expect(nivelHidrologicoPelaCota(500, ref)).toBe("inundacao");
    expect(sugerirNivel("HIDROLOGICO", { cota: 520, cotasReferencia: ref }).nivel).toBe("vermelho");
    expect(sugerirNivel("HIDROLOGICO", { cota: 410, cotasReferencia: ref }).nivel).toBe("laranja");
    const semReferencia = sugerirNivel("HIDROLOGICO", { cota: 520 });
    expect(semReferencia.nivel).toBeNull();
    expect(semReferencia.fundamento).toMatch(/não tem limiar numérico global/);
  });

  it("tecnológico: sem matriz", () => {
    expect(sugerirNivel("TECNOLOGICO", { mmHora: 100 }).nivel).toBeNull();
  });
});

describe("território (fração oficial × município)", () => {
  it("fração pelo código ou pelo rótulo do formulário; COB e UEOp saem da fração", () => {
    const r = resolverTerritorio({ fracao: "1 BBM/2CIA/1PEL (Ouro Preto)", codIbge: "3146107", municipio: null });
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.territorio).toEqual({
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia/1º Pel (Ouro Preto)",
      municipio: "Ouro Preto",
      codIbge: "3146107",
    });
    const porCodigo = resolverTerritorio({ fracao: "6_BBM_Governador_Valadares_Sede_5_COB", codIbge: null, municipio: "Governador Valadares" });
    expect(porCodigo.territorio).toMatchObject({ cob: "5º COB", ueop: "6º BBM", fracao: null, codIbge: "3127701" });
  });

  it("fração fora da lista oficial e município inexistente são erro", () => {
    const r = resolverTerritorio({ fracao: "99 BBM/9CIA (Atlântida)", codIbge: "3199999", municipio: null });
    expect(r.erros.map((e) => e.campo)).toEqual(["fracao", "codIbge"]);
    expect(resolverTerritorio({ fracao: null, codIbge: null, municipio: null }).erros).toHaveLength(2);
    // No rascunho, o que falta não é erro.
    expect(resolverTerritorio({ fracao: null, codIbge: null, municipio: null }, false).erros).toEqual([]);
    expect(resolverTerritorio({ fracao: null, codIbge: "3146107", municipio: "Juiz de Fora" }).erros.map((e) => e.campo)).toContain(
      "municipio",
    );
  });

  it("município de outro COB pela tabela aproximada: NÃO bloqueia, só avisa", () => {
    // Uberaba é do 2º COB; a fração de Ouro Preto é do 1º COB.
    const r = resolverTerritorio({ fracao: "1 BBM/2CIA/1PEL (Ouro Preto)", codIbge: "3170107", municipio: null });
    expect(r.erros).toEqual([]);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/Uberaba aparece no 2º COB pela tabela aproximada/);
    expect(r.territorio.cob).toBe("1º COB");
  });

  it("UEOp da unidade do GeoRescue no formato da lista oficial", () => {
    expect(ueopDaUnidade("1BBM (BELO HORIZONTE)")).toBe("1º BBM");
    expect(ueopDaUnidade("11º BBM")).toBe("11º BBM");
    expect(ueopDaUnidade("5CIA IND (SETE LAGOAS)")).toBe("5ª Cia Ind");
    expect(ueopDaUnidade("Sala de Situação")).toBeNull();
  });
});

describe("validação por ação (zod)", () => {
  it("ação desconhecida, alertaId malformado e campo fora do domínio são 400", () => {
    expect(esquemaPedido.safeParse({ acao: "applyEdits" }).success).toBe(false);
    expect(esquemaPedido.safeParse({ acao: "ciencia", alertaId: "1 OR 1=1" }).success).toBe(false);
    expect(esquemaPedido.safeParse({ acao: "salvar", nivelAlerta: "azul" }).success).toBe(false);
    expect(esquemaPedido.safeParse({ acao: "salvar", codIbge: "3550308" }).success).toBe(false); // São Paulo (SP)
    expect(esquemaPedido.safeParse({ acao: "salvar", titulo: "x".repeat(161) }).success).toBe(false);
    expect(esquemaPedido.safeParse({ acao: "salvar", mmHora: -1 }).success).toBe(false);
  });

  it("textos: vazio vira null e espaços nas pontas saem; cancelar exige motivo; encerrar exige a versão", () => {
    const r = esquemaPedido.parse({ acao: "salvar", titulo: "  Título  ", fonteRef: "" });
    expect(r).toMatchObject({ titulo: "Título", fonteRef: null });
    expect(
      esquemaPedido.safeParse({ acao: "cancelar", alertaId: "AL-20261002-0001", alteradoEm: AGORA.toISOString(), motivo: "" }).success,
    ).toBe(false);
    expect(esquemaPedido.safeParse({ acao: "encerrar", alertaId: "AL-20261002-0001" }).success).toBe(false);
  });

  it("autoria não entra pelo corpo: campos do servidor são descartados", () => {
    const r = esquemaPedido.parse({
      acao: "salvar",
      titulo: "Teste",
      criadoPorId: "forjado",
      emitidoPorId: "forjado",
      situacao: "ENCERRADO",
      capIdentifier: "forjado",
    });
    expect(r).not.toHaveProperty("criadoPorId");
    expect(r).not.toHaveProperty("emitidoPorId");
    expect(r).not.toHaveProperty("situacao");
    expect(r).not.toHaveProperty("capIdentifier");
  });
});

function alertaParaEmitir(extra: Partial<AlertaSala> = {}): AlertaSala {
  return {
    ...alertaVazio("AL-20261002-0001"),
    fonteGatilho: "CEMADEN",
    tipoRisco: "GEOLOGICO",
    evento: "DESLIZAMENTO",
    nivelAlerta: "laranja",
    numeroChamada: "2026-12340000-1",
    indiceRisco: 2.1,
    cob: "1º COB",
    ueop: "1º BBM",
    fracao: "2ª Cia/1º Pel (Ouro Preto)",
    municipio: "Ouro Preto",
    codIbge: "3146107",
    titulo: "Risco alto",
    descricao: "Índice 2,1.",
    instrucao: "Vistoriar.",
    areaDesc: "Ouro Preto/MG",
    capIdentifier: identificadorCap("AL-20261002-0001"),
    capUrgencia: "Expected",
    capCerteza: "Likely",
    dataEmissao: AGORA.toISOString(),
    inicioVigencia: AGORA.toISOString(),
    validoAte: "2026-10-03T15:00:00.000Z",
    prazoAcao: "2026-10-02T21:00:00.000Z",
    ...extra,
  };
}

describe("validação da emissão (campos E e campos por tipo)", () => {
  it("alerta completo passa", () => {
    expect(validarEmissao(alertaParaEmitir(), AGORA)).toEqual([]);
  });

  it("faltando campos E: um problema por campo, com o rótulo", () => {
    const problemas = validarEmissao(alertaParaEmitir({ titulo: null, numeroChamada: null, capCerteza: null }), AGORA);
    expect(problemas.map((p) => p.campo).sort()).toEqual(["capCerteza", "numeroChamada", "titulo"]);
    expect(problemas.find((p) => p.campo === "titulo")?.mensagem).toBe("Título: obrigatório para emitir.");
  });

  it("campos por tipo de risco", () => {
    const met = validarEmissao(alertaParaEmitir({ tipoRisco: "METEOROLOGICO", evento: "CHUVA_INTENSA", indiceRisco: null }), AGORA);
    expect(met.map((p) => p.campo)).toEqual(["mmHora"]);
    expect(
      validarEmissao(alertaParaEmitir({ tipoRisco: "METEOROLOGICO", evento: "CHUVA_INTENSA", mm24h: 80 }), AGORA),
    ).toEqual([]);
    const hid = validarEmissao(alertaParaEmitir({ tipoRisco: "HIDROLOGICO", evento: "INUNDACAO", rio: "Rio Doce" }), AGORA);
    expect(hid.map((p) => p.campo).sort()).toEqual(["bacia", "cota"]);
    expect(validarEmissao(alertaParaEmitir({ indiceRisco: null }), AGORA).map((p) => p.campo)).toEqual(["indiceRisco"]);
    expect(validarEmissao(alertaParaEmitir({ tipoRisco: "TECNOLOGICO", evento: "BARRAGEM" }), AGORA)).toEqual([]);
  });

  it("evento precisa ser do tipo (cascata); 'Outro' vale para qualquer tipo", () => {
    expect(validarEmissao(alertaParaEmitir({ evento: "VENDAVAL" }), AGORA).map((p) => p.campo)).toEqual(["evento"]);
    expect(validarEmissao(alertaParaEmitir({ evento: "OUTRO" }), AGORA)).toEqual([]);
  });

  it("datas: validade depois do início, prazo depois da emissão, validade no futuro (só na emissão)", () => {
    const passado = alertaParaEmitir({ validoAte: "2026-10-02T14:00:00.000Z", inicioVigencia: "2026-10-02T13:00:00.000Z" });
    expect(validarEmissao(passado, AGORA).map((p) => p.mensagem)).toEqual(['"Válido até" já passou.']);
    expect(validarEmissao(passado, AGORA, false)).toEqual([]);
    expect(
      validarEmissao(alertaParaEmitir({ validoAte: AGORA.toISOString() }), AGORA).map((p) => p.campo),
    ).toEqual(["validoAte", "validoAte"]);
    expect(validarEmissao(alertaParaEmitir({ prazoAcao: AGORA.toISOString() }), AGORA).map((p) => p.campo)).toEqual(["prazoAcao"]);
  });
});

describe("CAP 1.2 e autoria", () => {
  it("identificadores: original, Update numerado e Cancel", () => {
    expect(identificadorCap("AL-20261002-0001")).toBe("BR-MG-CBMMG-SALA-AL-20261002-0001");
    expect(identificadorMensagem("AL-20261002-0001", "Update", 2)).toBe("BR-MG-CBMMG-SALA-AL-20261002-0001-U2");
    expect(identificadorMensagem("AL-20261002-0001", "Cancel")).toBe("BR-MG-CBMMG-SALA-AL-20261002-0001-C");
    expect(isoBrasilia("2026-10-02T15:00:00.000Z")).toBe("2026-10-02T12:00:00-03:00");
  });

  it("mensagem: status pela natureza, severidade pelo nível, COBRADE e geocode IBGE; sem autoria", () => {
    const alerta = alertaParaEmitir({ natureza: "EXERCICIO", criadoPorId: "abc", emitidoPorId: "def" });
    const msg = montarMensagemCap(alerta, "Alert", alerta.capIdentifier!, AGORA.toISOString());
    expect(msg).toMatchObject({
      status: "Exercise",
      scope: "Restricted",
      sent: "2026-10-02T12:00:00-03:00",
      info: {
        category: "Geo",
        severity: "Severe",
        eventCode: { valueName: "COBRADE", value: "1.1.3.2.1" },
        area: { geocode: { valueName: "IBGE", value: "3146107" } },
      },
    });
    expect(JSON.stringify(msg)).not.toMatch(/abc|def/);
    const cancel = montarMensagemCap(alerta, "Cancel", "X-C", AGORA.toISOString(), { identificador: "X", enviadoEm: AGORA.toISOString() });
    expect(cancel.references).toBe("BR-MG-CBMMG-SALA,X,2026-10-02T12:00:00-03:00");
  });

  it("pseudônimo: HMAC estável de 32 hex, muda com o segredo, não contém o identificador", () => {
    const a = pseudonimo("12345678901", "segredo-a".repeat(4));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(pseudonimo("12345678901", "segredo-a".repeat(4))).toBe(a);
    expect(pseudonimo("12345678901", "segredo-b".repeat(4))).not.toBe(a);
    expect(a).not.toContain("12345678901");
    expect(
      dominioDaSessao({ papel: "operador-sala", grupos: ["SALA"], cobs: [], escopoGlobal: true }),
    ).toBe("SALA");
    expect(dominioDaSessao({ papel: "unidade", grupos: [], cobs: ["3º COB"], escopoGlobal: false })).toBe("3º COB");
  });
});
