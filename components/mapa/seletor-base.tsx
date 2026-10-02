"use client";

import { Check, Earth, Globe, Signpost, Triangle, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { BASES_MAPA, CATALOGO_BASES, type BaseMapaId, type IconeBase } from "@/lib/mapa";

const ICONES: Record<IconeBase, LucideIcon> = {
  terra: Earth,
  globo: Globe,
  placa: Signpost,
  triangulo: Triangle,
};

interface PropsSeletorBase {
  base: BaseMapaId;
  /** Os tiles do mapa base estão falhando (sem rede ou serviço fora). */
  falhaBase: boolean;
  onEscolher: (base: BaseMapaId) => void;
  onFechar: () => void;
}

/** Painel "Mapa base": grupo de opções (rádio nativo, setas trocam a opção). */
export function SeletorBase({ base, falhaBase, onEscolher, onFechar }: PropsSeletorBase) {
  const idTitulo = useId();
  const nomeGrupo = useId();
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
    <section ref={painelRef} className="mapa-painel" aria-labelledby={idTitulo} tabIndex={-1} onKeyDown={aoTeclar}>
      <div className="mapa-painel__topo">
        <h2 id={idTitulo} className="mapa-painel__titulo">
          Mapa base
        </h2>
        <button type="button" className="mapa-painel__fechar" onClick={onFechar} aria-label="Fechar painel de mapa base">
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="mapa-painel__corpo" role="radiogroup" aria-labelledby={idTitulo}>
        {BASES_MAPA.map((id) => {
          const definicao = CATALOGO_BASES[id];
          const Icone = ICONES[definicao.icone];
          const ativo = id === base;
          return (
            <label key={id} className="mapa-base-op" data-ativo={ativo}>
              <input
                type="radio"
                name={nomeGrupo}
                value={id}
                checked={ativo}
                onChange={() => onEscolher(id)}
              />
              <Icone aria-hidden="true" />
              <span>{definicao.rotulo}</span>
              {ativo ? <Check className="mapa-base-op__marca" aria-hidden="true" /> : null}
            </label>
          );
        })}
      </div>
      <p className="mapa-painel__rodape" data-tom={falhaBase ? "alerta" : undefined}>
        {falhaBase ? (
          <>
            <TriangleAlert aria-hidden="true" />
            Mapa base indisponível no momento — os limites e os registros continuam no mapa.
          </>
        ) : (
          "Imagens e mapas: Esri. A escolha fica salva neste navegador."
        )}
      </p>
    </section>
  );
}
