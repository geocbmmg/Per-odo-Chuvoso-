/**
 * Erro do login com o status HTTP da resposta: as rotas /api/auth/* devolvem
 * `{ok: false, erro, motivo}`, no mesmo formato de /api/alertas.
 * - `erro`: mensagem em português para a tela, sempre genérica (nunca o corpo
 *   da resposta do GeoRescue, nunca o CPF);
 * - `motivo`: código estável para o cliente decidir.
 */
export type MotivoErroAuth =
  | "formato" // corpo do pedido inválido
  | "entrada_invalida" // CPF/senha fora do formato
  | "origem" // Origin de outro site (CSRF)
  | "credenciais" // CPF ou senha inválidos
  | "conta" // conta bloqueada, suspensa, vencida, lotação restrita, sem papel
  | "troca_senha" // senha temporária: trocar no GeoRescue
  | "negado" // credenciais certas, mas o papel/domínio não dá acesso à Sala
  | "limite" // muitas tentativas
  | "georescue" // GeoRescue fora do ar ou com erro
  | "contrato" // GeoRescue respondeu num formato inesperado
  | "tempo" // GeoRescue não respondeu a tempo
  | "indisponivel"; // login desligado por configuração

export type StatusErroAuth = 400 | 401 | 403 | 429 | 502 | 503 | 504;

export class ErroAutenticacao extends Error {
  constructor(
    public readonly status: StatusErroAuth,
    public readonly motivo: MotivoErroAuth,
    mensagem: string,
    /** Segundos para tentar de novo (429). */
    public readonly tentarEmS?: number,
  ) {
    super(mensagem);
    this.name = "ErroAutenticacao";
  }
}

/** Falhas que contam como tentativa errada no limite (a senha não conferiu). */
export function contaComoTentativaErrada(erro: unknown): boolean {
  return erro instanceof ErroAutenticacao && erro.motivo === "credenciais";
}
