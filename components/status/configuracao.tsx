import { useId } from "react";
import { Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ConfiguracaoStatus } from "@/lib/dados/status";

/**
 * O que está configurado no servidor, para o primeiro deploy e para a
 * operação: só sim/não e o nome do modo (nunca o valor de uma variável — a
 * página /status é pública). Cada linha diz o que falta e onde se lê a respeito.
 */

interface Linha {
  rotulo: string;
  valor: string;
  /** null = informativo; true = ok; false = pendente. */
  ok: boolean | null;
  nota?: string;
}

function linhas(c: ConfiguracaoStatus, modoExemplo: boolean): Linha[] {
  return [
    {
      rotulo: "Última leitura válida",
      valor: c.armazemLeituras === "postgres" ? "Postgres (compartilhada)" : "memória da instância",
      ok: c.armazemLeituras === "postgres" ? true : null,
      nota: c.armazemLeituras === "postgres" ? undefined : "ARMAZEM_LEITURAS=postgres compartilha a leitura entre as instâncias.",
    },
    {
      rotulo: "Fila de alertas",
      valor: modoExemplo
        ? "memória (demonstração)"
        : c.alertasArmazem === "postgres"
          ? "Postgres"
          : c.alertasArmazem === "arcgis"
            ? "ArcGIS (só leitura)"
            : "memória",
      ok: modoExemplo ? null : c.alertasArmazem !== "memoria",
      nota: modoExemplo || c.alertasArmazem !== "memoria" ? undefined : "Em produção a fila exige ALERTAS_ARMAZEM=postgres.",
    },
    {
      rotulo: "Banco de dados",
      valor: c.bancoConfigurado ? "DATABASE_URL definida" : "sem DATABASE_URL",
      ok: c.bancoConfigurado ? true : c.armazemLeituras === "postgres" || c.alertasArmazem === "postgres" ? false : null,
    },
    {
      rotulo: "Pseudônimo de autoria",
      valor: c.pseudonimoConfigurado ? "SALA_PSEUDO_SEGREDO definido" : modoExemplo ? "chave de demonstração" : "não definido",
      ok: c.pseudonimoConfigurado ? true : modoExemplo ? null : false,
      nota: c.pseudonimoConfigurado || modoExemplo ? undefined : "Sem ele a fila não grava (LGPD: autoria só por pseudônimo).",
    },
    {
      rotulo: "Login pelo GeoRescue",
      valor: modoExemplo ? "perfis de demonstração" : c.loginConfigurado ? "ligado" : "desligado",
      ok: modoExemplo ? null : c.loginConfigurado,
      nota: modoExemplo || c.loginConfigurado ? undefined : "Defina GEORESCUE_BASE_URL e SALA_SESSION_SECRET (32+ caracteres).",
    },
    {
      rotulo: "Grupo dos operadores",
      // Nunca o nome definido: só se é o padrão (o servidor nem o envia).
      valor: c.grupoOperadorPadrao ? "padrão (SALA)" : "definido",
      ok: null,
      nota: "SALA_GRUPO_OPERADOR: domínio de grupo do GeoRescue que faz o Operador da Sala.",
    },
    {
      rotulo: "Jobs de atualização",
      valor:
        c.cron === "protegido"
          ? "protegidos por CRON_SECRET"
          : c.cron === "curto"
            ? "CRON_SECRET curto: jobs bloqueados"
            : "sem CRON_SECRET",
      ok: c.cron === "protegido" ? true : c.cron === "curto" || process.env.NODE_ENV === "production" ? false : null,
      nota: c.cron === "curto" ? "Use 16+ caracteres (ex.: openssl rand -hex 32): com menos, /api/ingest recusa todos os jobs." : undefined,
    },
  ];
}

export function ConfiguracaoStatus({ configuracao, modoExemplo }: { configuracao: ConfiguracaoStatus; modoExemplo: boolean }) {
  const idTitulo = useId();
  const itens = linhas(configuracao, modoExemplo);
  const pendentes = itens.filter((l) => l.ok === false).length;
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={idTitulo} className="flex items-center gap-2 text-[16px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
          <Settings2 aria-hidden="true" className="size-4 text-mut" />
          Configuração do servidor
        </h2>
        {pendentes > 0 ? (
          <Badge variant="alerta" marcador>
            {pendentes === 1 ? "1 pendência" : `${pendentes} pendências`}
          </Badge>
        ) : (
          <span className="text-[12.5px] text-mut">Só sim/não: nenhum valor de variável aparece aqui.</span>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-[14px] border border-border bg-superficie px-4 py-3 text-[13px] leading-snug sm:grid-cols-2">
        {itens.map((l) => (
          <div key={l.rotulo} className="flex flex-col gap-0.5 py-1">
            <dt className="text-mut">{l.rotulo}</dt>
            <dd className="flex flex-wrap items-center gap-2 text-ink-2">
              <span className="font-mono text-[12.5px] text-ink">{l.valor}</span>
              {l.ok === true ? (
                <Badge variant="ok" marcador>
                  ok
                </Badge>
              ) : l.ok === false ? (
                <Badge variant="alerta" marcador>
                  pendente
                </Badge>
              ) : null}
              {l.nota ? <span className="basis-full text-[12px] text-mut">{l.nota}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
