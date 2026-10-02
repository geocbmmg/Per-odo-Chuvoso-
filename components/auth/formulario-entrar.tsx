"use client";

import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cpfValido, interpretarIdentificador, mascararCpfDigitado } from "@/lib/auth/cpf";
import { caminhoDeVolta } from "@/lib/auth/voltar";
import { cn } from "@/lib/utils";

import { enviarAuth } from "./enviar";
import { MensagemErroAuth } from "./mensagem-erro";

const CLASSE_CAMPO = [
  "h-11 w-full rounded-[9px] border border-input bg-sup-1 pl-10 text-[15px] text-ink",
  "placeholder:text-faint transition-colors hover:border-linha/24 focus-visible:border-acc/60",
  "aria-invalid:border-perigo disabled:opacity-60",
].join(" ");

type Campo = "cpf" | "senha";

/**
 * Formulário de entrada com CPF e senha do GeoRescue. O navegador fala só com
 * a Sala (POST /api/auth/login, mesma origem); quem confere a senha é o
 * GeoRescue, de servidor para servidor. A senha nunca é guardada no navegador
 * além do campo, que é limpo depois de uma recusa.
 *
 * Acessível: rótulos visíveis, erro num aria-live="assertive" ligado aos campos
 * por aria-describedby, aria-invalid no campo com problema, botão com estado
 * de envio e alvos de 44px.
 */
export function FormularioEntrar({ voltar, esqueciUrl }: { voltar: string; esqueciUrl: string | null }) {
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campoInvalido, setCampoInvalido] = useState<Campo | null>(null);
  const refCpf = useRef<HTMLInputElement>(null);
  const refSenha = useRef<HTMLInputElement>(null);

  function falhar(mensagem: string, campo: Campo | null) {
    setErro(mensagem);
    setCampoInvalido(campo);
    if (campo === "cpf") refCpf.current?.focus();
    if (campo === "senha") refSenha.current?.focus();
  }

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    const id = interpretarIdentificador(identificador);
    if (!id) return falhar("Informe o CPF com 11 dígitos.", "cpf");
    if (id.tipo === "cpf" && !cpfValido(id.valor)) return falhar("CPF inválido: confira os dígitos.", "cpf");
    if (!senha) return falhar("Informe a senha.", "senha");

    setEnviando(true);
    setErro(null);
    setCampoInvalido(null);
    const resultado = await enviarAuth("/api/auth/login", id.tipo === "cpf" ? { cpf: id.valor, senha } : { usuario: id.valor, senha });
    if (resultado.ok) {
      setSenha("");
      // Navegação completa: o cabeçalho e as páginas do servidor releem o cookie novo.
      window.location.assign(caminhoDeVolta(voltar));
      return;
    }
    setEnviando(false);
    if (resultado.motivo === "credenciais") {
      setSenha("");
      falhar(resultado.erro, "senha");
    } else if (resultado.motivo === "entrada_invalida") {
      falhar(resultado.erro, /senha/i.test(resultado.erro) ? "senha" : "cpf");
    } else {
      falhar(resultado.erro, null);
    }
  }

  const descricaoCpf = cn("entrar-cpf-dica", campoInvalido === "cpf" && "entrar-erro");
  const descricaoSenha = cn(campoInvalido === "senha" && "entrar-erro");

  return (
    <form noValidate onSubmit={aoEnviar} aria-busy={enviando} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="entrar-cpf" className="text-[12.5px] font-bold text-ink-2">
          CPF
        </label>
        <div className="relative">
          <UserRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-mut" />
          <input
            ref={refCpf}
            id="entrar-cpf"
            name="usuario"
            type="text"
            inputMode="numeric"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="000.000.000-00"
            maxLength={64}
            required
            value={identificador}
            disabled={enviando}
            aria-invalid={campoInvalido === "cpf" || undefined}
            aria-describedby={descricaoCpf || undefined}
            onChange={(e) => {
              setIdentificador(mascararCpfDigitado(e.target.value));
              if (campoInvalido === "cpf") setCampoInvalido(null);
            }}
            className={cn(CLASSE_CAMPO, "pr-3 tabular-nums")}
          />
        </div>
        <p id="entrar-cpf-dica" className="text-[11.5px] leading-snug text-mut">
          O mesmo CPF e senha do GeoRescue.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="entrar-senha" className="text-[12.5px] font-bold text-ink-2">
          Senha
        </label>
        <div className="relative">
          <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-mut" />
          <input
            ref={refSenha}
            id="entrar-senha"
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={256}
            required
            value={senha}
            disabled={enviando}
            aria-invalid={campoInvalido === "senha" || undefined}
            aria-describedby={descricaoSenha || undefined}
            onChange={(e) => {
              setSenha(e.target.value);
              if (campoInvalido === "senha") setCampoInvalido(null);
            }}
            className={cn(CLASSE_CAMPO, "pr-12")}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={mostrarSenha}
            aria-controls="entrar-senha"
            className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-[8px] text-mut transition-colors hover:bg-linha/6 hover:text-ink-forte"
          >
            {mostrarSenha ? <EyeOff aria-hidden="true" className="size-[18px]" /> : <Eye aria-hidden="true" className="size-[18px]" />}
          </button>
        </div>
      </div>

      <MensagemErroAuth id="entrar-erro" mensagem={erro} />

      <Button type="submit" size="lg" disabled={enviando} className="h-11 w-full text-[14px]">
        {enviando ? (
          <>
            <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
            Entrando…
          </>
        ) : (
          <>
            <LogIn aria-hidden="true" />
            Entrar
          </>
        )}
      </Button>

      {esqueciUrl ? (
        <p className="text-center text-[12.5px] text-mut">
          <a
            href={esqueciUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative alvo-toque font-semibold text-acc-txt underline-offset-4 hover:underline"
          >
            Esqueci minha senha
            <span className="sr-only"> (abre o GeoRescue em outra aba)</span>
          </a>
          <span aria-hidden="true"> · no GeoRescue</span>
        </p>
      ) : null}
    </form>
  );
}
