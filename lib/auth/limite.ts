import { createHmac, randomBytes } from "node:crypto";

/**
 * Limite de tentativas de login em memória, por janela deslizante.
 *
 * Por que: o GeoRescue bloqueia a conta após 5 senhas erradas seguidas; sem
 * limite aqui, a Sala viraria um caminho para travar contas de terceiros e
 * para varrer senhas (cada tentativa custa um PBKDF2 de 260 mil iterações lá).
 *
 * - Por IP e por conta (CPF ou usuário). A chave da conta é um HMAC com sal
 *   aleatório do processo: o CPF não fica em claro nem na memória.
 * - A vaga é reservada ANTES de chamar o GeoRescue (pedidos em paralelo não
 *   furam o limite) e devolvida quando a senha conferiu ou quando a falha foi
 *   da infraestrutura — só a senha errada fica contada.
 * - Limitação: a memória é por instância serverless (perde-se num cold start e
 *   não é compartilhada). É uma barreira de custo, não a única: o bloqueio por
 *   conta continua sendo o do GeoRescue.
 */

export interface EstadoLimite {
  permitido: boolean;
  /** Segundos até liberar uma vaga (0 quando permitido). */
  tentarEmS: number;
}

export class LimiteTentativas {
  private readonly registros = new Map<string, number[]>();

  constructor(
    readonly maximo: number,
    readonly janelaMs: number,
    /** Teto de chaves guardadas (proteção de memória contra varredura de IPs). */
    private readonly capacidade = 20_000,
  ) {}

  private vigentes(chave: string, agoraMs: number): number[] {
    const lista = this.registros.get(chave);
    if (!lista) return [];
    const vivos = lista.filter((t) => agoraMs - t < this.janelaMs);
    if (vivos.length === 0) this.registros.delete(chave);
    else if (vivos.length !== lista.length) this.registros.set(chave, vivos);
    return vivos;
  }

  /** Consulta sem consumir. */
  estado(chave: string, agoraMs: number = Date.now()): EstadoLimite {
    const vivos = this.vigentes(chave, agoraMs);
    if (vivos.length < this.maximo) return { permitido: true, tentarEmS: 0 };
    const liberaEm = vivos[vivos.length - this.maximo] + this.janelaMs;
    return { permitido: false, tentarEmS: Math.max(1, Math.ceil((liberaEm - agoraMs) / 1000)) };
  }

  /** Reserva uma vaga (chame só depois de `estado(...).permitido`). */
  registrar(chave: string, agoraMs: number = Date.now()): void {
    const vivos = this.vigentes(chave, agoraMs);
    vivos.push(agoraMs);
    this.registros.delete(chave); // reinsere no fim: a ordem do Map vira "mais recente por último"
    this.registros.set(chave, vivos);
    if (this.registros.size > this.capacidade) this.podar(agoraMs);
  }

  /** Devolve a vaga reservada mais recente (tentativa que não deve contar). */
  devolver(chave: string): void {
    const lista = this.registros.get(chave);
    if (!lista || lista.length === 0) return;
    lista.pop();
    if (lista.length === 0) this.registros.delete(chave);
  }

  /** Só para testes. */
  limpar(): void {
    this.registros.clear();
  }

  private podar(agoraMs: number): void {
    for (const chave of [...this.registros.keys()]) this.vigentes(chave, agoraMs);
    // Ainda cheio: descarta as chaves menos recentes (início do Map).
    for (const chave of this.registros.keys()) {
      if (this.registros.size <= this.capacidade) break;
      this.registros.delete(chave);
    }
  }
}

/** 10 tentativas por IP em 10 min (a rede do CBMMG pode sair por um IP só). */
export const LIMITE_POR_IP = { maximo: 10, janelaMs: 10 * 60_000 } as const;
/** 5 tentativas por conta em 10 min (o GeoRescue bloqueia na 5ª senha errada seguida). */
export const LIMITE_POR_CONTA = { maximo: 5, janelaMs: 10 * 60_000 } as const;

const SAL_PROCESSO = randomBytes(32);

/** Chave da conta no limite: HMAC com sal aleatório do processo (nunca o CPF em claro). */
export function chaveDaConta(identificador: string): string {
  return createHmac("sha256", SAL_PROCESSO).update(identificador.trim().toLowerCase()).digest("base64url");
}
