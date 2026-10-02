import type { CSSProperties } from "react";
import type { CamadaMapaId } from "@/lib/dominio/tipos";
import { COR_OCORRENCIA_FINALIZADA, SIMBOLOS, type FormaSimbolo } from "@/lib/mapa";

type FormaComArea = FormaSimbolo | "area" | "cobs";

interface PropsSimbolo {
  forma: FormaComArea;
  /** Cor de dado (tabelas de simbologia/COBs), nunca vinda da fonte. */
  cor?: string;
  contorno?: string;
  numero?: string;
  className?: string;
}

/** Amostra de símbolo da legenda/painel: forma + cor (o texto vem ao lado). */
export function Simbolo({ forma, cor, contorno, numero, className }: PropsSimbolo) {
  const estilo = { "--sim-cor": cor, "--sim-contorno": contorno } as CSSProperties;
  return (
    <span
      className={className ? `mapa-simbolo ${className}` : "mapa-simbolo"}
      data-forma={forma}
      style={estilo}
      aria-hidden="true"
    >
      {numero ? <span className="mapa-simbolo__n">{numero}</span> : null}
    </span>
  );
}

/** Símbolo de uma camada lógica (COBs = faixa com as 6 cores). */
export function SimboloCamada({ camada }: { camada: CamadaMapaId }) {
  if (camada === "cobs") return <Simbolo forma="cobs" />;
  const simbolo = SIMBOLOS[camada];
  return <Simbolo forma={simbolo.forma} cor={simbolo.cor} />;
}

export function SimboloOcorrenciaFinalizada() {
  return <Simbolo forma="alvo-apagado" cor={COR_OCORRENCIA_FINALIZADA} />;
}
