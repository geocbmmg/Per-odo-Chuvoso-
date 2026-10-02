import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { FonteIndisponivelError, type FonteId } from "@/lib/fontes/tipos";

/** Erro padrão dos clientes que ainda são stubs (Fase 0). */
export function naoImplementada(fonte: FonteId): never {
  throw new FonteIndisponivelError(
    fonte,
    `${CATALOGO_FONTES[fonte].nome}: cliente ainda não implementado (previsto para a Fase 1).`,
  );
}
