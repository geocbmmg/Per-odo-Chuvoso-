import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleAlert, ShieldCheck } from "lucide-react";

import { AvisoSessaoDemonstracao } from "@/components/auth/aviso-sessao-demonstracao";
import { FormularioEntrar } from "@/components/auth/formulario-entrar";
import { PerfisDemonstracao } from "@/components/auth/perfis-demonstracao";
import { BrasaoCbmmg } from "@/components/layout/brasao-cbmmg";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { configAuth } from "@/lib/auth/config";
import { OPCOES_PERFIL_DEMONSTRACAO, perfilDemonstracaoValido } from "@/lib/auth/demonstracao";
import { obterSessaoComOrigem } from "@/lib/auth/sessao";
import { ROTULOS_PAPEL_SALA } from "@/lib/auth/tipos";
import { caminhoDeVolta } from "@/lib/auth/voltar";

/*
 * Entrar — login federado pelo GeoRescue (docs/fase-1.md §3). Cartão central
 * com o brasão; CPF e senha do GeoRescue; no modo demonstração, três perfis
 * fictícios. `?voltar=` só aceita caminho interno (lib/auth/voltar.ts).
 * As páginas públicas (Visão Geral, Monitoramento, Status) não exigem login.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entrar na Sala de Situação com o usuário do GeoRescue.",
};

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const voltar = caminhoDeVolta((await searchParams).voltar);
  const config = configAuth();
  const atual = await obterSessaoComOrigem();
  const logado = atual?.origem === "cookie" ? atual.sessao : null;
  const perfilAtual = logado?.demonstracao && perfilDemonstracaoValido(logado.papel) ? logado.papel : null;

  return (
    <div className="flex min-h-full items-start justify-center px-0 py-6 sm:py-10">
      <Card variant="modulo" className="w-full max-w-[440px] gap-5 shadow-cartao max-sm:px-4">
        <header className="flex flex-col items-center gap-3 text-center">
          <BrasaoCbmmg className="h-16" classeMonograma="h-16 text-[11px]" />
          <div>
            <p className="gr-eyebrow text-[10.5px] text-acc-txt">CBMMG · Período Chuvoso</p>
            <h1 className="mt-1 text-[20px] font-bold uppercase leading-tight tracking-[.02em] text-ink-forte">
              Sala de Situação
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-mut">
              {config.modo === "demonstracao"
                ? "Escolha um perfil de demonstração para entrar."
                : "Entre com o seu usuário do GeoRescue."}
            </p>
          </div>
        </header>

        {logado ? (
          <div className="flex flex-col gap-2 rounded-[12px] border border-ok/40 bg-ok/10 px-3.5 py-3">
            <p className="text-[12.5px] leading-snug text-ink-2">
              Você já entrou como <strong className="font-bold text-ink">{logado.nome}</strong> (
              {ROTULOS_PAPEL_SALA[logado.papel]}).
            </p>
            <Link
              href={voltar}
              className="relative alvo-toque inline-flex w-fit items-center gap-1.5 text-[12.5px] font-bold text-acc-txt underline-offset-4 hover:underline"
            >
              Continuar na Sala
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        ) : null}

        {config.modo === "demonstracao" ? (
          <>
            <AvisoSessaoDemonstracao>
              O login do GeoRescue fica desligado neste modo. Os perfis abaixo são fictícios e emitem a mesma sessão
              assinada do login real.
            </AvisoSessaoDemonstracao>
            <PerfisDemonstracao perfis={OPCOES_PERFIL_DEMONSTRACAO} voltar={voltar} atual={perfilAtual} />
          </>
        ) : config.modo === "indisponivel" ? (
          <div role="status" className="flex flex-col gap-2 rounded-[12px] border border-alerta/40 bg-alerta/12 px-3.5 py-3">
            <Badge variant="alerta" marcador>
              Login indisponível
            </Badge>
            <p className="text-[12.5px] leading-snug text-ink-2">
              O login pelo GeoRescue ainda não foi configurado neste servidor. As páginas de consulta continuam abertas;
              a emissão e a fila de alertas exigem login.
            </p>
            <p className="text-[11.5px] leading-snug text-mut">
              Para o administrador: defina {config.faltando.join(" e ")} (veja .env.example).
            </p>
          </div>
        ) : (
          <FormularioEntrar voltar={voltar} esqueciUrl={config.georescueUrl} />
        )}

        <footer className="flex flex-col gap-2 border-t border-border pt-3.5 text-[11.5px] leading-snug text-mut">
          <p className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-px size-4 shrink-0 text-ok-txt" />
            <span>
              A senha é conferida pelo GeoRescue e não fica guardada na Sala. O CPF não é gravado: a Sala identifica
              você por um código anônimo.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-mut" />
            <span>
              Acesso por papel, domínio e grupo do GeoRescue. Sem acesso? Procure o administrador do GeoRescue.
            </span>
          </p>
          <p className="text-center text-[10.5px] font-bold uppercase tracking-[.14em] text-faint">Acesso restrito · CBMMG</p>
        </footer>
      </Card>
    </div>
  );
}
