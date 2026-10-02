import type { Problema } from "./dominio";
import { ErroArmazem, ErroConflito, ErroEscritaDesligada, ErroNaoEncontrado } from "./repositorio";

/**
 * Erro da fila de alertas com o status HTTP do contrato (módulo INSARAG do
 * GeoRescue): a rota devolve `{ok: false, erro, motivo}`.
 * - `erro`: mensagem em português para a tela;
 * - `motivo`: código estável para o cliente decidir (ex.: "conflito").
 */
export type StatusErroAlertas = 400 | 401 | 403 | 404 | 409 | 502 | 503;

export class ErroAlertas extends Error {
  constructor(
    public readonly status: StatusErroAlertas,
    public readonly motivo: string,
    mensagem: string,
    /** Problemas por campo (400 de validação). */
    public readonly campos?: Problema[],
    /** Versão gravada (409), para a tela mostrar quem venceu. */
    public readonly alteradoEmAtual?: string | null,
  ) {
    super(mensagem);
    this.name = "ErroAlertas";
  }
}

/** Traduz os erros do repositório para o contrato HTTP. Erro desconhecido volta como está. */
export function traduzirErro(erro: unknown): unknown {
  if (erro instanceof ErroAlertas) return erro;
  if (erro instanceof ErroConflito) return new ErroAlertas(409, "conflito", erro.message, undefined, erro.alteradoEmAtual);
  if (erro instanceof ErroNaoEncontrado) return new ErroAlertas(404, "nao_encontrado", erro.message);
  if (erro instanceof ErroEscritaDesligada) return new ErroAlertas(503, "escrita_desligada", erro.message);
  if (erro instanceof ErroArmazem) return new ErroAlertas(502, "armazem", erro.message);
  return erro;
}
