// Sessão encerrada por inatividade (DOCX §3, preparação T05; revisto em 12/11/2026).
// ==================================================================================
//
// Sem clique, tecla, rolagem ou movimento do mouse por N minutos (Operação →
// Configuração; 60 por padrão desde 12/11), a tela avisa 5 minutos antes e
// sai — fecha os diálogos abertos e apaga a sessão deste navegador. A última
// interação é compartilhada entre as abas: trabalhar numa aba mantém as
// outras abertas. A conta está em dominio/sessao.js.
//
// O aviso também chega com a aba escondida (os advogados trabalham no
// Projudi e no Word com o sistema ao lado): o título da aba pisca e, se as
// notificações do computador estiverem ligadas, sai uma notificação — clicar
// nela mantém a sessão. Cronômetro aberto segura a sessão por até 3 horas.
//
// É uma proteção da TELA, para o computador esquecido aberto. A renovação
// automática do token não conta como interação. Bloqueio estrito no servidor
// (sessão expirada recusada pela API) depende da configuração de sessões do
// Auth do Supabase, que varia por plano — ver docs/operacao/.

import { db, sair, sessaoAtual } from './supabase.js';
import { notificarComputador } from './notificar.js';
import { MINUTOS_PADRAO, relogioRegressivo, situacaoDaSessao } from '../dominio/sessao.js';

const CHAVE = 'fhl.ultima-interacao';
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input', 'mousemove'];

// Cronômetros abertos nesta aba (atendimento, tarefa): seguram a sessão.
const cronometros = new Set();
export function marcarCronometro(chave, aberto) {
  if (aberto) cronometros.add(chave);
  else cronometros.delete(chave);
}

const ler = () => {
  try {
    return Number(localStorage.getItem(CHAVE)) || 0;
  } catch {
    return 0;
  }
};

export function ligarInatividade() {
  let minutos = MINUTOS_PADRAO;
  let ultima = Date.now();
  let gravada = 0;
  let aviso = null;
  let tituloOriginal = null;
  let piscar = null;
  let contagem = null;
  let notificacao = null;

  db.um('config_seguranca', { select: 'inatividade_minutos' })
    .then((c) => {
      if (c?.inatividade_minutos) minutos = Number(c.inatividade_minutos);
    })
    .catch(() => {});

  const marcar = (forcar = false) => {
    ultima = Date.now();
    tirarAviso();
    // Grava no máximo a cada 15 s: o evento "storage" acorda as outras abas.
    if (forcar || ultima - gravada > 15_000) {
      gravada = ultima;
      try {
        localStorage.setItem(CHAVE, String(ultima));
      } catch { /* armazenamento bloqueado: vale só esta aba */ }
    }
  };
  const aoUsar = () => marcar();

  const tirarAviso = () => {
    if (!aviso) return;
    aviso.remove();
    aviso = null;
    clearInterval(piscar);
    clearInterval(contagem);
    piscar = contagem = null;
    if (tituloOriginal !== null) document.title = tituloOriginal;
    tituloOriginal = null;
    notificacao?.close();
    notificacao = null;
  };

  const parada = () => Date.now() - Math.max(ultima, ler());
  const situacao = () => situacaoDaSessao({ parada: parada(), minutos, cronometroAberto: cronometros.size > 0 });

  const mostrarAviso = () => {
    if (aviso) return;
    aviso = document.createElement('div');
    aviso.className = 'aviso-inatividade';
    aviso.setAttribute('role', 'alertdialog');
    aviso.setAttribute('aria-live', 'assertive');
    aviso.setAttribute('aria-label', 'Aviso de saída por falta de uso');
    const texto = document.createElement('p');
    const atualizarTexto = () => {
      texto.textContent = `Sem uso há algum tempo: a sessão termina em ${relogioRegressivo(situacao().falta)}. Quer continuar conectado?`;
    };
    atualizarTexto();
    const continuar = document.createElement('button');
    continuar.type = 'button';
    continuar.className = 'botao botao--primario';
    continuar.textContent = 'Continuar conectado';
    continuar.addEventListener('click', () => marcar(true));
    const encerrar = document.createElement('button');
    encerrar.type = 'button';
    encerrar.className = 'botao botao--discreto aviso-inatividade__sair';
    encerrar.textContent = 'Sair agora';
    encerrar.addEventListener('click', () => {
      tirarAviso();
      sair();
    });
    aviso.append(texto, continuar, encerrar);
    document.body.append(aviso);
    if (!document.hidden) continuar.focus();
    contagem = setInterval(atualizarTexto, 1000);

    // Aba escondida: o título pisca e, se ligada, a notificação do computador.
    tituloOriginal = document.title;
    let alterna = false;
    piscar = setInterval(() => {
      if (!document.hidden) {
        document.title = tituloOriginal;
        return;
      }
      alterna = !alterna;
      document.title = alterna ? '⚠ Sessão terminando — FL' : tituloOriginal;
    }, 1000);
    if (document.hidden) {
      notificacao = notificarComputador({
        titulo: 'Sua sessão vai terminar',
        corpo: `Termina em ${Math.max(1, Math.round(situacao().falta / 60_000))} min por falta de uso. Clique aqui para continuar conectado.`,
        tag: 'fl-sessao',
        insistente: true,
        aoClicar: () => marcar(true),
      });
    }
  };

  const conferir = async () => {
    if (!sessaoAtual()) return;
    const s = situacao();
    if (s.acao === 'sair') {
      tirarAviso();
      // Nada de formulário pela metade aberto na tela de outra pessoa.
      for (const d of document.querySelectorAll('dialog')) d.remove();
      await sair();
    } else if (s.acao === 'avisar') {
      mostrarAviso();
    } else {
      // Outra aba foi usada: o aviso desta some.
      tirarAviso();
    }
  };

  // Outra aba marcou uso: confere já, para tirar o aviso desta.
  const aoGuardar = (e) => {
    if (e.key === CHAVE) conferir();
  };

  for (const e of EVENTOS) addEventListener(e, aoUsar, { passive: true, capture: true });
  addEventListener('storage', aoGuardar);
  const timer = setInterval(conferir, 20_000);
  marcar(true);

  return () => {
    clearInterval(timer);
    tirarAviso();
    removeEventListener('storage', aoGuardar);
    for (const e of EVENTOS) removeEventListener(e, aoUsar, { capture: true });
  };
}
