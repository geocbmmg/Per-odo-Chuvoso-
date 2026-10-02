"use client";

import { Contrast, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useMontado } from "./hidratacao";

type PreferenciaTema = "dark" | "light" | "system";

interface OpcaoTema {
  valor: PreferenciaTema;
  rotulo: string;
  curto: string;
  icone: LucideIcon;
}

/** Mesmas três opções do modal "Aparência" do GeoRescue (Index.html:7429-7468). */
const OPCOES: readonly OpcaoTema[] = [
  { valor: "dark", rotulo: "Escuro", curto: "Escuro", icone: Moon },
  { valor: "light", rotulo: "Claro", curto: "Claro", icone: Sun },
  { valor: "system", rotulo: "Automático", curto: "Auto", icone: Monitor },
];

function ehPreferencia(valor: string | undefined): valor is PreferenciaTema {
  return valor === "dark" || valor === "light" || valor === "system";
}

/**
 * Escolha de aparência: Escuro / Claro / Automático.
 *
 * - `variante="menu"` (padrão): item do pé do trilho que abre um menu suspenso.
 *   Funciona com o trilho recolhido (só o ícone + dica).
 * - `variante="segmentado"`: controle segmentado (pílula .tut-vistas), para a gaveta do celular.
 *
 * Antes da hidratação não se sabe o tema salvo: nada é marcado até montar.
 */
export function AlternarTema({
  variante = "menu",
  recolhido = false,
  className,
}: {
  variante?: "menu" | "segmentado";
  /** Trilho recolhido: mostra a dica "Aparência" ao passar o mouse. */
  recolhido?: boolean;
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const montado = useMontado();
  const atual = montado && ehPreferencia(theme) ? theme : null;
  const opcaoAtual = OPCOES.find((o) => o.valor === atual) ?? null;

  if (variante === "segmentado") {
    return (
      <div
        role="group"
        aria-label="Aparência"
        className={cn("flex w-full gap-1 rounded-full border border-linha/16 bg-linha/6 p-1", className)}
      >
        {OPCOES.map((opcao) => {
          const Icone = opcao.icone;
          const ativo = atual === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              aria-pressed={ativo}
              aria-label={opcao.rotulo}
              title={opcao.valor === "system" ? "Automático — segue o tema do sistema" : opcao.rotulo}
              onClick={() => setTheme(opcao.valor)}
              className={cn(
                "relative alvo-toque flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-transparent px-1",
                "text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink-forte",
                "aria-pressed:border-acc/42 aria-pressed:bg-acc/16 aria-pressed:font-bold aria-pressed:text-acc-txt",
              )}
            >
              <Icone className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{opcao.curto}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const gatilho = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={opcaoAtual ? `Aparência: ${opcaoAtual.rotulo}` : "Aparência"}
        className={cn(
          "relative alvo-toque flex h-10 w-full items-center gap-3 pr-3 pl-5 text-left text-[13.5px] font-medium text-ink-2",
          "transition-colors hover:bg-linha/6 hover:text-ink-forte data-[state=open]:bg-linha/6 data-[state=open]:text-ink-forte",
          "trilho-mini:pr-0 trilho-mini:pl-[22px]",
          className,
        )}
      >
        <Contrast className="size-5 shrink-0 text-mut" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate trilho-mini:sr-only">Aparência</span>
        {opcaoAtual ? (
          <span aria-hidden="true" className="text-[11px] font-semibold text-mut trilho-mini:hidden">
            {opcaoAtual.rotulo}
          </span>
        ) : null}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {recolhido ? (
        <Tooltip>
          <TooltipTrigger asChild>{gatilho}</TooltipTrigger>
          <TooltipContent side="right">Aparência</TooltipContent>
        </Tooltip>
      ) : (
        gatilho
      )}
      <DropdownMenuContent side="right" align="end" className="w-52">
        <DropdownMenuLabel>Aparência</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={atual ?? ""}
          onValueChange={(valor) => {
            if (ehPreferencia(valor)) setTheme(valor);
          }}
        >
          {OPCOES.map((opcao) => {
            const Icone = opcao.icone;
            return (
              <DropdownMenuRadioItem key={opcao.valor} value={opcao.valor}>
                <Icone aria-hidden="true" />
                {opcao.rotulo}
                {opcao.valor === "system" ? <span className="ml-auto text-[11px] text-faint">sistema</span> : null}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
