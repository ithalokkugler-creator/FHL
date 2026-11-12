// Saída por inatividade: a conta, sem tela (12/11/2026).
// =======================================================
//
// Os advogados trabalham no Projudi, no Word e no WhatsApp com o sistema
// aberto ao lado, e a sessão caía aos 30 minutos sem ninguém ver o aviso
// (registros do Auth de 11 e 12/11). Agora:
//   · o padrão é 60 minutos (Operação e LGPD continua ajustando);
//   · o aviso vem 5 minutos antes (metade do limite, se ele for curto);
//   · cronômetro aberto (atendimento ou tarefa) segura a sessão por até
//     3 horas desde o último uso — atender um cliente sem tocar no
//     computador não derruba ninguém, e o cronômetro esquecido não deixa a
//     sessão aberta para sempre.

export const AVISO_ANTES_MS = 5 * 60_000;
export const CRONOMETRO_SEGURA_MS = 3 * 60 * 60_000;
export const MINUTOS_PADRAO = 60;

/**
 * @param {object} p
 * @param {number} p.parada            milissegundos desde o último uso
 * @param {number} p.minutos           limite configurado
 * @param {boolean} [p.cronometroAberto]
 * @returns {{ acao: 'ok' | 'avisar' | 'sair', falta: number, limite: number }}
 */
export function situacaoDaSessao({ parada, minutos, cronometroAberto = false }) {
  const configurado = (Number(minutos) > 0 ? Number(minutos) : MINUTOS_PADRAO) * 60_000;
  const limite = cronometroAberto ? Math.max(configurado, CRONOMETRO_SEGURA_MS) : configurado;
  const antes = Math.min(AVISO_ANTES_MS, Math.floor(limite / 2));
  const falta = Math.max(0, limite - parada);
  if (parada >= limite) return { acao: 'sair', falta: 0, limite };
  if (parada >= limite - antes) return { acao: 'avisar', falta, limite };
  return { acao: 'ok', falta, limite };
}

/** "4:05" — o que falta, em minutos e segundos. */
export function relogioRegressivo(ms) {
  const segundos = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}
