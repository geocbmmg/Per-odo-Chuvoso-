"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";

import { AlternarTema } from "./alternar-tema";
import { BrasaoCbmmg } from "./brasao-cbmmg";
import { useMediaQuery } from "./hidratacao";
import { ListaNavegacao } from "./lista-navegacao";
import { CHAVE_TRILHO, COOKIE_TRILHO, lerPreferenciaTrilho, type PreferenciaTrilho } from "./preferencia-trilho";

const EVENTO_TRILHO = "sala-situacao:trilho";
const CONSULTA_DESKTOP = "(min-width: 1024px)";

/** Cópia em memória para quando o localStorage não está disponível (modo privado, bloqueio). */
let preferenciaEmMemoria: PreferenciaTrilho | null = null;

function lerPreferencia(): PreferenciaTrilho {
  if (preferenciaEmMemoria) return preferenciaEmMemoria;
  try {
    return lerPreferenciaTrilho(window.localStorage.getItem(CHAVE_TRILHO));
  } catch {
    return "fixo";
  }
}

function salvarPreferencia(valor: PreferenciaTrilho) {
  preferenciaEmMemoria = valor;
  try {
    window.localStorage.setItem(CHAVE_TRILHO, valor);
  } catch {
    // localStorage indisponível: vale a cópia em memória até recarregar a página.
  }
  try {
    document.cookie = `${COOKIE_TRILHO}=${valor}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // cookies bloqueados: o servidor desenha o padrão e o cliente corrige ao hidratar.
  }
  window.dispatchEvent(new Event(EVENTO_TRILHO));
}

function assinarPreferencia(avisar: () => void) {
  const aoMudarStorage = (evento: StorageEvent) => {
    if (evento.key === null || evento.key === CHAVE_TRILHO) {
      preferenciaEmMemoria = null;
      avisar();
    }
  };
  window.addEventListener("storage", aoMudarStorage);
  window.addEventListener(EVENTO_TRILHO, avisar);
  return () => {
    window.removeEventListener("storage", aoMudarStorage);
    window.removeEventListener(EVENTO_TRILHO, avisar);
  };
}

/**
 * Trilho lateral do portal GeoRescue (.gr-trilho, Index.html:3322-3449; visual-shell.md §1.1).
 * - Desktop (≥ 1024px): 244px fixo; recolhível para 64px, preferência salva.
 * - Tablet (768–1023px): nasce recolhido; expandir vale só para a visita.
 * - Celular (< 768px): escondido — a navegação vai para a gaveta (GavetaNavegacao).
 * A largura é decidida por CSS a partir de data-desktop / data-tablet, então o HTML do
 * servidor já sai certo em qualquer largura de tela.
 */
export function TrilhoLateral({ preferenciaInicial = "fixo" }: { preferenciaInicial?: PreferenciaTrilho }) {
  const lerServidor = useCallback(() => preferenciaInicial, [preferenciaInicial]);
  const preferencia = useSyncExternalStore(assinarPreferencia, lerPreferencia, lerServidor);
  const [tabletExpandido, setTabletExpandido] = useState(false);
  const ehDesktop = useMediaQuery(CONSULTA_DESKTOP, true);

  const recolhido = ehDesktop ? preferencia === "mini" : !tabletExpandido;

  function alternar() {
    if (window.matchMedia(CONSULTA_DESKTOP).matches) {
      salvarPreferencia(preferencia === "mini" ? "fixo" : "mini");
    } else {
      setTabletExpandido((v) => !v);
    }
  }

  return (
    <aside
      aria-label="Menu lateral"
      data-desktop={preferencia}
      data-tablet={tabletExpandido ? "fixo" : "mini"}
      className={cn(
        "sala-trilho sticky top-0 z-20 hidden h-dvh flex-col self-start overflow-hidden border-r border-border bg-sup-1 md:flex",
      )}
    >
      {/* Marca institucional: brasão do CBMMG + nome do produto */}
      <div className="relative flex shrink-0 flex-col items-center px-3 pt-[18px] pb-3.5 trilho-mini:px-0 trilho-mini:pb-2">
        <BrasaoCbmmg
          className="h-[72px] trilho-mini:h-[34px]"
          classeMonograma="h-[72px] trilho-mini:h-[34px] trilho-mini:rounded-[8px] trilho-mini:text-[8.5px]"
        />
        <div className="mt-3 flex flex-col items-center gap-1 text-center trilho-mini:sr-only">
          <span className="text-[15px] font-bold leading-tight text-ink-forte">Sala de Situação</span>
          <span className="gr-eyebrow text-[10.5px]">Período Chuvoso</span>
        </div>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhido}
          aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "alvo-toque absolute top-3.5 right-2.5 inline-flex size-7 items-center justify-center rounded-[8px]",
            "border border-border bg-sup-2 text-mut transition-colors hover:border-acc/34 hover:text-acc-txt",
            "trilho-mini:relative trilho-mini:top-auto trilho-mini:right-auto trilho-mini:mt-2.5",
          )}
        >
          <PanelLeftClose aria-hidden="true" className="size-4 trilho-mini:hidden" />
          <PanelLeftOpen aria-hidden="true" className="hidden size-4 trilho-mini:block" />
        </button>
      </div>

      {/* Itens rolam por dentro do trilho */}
      <div className="rolagem-fina min-h-0 flex-1 overflow-x-hidden overflow-y-auto border-t border-linha/5 pt-2 pb-3">
        <ListaNavegacao variante="trilho" recolhido={recolhido} />
      </div>

      {/* Pé do trilho: aparência + assinatura (.gr-tr-pe / .gr-tr-ver) */}
      <div className="shrink-0 border-t border-border pt-1.5 pb-3">
        <AlternarTema variante="menu" recolhido={recolhido} />
        <p className="mt-2 px-3 text-center text-[10.5px] leading-tight text-faint trilho-mini:sr-only">
          Sala de Situação · CBMMG
        </p>
      </div>
    </aside>
  );
}
