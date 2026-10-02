/**
 * CPF no campo de login: máscara para digitação e conferência dos dígitos
 * verificadores (a mesma regra do `cpf_valido` do GeoRescue, acesso.py).
 * PURO: usado no formulário (navegador) e na rota (servidor). O CPF só passa
 * por aqui a caminho do GeoRescue; nada guarda nem registra o valor.
 */

export function cpfDigitos(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 11);
}

/** Dígitos verificadores conferem (e não é uma sequência repetida como 111.111.111-11). */
export function cpfValido(valor: string): boolean {
  const d = valor.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const resto = ((soma * 10) % 11) % 10;
    if (resto !== Number(d[t])) return false;
  }
  return true;
}

/**
 * Máscara 000.000.000-00 enquanto se digita — só quando o texto é numérico.
 * Com letras, devolve como está: o administrador de emergência do GeoRescue
 * entra pelo nome de usuário, como no próprio GeoRescue.
 */
export function mascararCpfDigitado(valor: string): string {
  if (!/^[\d.\-\s]*$/.test(valor)) return valor;
  const d = cpfDigitos(valor);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export type IdentificadorLogin = { tipo: "cpf"; valor: string } | { tipo: "usuario"; valor: string };

/**
 * O que foi digitado no campo "CPF": CPF (11 dígitos, com ou sem máscara) ou
 * o usuário do administrador de emergência (letras, dígitos, . _ - @).
 * null quando não é nenhum dos dois.
 */
export function interpretarIdentificador(valor: string): IdentificadorLogin | null {
  const v = valor.trim();
  if (/^[\d.\-\s]+$/.test(v)) {
    const d = v.replace(/\D/g, "");
    return d.length === 11 ? { tipo: "cpf", valor: d } : null;
  }
  if (/^[A-Za-z][A-Za-z0-9._@-]{1,63}$/.test(v)) return { tipo: "usuario", valor: v };
  return null;
}
