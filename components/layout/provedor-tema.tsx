"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

/** Chave do localStorage onde fica a escolha de tema ("dark" | "light" | "system"). */
const CHAVE_TEMA = "sala-situacao:tema";

/**
 * Tema da Sala de Situação, como no GeoRescue: atributo data-tema="escuro|claro"
 * no <html>, escuro por padrão, com opção "Automático" (segue o sistema).
 * O next-themes injeta o script anti-piscada antes da primeira pintura.
 */
export function ProvedorTema({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-tema"
      value={{ dark: "escuro", light: "claro" }}
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey={CHAVE_TEMA}
    >
      {children}
    </ThemeProvider>
  );
}
