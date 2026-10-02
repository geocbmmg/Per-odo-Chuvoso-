import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquemaCamposAlerta } from "@/lib/alertas/dominio";
import { atributosParaEvento } from "@/lib/alertas/feicao";
import { criarRepositorioMemoria, type RepositorioMemoria } from "@/lib/alertas/memoria";
import { executar, type ContextoServico } from "@/lib/alertas/servico";
import type { PapelSala, Sessao } from "@/lib/auth/tipos";
import { criarArmazemEmCamadas } from "@/lib/fontes/armazem-servidor";
import {
  criarArmazemMemoria,
  definirArmazem,
  obterLeitura,
  reiniciarLeituras,
  type ArmazemLeituras,
  type LeituraGuardada,
} from "@/lib/fontes/leituras";
import { interpretarAvisosAtivosInmet } from "@/lib/sources/inmet/parser-ativos";
import { inicioDaJanela, resumirCacheChuva } from "@/lib/sources/open-meteo/parser-municipios";

/*
 * Regressões dos achados da revisão adversarial da Fase 1. Cada teste
 * reproduz o cenário do achado e prova a correção.
 */

describe("INMET: cancelamento é uma versão nova do mesmo aviso", () => {
  const aviso = (extra: Record<string, unknown>) => ({
    id: 100,
    id_aviso: 50,
    id_sequencia: 1,
    descricao: "Chuvas Intensas",
    severidade: "Perigo",
    inicio: "2026-10-02 08:00",
    fim: "2026-10-03 23:59",
    geocodes: "3106200",
    municipios: "Belo Horizonte - MG (3106200)",
    encerrado: false,
    ...extra,
  });

  it("versão nova encerrada apaga a versão antiga do mapa", () => {
    const r = interpretarAvisosAtivosInmet({
      hoje: [aviso({}), aviso({ id: 101, id_sequencia: 2, encerrado: true, alterado: true })],
    });
    expect(r.avisos).toEqual([]);
    expect(r.descartados.encerrados).toBe(2);
  });

  it("versão antiga encerrada não derruba a versão nova vigente", () => {
    const r = interpretarAvisosAtivosInmet({
      hoje: [aviso({ encerrado: true }), aviso({ id: 101, id_sequencia: 2 })],
    });
    expect(r.avisos.map((a) => a.id)).toEqual(["101"]);
  });
});

describe("Open-Meteo: relógio desta instância atrás do da que gravou o cache", () => {
  const cache = {
    primeiraHoraIso: "2026-10-02T16:00:00.000Z",
    offsetSegundos: -10800,
    modelo: "best_match",
    series: { "3106200": Array.from({ length: 100 }, () => 1) },
  };

  it("meio segundo antes da hora cheia não zera a janela", () => {
    const tarde = inicioDaJanela(cache, new Date("2026-10-02T14:59:59.500Z"));
    expect(tarde.indice).toBe(0);
    expect(tarde.inicioJanela).toBe("2026-10-02T15:00:00.000Z");
    const resumo = resumirCacheChuva(cache, ["3106200"], new Date("2026-10-02T14:59:59.500Z"));
    expect(resumo.municipios[0].acumulado24h).toBe(24);
    expect(resumo.municipios[0].nivel24h).toBe("verde");
  });

  it("na hora certa, o índice segue o relógio", () => {
    expect(inicioDaJanela(cache, new Date("2026-10-02T15:00:00.100Z")).indice).toBe(0);
    expect(inicioDaJanela(cache, new Date("2026-10-02T17:30:00.000Z")).indice).toBe(2);
  });
});

describe("Armazém em camadas: instância quente aproveita a renovação de outra", () => {
  afterEach(() => reiniciarLeituras());

  function armazemFalso(inicial: Record<string, LeituraGuardada> = {}) {
    const dados = new Map(Object.entries(inicial));
    const armazem: ArmazemLeituras = {
      ler: vi.fn(async (chave: string) => dados.get(chave)),
      gravar: vi.fn(async (chave: string, leitura: LeituraGuardada) => {
        dados.set(chave, leitura);
      }),
    };
    return { armazem, dados };
  }

  it("memória vencida + Postgres mais novo → usa o Postgres sem consultar a fonte", async () => {
    const agora = new Date("2026-10-02T15:02:00.000Z");
    const memoria = criarArmazemMemoria();
    // Leitura antiga desta instância (3 h e pouco atrás: vencida para a chuva, ttl 3 h).
    await memoria.gravar("open-meteo-municipios:sedes", { dados: "velha", atualizadoEm: "2026-10-02T11:00:00.000Z" });
    const persistente = armazemFalso({
      "open-meteo-municipios:sedes": { dados: "nova (outra instância)", atualizadoEm: "2026-10-02T15:01:00.000Z" },
    });
    definirArmazem(criarArmazemEmCamadas(memoria, persistente.armazem));
    const fonte = vi.fn(async () => "fresquíssima");

    const leitura = await obterLeitura("open-meteo-municipios", "sedes", fonte, { agora: () => agora });
    expect(leitura).toMatchObject({ origem: "cache", dados: "nova (outra instância)" });
    expect(fonte).not.toHaveBeenCalled();
    expect(persistente.armazem.ler).toHaveBeenCalledTimes(1);
    // A cópia local foi atualizada: a próxima leitura nem toca o Postgres.
    await obterLeitura("open-meteo-municipios", "sedes", fonte, { agora: () => agora });
    expect(persistente.armazem.ler).toHaveBeenCalledTimes(1);
  });

  it("memória vencida e Postgres igualmente velho → consulta a fonte", async () => {
    const agora = new Date("2026-10-02T15:02:00.000Z");
    const memoria = criarArmazemMemoria();
    await memoria.gravar("inmet-avisos:rss", { dados: "velha", atualizadoEm: "2026-10-02T11:00:00.000Z" });
    const persistente = armazemFalso({ "inmet-avisos:rss": { dados: "velha", atualizadoEm: "2026-10-02T11:00:00.000Z" } });
    definirArmazem(criarArmazemEmCamadas(memoria, persistente.armazem));
    const fonte = vi.fn(async () => "nova");
    const leitura = await obterLeitura("inmet-avisos", "rss", fonte, { agora: () => agora });
    expect(leitura).toMatchObject({ origem: "ao-vivo", dados: "nova" });
    expect(fonte).toHaveBeenCalledTimes(1);
  });

  it("memória dentro do ttl não consulta o Postgres", async () => {
    const agora = new Date("2026-10-02T15:02:00.000Z");
    const memoria = criarArmazemMemoria();
    await memoria.gravar("inmet-avisos:rss", { dados: "recente", atualizadoEm: "2026-10-02T15:00:00.000Z" });
    const persistente = armazemFalso();
    definirArmazem(criarArmazemEmCamadas(memoria, persistente.armazem));
    const leitura = await obterLeitura("inmet-avisos", "rss", async () => "x", { agora: () => agora });
    expect(leitura.dados).toBe("recente");
    expect(persistente.armazem.ler).not.toHaveBeenCalled();
  });
});

describe("Alertas: texto com < e > conta o tamanho gravado", () => {
  it("descrição que só cabe antes de escrever os sinais por extenso é recusada", () => {
    const base = "x".repeat(3990);
    expect(esquemaCamposAlerta.safeParse({ descricao: `${base} < 500` }).success).toBe(false);
    expect(esquemaCamposAlerta.safeParse({ descricao: `${base} 500` }).success).toBe(true);
    expect(esquemaCamposAlerta.safeParse({ descricao: "cota < 500 cm e acumulado > 90 mm" }).success).toBe(true);
  });
});

describe("Alertas: histórico tolera evento gravado por uma versão futura", () => {
  it("evento desconhecido não derruba a linha do tempo", () => {
    const evento = atributosParaEvento({
      objectid: 1,
      alerta_id: "AL-20261102-0003",
      alvo_tipo: "DESTINATARIO",
      alvo_id: "7",
      evento: "REDIRECIONADO",
      quando: Date.parse("2026-11-02T12:00:00Z"),
      por_dominio: "SALA",
    });
    expect(evento.evento).toBe("REDIRECIONADO");
    expect(evento.alvoTipo).toBe("DESTINATARIO");
  });
});

describe("Alertas: ação de unidade só notificada e ordem gravação", () => {
  const AGORA = new Date("2026-10-02T15:00:00.000Z");
  const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";
  const sessao = (papel: PapelSala, extra: Partial<Sessao> = {}): Sessao => ({
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
  });
  const OPERADOR = sessao("operador-sala", { escopoGlobal: true, grupos: ["SALA"], usuarioId: "op-1" });
  const UNIDADE_1COB = sessao("unidade", { cobs: ["1º COB"], unidade: "1BBM (BELO HORIZONTE)", usuarioId: "un-1" });
  const UNIDADE_5COB = sessao("unidade", { cobs: ["5º COB"], unidade: "6BBM (GOVERNADOR VALADARES)", usuarioId: "un-5" });

  let repo: RepositorioMemoria;
  const ctx = (): Partial<ContextoServico> => ({ repositorio: repo, agora: AGORA, segredo: SEGREDO });
  const campos = (extra: Record<string, unknown> = {}) => ({
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
  });
  const acao = (alertaId: string) => ({
    alertaId,
    tipoAcao: "VISTORIA",
    resultado: "CONCLUIDA",
    acaoExecutada: "Vistoria concluída.",
  });

  beforeEach(() => {
    repo = criarRepositorioMemoria();
  });

  it("unidade de outro COB, só notificada, registra apoio sem mudar a situação", async () => {
    const emitido = await executar("emitir", campos({ destinatarios: [{ cob: "5º COB" }] }), OPERADOR, ctx());
    const r = await executar("registrar_acao", acao(emitido.id), UNIDADE_5COB, ctx());
    expect(r.alerta!.situacao).toBe("EMITIDO");
    expect(r.alerta!.pendente).toBe(true);
    expect(r.alerta!.acoes).toHaveLength(1);
    expect(r.avisos.join(" ")).toMatch(/apoio/);
    const historico = await repo.listarHistorico(emitido.id);
    expect(historico.at(-1)).toMatchObject({ evento: "ACAO_REGISTRADA", situacaoDe: null, situacaoPara: null });
    expect(historico.at(-1)!.detalhe).toMatch(/apoio/);
    // A unidade principal continua podendo dar ciência e avançar.
    const ciente = await executar("ciencia", { alertaId: emitido.id }, UNIDADE_1COB, ctx());
    expect(ciente.alerta!.situacao).toBe("CIENTE");
  });

  it("unidade do COB principal avança a situação (ciência implícita + ação registrada)", async () => {
    const emitido = await executar("emitir", campos(), OPERADOR, ctx());
    const r = await executar("registrar_acao", acao(emitido.id), UNIDADE_1COB, ctx());
    expect(r.alerta!.situacao).toBe("ACAO_REGISTRADA");
    expect(r.avisos).toEqual([]);
  });

  it("falha ao gravar a situação deixa o alerta pendente COM a ação registrada", async () => {
    const emitido = await executar("emitir", campos(), OPERADOR, ctx());
    const original = repo.atualizar.bind(repo);
    const atualizar = vi.spyOn(repo, "atualizar").mockImplementationOnce(async () => {
      throw new Error("banco indisponível");
    });
    await expect(executar("registrar_acao", acao(emitido.id), UNIDADE_1COB, ctx())).rejects.toThrow();
    atualizar.mockRestore();
    repo.atualizar = original;
    const atual = await repo.obter(emitido.id);
    expect(atual!.situacao).toBe("EMITIDO");
    expect(await repo.listarAcoes([emitido.id])).toHaveLength(1);
  });

  it("nº da chamada CAD não muda depois de emitido", async () => {
    const emitido = await executar("emitir", campos(), OPERADOR, ctx());
    await expect(
      executar("salvar", { alertaId: emitido.id, alteradoEm: emitido.alerta!.alteradoEm, numeroChamada: "2026-99999999-9" }, OPERADOR, ctx()),
    ).rejects.toMatchObject({ motivo: "campo_travado" });
  });
});
