// Cronômetro das tarefas (pedido de 12/11/2026).
// ===============================================
//
// "Ao clicar em Iniciar tarefa, o cronômetro começa a contar; dá para pausar,
// retomar e finalizar. Trabalhei 30 minutos, pausei, mais 20: 50 minutos." Cada
// trecho é um período em tarefas_tempos, com a hora do servidor (funções
// iniciar_tarefa, pausar_tarefa e finalizar_tarefa). Uma tarefa rodando por
// pessoa; iniciar outra pergunta se pausa a que está rodando.
//
// O indicador fica na lateral (e no topo do celular), como o do atendimento,
// e segura a sessão aberta (nucleo/inatividade.js).

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { ErroCampo } from '../../nucleo/formularios.js';
import { estado } from '../../nucleo/estado.js';
import { dataHora, duracao, horaDoMinuto, instante, noFuso } from '../../nucleo/formato.js';
import { html } from '../../nucleo/html.js';
import { marcarCronometro } from '../../nucleo/inatividade.js';
import { db } from '../../nucleo/supabase.js';

const CONFERIR_A_CADA = 15_000;
const LONGO_MS = 8 * 3600_000; // rodando há mais que isso: provavelmente esquecido

const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('fhl-tarefas') : null;
if (canal) canal.onmessage = () => dispatchEvent(new CustomEvent('fhl:tarefas', { detail: { remoto: true } }));

/** Avisa as telas abertas (nesta e nas outras abas) que o tempo de uma tarefa mudou. */
export function avisarTarefas() {
  dispatchEvent(new CustomEvent('fhl:tarefas'));
  canal?.postMessage({ membro: estado.membro?.id });
}

const relogio = (segundos) => [Math.floor(segundos / 3600), Math.floor(segundos / 60) % 60, segundos % 60]
  .map((n) => String(n).padStart(2, '0')).join(':');

/** Rodando há muito tempo: pergunta a hora real. Devolve { fim } ou null (desistiu). */
async function confirmarFim(desde, rotulo) {
  if (!desde || Date.now() - Date.parse(desde) < LONGO_MS) return { fim: null };
  const agora = noFuso(new Date().toISOString());
  return abrirDialogo({
    titulo: rotulo,
    rotuloOk: rotulo,
    corpo: html`
      <p class="dialogo__texto">O cronômetro desta tarefa está rodando desde ${dataHora(desde)} — há
        ${duracao((Date.now() - Date.parse(desde)) / 60000)}. Parou na hora certa?</p>
      <label class="opcao"><input type="checkbox" name="fim_real"> Esqueci de pausar: informar a hora real em que parei</label>
      <label class="campo" data-fim-real hidden><span>Parei em</span>
        <input type="datetime-local" name="fim" value="${agora.dia}T${horaDoMinuto(agora.minuto)}" required disabled></label>`,
    aoAbrir: (dialogo, form) => {
      form.fim_real.addEventListener('change', () => {
        form.fim.disabled = !form.fim_real.checked;
        dialogo.querySelector('[data-fim-real]').hidden = !form.fim_real.checked;
      });
    },
    aoEnviar: async (d) => {
      if (!d.fim_real) return { fim: null };
      if (!d.fim) throw new ErroCampo('fim', 'Informe a hora em que parou.');
      return { fim: instante(d.fim.slice(0, 10), d.fim.slice(11, 16)) };
    },
  });
}

/** "Iniciar" ou "Retomar". Com outra tarefa rodando, pergunta antes de pausá-la. */
export async function iniciarTarefa(id) {
  const meu = (await db.rpc('meu_cronometro_tarefa'))?.tarefa;
  let pausarOutra = false;
  if (meu && meu.id !== id) {
    const ok = await abrirDialogo({
      titulo: 'Outra tarefa está rodando',
      rotuloOk: 'Pausar a outra e iniciar esta',
      rotuloFechar: 'Voltar',
      corpo: html`<p class="dialogo__texto">O cronômetro de <strong>${meu.titulo}</strong> está rodando. Cada pessoa conta uma
        tarefa por vez: ela fica pausada, com o tempo guardado, e esta começa a contar.</p>`,
    });
    if (!ok) return false;
    pausarOutra = true;
  }
  await db.rpc('iniciar_tarefa', { p_id: id, p_pausar_outra: pausarOutra });
  avisarTarefas();
  avisar(pausarOutra ? 'A outra tarefa foi pausada e esta começou a contar.' : 'Cronômetro da tarefa iniciado. Pause quando parar.');
  return true;
}

export async function pausarTarefa(id, desde) {
  const r = await confirmarFim(desde, 'Pausar tarefa');
  if (!r) return false;
  await db.rpc('pausar_tarefa', { p_id: id, p_fim: r.fim });
  avisarTarefas();
  avisar('Tarefa pausada. O tempo fica guardado; use Retomar para continuar.');
  return true;
}

export async function finalizarTarefa(id, desde) {
  const r = await confirmarFim(desde, 'Finalizar tarefa');
  if (!r) return false;
  await db.rpc('finalizar_tarefa', { p_id: id, p_fim: r.fim });
  avisarTarefas();
  avisar('Tarefa concluída. O tempo dedicado fica no histórico dela.');
  return true;
}

/** O indicador da tarefa rodando, na lateral e no topo do celular. Devolve o desligar. */
export function ligarCronometroTarefa(raiz) {
  const membroId = estado.membro.id;
  let vivo = true;
  let buscando = false;
  let atual = null; // { id, titulo, desde, anterior }
  let base = 0;
  let sincronizado = 0;

  const caixas = ['.lateral__rodape', '.topo-movel'].map((seletor) => {
    const caixa = document.createElement('div');
    caixa.className = 'cronometro-global cronometro-global--tarefa';
    caixa.hidden = true;
    caixa.innerHTML = String(html`
      <span class="cronometro-global__nome"><span class="cronometro-global__ponto" aria-hidden="true"></span>
        <span class="cronometro-global__tipo">Tarefa</span><span data-nome></span></span>
      <span class="cronometro-global__tempo" data-tempo aria-hidden="true"></span>
      <button type="button" class="botao botao--pequeno" data-pausar>Pausar</button>
      <button type="button" class="botao botao--pequeno" data-finalizar>Finalizar</button>`);
    raiz.querySelector(seletor)?.prepend(caixa);
    const executar = (fn) => async (e) => {
      const botao = e.currentTarget;
      if (!atual || botao.disabled) return;
      botao.disabled = true;
      try {
        await fn(atual.id, atual.desde);
      } catch (erro) {
        avisarErro(erro);
      } finally {
        botao.disabled = false;
        ler();
      }
    };
    caixa.querySelector('[data-pausar]').addEventListener('click', executar(pausarTarefa));
    caixa.querySelector('[data-finalizar]').addEventListener('click', executar(finalizarTarefa));
    return caixa;
  });

  const tique = () => {
    if (!vivo) return;
    const segundos = Math.max(0, Math.floor((base + performance.now() - sincronizado) / 1000));
    for (const caixa of caixas) {
      caixa.hidden = !atual;
      if (atual) caixa.querySelector('[data-tempo]').textContent = relogio(segundos);
    }
  };

  const ler = async () => {
    if (!vivo || buscando || estado.membro?.id !== membroId) return;
    buscando = true;
    try {
      const resposta = await db.rpc('meu_cronometro_tarefa');
      if (!vivo || estado.membro?.id !== membroId) return;
      atual = resposta?.tarefa ?? null;
      marcarCronometro('tarefa', Boolean(atual));
      // O total da tarefa: o tempo já contado (de todos) e o trecho que está correndo.
      base = atual ? Number(atual.anterior || 0) * 1000 + Math.max(0, Date.parse(resposta.agora) - Date.parse(atual.desde)) : 0;
      sincronizado = performance.now();
      if (atual) {
        for (const caixa of caixas) {
          caixa.querySelector('[data-nome]').textContent = atual.titulo;
          caixa.setAttribute('role', 'group');
          caixa.setAttribute('aria-label', `Cronômetro da tarefa ${atual.titulo}, rodando desde ${dataHora(atual.desde)}`);
          caixa.title = `Tarefa: ${atual.titulo} — tempo total dedicado (este trecho desde ${dataHora(atual.desde)})`;
        }
      }
      tique();
    } catch {
      for (const caixa of caixas) caixa.title = 'Não foi possível sincronizar o cronômetro da tarefa. A próxima conferência será automática.';
    } finally {
      buscando = false;
    }
  };

  const voltou = () => { if (!document.hidden) ler(); };
  addEventListener('fhl:tarefas', ler);
  document.addEventListener('visibilitychange', voltou);
  addEventListener('focus', ler);
  const tic = setInterval(tique, 1000);
  const conferencia = setInterval(voltou, CONFERIR_A_CADA);
  ler();

  return () => {
    vivo = false;
    marcarCronometro('tarefa', false);
    clearInterval(tic);
    clearInterval(conferencia);
    removeEventListener('fhl:tarefas', ler);
    document.removeEventListener('visibilitychange', voltou);
    removeEventListener('focus', ler);
    caixas.forEach((caixa) => caixa.remove());
  };
}
