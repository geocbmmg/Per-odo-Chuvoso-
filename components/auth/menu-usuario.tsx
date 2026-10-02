"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FlaskConical, LoaderCircle, LogIn, LogOut, Repeat } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarHora } from "@/lib/datas";
import { cn } from "@/lib/utils";

import { AvisoSessaoDemonstracao } from "./aviso-sessao-demonstracao";
import { enviarAuth } from "./enviar";

/** O que o chip precisa saber da sessão (sem sid, sem pseudônimo, sem CPF). */
export interface DadosChipUsuario {
  nome: string;
  posto: string | null;
  rotuloPapel: string;
  /** "Estado inteiro" ou a lista de COBs. */
  escopo: string;
  unidade: string | null;
  expiraEm: string;
  demonstracao: boolean;
  /** Operador de demonstração implícito (modo demonstração, sem perfil escolhido). */
  implicita: boolean;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return `${primeira}${ultima}`.toUpperCase();
}

function linkEntrar(caminho: string): string {
  return caminho && caminho !== "/" ? `/entrar?voltar=${encodeURIComponent(caminho)}` : "/entrar";
}

/**
 * Chip do usuário no cabeçalho: iniciais (e, a partir de 640px, nome e papel);
 * abre um menu com escopo, unidade, validade da sessão e "Sair". Sem sessão,
 * vira o link "Entrar" (que volta para a página atual). Na demonstração, leva
 * o ícone de frasco e o aviso de sessão fictícia.
 */
export function MenuUsuario({ usuario }: { usuario: DadosChipUsuario | null }) {
  const caminho = usePathname() ?? "/";
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!usuario) {
    if (caminho === "/entrar") return null;
    return (
      <Link
        href={linkEntrar(caminho)}
        className={cn(
          "relative alvo-toque inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-acc/34 px-3 py-1",
          "text-[12.5px] font-bold text-acc-txt transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <LogIn aria-hidden="true" className="size-4" />
        Entrar
      </Link>
    );
  }

  async function sair() {
    setSaindo(true);
    setErro(null);
    const resultado = await enviarAuth("/api/auth/logout");
    if (resultado.ok) {
      window.location.reload();
      return;
    }
    setSaindo(false);
    setErro(resultado.erro);
  }

  const nomeExibido = usuario.posto ? `${usuario.posto} ${usuario.nome}` : usuario.nome;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative alvo-toque inline-flex max-w-full items-center gap-2 rounded-full border bg-sup-1 py-[3px] pr-2.5 pl-[3px]",
            "text-left transition-colors hover:border-acc/34 data-[state=open]:border-acc/50",
            usuario.demonstracao ? "border-info/40" : "border-linha/20",
          )}
        >
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-acc/40 bg-acc/16 text-[11px] font-extrabold tracking-[.02em] text-acc-txt"
          >
            {iniciais(usuario.nome)}
          </span>
          <span aria-hidden="true" className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="max-w-[18ch] truncate text-[12.5px] font-bold text-ink">{usuario.nome}</span>
            <span className="max-w-[22ch] truncate text-[10.5px] font-semibold text-mut">{usuario.rotuloPapel}</span>
          </span>
          {usuario.demonstracao ? <FlaskConical aria-hidden="true" className="size-3.5 shrink-0 text-info-txt" /> : null}
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-mut" />
          <span className="sr-only">
            {`Conta: ${usuario.nome}, ${usuario.rotuloPapel}${usuario.demonstracao ? ", demonstração" : ""}. Abrir o menu da conta.`}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(18.5rem,calc(100vw-24px))]">
        <div className="px-2.5 pt-2 pb-1.5">
          <p className="text-[13.5px] font-bold leading-tight text-ink-forte">{nomeExibido}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-acc-txt">{usuario.rotuloPapel}</p>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11.5px] leading-snug">
            <dt className="text-faint">Escopo</dt>
            <dd className="text-ink-2">{usuario.escopo}</dd>
            {usuario.unidade ? (
              <>
                <dt className="text-faint">Unidade</dt>
                <dd className="truncate text-ink-2">{usuario.unidade}</dd>
              </>
            ) : null}
            <dt className="text-faint">Sessão</dt>
            <dd className="text-ink-2 tabular-nums">
              {usuario.implicita ? "sem login (demonstração)" : `até ${formatarHora(usuario.expiraEm)}`}
            </dd>
          </dl>
        </div>
        {usuario.demonstracao ? (
          <AvisoSessaoDemonstracao className="mx-1 my-1.5 text-[11.5px]">
            {usuario.implicita
              ? "Sem perfil escolhido, a Sala usa o Operador de demonstração."
              : "Perfil fictício, sem login no GeoRescue."}
          </AvisoSessaoDemonstracao>
        ) : null}
        <DropdownMenuSeparator />
        {usuario.demonstracao ? (
          <DropdownMenuItem asChild>
            <Link href={linkEntrar(caminho)}>
              <Repeat aria-hidden="true" />
              Trocar perfil de demonstração
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          disabled={saindo}
          onSelect={(evento) => {
            evento.preventDefault();
            void sair();
          }}
        >
          {saindo ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <LogOut aria-hidden="true" />}
          {saindo ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
        {erro ? (
          <DropdownMenuLabel role="alert" className="normal-case tracking-normal text-[11.5px] font-semibold text-perigo-txt">
            {erro}
          </DropdownMenuLabel>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
