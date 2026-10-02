/**
 * Preferência "trilho recolhido" do desktop (≥ 1024px), como georescue_trilho no GeoRescue.
 * A fonte da verdade é o localStorage; um cookie espelha o valor só para o servidor
 * já desenhar o trilho no estado certo (sem o trilho "pular" depois da hidratação).
 * Módulo sem "use client": o layout (servidor) lê a constante do cookie.
 */
export type PreferenciaTrilho = "fixo" | "mini";

export const CHAVE_TRILHO = "sala-situacao:trilho";
export const COOKIE_TRILHO = "sala-trilho";

export function lerPreferenciaTrilho(valor: string | null | undefined): PreferenciaTrilho {
  return valor === "mini" ? "mini" : "fixo";
}
