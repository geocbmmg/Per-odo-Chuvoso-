import { OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Região de erro dos formulários de entrada. Fica SEMPRE no DOM (vazia quando
 * não há erro) para o leitor de tela anunciar a mensagem nova
 * (aria-live="assertive"). Dois sinais: ícone em losango + texto.
 */
export function MensagemErroAuth({ id, mensagem, className }: { id: string; mensagem: string | null; className?: string }) {
  return (
    <div id={id} aria-live="assertive" aria-atomic="true" className={cn(!mensagem && "sr-only", className)}>
      {mensagem ? (
        <p className="flex items-start gap-2 rounded-[10px] border border-perigo/40 bg-perigo/12 px-3 py-2 text-[12.5px] font-semibold leading-snug text-perigo-txt">
          <OctagonAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>{mensagem}</span>
        </p>
      ) : null}
    </div>
  );
}
