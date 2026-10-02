import { readFileSync } from "node:fs";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  CANAIS_NOTIFICACAO,
  CAP_CERTEZAS,
  CAP_ESCOPOS,
  CAP_MSG_TYPES,
  CAP_RESPOSTAS,
  CAP_URGENCIAS,
  COBS_FEICAO,
  EVENTOS,
  FONTES_GATILHO,
  NATUREZAS,
  NIVEIS_ALERTA,
  NIVEIS_DESTINATARIO,
  NIVEL_PARA_SEVERIDADE,
  ORIGENS_REGISTRO,
  RESULTADOS_ACAO,
  SIM_NAO,
  SITUACOES,
  SITUACOES_DESTINATARIO,
  TIPOS_ACAO,
  TIPOS_RISCO_SALA,
  type Opcao,
} from "@/lib/alertas/codigos";
import { fracaoDoTerritorio, PRAZO_PADRAO_HORAS, type AcaoRrdSala, type AlertaSala, type Destinatario, type EventoHistorico } from "@/lib/alertas/dominio";
import { conteudoExemplo, REFERENCIA_ALERTAS_EXEMPLO } from "@/lib/alertas/exemplos";
import {
  acaoParaFeicao,
  alertaParaFeicao,
  atributosParaDestinatario,
  atributosParaEvento,
  CAMADAS_SALA,
  camposDaCamada,
  destinatarioParaAtributos,
  ErroFeicao,
  eventoParaAtributos,
  feicaoParaAcao,
  feicaoParaAlerta,
  NIVEIS_FEICAO_NA_ORDEM,
  textoSeguro,
  type CamadaSala,
} from "@/lib/alertas/feicao";
import { atributosParaLinha, feicaoParaLinha, linhaParaFeicao } from "@/lib/alertas/postgres";
import { NIVEIS_RISCO } from "@/lib/dominio/matrizes";
import { salaAcoesRrd, salaAlertas, salaAlertasDestinatarios, salaAlertasHistorico } from "@/lib/db/schema";
import { municipioPorIbge } from "@/lib/territorio/municipios";

// ---------------------------------------------------------------------------------------------
// Leitura do script de criação das camadas (parse simples, por regex)
// ---------------------------------------------------------------------------------------------

const SCRIPT = readFileSync(new URL("../scripts/arcgis/criar_camadas_sala.py", import.meta.url), "utf8");

type TipoScript = "txt" | "data" | "dbl" | "inteiro";
interface CampoScript {
  tipo: TipoScript;
  tamanho: number | null;
}

/** Constantes de tamanho: "T_ID, T_PSEUDO, T_DOMINIO = 40, 64, 60". */
function constantesDeTamanho(): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const m of SCRIPT.matchAll(/^(T_[A-Z_]+(?:,\s*T_[A-Z_]+)*)\s*=\s*([\d,\s]+)$/gm)) {
    const nomes = m[1].split(",").map((s) => s.trim());
    const valores = m[2].split(",").map((s) => Number(s.trim()));
    nomes.forEach((n, i) => mapa.set(n, valores[i]));
  }
  return mapa;
}
const TAMANHOS = constantesDeTamanho();

function camposDoTrecho(trecho: string): Map<string, CampoScript> {
  const campos = new Map<string, CampoScript>();
  for (const m of trecho.matchAll(/\b(txt|data|dbl|inteiro)\("([a-z0-9_]+)",\s*"[^"]*"(?:,\s*([A-Z_0-9]+))?/g)) {
    const tipo = m[1] as TipoScript;
    const bruto = m[3];
    const tamanho = tipo !== "txt" || !bruto ? null : /^\d+$/.test(bruto) ? Number(bruto) : (TAMANHOS.get(bruto) ?? NaN);
    campos.set(m[2], { tipo, tamanho });
  }
  return campos;
}

/** Trecho do script entre dois marcadores. */
function entre(inicio: string, fim: string): string {
  const i = SCRIPT.indexOf(inicio);
  const j = SCRIPT.indexOf(fim, i + inicio.length);
  expect(i, `marcador ${inicio}`).toBeGreaterThanOrEqual(0);
  expect(j, `marcador ${fim}`).toBeGreaterThan(i);
  return SCRIPT.slice(i, j);
}

const CAMPOS_TERRITORIO = camposDoTrecho(entre("def territorio(sigla):", "# ===="));

/** Trecho do script de cada camada (do `_base(` dela até o da próxima). */
const TRECHOS: Record<CamadaSala, string> = {
  Sala_Alertas: entre("SALA_ALERTAS = _base(", "SALA_ACOES = _base("),
  Sala_Acoes_RRD: entre("SALA_ACOES = _base(", "SALA_DESTINATARIOS = _base("),
  Sala_Alertas_Destinatarios: entre("SALA_DESTINATARIOS = _base(", "SALA_HISTORICO = _base("),
  Sala_Alertas_Historico: entre("SALA_HISTORICO = _base(", "SALA_TERRITORIO = _base("),
};

function camposDaCamadaNoScript(trecho: string): Map<string, CampoScript> {
  const campos = camposDoTrecho(trecho);
  if (/\+\s*territorio\("/.test(trecho)) for (const [k, v] of CAMPOS_TERRITORIO) campos.set(k, v);
  return campos;
}

const SCRIPT_POR_CAMADA = Object.fromEntries(
  CAMADAS_SALA.map((c) => [c, camposDaCamadaNoScript(TRECHOS[c])]),
) as Record<CamadaSala, Map<string, CampoScript>>;

/** Lista Python `NOME = [("CODIGO", "Rótulo"), ...]`. */
function listaDoScript(nome: string): { codigo: string; rotulo: string }[] {
  const m = SCRIPT.match(new RegExp(`^${nome}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:#.*)?$`, "m"));
  expect(m, `lista ${nome} no script`).not.toBeNull();
  return [...m![1].matchAll(/\(\s*"([^"]*)",\s*"([^"]*)"\s*\)/g)].map((p) => ({ codigo: p[1], rotulo: p[2] }));
}

function dicionarioDoScript(nome: string): Record<string, string> {
  const m = SCRIPT.match(new RegExp(`^${nome}\\s*=\\s*\\{([\\s\\S]*?)\\}`, "m"));
  expect(m, `dicionário ${nome} no script`).not.toBeNull();
  return Object.fromEntries([...m![1].matchAll(/"([A-Z_]+)":\s*"?([A-Za-z0-9]+)"?/g)].map((p) => [p[1], p[2]]));
}

const TIPO_ESPERADO: Record<string, TipoScript> = { texto: "txt", data: "data", double: "dbl", inteiro: "inteiro" };

// ---------------------------------------------------------------------------------------------
// Esquema × código
// ---------------------------------------------------------------------------------------------

describe("feição × script das camadas (os dois não podem divergir)", () => {
  it("o parse do script achou as quatro camadas com campos", () => {
    expect(TAMANHOS.get("T_ID")).toBe(40);
    expect(TAMANHOS.get("T_MUN")).toBe(120);
    for (const camada of CAMADAS_SALA) expect(SCRIPT_POR_CAMADA[camada].size).toBeGreaterThan(10);
    expect(SCRIPT_POR_CAMADA.Sala_Alertas.has("cod_ibge")).toBe(true); // veio do territorio("al")
  });

  for (const camada of CAMADAS_SALA) {
    it(`${camada}: todo campo produzido existe no script, com o mesmo tipo e tamanho`, () => {
      const script = SCRIPT_POR_CAMADA[camada];
      for (const campo of camposDaCamada(camada)) {
        const noScript = script.get(campo.nome);
        expect(noScript, `${camada}.${campo.nome} não existe no script`).toBeDefined();
        expect(noScript!.tipo, `${camada}.${campo.nome}`).toBe(TIPO_ESPERADO[campo.tipo]);
        if (campo.tipo === "texto") expect(noScript!.tamanho, `${camada}.${campo.nome}`).toBe(campo.tamanho);
      }
    });

    it(`${camada}: todo campo do script é produzido (nada fica para trás)`, () => {
      const produzidos = new Set(camposDaCamada(camada).map((c) => c.nome));
      const faltando = [...SCRIPT_POR_CAMADA[camada].keys()].filter((n) => !produzidos.has(n));
      expect(faltando).toEqual([]);
    });
  }

  it("as feições de exemplo e as produzidas só têm campos do script (+ objectid)", () => {
    const conteudo = conteudoExemplo(new Date(REFERENCIA_ALERTAS_EXEMPLO));
    const conferir = (camada: CamadaSala, atributos: Record<string, unknown>) => {
      for (const nome of Object.keys(atributos)) {
        if (nome === "objectid") continue;
        expect(SCRIPT_POR_CAMADA[camada].has(nome), `${camada}.${nome}`).toBe(true);
      }
    };
    conteudo.alertas.forEach((f) => conferir("Sala_Alertas", f.attributes));
    conteudo.acoes.forEach((f) => conferir("Sala_Acoes_RRD", f.attributes));
    conteudo.destinatarios.forEach((d) => conferir("Sala_Alertas_Destinatarios", d));
    conteudo.historico.forEach((h) => conferir("Sala_Alertas_Historico", h));
  });

  const LISTAS: [string, readonly Opcao<string>[]][] = [
    ["SITUACOES", SITUACOES],
    ["NATUREZAS", NATUREZAS],
    ["TIPOS_RISCO", TIPOS_RISCO_SALA],
    ["NIVEIS", NIVEIS_ALERTA],
    ["ORIGENS_REGISTRO", ORIGENS_REGISTRO],
    ["FONTES_GATILHO", FONTES_GATILHO],
    ["CAP_MSG_TYPES", CAP_MSG_TYPES],
    ["CAP_ESCOPOS", CAP_ESCOPOS],
    ["CAP_URGENCIAS", CAP_URGENCIAS],
    ["CAP_CERTEZAS", CAP_CERTEZAS],
    ["CAP_RESPOSTAS", CAP_RESPOSTAS],
    ["TIPOS_ACAO", TIPOS_ACAO],
    ["RESULTADOS", RESULTADOS_ACAO],
    ["SIM_NAO", SIM_NAO],
    ["NIVEIS_DEST", NIVEIS_DESTINATARIO],
    ["SITUACOES_DEST", SITUACOES_DESTINATARIO],
    ["CANAIS", CANAIS_NOTIFICACAO],
  ];
  for (const [nome, lista] of LISTAS) {
    it(`domínio ${nome}: mesmos códigos e rótulos do script`, () => {
      expect(lista.map((o) => ({ codigo: o.codigo, rotulo: o.rotulo }))).toEqual(listaDoScript(nome));
    });
  }

  it("EVENTOS: código, rótulo, grupo, COBRADE e categoria CAP iguais ao script (segunda cópia assumida)", () => {
    const m = SCRIPT.match(/^EVENTOS\s*=\s*\[([\s\S]*?)^\]/m);
    expect(m).not.toBeNull();
    const doScript = [
      ...m![1].matchAll(/\(\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"\s*\)/g),
    ].map((p) => ({ codigo: p[1], rotulo: p[2], grupo: p[3] || null, cobrade: p[4] || null, categoriaCap: p[5] }));
    expect(EVENTOS.map((e) => ({ ...e }))).toEqual(doScript);
  });

  it("COBs do domínio: 1º a 6º COB, código igual ao rótulo", () => {
    expect(SCRIPT).toMatch(/COBS = \[\("\{\}º COB"\.format\(n\), "\{\}º COB"\.format\(n\)\) for n in range\(1, 7\)\]/);
    expect([...COBS_FEICAO]).toEqual(["1º COB", "2º COB", "3º COB", "4º COB", "5º COB", "6º COB"]);
  });

  it("prazo padrão e severidade CAP por nível iguais ao script", () => {
    const prazos = dicionarioDoScript("PRAZO_PADRAO_HORAS");
    const severidades = dicionarioDoScript("NIVEL_PARA_SEVERIDADE");
    for (const n of NIVEIS_ALERTA) {
      expect(PRAZO_PADRAO_HORAS[n.nivel], n.codigo).toBe(Number(prazos[n.codigo]));
      expect(NIVEL_PARA_SEVERIDADE[n.nivel], n.codigo).toBe(severidades[n.codigo]);
    }
    expect(NIVEIS_FEICAO_NA_ORDEM).toEqual(NIVEIS_RISCO.map((n) => n.toUpperCase()));
  });

  const TABELAS: [CamadaSala, PgTable][] = [
    ["Sala_Alertas", salaAlertas],
    ["Sala_Acoes_RRD", salaAcoesRrd],
    ["Sala_Alertas_Destinatarios", salaAlertasDestinatarios],
    ["Sala_Alertas_Historico", salaAlertasHistorico],
  ];
  const TIPO_COLUNA: Record<string, TipoScript> = {
    PgVarchar: "txt",
    PgBigInt53: "data",
    PgDoublePrecision: "dbl",
    PgInteger: "inteiro",
  };
  for (const [camada, tabela] of TABELAS) {
    it(`Postgres ${getTableConfig(tabela).name}: colunas = campos da feição (mesmo nome, tipo e tamanho)`, () => {
      const config = getTableConfig(tabela);
      const script = SCRIPT_POR_CAMADA[camada];
      const colunas = config.columns.filter((c) => !["objectid", "x", "y"].includes(c.name));
      expect(colunas.map((c) => c.name).sort()).toEqual([...script.keys()].sort());
      for (const c of colunas) {
        const campo = script.get(c.name)!;
        expect(TIPO_COLUNA[c.columnType], c.name).toBe(campo.tipo);
        if (campo.tipo === "txt") expect((c as unknown as { length?: number }).length, c.name).toBe(campo.tamanho);
      }
      // Os índices do script também existem (mesmo nome).
      const indicesScript = [...TRECHOS[camada].matchAll(/idx\("([a-z_]+)"/g)].map((m) => m[1]);
      expect(indicesScript.length).toBeGreaterThan(0);
      for (const nome of indicesScript) expect(config.indexes.map((i) => i.config.name), nome).toContain(nome);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Conversão ida e volta
// ---------------------------------------------------------------------------------------------

function alertaCompleto(): AlertaSala {
  return {
    objectid: 7,
    alertaId: "AL-20261002-0042",
    loteId: "AL-20261002-0041",
    situacao: "CIENTE",
    natureza: "REAL",
    origemRegistro: "SALA",
    fonteGatilho: "CEMADEN",
    fonteRef: "CEMADEN — alerta 123",
    tipoRisco: "GEOLOGICO",
    evento: "DESLIZAMENTO",
    nivelAlerta: "vermelho",
    numeroChamada: "2026-12340000-1",
    mmHora: 12.5,
    mm24h: 80,
    bacia: "Rio das Velhas",
    rio: "Ribeirão Arrudas",
    cota: 310,
    estacaoCodigo: "41180000",
    indiceRisco: 2.7,
    cob: "1º COB",
    ueop: "1º BBM",
    fracao: "2ª Cia/1º Pel (Ouro Preto)",
    municipio: "Ouro Preto",
    codIbge: "3146107",
    localReferencia: "Morro da Queimada",
    titulo: "Risco muito alto de deslizamento",
    descricao: "Índice 2,7 após 80 mm em 24 h.\nEncostas com histórico.",
    instrucao: "Vistoriar e orientar moradores.",
    areaDesc: "Ouro Preto/MG — Morro da Queimada",
    capIdentifier: "BR-MG-CBMMG-SALA-AL-20261002-0042",
    capMsgType: "Alert",
    capEscopo: "Restricted",
    capUrgencia: "Expected",
    capCerteza: "Likely",
    capResposta: "Assess",
    dataEmissao: "2026-10-02T13:00:00.000Z",
    inicioVigencia: "2026-10-02T13:00:00.000Z",
    validoAte: "2026-10-03T13:00:00.000Z",
    prazoAcao: "2026-10-02T15:00:00.000Z",
    encerradoEm: null,
    motivoCancelamento: null,
    idOp: null,
    criadoPorId: "3f6c1a9e0b7d4f2a8c5e1b3d7f9a0c2e",
    criadoEm: "2026-10-02T12:50:00.000Z",
    emitidoPorId: "3f6c1a9e0b7d4f2a8c5e1b3d7f9a0c2e",
    emitidoPorDominio: "SALA",
    alteradoPorId: "c7a3e9f15b2d4086a1c3e5f7b9d0284f",
    alteradoEm: "2026-10-02T13:20:00.123Z",
    longitude: -43.5047,
    latitude: -20.3858,
  };
}

describe("conversão alerta ↔ feição (pura)", () => {
  it("alerta: ida e volta sem perda; datas em epoch ms; nível em código do domínio", () => {
    const alerta = alertaCompleto();
    const feicao = alertaParaFeicao(alerta);
    expect(feicao.attributes.data_emissao).toBe(Date.parse("2026-10-02T13:00:00.000Z"));
    expect(feicao.attributes.alterado_em).toBe(Date.parse("2026-10-02T13:20:00.123Z"));
    expect(feicao.attributes.nivel_alerta).toBe("VERMELHO");
    expect(feicao.attributes.objectid).toBe(7);
    expect(feicao.geometry).toEqual({ x: -43.5047, y: -20.3858, spatialReference: { wkid: 4326 } });
    expect(feicaoParaAlerta(feicao)).toEqual(alerta);
    // Também pela linha do Postgres (o mesmo formato).
    const linha = { objectid: 7, ...feicaoParaLinha(feicao) };
    expect(feicaoParaAlerta(linhaParaFeicao(linha))).toEqual(alerta);
  });

  it("sem coordenada, o ponto é a sede do município (e volta com ela)", () => {
    const alerta = { ...alertaCompleto(), longitude: null, latitude: null };
    const feicao = alertaParaFeicao(alerta);
    const sede = municipioPorIbge("3146107")!;
    expect(feicao.geometry).toEqual({ x: sede.lon, y: sede.lat, spatialReference: { wkid: 4326 } });
    expect(alertaParaFeicao({ ...alerta, codIbge: null }).geometry).toBeNull();
  });

  it("ação, destinatário e histórico: ida e volta sem perda", () => {
    const acao: AcaoRrdSala = {
      objectid: 3,
      acaoId: "AC-20261002-0001",
      alertaId: "AL-20261002-0042",
      numeroChamada: "2026-12340000-1",
      ocorrenciaCad: null,
      natureza: "REAL",
      origemRegistro: "SALA",
      tipoRisco: "GEOLOGICO",
      tipoAcao: "VISTORIA",
      resultado: "CONCLUIDA",
      acaoExecutada: "Vistoria em 12 imóveis.",
      dataAcao: "2026-10-02T14:00:00.000Z",
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia/1º Pel (Ouro Preto)",
      municipio: "Ouro Preto",
      codIbge: "3146107",
      localReferencia: null,
      pessoasOrientadas: 30,
      pessoasRemovidas: 0,
      imoveisVistoriados: 12,
      imoveisInterditados: 1,
      efetivoEmpregado: 6,
      viaturasEmpregadas: 2,
      compdecAcionada: false,
      registradoPorId: "c7a3e9f15b2d4086a1c3e5f7b9d0284f",
      registradoPorDominio: "1º COB",
      criadoEm: "2026-10-02T14:05:00.000Z",
      alteradoPorId: "c7a3e9f15b2d4086a1c3e5f7b9d0284f",
      alteradoEm: "2026-10-02T14:05:00.000Z",
      longitude: -43.51,
      latitude: -20.38,
    };
    const feicaoAcao = acaoParaFeicao(acao);
    expect(feicaoAcao.attributes.compdec_acionada).toBe("N");
    expect(feicaoParaAcao(feicaoAcao)).toEqual(acao);
    // compdec vazio = NÃO RESPONDIDO (null), nunca "não".
    expect(feicaoParaAcao(acaoParaFeicao({ ...acao, compdecAcionada: null })).compdecAcionada).toBeNull();

    const destinatario: Destinatario = {
      objectid: 9,
      alertaId: "AL-20261002-0042",
      destNivel: "FRACAO",
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia/1º Pel (Ouro Preto)",
      principal: true,
      situacaoDest: "CIENTE",
      canalNotificacao: "SISTEMA",
      notificadoEm: "2026-10-02T13:00:00.000Z",
      cienteEm: "2026-10-02T13:20:00.000Z",
      cientePorId: "c7a3e9f15b2d4086a1c3e5f7b9d0284f",
      cientePorDominio: "1º COB",
      redirecionadoPara: null,
      observacao: null,
      criadoEm: "2026-10-02T12:50:00.000Z",
      alteradoEm: "2026-10-02T13:20:00.000Z",
    };
    const atributosDest = destinatarioParaAtributos(destinatario);
    expect(atributosDest.principal).toBe("S");
    expect(atributosParaDestinatario(atributosDest)).toEqual(destinatario);
    expect(atributosParaDestinatario(atributosParaLinha(atributosDest))).toEqual({ ...destinatario, objectid: null });

    const evento: EventoHistorico = {
      objectid: 11,
      alertaId: "AL-20261002-0042",
      alvoTipo: "ALERTA",
      alvoId: "AL-20261002-0042",
      evento: "ATUALIZADO",
      situacaoDe: "CIENTE",
      situacaoPara: "CIENTE",
      quando: "2026-10-02T13:30:00.000Z",
      porId: "3f6c1a9e0b7d4f2a8c5e1b3d7f9a0c2e",
      porDominio: "SALA",
      capIdentifier: "BR-MG-CBMMG-SALA-AL-20261002-0042-U1",
      capMsgType: "Update",
      capJson: JSON.stringify({ identifier: "x", info: { headline: "Risco" } }),
      camposAlterados: ["prazoAcao", "nivelAlerta"],
      detalhe: "nivelAlerta: laranja → vermelho",
    };
    const atributosEvento = eventoParaAtributos(evento);
    expect(atributosEvento.campos_alterados).toBe("prazoAcao,nivelAlerta");
    expect(atributosParaEvento(atributosEvento)).toEqual(evento);
  });

  it("proteção XSS do portal: '<' e '>' viram texto, e o JSON do CAP continua válido", () => {
    expect(textoSeguro("Chuva < 50 mm e cota > 300 cm")).toBe("Chuva menor que 50 mm e cota maior que 300 cm");
    expect(textoSeguro("índice >= 2,6 ou <=1")).toBe("índice maior ou igual a 2,6 ou menor ou igual a 1");
    expect(textoSeguro("<script>alert(1)</script>")).not.toMatch(/[<>]/);
    expect(textoSeguro("≤ 6 mm/h")).toBe("≤ 6 mm/h");

    const alerta = { ...alertaCompleto(), titulo: "Chuva >90 mm/h", descricao: "<b>atenção</b>" };
    const atributos = alertaParaFeicao(alerta).attributes;
    for (const valor of Object.values(atributos)) {
      if (typeof valor === "string") expect(valor).not.toMatch(/[<>]/);
    }
    const evento = eventoParaAtributos({
      objectid: null,
      alertaId: "AL-20261002-0042",
      alvoTipo: "ALERTA",
      alvoId: null,
      evento: "EMITIDO",
      situacaoDe: null,
      situacaoPara: null,
      quando: "2026-10-02T13:30:00.000Z",
      porId: null,
      porDominio: null,
      capIdentifier: null,
      capMsgType: null,
      capJson: JSON.stringify({ info: { description: "cota > 300 cm" } }),
      camposAlterados: [],
      detalhe: null,
    });
    expect(JSON.parse(String(evento.cap_json))).toEqual({ info: { description: "cota maior que 300 cm" } });
  });

  it("texto maior que o campo é cortado no tamanho do script", () => {
    const atributos = alertaParaFeicao({ ...alertaCompleto(), titulo: "x".repeat(500) }).attributes;
    expect(String(atributos.titulo)).toHaveLength(160);
  });

  it("valor fora do domínio: situação recusada (erro), campo opcional vira null", () => {
    const feicao = alertaParaFeicao(alertaCompleto());
    expect(() => feicaoParaAlerta({ ...feicao, attributes: { ...feicao.attributes, situacao: "PENDENTE" } })).toThrow(ErroFeicao);
    const lido = feicaoParaAlerta({ ...feicao, attributes: { ...feicao.attributes, evento: "TERREMOTO", nivel_alerta: "AZUL" } });
    expect(lido.evento).toBeNull();
    expect(lido.nivelAlerta).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Dados de exemplo
// ---------------------------------------------------------------------------------------------

describe("dados de exemplo da fila", () => {
  it("passam pelo mesmo parser, em todos os estados, com território coerente", () => {
    const agora = new Date(REFERENCIA_ALERTAS_EXEMPLO);
    const conteudo = conteudoExemplo(agora);
    const alertas = conteudo.alertas.map((f) => feicaoParaAlerta(f));
    expect(alertas).toHaveLength(10);
    expect(new Set(alertas.map((a) => a.situacao))).toEqual(
      new Set(["RASCUNHO", "EMITIDO", "CIENTE", "EM_ACAO", "ACAO_REGISTRADA", "ENCERRADO", "CANCELADO"]),
    );
    for (const a of alertas) {
      expect(a.alertaId).toMatch(/^AL-\d{8}-\d{4}$/);
      const municipio = municipioPorIbge(a.codIbge)!;
      expect(municipio.nome).toBe(a.municipio);
      expect(municipio.cob, a.alertaId).toBe(a.cob);
      // A fração gravada é uma das 96 oficiais, do mesmo COB do município.
      const oficial = fracaoDoTerritorio(a);
      expect(oficial, a.alertaId).not.toBeNull();
      expect(oficial!.cob).toBe(a.cob);
    }
    conteudo.acoes.forEach((f) => expect(feicaoParaAcao(f).acaoId).toMatch(/^AC-\d{8}-\d{4}$/));
    conteudo.destinatarios.forEach((d) => expect(atributosParaDestinatario(d).alertaId).toMatch(/^AL-/));
    conteudo.historico.forEach((h) => expect(atributosParaEvento(h).evento).toBeTruthy());
  });

  it("determinísticos e relativos a agora: datas deslocadas e códigos pelo dia de Brasília", () => {
    const um = conteudoExemplo(new Date("2026-11-20T18:30:00.000Z"));
    const dois = conteudoExemplo(new Date("2026-11-20T18:30:00.000Z"));
    expect(um).toEqual(dois);
    const ref = conteudoExemplo(new Date(REFERENCIA_ALERTAS_EXEMPLO));
    const delta = Date.parse("2026-11-20T18:30:00.000Z") - Date.parse(REFERENCIA_ALERTAS_EXEMPLO);
    expect((um.alertas[0].attributes.criado_em as number) - (ref.alertas[0].attributes.criado_em as number)).toBe(delta);
    // O código acompanha o dia da criação já deslocada, e as referências entre camadas casam.
    const ids = new Set(um.alertas.map((f) => f.attributes.alerta_id));
    for (const f of um.alertas) {
      const dia = new Date((f.attributes.criado_em as number) - 3 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
      expect(String(f.attributes.alerta_id)).toContain(`AL-${dia}-`);
      if (f.attributes.cap_identifier) expect(f.attributes.cap_identifier).toBe(`BR-MG-CBMMG-SALA-${f.attributes.alerta_id}`);
    }
    for (const d of um.destinatarios) expect(ids.has(d.alerta_id)).toBe(true);
    for (const h of um.historico) expect(ids.has(h.alerta_id)).toBe(true);
    for (const f of um.acoes) expect(ids.has(f.attributes.alerta_id)).toBe(true);
  });
});
