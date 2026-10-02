/**
 * Resultado de uma busca de dados que NUNCA rejeita: quem renderiza decide o
 * que mostrar (o bloco com dados ou o cartão "fonte indisponível").
 */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: unknown };

/**
 * Embrulha a promessa de uma fonte para ser entregue, ainda pendente, a blocos
 * async dentro de <Suspense> (streaming: cada bloco espera só a sua fonte).
 *
 * - Nunca rejeita: sem "unhandledRejection" se nenhum bloco chegar a lê-la
 *   (ex.: requisição abortada) e sem derrubar a página no error.tsx.
 * - `aoFalhar` roda uma única vez, mesmo com vários blocos lendo o mesmo
 *   resultado (bom lugar para o log).
 */
export function embrulhar<T>(promessa: Promise<T>, aoFalhar?: (motivo: unknown) => void): Promise<Resultado<T>> {
  return promessa.then(
    (valor): Resultado<T> => ({ ok: true, valor }),
    (motivo: unknown): Resultado<T> => {
      try {
        aoFalhar?.(motivo);
      } catch {
        // o log não pode transformar a falha da fonte numa rejeição
      }
      return { ok: false, motivo };
    },
  );
}
