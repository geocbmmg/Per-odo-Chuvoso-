"use client";

import { Eye, EyeOff, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { CamadaMapaId } from "@/lib/dominio/tipos";
import { ROTULOS_CAMADAS } from "@/lib/mapa";
import { descreverLeitura, estadoPilula, rotuloContagem, textoContagem, type InfoCamada } from "./info";
import { SimboloCamada } from "./simbolo";

interface PropsPainelCamadas {
  camadas: readonly CamadaMapaId[];
  visiveis: ReadonlySet<CamadaMapaId>;
  info: Partial<Record<CamadaMapaId, InfoCamada>>;
  rotuloPeriodo?: string;
  onAlternar: (camada: CamadaMapaId) => void;
  onTentarDeNovo: (camada: CamadaMapaId) => void;
  onFechar: () => void;
}

/** Painel "Camadas": olho liga/desliga, contagem em pílula e estado de erro. */
export function PainelCamadas({
  camadas,
  visiveis,
  info,
  rotuloPeriodo,
  onAlternar,
  onTentarDeNovo,
  onFechar,
}: PropsPainelCamadas) {
  const idTitulo = useId();
  const painelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    painelRef.current?.focus();
  }, []);

  const aoTeclar = (evento: KeyboardEvent) => {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      onFechar();
    }
  };

  return (
    <section
      ref={painelRef}
      className="mapa-painel"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      onKeyDown={aoTeclar}
    >
      <div className="mapa-painel__topo">
        <h2 id={idTitulo} className="mapa-painel__titulo">
          Camadas
        </h2>
        <button type="button" className="mapa-painel__fechar" onClick={onFechar} aria-label="Fechar painel de camadas">
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <ul className="mapa-painel__corpo" role="list">
        {camadas.map((camada) => {
          const dados = info[camada];
          const ligada = visiveis.has(camada);
          const leitura = dados ? descreverLeitura(dados) : null;
          const idEstado = `${idTitulo}-${camada}`;
          return (
            <li key={camada} className="mapa-camada">
              <button
                type="button"
                className="mapa-camada__botao"
                aria-pressed={ligada}
                aria-describedby={leitura || dados?.erro ? idEstado : undefined}
                onClick={() => onAlternar(camada)}
              >
                <span className="mapa-camada__olho" aria-hidden="true">
                  {ligada ? <Eye /> : <EyeOff />}
                </span>
                <SimboloCamada camada={camada} />
                <span className="mapa-camada__nome">
                  {ROTULOS_CAMADAS[camada]}
                  <span className="mapa-sr">{ligada ? " (visível)" : " (oculta)"}</span>
                  {leitura ? (
                    <span className="mapa-camada__estado" id={dados?.erro ? undefined : idEstado}>
                      {leitura}
                    </span>
                  ) : null}
                </span>
                {dados ? (
                  <span
                    className="mapa-pilula"
                    data-estado={estadoPilula(dados)}
                    aria-label={rotuloContagem(dados, camada)}
                  >
                    {textoContagem(dados)}
                  </span>
                ) : null}
              </button>
              {dados?.erro ? (
                <p className="mapa-camada__aviso" id={idEstado}>
                  <TriangleAlert aria-hidden="true" />
                  <span>
                    {dados.total === null ? dados.erro : `${dados.erro} Mostrando a última leitura.`}
                  </span>
                  <button type="button" className="mapa-camada__tentar" onClick={() => onTentarDeNovo(camada)}>
                    Tentar de novo
                  </button>
                </p>
              ) : null}
              {!dados?.erro && dados && dados.semLocalizacao > 0 ? (
                <p className="mapa-camada__nota">
                  {dados.semLocalizacao === 1
                    ? "1 registro sem localização não aparece no mapa."
                    : `${dados.semLocalizacao} registros sem localização não aparecem no mapa.`}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mapa-painel__rodape">
        {rotuloPeriodo ? `Contagens: ${rotuloPeriodo}. ` : ""}
        Fonte: CBMMG — ArcGIS Enterprise.
      </p>
    </section>
  );
}
