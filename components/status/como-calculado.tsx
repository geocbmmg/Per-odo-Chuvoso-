import { useId } from "react";
import { Info } from "lucide-react";

import { CabecalhoBloco } from "@/components/monitoramento/cabecalho-bloco";
import { Card, CardContent } from "@/components/ui/card";
import type { EstadoFonte } from "@/lib/fontes/tipos";

import { PilulaEstado } from "./pilula-estado";

/** Regras de statusDaFonte (lib/fontes/leituras.ts), na ordem em que são avaliadas para leitura humana. */
const REGRAS: readonly { estado: EstadoFonte; texto: string }[] = [
  {
    estado: "ok",
    texto: "A última tentativa de consulta deu certo e a leitura válida está dentro da tolerância da fonte.",
  },
  {
    estado: "atrasada",
    texto:
      "Há leitura válida, mas a última tentativa falhou ou a leitura passou da tolerância. As telas seguem mostrando a última leitura válida, com aviso.",
  },
  {
    estado: "fora-do-ar",
    texto:
      "Não há nenhuma leitura válida, ou a última leitura válida é mais velha que o limite “fora do ar” da fonte.",
  },
  {
    estado: "desconhecida",
    texto: "Esta instância do servidor ainda não tentou consultar a fonte.",
  },
  {
    estado: "exemplo",
    texto: "Modo de demonstração (DADOS_EXEMPLO=1): as fontes não são consultadas e os dados são fictícios.",
  },
  {
    estado: "nao-implementada",
    texto: "Integração prevista para as próximas fases; a fonte ainda não é consultada.",
  },
];

/** Seção "Como o estado é calculado" de /status. */
export function ComoCalculado() {
  const idTitulo = useId();
  return (
    <section aria-labelledby={idTitulo}>
      <Card className="gap-4">
        <CabecalhoBloco
          id={idTitulo}
          titulo="Como o estado é calculado"
          icone={Info}
          descricao="Ao abrir esta página, cada fonte implementada é consultada (respeitando o cache) e classificada assim:"
        />
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-x-4 gap-y-2.5 text-[13px] leading-snug sm:grid-cols-[auto_minmax(0,1fr)]">
            {REGRAS.map((r) => (
              <div key={r.estado} className="contents">
                <dt className="pt-px">
                  <PilulaEstado estado={r.estado} />
                </dt>
                <dd className="mb-1.5 text-ink-2 sm:mb-0">{r.texto}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex list-disc flex-col gap-1.5 border-t border-border pl-5 pt-3 text-[12.5px] leading-snug text-mut marker:text-faint">
            <li>
              <span className="font-semibold text-ink-2">Tolerância</span> e{" "}
              <span className="font-semibold text-ink-2">fora do ar após</span> são definidos por fonte no catálogo
              e aparecem na linha de cada uma.
            </li>
            <li>
              <span className="font-semibold text-ink-2">Reconsulta a cada</span>: dentro desse intervalo a
              leitura guardada é reaproveitada sem consultar a fonte de novo.
            </li>
            <li>
              Depois de uma falha, a fonte só é consultada de novo após até 1 minuto — assim nenhuma tela espera o
              tempo-limite da fonte a cada acesso.
            </li>
            <li>
              O registro fica na memória de cada instância do servidor: instâncias diferentes podem divergir por
              alguns minutos, até a próxima consulta.
            </li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
