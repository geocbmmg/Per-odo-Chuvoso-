"use client";

import { ChevronDown, LocateFixed } from "lucide-react";
import { useMemo, useState } from "react";
import { formatarDataHora } from "@/lib/datas";
import type { CamadaMapaId } from "@/lib/dominio/tipos";
import {
  CAMADAS_PONTUAIS,
  contarRegistrosNoMapa,
  registrosParaLista,
  rotuloUnidade,
  ROTULOS_CAMADAS,
  SIMBOLOS,
  type ColecaoMapa,
  type RegistroLista,
} from "@/lib/mapa";
import { Simbolo, SimboloOcorrenciaFinalizada } from "./simbolo";

/** Linhas exibidas por vez (a lista pode ter milhares de ações RRD). */
const PASSO = 50;

const formatoInteiro = new Intl.NumberFormat("pt-BR");

interface PropsListaRegistros {
  /** Pontos no período (os mesmos do mapa). */
  colecoes: Partial<Record<CamadaMapaId, ColecaoMapa>>;
  /** Camadas ligadas no mapa: só elas entram na lista. */
  visiveis: ReadonlySet<CamadaMapaId>;
  /** Camadas disponíveis neste mapa. */
  camadas: readonly CamadaMapaId[];
  rotuloPeriodo?: string;
  /** Registros que ficam fora do mapa (e da lista) por falta de coordenadas. */
  semLocalizacao: number;
  /** Centraliza o mapa no registro e abre o balão; null = mapa indisponível. */
  onVerNoMapa: ((registro: RegistroLista, origem: HTMLElement) => void) | null;
}

function Vazio() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="mapa-sr">não informado</span>
    </>
  );
}

function SimboloRegistro({ registro }: { registro: RegistroLista }) {
  if (registro.situacao === "finalizada") return <SimboloOcorrenciaFinalizada />;
  const simbolo = SIMBOLOS[registro.camada];
  return <Simbolo forma={simbolo.forma} cor={simbolo.cor} />;
}

/**
 * "Ver registros em lista": alternativa ao clique no canvas para teclado e
 * leitor de tela. Mostra os mesmos pontos do mapa (camadas ligadas, período,
 * só com localização); "Ver no mapa" aproxima o ponto e abre o mesmo balão.
 * As linhas só são montadas com a lista aberta.
 */
export function ListaRegistros({
  colecoes,
  visiveis,
  camadas,
  rotuloPeriodo,
  semLocalizacao,
  onVerNoMapa,
}: PropsListaRegistros) {
  const [aberta, setAberta] = useState(false);
  const [limite, setLimite] = useState(PASSO);

  const total = contarRegistrosNoMapa(colecoes, visiveis);
  const registros = useMemo(
    () => (aberta ? registrosParaLista(colecoes, visiveis) : []),
    [aberta, colecoes, visiveis],
  );
  const exibidos = registros.slice(0, limite);
  const restantes = registros.length - exibidos.length;

  const pontuais = CAMADAS_PONTUAIS.filter((c) => camadas.includes(c));
  const desligadas = pontuais.filter((c) => !visiveis.has(c));

  return (
    <details className="mapa-lista" onToggle={(evento) => setAberta(evento.currentTarget.open)}>
      <summary className="mapa-lista__alternar">
        <span className="mapa-lista__titulo">Ver registros em lista</span>
        <span className="mapa-pilula" data-estado={total === 0 ? "vazio" : "ok"} aria-hidden="true">
          {formatoInteiro.format(total)}
        </span>
        <span className="mapa-sr">{`${formatoInteiro.format(total)} ${total === 1 ? "registro" : "registros"}`}</span>
        <ChevronDown aria-hidden="true" />
      </summary>

      {aberta ? (
        <div className="mapa-lista__corpo">
          <p className="mapa-lista__nota">
            {rotuloPeriodo ? `${rotuloPeriodo}. ` : null}
            Os mesmos registros do mapa, do mais recente ao mais antigo.
            {desligadas.length
              ? ` Camadas desligadas no mapa ficam fora: ${desligadas.map((c) => ROTULOS_CAMADAS[c]).join(", ")}.`
              : null}
            {semLocalizacao > 0
              ? semLocalizacao === 1
                ? " 1 registro sem localização não aparece aqui."
                : ` ${formatoInteiro.format(semLocalizacao)} registros sem localização não aparecem aqui.`
              : null}
          </p>

          {registros.length === 0 ? (
            <p className="mapa-lista__vazio">Nenhum registro no mapa com as camadas ligadas.</p>
          ) : (
            <div className="mapa-lista__rolagem" role="region" aria-label="Registros do mapa" tabIndex={0}>
              <table className="mapa-lista__tabela">
                <caption className="mapa-sr">
                  Registros do mapa{rotuloPeriodo ? ` — ${rotuloPeriodo}` : ""}: {exibidos.length} de {registros.length}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Tipo</th>
                    <th scope="col">Município</th>
                    <th scope="col">COB</th>
                    <th scope="col">UEOp / fração</th>
                    <th scope="col">Data</th>
                    {onVerNoMapa ? (
                      <th scope="col">
                        <span className="mapa-sr">Localizar</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {exibidos.map((registro) => {
                    const unidade = rotuloUnidade(registro.ueop, registro.fracao);
                    return (
                      <tr key={registro.chave}>
                        <th scope="row">
                          <span className="mapa-lista__tipo">
                            <SimboloRegistro registro={registro} />
                            <span>
                              {registro.tipo}
                              {registro.detalhe ? (
                                <span className="mapa-lista__detalhe">{registro.detalhe}</span>
                              ) : null}
                            </span>
                          </span>
                        </th>
                        <td>{registro.municipio ?? <Vazio />}</td>
                        <td className="mapa-lista__nowrap">{registro.cob ?? <Vazio />}</td>
                        <td>{unidade ?? <Vazio />}</td>
                        <td className="mapa-lista__nowrap">
                          {registro.data ? (
                            <time dateTime={registro.data}>{formatarDataHora(registro.data)}</time>
                          ) : (
                            <Vazio />
                          )}
                        </td>
                        {onVerNoMapa ? (
                          <td>
                            <button
                              type="button"
                              className="mapa-lista__ver"
                              onClick={(evento) => onVerNoMapa(registro, evento.currentTarget)}
                              aria-label={`Ver no mapa: ${registro.tipo}${
                                registro.municipio ? ` em ${registro.municipio}` : ""
                              }${registro.data ? `, ${formatarDataHora(registro.data)}` : ""}`}
                            >
                              <LocateFixed aria-hidden="true" />
                              Ver no mapa
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {restantes > 0 ? (
            <button type="button" className="mapa-lista__mais" onClick={() => setLimite((l) => l + PASSO)}>
              Mostrar mais {formatoInteiro.format(Math.min(PASSO, restantes))}
              <span className="mapa-lista__contagem">
                ({formatoInteiro.format(exibidos.length)} de {formatoInteiro.format(registros.length)})
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
