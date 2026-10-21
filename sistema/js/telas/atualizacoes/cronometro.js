// Cronômetro (F4).
// ================
//
// O relógio é o do servidor: iniciar e parar são funções do banco que usam a
// hora dele (clock_timestamp), e cada pessoa tem no máximo um cronômetro
// aberto. A tela só mostra o tempo correndo: pergunta ao banco quando começou
// (`meu_cronometro`, que devolve também a hora do servidor) e conta a partir
// daí com o relógio monotônico do navegador — mudar a hora do computador não
// muda nada.
//
// O indicador fica na lateral, e no topo no celular, em todas as telas. Outra
// aba do mesmo navegador sabe na hora (BroadcastChannel); outro computador,
// na próxima conferência, a cada 15 segundos.
//
// "Anotar" (21/10, pedido do Guilherme): escrever o relato com o relógio
// correndo, em vez de só ao parar. Grava sozinho — a cada 20 s de digitação e
// ao fechar —, e o "Parar" já abre com o texto.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado, nomeDe, pode } from '../../nucleo/estado.js';
import { dataHora, duracao, horaDoMinuto, instante, noFuso } from '../../nucleo/formato.js';
import { html } from '../../nucleo/html.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_ATUALIZACAO, minutosDe, TIPOS_ATUALIZACAO } from '../../dominio/tempo.js';
import { campoCliente } from '../clientes.js';
import { opcoes } from '../comum.js';
import { apoioAtualizacao, atualizarSituacao, campoSituacao, ligarProcesso, notificarAtualizacoes } from './formulario.js';

const CONFERIR_A_CADA = 15_000;
const SALVAR_A_CADA = 20_000; // anotações: um registro no histórico a cada 20 s de digitação, não a cada tecla
const LONGO = 8 * 60; // minutos: cronômetro aberto há mais que isso provavelmente foi esquecido

const relogio = (segundos) => [Math.floor(segundos / 3600), Math.floor(segundos / 60) % 60, segundos % 60]
  .map((n) => String(n).padStart(2, '0')).join(':');

/** Liga o indicador global. Devolve a função que o desliga (ao sair). */
export function ligarCronometro(raiz) {
  if (!pode.clientes()) return () => {};

  const membroId = estado.membro.id;
  let vivo = true;
  let buscando = false;
  let atual = null; // a atividade aberta, ou null
  let base = 0; // milissegundos já corridos na hora da última conferência
  let sincronizado = 0; // performance.now() dessa conferência

  // Uma caixa na lateral e outra no topo do celular; o CSS mostra a que cabe.
  const caixas = ['.lateral__rodape', '.topo-movel'].map((seletor) => {
    const caixa = document.createElement('div');
    caixa.className = 'cronometro-global';
    caixa.hidden = true;
    caixa.innerHTML = String(html`
      <span class="cronometro-global__nome"><span class="cronometro-global__ponto" aria-hidden="true"></span><span data-nome></span></span>
      <span class="cronometro-global__tempo" data-tempo aria-hidden="true"></span>
      <button type="button" class="botao botao--pequeno" data-anotar>Anotar</button>
      <button type="button" class="botao botao--pequeno" data-parar>Parar</button>`);
    raiz.querySelector(seletor)?.prepend(caixa);
    caixa.querySelector('[data-anotar]').addEventListener('click', () => anotarCronometro(atual?.id, atual?.cliente_nome).catch(avisarErro));
    caixa.querySelector('[data-parar]').addEventListener('click', () => pararCronometro(atual?.id).catch(avisarErro));
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
      const resposta = await db.rpc('meu_cronometro');
      if (!vivo || estado.membro?.id !== membroId) return;
      atual = resposta.atualizacao;
      base = atual ? Math.max(0, Date.parse(resposta.agora) - Date.parse(atual.inicio)) : 0;
      sincronizado = performance.now();
      if (atual) {
        const nome = atual.cliente_nome || 'Cliente';
        for (const caixa of caixas) {
          caixa.querySelector('[data-nome]').textContent = nome;
          caixa.setAttribute('role', 'group');
          caixa.setAttribute('aria-label', `Cronômetro de ${nome}, desde ${dataHora(atual.inicio)}`);
          caixa.title = `${nomeDe(membroId)} · ${TIPOS_ATUALIZACAO[atual.tipo]} · ${nome}`;
        }
      }
      tique();
    } catch {
      for (const caixa of caixas) caixa.title = 'Não foi possível sincronizar o cronômetro. A próxima conferência será automática.';
    } finally {
      buscando = false;
    }
  };

  const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('fhl-cronometro') : null;
  const mudou = () => {
    ler();
    canal?.postMessage({ membroId });
  };
  if (canal) canal.onmessage = (e) => { if (e.data?.membroId === membroId) ler(); };
  const voltou = () => { if (!document.hidden) ler(); };

  addEventListener('fhl:atualizacoes', mudou);
  document.addEventListener('visibilitychange', voltou);
  addEventListener('focus', ler);
  const tic = setInterval(tique, 1000);
  const conferencia = setInterval(voltou, CONFERIR_A_CADA);
  ler();

  return () => {
    vivo = false;
    clearInterval(tic);
    clearInterval(conferencia);
    canal?.close();
    removeEventListener('fhl:atualizacoes', mudou);
    document.removeEventListener('visibilitychange', voltou);
    removeEventListener('focus', ler);
    caixas.forEach((caixa) => caixa.remove());
  };
}

/** Diálogo "Iniciar cronômetro". Com `compromisso_id`, é o "Iniciar
 *  atendimento" da Agenda: o banco registra também a chegada do cliente. Se o
 *  atendimento ainda não tem cliente (reserva do Google, marcado só com o
 *  nome), escolhe-se ou cadastra-se aqui, e o banco o liga ao compromisso. */
export async function iniciarCronometro({ cliente_id = null, processo_id = null, compromisso_id = null, tipo = 'atendimento_presencial' } = {}) {
  const [clientes, processos] = await apoioAtualizacao();
  const rotulo = compromisso_id ? 'Iniciar atendimento' : 'Iniciar cronômetro';
  const semCliente = Boolean(compromisso_id) && !cliente_id;
  return abrirDialogo({
    titulo: rotulo,
    rotuloOk: rotulo,
    corpo: html`
      ${semCliente ? html`<p class="nota nota--info">Este atendimento ainda não tem cliente vinculado. Escolha quem está sendo
        atendido — ou cadastre com “Novo” — e ele fica ligado ao compromisso.</p>` : ''}
      <div class="campos">
        ${campoCliente(clientes, { atual: cliente_id })}
        <label class="campo"><span>Processo / caso</span><select name="processo_id"></select></label>
        <label class="campo"><span>Tipo de atividade</span><select name="tipo">${opcoes(Object.entries(TIPOS_ATUALIZACAO), tipo)}</select></label>
        <label class="campo"><span>Relato inicial (opcional)</span><textarea name="relato" rows="3" maxlength="30000"></textarea></label>
      </div>`,
    aoAbrir: (_, form) => ligarProcesso(form, clientes, processos, processo_id),
    aoEnviar: async (d) => {
      if (compromisso_id && cliente_id && d.cliente_id !== cliente_id) throw new Error('Mantenha o cliente do atendimento selecionado.');
      const id = await db.rpc('iniciar_cronometro', {
        p: { cliente_id: d.cliente_id, processo_id: d.processo_id || null, tipo: d.tipo, relato: d.relato, compromisso_id },
      });
      notificarAtualizacoes();
      avisar(`${compromisso_id ? 'Atendimento iniciado' : 'Cronômetro iniciado'}. Para escrever durante, use “Anotar” no cronômetro.`, 'ok', 8000);
      return id;
    },
  });
}

const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "Anotar": o relato e a próxima providência com o cronômetro correndo. */
export async function anotarCronometro(id = null, clienteNome = '') {
  const aberta = id
    ? await db.um('atualizacoes', { select: COLUNAS_ATUALIZACAO, filtros: [['id', 'eq', id]] })
    : (await db.rpc('meu_cronometro')).atualizacao;
  if (!aberta || aberta.fim || aberta.cancelado_em) throw new Error('Este cronômetro não está rodando.');
  const nome = clienteNome || aberta.cliente_nome || '';

  // O que já está no banco: só grava se mudou.
  let salvo = { relato: aberta.relato ?? '', proxima: aberta.proxima_providencia ?? '' };
  const gravar = async (relato, proxima) => {
    if (relato === salvo.relato && proxima === salvo.proxima) return false;
    // Só a atividade ainda aberta: parada em outro lugar, não se reescreve aqui
    // (o alterar sem linha nenhuma vira o erro abaixo).
    try {
      await db.alterar('atualizacoes',
        [['id', 'eq', aberta.id], ['fim', 'is', null], ['cancelado_em', 'is', null]],
        { relato: relato.trim() || null, proxima_providencia: proxima.trim() || null }, 'id');
    } catch (erro) {
      if (!/não encontrado/i.test(erro.message)) throw erro;
      throw new Error('O cronômetro já foi parado em outro lugar, e estas anotações não foram gravadas. Copie o texto e acrescente pela atividade, em Atualizações.');
    }
    salvo = { relato, proxima };
    return true;
  };

  return abrirDialogo({
    titulo: `Anotações do atendimento${nome ? ` — ${nome}` : ''}`,
    largo: true,
    rotuloOk: 'Salvar',
    rotuloFechar: 'Fechar',
    corpo: html`
      <p class="sub dialogo__texto">${nomeDe(aberta.membro_id)} · desde ${dataHora(aberta.inicio)} · o cronômetro continua contando.</p>
      <div class="campos">
        <label class="campo"><span>Relato do atendimento</span><textarea name="relato" rows="10" maxlength="30000" autofocus>${aberta.relato ?? ''}</textarea></label>
        <label class="campo"><span>Próxima providência</span><textarea name="proxima" rows="2" maxlength="5000">${aberta.proxima_providencia ?? ''}</textarea></label>
      </div>
      <p class="sub secao" data-salvo aria-live="polite">Grava sozinho enquanto você escreve. Ao parar o cronômetro, o relato já vem preenchido.</p>`,
    aoAbrir: (dialogo, form) => {
      const situacao = dialogo.querySelector('[data-salvo]');
      let espera = null;
      const agora = async () => {
        clearTimeout(espera);
        espera = null;
        try {
          if (await gravar(form.relato.value, form.proxima.value)) situacao.textContent = `Salvo às ${horaAgora()}. O cronômetro continua contando.`;
        } catch (erro) {
          situacao.textContent = erro.message;
        }
      };
      form.addEventListener('input', () => {
        situacao.textContent = 'Alterações ainda não gravadas…';
        if (!espera) espera = setTimeout(agora, SALVAR_A_CADA);
      });
      // Fechou com texto novo (Esc, × ou Fechar): grava antes de o diálogo sumir.
      const aoSair = () => {
        clearTimeout(espera);
        espera = null;
        gravar(form.relato.value, form.proxima.value)
          .then((mudou) => { if (mudou) avisar('Anotações gravadas. O cronômetro continua contando.'); })
          .catch(avisarErro);
      };
      dialogo.addEventListener('cancel', aoSair);
      dialogo.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) aoSair(); }, true);
    },
    aoEnviar: async (d) => {
      await gravar(d.relato ?? '', d.proxima ?? '');
      notificarAtualizacoes();
      avisar('Anotações gravadas. O cronômetro continua contando.');
      return true;
    },
  });
}

/** Diálogo "Parar": relato, próxima providência e, se o relógio ficou
 *  esquecido, a hora real do fim — que transforma a atividade em lançada à mão. */
export async function pararCronometro(id = null) {
  const aberta = id
    ? await db.um('atualizacoes', { select: COLUNAS_ATUALIZACAO, filtros: [['id', 'eq', id]] })
    : (await db.rpc('meu_cronometro')).atualizacao;
  if (!aberta || aberta.fim || aberta.cancelado_em) throw new Error('Este cronômetro não está rodando.');

  const referencia = await db.rpc('meu_cronometro');
  const minutos = minutosDe(aberta, referencia.agora);
  const agora = noFuso(referencia.agora);

  return abrirDialogo({
    titulo: 'Parar cronômetro',
    largo: true,
    rotuloOk: 'Salvar e parar',
    corpo: html`
      <p class="sub">${nomeDe(aberta.membro_id)} · iniciado em ${dataHora(aberta.inicio)} · ${duracao(minutos)}</p>
      ${minutos > LONGO ? html`<p class="nota">O cronômetro está rodando há ${duracao(minutos)}. Parou na hora certa? Informe o fim real se necessário.</p>` : ''}
      <div class="campos">
        <label class="campo"><span>Relato do atendimento / trabalho</span><textarea name="relato" rows="5" maxlength="30000" autofocus>${aberta.relato ?? ''}</textarea></label>
        <label class="campo"><span>Próxima providência</span><textarea name="proxima" rows="2" maxlength="5000">${aberta.proxima_providencia ?? ''}</textarea></label>
        ${campoSituacao()}
        <label class="opcao"><input type="checkbox" name="fim_real"> Esqueci de parar: informar a hora real do fim</label>
        <label class="campo" data-fim-real hidden><span>Fim real</span><input type="datetime-local" name="fim" value="${agora.dia}T${horaDoMinuto(agora.minuto)}" required disabled>
          <span class="campo__ajuda">Ao corrigir a hora, a atividade passa a ser lançada à mão.</span></label>
        <label class="opcao"><input type="checkbox" name="gerar_ficha"> Gerar ficha de atendimento ao salvar</label>
      </div>`,
    aoAbrir: (dialogo, form) => {
      form.fim_real.addEventListener('change', () => {
        form.fim.disabled = !form.fim_real.checked;
        dialogo.querySelector('[data-fim-real]').hidden = !form.fim_real.checked;
      });
    },
    aoEnviar: async (d) => {
      const fim = d.fim_real ? instante(d.fim.slice(0, 10), d.fim.slice(11)) : null;
      await db.rpc('parar_cronometro', { p_id: aberta.id, p_relato: d.relato, p_proxima: d.proxima, p_fim: fim });
      await atualizarSituacao(aberta.processo_id, d.situacao_processo);
      notificarAtualizacoes();
      avisar('Atividade registrada e cronômetro parado.');
      if (d.gerar_ficha) {
        navegar('/documentos/novo', { modelo: 'ficha_atendimento', cliente: aberta.cliente_id, processo: aberta.processo_id, atualizacao: aberta.id });
      }
      return true;
    },
  });
}
