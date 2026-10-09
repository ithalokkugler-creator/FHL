// Sessão encerrada por inatividade (DOCX §3, preparação T05).
// ==========================================================
//
// Sem clique, tecla ou rolagem por N minutos (Operação → Configuração; 30 por
// padrão), a tela avisa um minuto antes e sai — fecha os diálogos abertos e
// apaga a sessão deste navegador. A última interação é compartilhada entre
// as abas: trabalhar numa aba mantém as outras abertas.
//
// É uma proteção da TELA, para o computador esquecido aberto. A renovação
// automática do token não conta como interação. Bloqueio estrito no servidor
// (sessão expirada recusada pela API) depende da configuração de sessões do
// Auth do Supabase, que varia por plano — ver docs/operacao/.

import { db, sair, sessaoAtual } from './supabase.js';

const CHAVE = 'fhl.ultima-interacao';
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'];

const ler = () => {
  try {
    return Number(localStorage.getItem(CHAVE)) || 0;
  } catch {
    return 0;
  }
};

export function ligarInatividade() {
  let minutos = 30;
  let ultima = Date.now();
  let gravada = 0;
  let aviso = null;

  db.um('config_seguranca', { select: 'inatividade_minutos' })
    .then((c) => {
      if (c?.inatividade_minutos) minutos = Number(c.inatividade_minutos);
    })
    .catch(() => {});

  const marcar = () => {
    ultima = Date.now();
    tirarAviso();
    // Grava no máximo a cada 15 s: o evento "storage" acorda as outras abas.
    if (ultima - gravada > 15_000) {
      gravada = ultima;
      try {
        localStorage.setItem(CHAVE, String(ultima));
      } catch { /* armazenamento bloqueado: vale só esta aba */ }
    }
  };

  const tirarAviso = () => {
    aviso?.remove();
    aviso = null;
  };

  const mostrarAviso = () => {
    if (aviso) return;
    aviso = document.createElement('div');
    aviso.className = 'aviso-inatividade';
    aviso.setAttribute('role', 'alertdialog');
    aviso.setAttribute('aria-live', 'assertive');
    const texto = document.createElement('p');
    texto.textContent = 'Sem atividade há algum tempo: a sessão vai ser encerrada em 1 minuto.';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao botao--primario';
    botao.textContent = 'Continuar conectado';
    botao.addEventListener('click', marcar);
    aviso.append(texto, botao);
    document.body.append(aviso);
    botao.focus();
  };

  const conferir = async () => {
    if (!sessaoAtual()) return;
    const parada = Date.now() - Math.max(ultima, ler());
    const limite = minutos * 60_000;
    if (parada >= limite) {
      tirarAviso();
      // Nada de formulário pela metade aberto na tela de outra pessoa.
      for (const d of document.querySelectorAll('dialog')) d.remove();
      await sair();
    } else if (parada >= limite - 60_000) {
      mostrarAviso();
    }
  };

  for (const e of EVENTOS) addEventListener(e, marcar, { passive: true, capture: true });
  const timer = setInterval(conferir, 20_000);
  marcar();

  return () => {
    clearInterval(timer);
    tirarAviso();
    for (const e of EVENTOS) removeEventListener(e, marcar, { capture: true });
  };
}
