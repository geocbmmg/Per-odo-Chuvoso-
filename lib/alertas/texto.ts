/**
 * Texto que vai para o portal: o serviço nasce com proteção XSS em modo
 * `rejectInvalid`, que recusa "<" e ">" (docs/fase-1.md §4.3). Os sinais
 * viram palavras ("cota < 500 cm" → "cota menor que 500 cm"). PURO.
 */
export function textoSeguro(texto: string): string {
  return texto
    .replace(/ ?<= ?/g, " menor ou igual a ")
    .replace(/ ?>= ?/g, " maior ou igual a ")
    .replace(/ ?< ?/g, " menor que ")
    .replace(/ ?> ?/g, " maior que ")
    .trim();
}
