import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { AvisoDadosExemplo } from "@/components/layout/aviso-dados-exemplo";
import { CabecalhoInstitucional } from "@/components/layout/cabecalho-institucional";
import { COOKIE_TRILHO, lerPreferenciaTrilho } from "@/components/layout/preferencia-trilho";
import { ProvedorTema } from "@/components/layout/provedor-tema";
import { RodapeCreditos } from "@/components/layout/rodape-creditos";
import { TrilhoLateral } from "@/components/layout/trilho-lateral";
import { modoExemplo } from "@/lib/env";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s · Sala de Situação — CBMMG",
    default: "Sala de Situação — Período Chuvoso · CBMMG",
  },
  description:
    "Sala de Situação do Período Chuvoso do Corpo de Bombeiros Militar de Minas Gerais: mapa de MG com COBs, " +
    "alertas, ações de Redução do Risco de Desastres e ocorrências complexas, avisos meteorológicos e previsão de chuva.",
  applicationName: "Sala de Situação — CBMMG",
  formatDetection: { telephone: false, email: false, address: false },
  // Ferramenta operacional interna: não deve aparecer em buscadores.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0E14" },
    { media: "(prefers-color-scheme: light)", color: "#F2F4F7" },
  ],
  colorScheme: "dark light",
};

/** Créditos exigidos pelas fontes já implementadas (termos de uso), sem repetição. */
function creditosDasFontes(): string[] {
  const creditos = Object.values(CATALOGO_FONTES)
    .filter((fonte) => fonte.implementada)
    .map((fonte) => fonte.credito);
  return Array.from(new Set(creditos));
}

/** DADOS_EXEMPLO=1 liga a tarja de demonstração. Env inválido não pode derrubar a casca. */
function emModoExemplo(): boolean {
  try {
    return modoExemplo();
  } catch (erro) {
    console.error("[layout] variáveis de ambiente inválidas; tarja de exemplo pela leitura direta", erro);
    return process.env.DADOS_EXEMPLO === "1";
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const preferenciaTrilho = lerPreferenciaTrilho((await cookies()).get(COOKIE_TRILHO)?.value);

  return (
    <html lang="pt-BR" data-acento="ouro" suppressHydrationWarning>
      <body>
        <ProvedorTema>
          <a href="#conteudo" className="pular-conteudo">
            Pular para o conteúdo
          </a>
          <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)]">
            <TrilhoLateral preferenciaInicial={preferenciaTrilho} />
            <div className="flex min-w-0 flex-col">
              <AvisoDadosExemplo ativo={emModoExemplo()} />
              <CabecalhoInstitucional />
              <main id="conteudo" tabIndex={-1} className="sala-pagina min-w-0 flex-1 focus:outline-none">
                {children}
              </main>
              <RodapeCreditos creditos={creditosDasFontes()} />
            </div>
          </div>
        </ProvedorTema>
      </body>
    </html>
  );
}
