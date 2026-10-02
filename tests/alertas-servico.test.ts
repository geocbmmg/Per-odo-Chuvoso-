import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarRepositorioArcgis } from "@/lib/alertas/arcgis";
import { pseudonimo } from "@/lib/alertas/autoria";
import { obterRepositorioAlertas, reiniciarAlertas } from "@/lib/alertas/config";
import { ErroAlertas } from "@/lib/alertas/erros";
import { criarRepositorioMemoria, type RepositorioMemoria } from "@/lib/alertas/memoria";
import { diaBrasilia, executar, listarFila, type ContextoServico, type ResultadoAcao } from "@/lib/alertas/servico";
import type { PapelSala, Sessao } from "@/lib/auth/tipos";
import { reiniciarEnv } from "@/lib/env";

const AGORA = new Date("2026-10-02T15:00:00.000Z"); // 12:00 em Brasília
const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";

function sessao(papel: PapelSala, extra: Partial<Sessao> = {}): Sessao {
  return {
    sid: `sid-${papel}`,
    usuarioId: `usuario-${papel}`,
    nome: "Nome de Teste",
    posto: null,
    bm: null,
    papel,
    papelGeoRescue: "operacional",
    cobs: [],
    escopoGlobal: false,
    grupos: [],
    unidade: null,
    expiraEm: "2026-10-02T23:00:00.000Z",
    demonstracao: false,
    ...extra,
  };
}

const OPERADOR = sessao("operador-sala", { escopoGlobal: true, grupos: ["SALA"], usuarioId: "op-1", unidade: "Sala de Situação" });
const OPERADOR_2 = sessao("operador-sala", { escopoGlobal: true, grupos: ["SALA"], usuarioId: "op-2" });
const UNIDADE_1COB = sessao("unidade", { cobs: ["1º COB"], unidade: "1BBM (BELO HORIZONTE)", usuarioId: "un-1" });
const UNIDADE_2COB = sessao("unidade", { cobs: ["2º COB"], unidade: "8BBM (UBERABA)", usuarioId: "un-2" });
const UNIDADE_5COB = sessao("unidade", { cobs: ["5º COB"], unidade: "6BBM (GOVERNADOR VALADARES)", usuarioId: "un-5" });
const LEITURA_1COB = sessao("leitura", { cobs: ["1º COB"], usuarioId: "le-1", papelGeoRescue: "visualizador" });

let repo: RepositorioMemoria;
let agora: Date;
const ctx = (): Partial<ContextoServico> => ({ repositorio: repo, agora, segredo: SEGREDO });

/** Campos de um alerta geológico completo em Ouro Preto (1º COB). */
function camposOuroPreto(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fonteGatilho: "CEMADEN",
    tipoRisco: "GEOLOGICO",
    evento: "DESLIZAMENTO",
    nivelAlerta: "laranja",
    indiceRisco: 2.1,
    numeroChamada: "2026-12340000-1",
    fracao: "1 BBM/2CIA/1PEL (Ouro Preto)",
    codIbge: "3146107",
    titulo: "Risco alto de deslizamento",
    descricao: "Índice GeoRisk 2,1 após chuva persistente.",
    instrucao: "Vistoriar encostas e orientar moradores.",
    capUrgencia: "Expected",
    capCerteza: "Likely",
    validoAte: "2026-10-03T15:00:00.000Z",
    ...extra,
  };
}

async function esperarErro(promessa: Promise<unknown>, status: number, motivo?: string): Promise<ErroAlertas> {
  try {
    await promessa;
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroAlertas);
    const e = erro as ErroAlertas;
    expect(e.status, `${e.motivo}: ${e.message}`).toBe(status);
    if (motivo) expect(e.motivo).toBe(motivo);
    return e;
  }
  throw new Error(`esperava erro ${status}`);
}

function avancar(minutos: number) {
  agora = new Date(agora.getTime() + minutos * 60_000);
}

async function emitirOuroPreto(extra: Record<string, unknown> = {}): Promise<ResultadoAcao> {
  return executar("emitir", camposOuroPreto(extra), OPERADOR, ctx());
}

beforeEach(() => {
  repo = criarRepositorioMemoria();
  agora = AGORA;
});

describe("fluxo completo pela Sala e pela unidade", () => {
  it("rascunho → emitir → ciência → em ação → ação registrada → encerrado, com histórico por transição", async () => {
    const salvo = await executar("salvar", camposOuroPreto({ titulo: "Rascunho" }), OPERADOR, ctx());
    expect(salvo.id).toBe("AL-20261002-0001");
    expect(salvo.alerta).toMatchObject({
      situacao: "RASCUNHO",
      loteId: "AL-20261002-0001",
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia/1º Pel (Ouro Preto)",
      municipio: "Ouro Preto",
      fracaoCodigo: "1_BBM_2CIA_1PEL_Ouro_Preto_1_COB",
      capIdentifier: null,
      dataEmissao: null,
      pendente: false,
    });
    expect(salvo.alerta!.destinatarios).toMatchObject([{ destNivel: "FRACAO", principal: true, situacaoDest: "AGUARDANDO" }]);

    avancar(5);
    const emitido = await executar(
      "emitir",
      { alertaId: salvo.id, alteradoEm: salvo.alerta!.alteradoEm, titulo: "Risco alto de deslizamento" },
      OPERADOR,
      ctx(),
    );
    const a = emitido.alerta!;
    expect(a).toMatchObject({
      situacao: "EMITIDO",
      capIdentifier: "BR-MG-CBMMG-SALA-AL-20261002-0001",
      capMsgType: "Alert",
      dataEmissao: agora.toISOString(),
      inicioVigencia: agora.toISOString(),
      prazoAcao: new Date(agora.getTime() + 6 * 3_600_000).toISOString(), // laranja: 6 h
      areaDesc: "Ouro Preto/MG",
      emitidoPorId: pseudonimo("op-1", SEGREDO),
      emitidoPorDominio: "SALA",
      pendente: true,
      vencido: false,
    });
    expect(a.destinatarios[0]).toMatchObject({ canalNotificacao: "SISTEMA", notificadoEm: agora.toISOString() });

    avancar(10);
    const ciente = await executar("ciencia", { alertaId: salvo.id }, UNIDADE_1COB, ctx());
    expect(ciente.alerta!.situacao).toBe("CIENTE");
    expect(ciente.alerta!.destinatarios[0]).toMatchObject({
      situacaoDest: "CIENTE",
      cientePorId: pseudonimo("un-1", SEGREDO),
      cientePorDominio: "1º COB",
    });

    avancar(30);
    const emAcao = await executar(
      "registrar_acao",
      { alertaId: salvo.id, tipoAcao: "MONITORAMENTO", resultado: "EM_ANDAMENTO", acaoExecutada: "Equipe monitorando a encosta." },
      UNIDADE_1COB,
      ctx(),
    );
    expect(emAcao.acaoId).toBe("AC-20261002-0001");
    expect(emAcao.alerta!.situacao).toBe("EM_ACAO");
    expect(emAcao.alerta!.acoes[0]).toMatchObject({
      alertaId: salvo.id,
      numeroChamada: "2026-12340000-1", // copiado do alerta pelo servidor
      cob: "1º COB",
      codIbge: "3146107",
      natureza: "REAL",
      registradoPorId: pseudonimo("un-1", SEGREDO),
    });

    avancar(60);
    const registrada = await executar(
      "registrar_acao",
      {
        alertaId: salvo.id,
        tipoAcao: "VISTORIA",
        resultado: "CONCLUIDA",
        acaoExecutada: "Vistoria em 12 imóveis; 1 interditado.",
        imoveisVistoriados: 12,
        imoveisInterditados: 1,
        compdecAcionada: true,
      },
      UNIDADE_1COB,
      ctx(),
    );
    expect(registrada.acaoId).toBe("AC-20261002-0002");
    expect(registrada.alerta!).toMatchObject({ situacao: "ACAO_REGISTRADA", pendente: false });

    await esperarErro(
      executar("encerrar", { alertaId: salvo.id, alteradoEm: registrada.alerta!.alteradoEm }, UNIDADE_1COB, ctx()),
      403,
      "permissao",
    );
    avancar(5);
    const encerrado = await executar("encerrar", { alertaId: salvo.id, alteradoEm: registrada.alerta!.alteradoEm }, OPERADOR, ctx());
    expect(encerrado.alerta).toMatchObject({ situacao: "ENCERRADO", encerradoEm: agora.toISOString() });

    const historico = await repo.listarHistorico(salvo.id);
    expect(historico.map((e) => e.evento)).toEqual([
      "CRIADO",
      "ATUALIZADO",
      "EMITIDO",
      "NOTIFICADO",
      "CIENTE",
      "EM_ACAO",
      "ACAO_REGISTRADA",
      "ENCERRADO",
    ]);
    expect(historico.find((e) => e.evento === "ATUALIZADO")).toMatchObject({ camposAlterados: ["titulo"] });
    const emissao = historico.find((e) => e.evento === "EMITIDO")!;
    expect(emissao).toMatchObject({ situacaoDe: "RASCUNHO", situacaoPara: "EMITIDO", capMsgType: "Alert" });
    expect(JSON.parse(emissao.capJson!)).toMatchObject({ identifier: "BR-MG-CBMMG-SALA-AL-20261002-0001", status: "Actual" });
    expect(historico.find((e) => e.evento === "CIENTE")).toMatchObject({
      alvoTipo: "DESTINATARIO",
      situacaoDe: "EMITIDO",
      situacaoPara: "CIENTE",
      porDominio: "1º COB",
    });
    expect(historico.find((e) => e.evento === "ACAO_REGISTRADA")).toMatchObject({
      alvoTipo: "ACAO",
      alvoId: "AC-20261002-0002",
      situacaoDe: "EM_ACAO",
      situacaoPara: "ACAO_REGISTRADA",
    });
  });

  it("emitir direto (sem rascunho prévio) cria e emite numa requisição; código sequencial por dia de Brasília", async () => {
    const primeiro = await emitirOuroPreto();
    expect(primeiro.alerta!.situacao).toBe("EMITIDO");
    expect((await emitirOuroPreto()).id).toBe("AL-20261002-0002");
    // 23:30 em Brasília ainda é o dia 02; 00:30 já é o dia 03.
    agora = new Date("2026-10-03T02:30:00.000Z");
    expect(diaBrasilia(agora)).toBe("20261002");
    expect((await emitirOuroPreto({ validoAte: "2026-10-04T00:00:00.000Z" })).id).toBe("AL-20261002-0003");
    agora = new Date("2026-10-03T03:30:00.000Z");
    expect((await emitirOuroPreto({ validoAte: "2026-10-04T00:00:00.000Z" })).id).toBe("AL-20261003-0001");
  });

  it("registrar ação sem ciência prévia dá a ciência implícita", async () => {
    const { id } = await emitirOuroPreto();
    const r = await executar(
      "registrar_acao",
      { alertaId: id, tipoAcao: "ORIENTACAO", resultado: "CONCLUIDA", acaoExecutada: "Orientação porta a porta." },
      UNIDADE_1COB,
      ctx(),
    );
    expect(r.alerta!.situacao).toBe("ACAO_REGISTRADA");
    expect(r.alerta!.destinatarios[0].situacaoDest).toBe("CIENTE");
    const eventos = (await repo.listarHistorico(id)).map((e) => `${e.evento}:${e.situacaoDe}>${e.situacaoPara}`);
    expect(eventos.slice(-2)).toEqual(["CIENTE:EMITIDO>CIENTE", "ACAO_REGISTRADA:CIENTE>ACAO_REGISTRADA"]);
  });

  it("nível diferente da sugestão da matriz e município de outro COB: emitem com aviso, sem bloquear", async () => {
    const r = await emitirOuroPreto({ nivelAlerta: "vermelho", codIbge: "3170107" }); // índice 2,1 = laranja; Uberaba = 2º COB
    expect(r.alerta!.situacao).toBe("EMITIDO");
    expect(r.alerta!.cob).toBe("1º COB"); // o COB sai da fração
    expect(r.avisos.join(" ")).toMatch(/difere do sugerido pela matriz \(laranja\)/);
    expect(r.avisos.join(" ")).toMatch(/Uberaba aparece no 2º COB/);
  });

  it("destinatários adicionais (lista oficial ou COB) e lote", async () => {
    const r = await executar(
      "salvar",
      camposOuroPreto({ destinatarios: [{ cob: "1º COB" }, { fracao: "1_BBM_2CIA_1PEL_PA_Mariana_1_COB" }, { fracao: "1 BBM/2CIA/1PEL (Ouro Preto)" }] }),
      OPERADOR,
      ctx(),
    );
    expect(r.alerta!.destinatarios.map((d) => `${d.destNivel}:${d.principal}`)).toEqual(["FRACAO:true", "COB:false", "FRACAO:false"]);
    const mesmoLote = await executar("salvar", camposOuroPreto({ mesmoLoteDe: r.id, codIbge: "3140001" }), OPERADOR, ctx());
    expect(mesmoLote.alerta!.loteId).toBe(r.id);
  });
});

describe("validação no serviço", () => {
  it("emitir sem os campos E: 400 com os problemas por campo; nada muda", async () => {
    const salvo = await executar("salvar", { fracao: "1 BBM/2CIA/1PEL (Ouro Preto)" }, OPERADOR, ctx());
    const erro = await esperarErro(
      executar("emitir", { alertaId: salvo.id, alteradoEm: salvo.alerta!.alteradoEm }, OPERADOR, ctx()),
      400,
      "entrada_invalida",
    );
    expect(erro.campos!.map((c) => c.campo)).toEqual(expect.arrayContaining(["tipoRisco", "titulo", "codIbge", "validoAte"]));
    expect((await repo.obter(salvo.id))!.situacao).toBe("RASCUNHO");
  });

  it("emitir reprovado não deixa efeito colateral (nem rascunho criado, nem edição gravada)", async () => {
    await esperarErro(executar("emitir", camposOuroPreto({ titulo: null }), OPERADOR, ctx()), 400, "entrada_invalida");
    expect(repo.conteudo()).toEqual({ alertas: [], acoes: [], destinatarios: [], historico: [] });
    const salvo = await executar("salvar", camposOuroPreto(), OPERADOR, ctx());
    await esperarErro(
      executar("emitir", { alertaId: salvo.id, alteradoEm: salvo.alerta!.alteradoEm, titulo: "Novo", descricao: null }, OPERADOR, ctx()),
      400,
    );
    expect((await repo.obter(salvo.id))!.titulo).toBe("Risco alto de deslizamento");
    expect((await repo.listarHistorico(salvo.id)).map((e) => e.evento)).toEqual(["CRIADO"]);
  });

  it("território: fração fora da lista oficial ou município fora de MG → 400", async () => {
    const e1 = await esperarErro(executar("salvar", { fracao: "99 BBM (Atlântida)" }, OPERADOR, ctx()), 400);
    expect(e1.campos![0].campo).toBe("fracao");
    await esperarErro(executar("salvar", { codIbge: "3550308" }, OPERADOR, ctx()), 400); // SP
    await esperarErro(executar("salvar", { destinatarios: [{ fracao: "inexistente" }] }, OPERADOR, ctx()), 400);
  });

  it("depois de emitido, território e natureza não mudam (cancele e emita outro)", async () => {
    const r = await emitirOuroPreto();
    const e = await esperarErro(
      executar("salvar", { alertaId: r.id, alteradoEm: r.alerta!.alteradoEm, codIbge: "3140001" }, OPERADOR, ctx()),
      400,
      "campo_travado",
    );
    expect(e.campos!.map((c) => c.campo)).toEqual(["codIbge"]);
  });

  it("atualizar alerta emitido gera CAP Update; só o prazo → PRAZO_ALTERADO", async () => {
    const r = await emitirOuroPreto();
    avancar(5);
    const novoPrazo = new Date(agora.getTime() + 3 * 3_600_000).toISOString();
    const u = await executar("salvar", { alertaId: r.id, alteradoEm: r.alerta!.alteradoEm, prazoAcao: novoPrazo }, OPERADOR, ctx());
    expect(u.alerta).toMatchObject({ situacao: "EMITIDO", prazoAcao: novoPrazo, capMsgType: "Update" });
    const ultimo = (await repo.listarHistorico(r.id)).at(-1)!;
    expect(ultimo).toMatchObject({
      evento: "PRAZO_ALTERADO",
      camposAlterados: ["prazoAcao"],
      capMsgType: "Update",
      capIdentifier: `BR-MG-CBMMG-SALA-${r.id}-U1`,
    });
    expect(JSON.parse(ultimo.capJson!).references).toContain(`BR-MG-CBMMG-SALA-${r.id}`);
    // Pedido sem mudança: nada gravado, nenhum evento.
    const total = (await repo.listarHistorico(r.id)).length;
    await executar("salvar", { alertaId: r.id, alteradoEm: u.alerta!.alteradoEm, prazoAcao: novoPrazo }, OPERADOR, ctx());
    expect(await repo.listarHistorico(r.id)).toHaveLength(total);
  });
});

describe("permissões por papel e escopo de COB", () => {
  it("só o operador da Sala cria, emite, apaga, encerra e cancela", async () => {
    for (const s of [UNIDADE_1COB, LEITURA_1COB]) {
      await esperarErro(executar("salvar", camposOuroPreto(), s, ctx()), 403, "permissao");
      await esperarErro(executar("emitir", camposOuroPreto(), s, ctx()), 403, "permissao");
    }
    const r = await emitirOuroPreto();
    await esperarErro(
      executar("cancelar", { alertaId: r.id, alteradoEm: r.alerta!.alteradoEm, motivo: "Teste de permissão" }, UNIDADE_1COB, ctx()),
      403,
    );
    expect(repo.conteudo().alertas).toHaveLength(1);
  });

  it("leitura não dá ciência nem registra ação", async () => {
    const r = await emitirOuroPreto();
    await esperarErro(executar("ciencia", { alertaId: r.id }, LEITURA_1COB, ctx()), 403, "permissao");
    await esperarErro(
      executar("registrar_acao", { alertaId: r.id, tipoAcao: "VISTORIA", resultado: "CONCLUIDA", acaoExecutada: "x x x" }, LEITURA_1COB, ctx()),
      403,
      "permissao",
    );
  });

  it("unidade de outro COB: 403 na ciência e na ação; o mesmo COB passa", async () => {
    const r = await emitirOuroPreto();
    await esperarErro(executar("ciencia", { alertaId: r.id }, UNIDADE_2COB, ctx()), 403, "escopo");
    await esperarErro(
      executar("registrar_acao", { alertaId: r.id, tipoAcao: "VISTORIA", resultado: "CONCLUIDA", acaoExecutada: "x x x" }, UNIDADE_2COB, ctx()),
      403,
      "escopo",
    );
    expect((await executar("ciencia", { alertaId: r.id }, UNIDADE_1COB, ctx())).alerta!.situacao).toBe("CIENTE");
    await esperarErro(executar("ciencia", { alertaId: r.id }, UNIDADE_1COB, ctx()), 409, "ja_ciente");
  });

  it("COB destinatário (não principal) vê o alerta e dá ciência sem mudar a situação", async () => {
    const r = await emitirOuroPreto({ destinatarios: [{ cob: "5º COB" }] });
    const fila5 = await listarFila(UNIDADE_5COB, {}, ctx());
    expect(fila5.alertas.map((a) => a.alertaId)).toEqual([r.id]);
    const c = await executar("ciencia", { alertaId: r.id }, UNIDADE_5COB, ctx());
    expect(c.alerta!.situacao).toBe("EMITIDO"); // só a ciência do principal muda a situação
    expect(c.alerta!.destinatarios.find((d) => d.cob === "5º COB")!.situacaoDest).toBe("CIENTE");
  });

  it("fila: unidade e leitura veem só o próprio COB e nunca rascunho; operador vê tudo", async () => {
    await emitirOuroPreto();
    await executar("salvar", camposOuroPreto({ titulo: "Rascunho em BH" }), OPERADOR, ctx());
    await executar(
      "emitir",
      camposOuroPreto({ fracao: "8 BBM - Uberaba (Sede)", codIbge: "3170107" }),
      OPERADOR,
      ctx(),
    );
    const op = await listarFila(OPERADOR, {}, ctx());
    expect(op.alertas).toHaveLength(3);
    expect(op.capacidades.emitir).toBe(true);
    const un1 = await listarFila(UNIDADE_1COB, {}, ctx());
    expect(un1.alertas.map((a) => [a.cob, a.situacao])).toEqual([["1º COB", "EMITIDO"]]);
    expect(un1.capacidades).toMatchObject({ emitir: false, darCiencia: true, verTodosCobs: false });
    const le1 = await listarFila(LEITURA_1COB, {}, ctx());
    expect(le1.alertas).toHaveLength(1);
    const un2 = await listarFila(UNIDADE_2COB, {}, ctx());
    expect(un2.alertas.map((a) => a.cob)).toEqual(["2º COB"]);
    // Rascunho por id: invisível (404) para quem não emite; alerta de outro COB: 403.
    const rascunho = op.alertas.find((a) => a.situacao === "RASCUNHO")!;
    await esperarErro(listarFila(UNIDADE_1COB, { id: rascunho.alertaId }, ctx()), 404);
    await esperarErro(executar("ciencia", { alertaId: rascunho.alertaId }, UNIDADE_1COB, ctx()), 404);
  });

  it("sem sessão: 401 na leitura e na escrita", async () => {
    await esperarErro(listarFila(null, {}, ctx()), 401, "sessao");
    await esperarErro(executar("salvar", camposOuroPreto(), null, ctx()), 401, "sessao");
  });
});

describe("concorrência otimista e transições inválidas (409)", () => {
  it("duas pessoas editam a mesma versão: a segunda recebe 409 com a versão vencedora", async () => {
    const r = await executar("salvar", camposOuroPreto(), OPERADOR, ctx());
    const versao = r.alerta!.alteradoEm!;
    avancar(1);
    const primeira = await executar("salvar", { alertaId: r.id, alteradoEm: versao, titulo: "Versão A" }, OPERADOR, ctx());
    const erro = await esperarErro(
      executar("salvar", { alertaId: r.id, alteradoEm: versao, titulo: "Versão B" }, OPERADOR_2, ctx()),
      409,
      "conflito",
    );
    expect(erro.alteradoEmAtual).toBe(primeira.alerta!.alteradoEm);
    expect((await repo.obter(r.id))!.titulo).toBe("Versão A");
  });

  it("versão nova mesmo no mesmo milissegundo (sempre cresce)", async () => {
    const r = await executar("salvar", camposOuroPreto(), OPERADOR, ctx());
    const u = await executar("salvar", { alertaId: r.id, alteradoEm: r.alerta!.alteradoEm, titulo: "Outro" }, OPERADOR, ctx());
    expect(Date.parse(u.alerta!.alteradoEm!)).toBeGreaterThan(Date.parse(r.alerta!.alteradoEm!));
    await esperarErro(
      executar("salvar", { alertaId: r.id, alteradoEm: r.alerta!.alteradoEm, titulo: "Velho" }, OPERADOR, ctx()),
      409,
    );
  });

  it("cancelar/encerrar/ciência com versão velha → 409; transição fora da tabela → 409", async () => {
    const r = await emitirOuroPreto();
    const velha = r.alerta!.alteradoEm!;
    avancar(1);
    await executar("ciencia", { alertaId: r.id }, UNIDADE_1COB, ctx()); // muda a versão (principal)
    await esperarErro(executar("cancelar", { alertaId: r.id, alteradoEm: velha, motivo: "Motivo qualquer" }, OPERADOR, ctx()), 409, "conflito");
    await esperarErro(executar("ciencia", { alertaId: r.id, alteradoEm: velha }, UNIDADE_1COB, ctx()), 409, "conflito");
    const atual = (await repo.obter(r.id))!.alteradoEm!;
    await esperarErro(executar("encerrar", { alertaId: r.id, alteradoEm: atual }, OPERADOR, ctx()), 409, "transicao_invalida");
    await esperarErro(executar("emitir", { alertaId: r.id, alteradoEm: atual }, OPERADOR, ctx()), 409, "transicao_invalida");
    await esperarErro(executar("apagar", { alertaId: r.id, alteradoEm: atual }, OPERADOR, ctx()), 409, "transicao_invalida");
  });

  it("cancelar com motivo: CAP Cancel no histórico; rascunho não se cancela; final não sai", async () => {
    const r = await emitirOuroPreto();
    const c = await executar(
      "cancelar",
      { alertaId: r.id, alteradoEm: r.alerta!.alteradoEm, motivo: "Aviso revogado pela fonte." },
      OPERADOR,
      ctx(),
    );
    expect(c.alerta).toMatchObject({ situacao: "CANCELADO", motivoCancelamento: "Aviso revogado pela fonte.", capMsgType: "Cancel" });
    const ultimo = (await repo.listarHistorico(r.id)).at(-1)!;
    expect(ultimo).toMatchObject({ evento: "CANCELADO", capIdentifier: `BR-MG-CBMMG-SALA-${r.id}-C`, capMsgType: "Cancel" });
    expect(JSON.parse(ultimo.capJson!)).toMatchObject({ msgType: "Cancel" });
    await esperarErro(
      executar("registrar_acao", { alertaId: r.id, tipoAcao: "VISTORIA", resultado: "CONCLUIDA", acaoExecutada: "x x x" }, UNIDADE_1COB, ctx()),
      409,
      "transicao_invalida",
    );
    const rascunho = await executar("salvar", camposOuroPreto(), OPERADOR, ctx());
    const e = await esperarErro(
      executar("cancelar", { alertaId: rascunho.id, alteradoEm: rascunho.alerta!.alteradoEm, motivo: "Não precisa mais" }, OPERADOR, ctx()),
      409,
    );
    expect(e.message).toMatch(/apague/);
  });

  it("apagar rascunho: some da fila, a trilha fica e o número não é reaproveitado", async () => {
    const r = await executar("salvar", camposOuroPreto(), OPERADOR, ctx());
    const apagado = await executar("apagar", { alertaId: r.id, alteradoEm: r.alerta!.alteradoEm }, OPERADOR, ctx());
    expect(apagado).toMatchObject({ id: r.id, alerta: null });
    expect(await repo.obter(r.id)).toBeNull();
    expect(repo.conteudo().destinatarios).toHaveLength(0);
    expect((await repo.listarHistorico(r.id)).map((e) => e.evento)).toEqual(["CRIADO", "APAGADO"]);
    expect((await executar("salvar", camposOuroPreto(), OPERADOR, ctx())).id).toBe("AL-20261002-0002");
  });
});

describe("LGPD: autoria só por pseudônimo", () => {
  it("nenhum CPF, nome ou nº BM no que é gravado; pseudônimo = HMAC do identificador", async () => {
    const cpf = "12345678901";
    const comDados = sessao("operador-sala", {
      escopoGlobal: true,
      grupos: ["SALA"],
      usuarioId: cpf, // mesmo que a sessão trouxesse o CPF por engano, ele não chega à feição
      nome: "Fulano de Tal",
      posto: "Sgt",
      bm: "123456-7",
    });
    const unidade = sessao("unidade", { cobs: ["1º COB"], usuarioId: "98765432100", nome: "Beltrana Silva", bm: "765432-1" });
    const r = await executar("emitir", camposOuroPreto(), comDados, ctx());
    await executar("ciencia", { alertaId: r.id, observacao: "Ciente pelo rádio." }, unidade, ctx());
    await executar(
      "registrar_acao",
      { alertaId: r.id, tipoAcao: "VISTORIA", resultado: "CONCLUIDA", acaoExecutada: "Vistoria feita." },
      unidade,
      ctx(),
    );
    const gravado = JSON.stringify(repo.conteudo());
    for (const proibido of [cpf, "98765432100", "Fulano", "Beltrana", "123456-7", "765432-1", "Sgt"]) {
      expect(gravado).not.toContain(proibido);
    }
    expect(gravado).not.toMatch(/(?<!\d)\d{11}(?!\d)/); // nada com cara de CPF
    const alerta = repo.conteudo().alertas[0].attributes;
    expect(alerta.criado_por_id).toBe(pseudonimo(cpf, SEGREDO));
    expect(alerta.criado_por_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("pseudônimos de OUTRAS pessoas só para o operador; o próprio aparece", async () => {
    const r = await emitirOuroPreto();
    await executar(
      "registrar_acao",
      { alertaId: r.id, tipoAcao: "VISTORIA", resultado: "CONCLUIDA", acaoExecutada: "Vistoria feita." },
      UNIDADE_1COB,
      ctx(),
    );
    const daUnidade = (await listarFila(UNIDADE_1COB, { id: r.id }, ctx())).alertas[0];
    expect(daUnidade.criadoPorId).toBeNull();
    expect(daUnidade.emitidoPorId).toBeNull();
    expect(daUnidade.acoes[0].registradoPorId).toBe(pseudonimo("un-1", SEGREDO)); // o próprio
    expect(daUnidade.historico!.filter((e) => e.porId !== null).every((e) => e.porId === pseudonimo("un-1", SEGREDO))).toBe(true);
    const doOperador = (await listarFila(OPERADOR, { id: r.id }, ctx())).alertas[0];
    expect(doOperador.criadoPorId).toBe(pseudonimo("op-1", SEGREDO));
    expect(doOperador.acoes[0].registradoPorId).toBe(pseudonimo("un-1", SEGREDO));
    expect((await listarFila(UNIDADE_1COB, {}, ctx())).perfil.pseudonimo).toBe(pseudonimo("un-1", SEGREDO));
  });

  it("sem SALA_PSEUDO_SEGREDO não grava (503)", async () => {
    await esperarErro(executar("salvar", camposOuroPreto(), OPERADOR, { repositorio: repo, agora, segredo: null }), 503, "configuracao");
  });
});

describe("leitura da fila: estados derivados, resumo e filtros", () => {
  it("vencido primeiro; resumo por situação, pendentes e vencidos; filtros PENDENTE/VENCIDO; contagem", async () => {
    const vencido = await emitirOuroPreto({ nivelAlerta: "laranja" }); // prazo +6 h
    avancar(7 * 60);
    const recente = await emitirOuroPreto({ fracao: "8 BBM - Uberaba (Sede)", codIbge: "3170107" });
    await executar("salvar", camposOuroPreto(), OPERADOR, ctx());
    const fila = await listarFila(OPERADOR, {}, ctx());
    expect(fila.alertas.map((a) => a.alertaId)).toEqual([vencido.id, recente.id, "AL-20261002-0003"]);
    expect(fila.alertas[0]).toMatchObject({ pendente: true, vencido: true });
    expect(fila.resumo).toMatchObject({ total: 3, pendentes: 2, vencidos: 1 });
    expect(fila.resumo.porSituacao).toMatchObject({ EMITIDO: 2, RASCUNHO: 1, ENCERRADO: 0 });
    expect((await listarFila(OPERADOR, { situacoes: ["VENCIDO"] }, ctx())).alertas.map((a) => a.alertaId)).toEqual([vencido.id]);
    expect((await listarFila(OPERADOR, { situacoes: ["PENDENTE"] }, ctx())).alertas).toHaveLength(2);
    expect((await listarFila(OPERADOR, { cob: "2º COB" }, ctx())).alertas.map((a) => a.alertaId)).toEqual([recente.id]);
    expect((await listarFila(OPERADOR, { tipo: "METEOROLOGICO" }, ctx())).alertas).toEqual([]);
    const contagem = await listarFila(OPERADOR, { so: "contagem" }, ctx());
    expect(contagem.alertas).toEqual([]);
    expect(contagem.resumo.total).toBe(3);
    expect(contagem.perfil).toMatchObject({ papel: "operador-sala", rotulo: "Operador da Sala", escopoGlobal: true });
  });
});

describe("armazéns", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    reiniciarEnv();
    reiniciarAlertas();
  });

  it("ArcGIS: só lê (/query); TODA escrita responde 503 'escrita desligada' — sem applyEdits", async () => {
    const urls: string[] = [];
    const arcgis = criarRepositorioArcgis({
      baseServicos: "https://exemplo.invalido/server/rest/services/Hosted",
      consultar: async (url) => {
        urls.push(url);
        return { features: [] };
      },
    });
    const e = await esperarErro(executar("salvar", camposOuroPreto(), OPERADOR, { repositorio: arcgis, agora, segredo: SEGREDO }), 503, "escrita_desligada");
    expect(e.message).toMatch(/Escrita no ArcGIS desligada nesta fase/);
    expect(urls.every((u) => u.endsWith("/SalaSituacao_AlertasRRD/FeatureServer/0"))).toBe(true);
    for (const escrita of [
      () => arcgis.atualizar({} as never, null),
      () => arcgis.criarAcao({} as never),
      () => arcgis.acrescentarHistorico([]),
      () => arcgis.atualizarDestinatario({} as never),
      () => arcgis.substituirDestinatarios("AL-20261002-0001", []),
      () => arcgis.apagarRascunho("AL-20261002-0001", null),
    ]) {
      await expect(escrita()).rejects.toThrow(/desligada/);
    }
    const fonte = readFileSync(new URL("../lib/alertas/arcgis.ts", import.meta.url), "utf8");
    expect(fonte.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")).not.toMatch(/applyEdits|addFeatures|updateFeatures|deleteFeatures/);
    expect((await listarFila(OPERADOR, {}, { repositorio: arcgis, agora, segredo: SEGREDO })).alertas).toEqual([]);
  });

  it("memória em produção é recusada (503); no modo exemplo vem semeada", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    vi.stubEnv("NODE_ENV", "production");
    reiniciarEnv();
    expect(() => obterRepositorioAlertas()).toThrow(/não configurado/);
    vi.stubEnv("ALERTAS_ARMAZEM", "postgres");
    vi.stubEnv("DATABASE_URL", "");
    reiniciarEnv();
    expect(() => obterRepositorioAlertas()).toThrow(/DATABASE_URL/);
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    const exemplo = obterRepositorioAlertas(AGORA);
    expect(exemplo.tipo).toBe("memoria");
    expect((await exemplo.listar({ cobs: null, incluirRascunhos: true }, 100)).alertas).toHaveLength(10);
  });
});
