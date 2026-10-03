/**
 * Altura da área do mapa de risco (classes Tailwind): ~60% da tela no celular
 * (mínimo de 340 px) e 620 px no desktop. Num módulo próprio para a página e
 * o esqueleto não precisarem importar o componente pesado do mapa.
 *
 * No mapa de verdade o mínimo de 340 px é reposto por components/mapa/mapa.css
 * (.risco-mapa .mapa-sit__area): a regra base .mapa-sit__area { min-height: 0 }
 * fica fora de camada e vence o utilitário min-h-[340px] (@layer utilities).
 * Os dois valores (340 px / 768 px) precisam andar juntos.
 */
export const ALTURA_MAPA_RISCO = "h-[60svh] min-h-[340px] md:h-[620px] md:min-h-0";
