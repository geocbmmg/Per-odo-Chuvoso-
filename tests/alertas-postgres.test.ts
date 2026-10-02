import { drizzle } from "drizzle-orm/neon-http";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { alertaVazio, type AlertaSala } from "@/lib/alertas/dominio";
import { alertaParaFeicao } from "@/lib/alertas/feicao";
import { criarRepositorioPostgres, feicaoParaLinha } from "@/lib/alertas/postgres";
import { ErroConflito, ErroNaoEncontrado, type RepositorioAlertas } from "@/lib/alertas/repositorio";
import type { BancoDados } from "@/lib/db/cliente";
import * as schema from "@/lib/db/schema";

/**
 * O armazém Postgres contra um cliente Neon FALSO: grava o SQL e os
 * parâmetros e devolve linhas preparadas (modo array, como o neon-http pede).
 * Confere o SQL da concorrência otimista e do recorte por COB sem banco.
 */

interface Consulta {
  sql: string;
  params: unknown[];
}

let consultas: Consulta[];
let respostas: unknown[][][];
let repo: RepositorioAlertas;

function clienteFalso(sql: string, params: unknown[]) {
  consultas.push({ sql, params });
  return Promise.resolve({ rows: respostas.shift() ?? [], fields: [], rowCount: 0, command: "" });
}

/** Linha em modo array, na ordem das colunas da tabela. */
function linhaArray(tabela: PgTable, linha: Record<string, unknown>): unknown[] {
  return getTableConfig(tabela).columns.map((c) => linha[c.name] ?? null);
}

function alerta(extra: Partial<AlertaSala> = {}): AlertaSala {
  return {
    ...alertaVazio("AL-20261002-0001"),
    loteId: "AL-20261002-0001",
    cob: "1º COB",
    ueop: "1º BBM",
    municipio: "Ouro Preto",
    codIbge: "3146107",
    titulo: "Teste",
    criadoEm: "2026-10-02T15:00:00.000Z",
    alteradoEm: "2026-10-02T15:00:00.000Z",
    ...extra,
  };
}

function linhaDoAlerta(a: AlertaSala, objectid = 1): unknown[] {
  return linhaArray(schema.salaAlertas, { objectid, ...feicaoParaLinha(alertaParaFeicao(a)) });
}

beforeEach(() => {
  consultas = [];
  respostas = [];
  const db = drizzle({ client: clienteFalso as never, schema }) as unknown as BancoDados;
  repo = criarRepositorioPostgres(db);
});

describe("armazém Postgres (SQL gerado, sem banco)", () => {
  it("atualizar: UPDATE condicionado à versão lida; sem linha → 409 (ou 404 se sumiu)", async () => {
    const lida = "2026-10-02T15:00:00.000Z";
    const novo = alerta({ titulo: "Novo", alteradoEm: "2026-10-02T15:05:00.000Z" });
    respostas.push([linhaDoAlerta(novo)]);
    const gravado = await repo.atualizar(novo, lida);
    expect(gravado).toMatchObject({ alertaId: "AL-20261002-0001", titulo: "Novo", objectid: 1, alteradoEm: novo.alteradoEm });
    expect(consultas[0].sql).toMatch(/^update "sala_alertas" set /);
    expect(consultas[0].sql).toMatch(/where \("sala_alertas"\."alerta_id" = \$\d+ and "sala_alertas"\."alterado_em" = \$\d+\) returning/);
    expect(consultas[0].params).toContain(Date.parse(lida));
    expect(consultas[0].params).toContain(Date.parse(novo.alteradoEm!)); // datas em epoch ms, como a feição

    // Outra pessoa gravou antes: o UPDATE não pega linha; a releitura mostra a versão vencedora.
    const vencedora = alerta({ alteradoEm: "2026-10-02T15:04:00.000Z" });
    respostas.push([], [linhaDoAlerta(vencedora)]);
    await expect(repo.atualizar(novo, lida)).rejects.toMatchObject({
      name: "ErroConflito",
      alteradoEmAtual: "2026-10-02T15:04:00.000Z",
    });
    respostas.push([], []);
    await expect(repo.atualizar(novo, lida)).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });

  it("listar com escopo de COB: alerta do COB OU notificado a ele; rascunho fora; limite + 1", async () => {
    respostas.push([linhaDoAlerta(alerta({ situacao: "EMITIDO" }))]);
    const { alertas, truncado } = await repo.listar({ cobs: ["1º COB"], incluirRascunhos: false }, 50);
    expect(alertas).toHaveLength(1);
    expect(truncado).toBe(false);
    const { sql, params } = consultas[0];
    expect(sql).toContain(`"sala_alertas"."situacao" <> $`);
    expect(sql).toMatch(
      /"sala_alertas"\."cob" in \(\$\d+\) or "sala_alertas"\."alerta_id" in \(select "alerta_id" from "sala_alertas_destinatarios" where "sala_alertas_destinatarios"\."cob" in \(\$\d+\)\)/,
    );
    expect(sql).toMatch(/limit \$\d+$/);
    expect(params).toEqual(expect.arrayContaining(["RASCUNHO", "1º COB", 51]));
    // Escopo vazio: nem consulta.
    expect(await repo.listar({ cobs: [], incluirRascunhos: false }, 50)).toEqual({ alertas: [], truncado: false });
    expect(consultas).toHaveLength(1);
  });

  it("criar: recusa código já usado (mesmo só no histórico); violação de unicidade vira 409", async () => {
    respostas.push([[1]]); // count(*) no histórico
    await expect(repo.criar(alerta())).rejects.toBeInstanceOf(ErroConflito);

    const erroUnico = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    consultas = [];
    const db = drizzle({
      client: ((sql: string, params: unknown[]) => {
        consultas.push({ sql, params });
        return consultas.length === 1 ? Promise.resolve({ rows: [[0]] }) : Promise.reject(erroUnico);
      }) as never,
      schema,
    }) as unknown as BancoDados;
    await expect(criarRepositorioPostgres(db).criar(alerta())).rejects.toBeInstanceOf(ErroConflito);
    expect(consultas[1].sql).toMatch(/^insert into "sala_alertas"/);
  });

  it("numeração: considera alertas e histórico com o prefixo do dia", async () => {
    respostas.push([["AL-20261002-0003"]], [["AL-20261002-0007"]]);
    expect(await repo.proximoNumero("alerta", "AL-20261002-")).toBe(8);
    expect(consultas.map((c) => c.params)).toEqual([["AL-20261002-%"], ["AL-20261002-%"]]);
  });

  it("histórico: só INSERT", async () => {
    await repo.acrescentarHistorico([
      {
        objectid: null,
        alertaId: "AL-20261002-0001",
        alvoTipo: "ALERTA",
        alvoId: "AL-20261002-0001",
        evento: "CRIADO",
        situacaoDe: null,
        situacaoPara: "RASCUNHO",
        quando: "2026-10-02T15:00:00.000Z",
        porId: "3f6c1a9e0b7d4f2a8c5e1b3d7f9a0c2e",
        porDominio: "SALA",
        capIdentifier: null,
        capMsgType: null,
        capJson: null,
        camposAlterados: ["titulo"],
        detalhe: null,
      },
    ]);
    expect(consultas).toHaveLength(1);
    expect(consultas[0].sql).toMatch(/^insert into "sala_alertas_historico"/);
    expect(consultas[0].params).toEqual(expect.arrayContaining([Date.parse("2026-10-02T15:00:00.000Z"), "titulo"]));
  });
});
