// Notificação do computador (a da barra do Windows), 12/11/2026.
// ===============================================================
//
// Só com a permissão do navegador — pedida por um botão em Minha conta, nunca
// sozinha — e com a preferência deste computador ligada. Sem isso, nada sai
// daqui: os avisos continuam no canto da tela do sistema.
//
// No celular (Chrome do Android) a notificação da página exige um
// "service worker", que o sistema não tem: lá o aviso fica só na tela.

const CHAVE = 'fhl.notificacoes.computador';

export const suportaNotificacao = () => typeof Notification === 'function';

export function permissaoNotificacao() {
  return suportaNotificacao() ? Notification.permission : 'indisponivel';
}

/** Ligadas neste computador: permissão dada e a pessoa não desligou. */
export function notificacoesLigadas() {
  if (permissaoNotificacao() !== 'granted') return false;
  try {
    return localStorage.getItem(CHAVE) !== 'nao';
  } catch {
    return true;
  }
}

export function guardarPreferencia(ligar) {
  try {
    localStorage.setItem(CHAVE, ligar ? 'sim' : 'nao');
  } catch { /* armazenamento bloqueado: vale só agora */ }
}

/** Pede a permissão (precisa vir de um clique). Devolve 'granted', 'denied'… */
export async function pedirPermissao() {
  if (!suportaNotificacao()) return 'indisponivel';
  const resposta = await Notification.requestPermission();
  if (resposta === 'granted') guardarPreferencia(true);
  return resposta;
}

/**
 * Mostra a notificação do computador, se estiver ligada. `tag` evita
 * repetir a mesma em duas abas; clicar traz a aba do sistema para a frente.
 */
export function notificarComputador({ titulo, corpo = '', tag, aoClicar = null, insistente = false }) {
  if (!notificacoesLigadas()) return null;
  try {
    const n = new Notification(titulo, {
      body: corpo, tag, lang: 'pt-BR', icon: '/sistema/img/favicon.png', requireInteraction: insistente,
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* sem foco: segue */ }
      aoClicar?.();
      n.close();
    };
    return n;
  } catch {
    // Android: "Illegal constructor" sem service worker.
    return null;
  }
}
