import Link from "next/link";
import { LayoutDashboard, LogIn, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Para onde o login devolve a pessoa depois de entrar. */
export const ROTA_ENTRAR_ALERTAS = "/entrar?voltar=/alertas-acoes-rrd";

/**
 * Sem sessão, a fila e a emissão não aparecem (dado com texto livre e
 * recortado por COB): só o convite para entrar com o usuário do GeoRescue.
 * Os totais públicos continuam na Visão Geral.
 */
export function CartaoEntrar({ expirou = false }: { expirou?: boolean }) {
  return (
    <Card variant="modulo" className="mx-auto w-full max-w-xl items-start gap-4">
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-[12px] border border-acc/34 bg-acc/12 text-acc-txt shadow-halo"
      >
        <LockKeyhole className="size-5" />
      </span>
      <div>
        <h2 className="text-[17px] font-bold uppercase leading-tight tracking-[.03em] text-ink-forte">
          {expirou ? "Sua sessão terminou" : "Entre para ver os alertas"}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          Entre com seu usuário do GeoRescue para ver e emitir alertas. Cada pessoa vê os alertas do próprio COB; a emissão é da Sala de
          Situação.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-mut">
          Os totais públicos de alertas e ações RRD continuam na Visão Geral, sem login.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg">
          <Link href={ROTA_ENTRAR_ALERTAS}>
            <LogIn aria-hidden="true" />
            Entrar com o GeoRescue
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/">
            <LayoutDashboard aria-hidden="true" />
            Ir para a Visão Geral
          </Link>
        </Button>
      </div>
    </Card>
  );
}
