// Lançar ou editar uma atualização à mão (F4), e as peças que o cronômetro
// também usa: cliente → processo, situação do processo e o aviso de mudança.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado, membrosAtivos, nomeDe, pode } from '../../nucleo/estado.js';
import { hoje, horaDoMinuto, noFuso } from '../../nucleo/formato.js';
import { html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO, SITUACOES_PROCESSO } from '../../dominio/clientes.js';
import { COLUNAS_ATUALIZACAO, prepararAtualizacao, TIPOS_ATUALIZACAO } from '../../dominio/tempo.js';
import { campoCliente, ligarCampoCliente } from '../clientes.js';
import { opcoes } from '../comum.js';

/** Avisa o cronômetro global e as telas abertas (ficha, linha do tempo, Hoje). */
export const notificarAtualizacoes = () => dispatchEvent(new Event('fhl:atualizacoes'));

/** A situação do processo é uma gravação à parte: se falhar, a atualização
 *  já está salva e a pessoa fica sabendo. */
export async function atualizarSituacao(processoId, situacao) {
  if (!processoId || !situacao) return;
  try {
    await db.alterar('processos', [['id', 'eq', processoId]], { situacao }, 'id');
  } catch (erro) {
    avisarErro(new Error(`A atualização foi salva, mas a situação do processo não mudou. ${erro.message}`));
  }
}

export const campoSituacao = () => html`
  <label class="campo"><span>Situação do processo depois disto (opcional)</span>
    <select name="situacao_processo">${opcoes(Object.entries(SITUACOES_PROCESSO), '', { vazio: 'Manter situação atual' })}</select></label>`;

export const apoioAtualizacao = () => Promise.all([
  db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
  db.todos('processos', { select: COLUNAS_PROCESSO, ordem: 'titulo.asc,id.asc' }),
]);

/** Campo de cliente que preenche a lista de processos daquele cliente. */
export function ligarProcesso(form, clientes, processos, atual = null) {
  let escolhido = atual;
  const atualizar = () => {
    const casos = processos.filter((p) => p.cliente_id === form.cliente_id.value);
    form.processo_id.innerHTML = String(opcoes(casos.map((p) => [p.id, p.titulo]), escolhido, { vazio: 'Sem processo' }));
    escolhido = null; // a escolha inicial só vale para o primeiro preenchimento
  };
  ligarCampoCliente(form, clientes, { aoMudar: atualizar });
  // Outro processo: a situação escolhida era do anterior.
  form.processo_id.addEventListener('change', () => {
    if (form.situacao_processo) form.situacao_processo.value = '';
  });
}

export async function formularioAtualizacao({ cliente_id = null, processo_id = null, atualizacao = null } = {}) {
  const [clientes, processos] = await apoioAtualizacao();
  const a = atualizacao ?? { cliente_id, processo_id, membro_id: estado.membro.id, tipo: 'atendimento_presencial', participantes: [] };
  if (atualizacao && !a.fim && !a.cancelado_em) throw new Error('Pare o cronômetro antes de editar os horários.');

  const ini = a.inicio ? noFuso(a.inicio) : { dia: hoje(), minuto: 9 * 60 };
  const fim = a.fim ? noFuso(a.fim) : { ...ini, minuto: Math.min(ini.minuto + 30, 23 * 60 + 59) };
  const quemRealizou = !atualizacao && pode.administrar()
    ? html`<select name="membro_id">${opcoes(membrosAtivos().map((m) => [m.id, m.nome_curto]), a.membro_id)}</select>`
    : html`<input value="${nomeDe(a.membro_id)}" readonly>`;

  return abrirDialogo({
    titulo: atualizacao ? 'Editar atualização' : 'Lançar atualização',
    largo: true,
    rotuloOk: atualizacao ? 'Salvar atualização' : 'Lançar atualização',
    corpo: html`
      <div class="campos">
        ${campoCliente(clientes, { atual: a.cliente_id })}
        <label class="campo"><span>Processo / caso</span><select name="processo_id"></select></label>
        <label class="campo campo--6"><span>Tipo de atividade</span><select name="tipo">${opcoes(Object.entries(TIPOS_ATUALIZACAO), a.tipo)}</select></label>
        <label class="campo campo--6"><span>Quem realizou</span>${quemRealizou}</label>
        <label class="campo campo--6"><span>Dia do início</span><input type="date" name="dia" value="${ini.dia}" required></label>
        <label class="campo campo--6"><span>Hora do início</span><input type="time" name="hora_inicio" value="${horaDoMinuto(ini.minuto)}" required></label>
        <label class="opcao"><input type="checkbox" name="sem_tempo" ${a.inicio && a.inicio === a.fim ? 'checked' : ''}> Sem tempo, só anotação</label>
        <label class="campo campo--6"><span>Dia do fim</span><input type="date" name="dia_fim" value="${fim.dia}" required></label>
        <label class="campo campo--6"><span>Hora do fim</span><input type="time" name="hora_fim" value="${horaDoMinuto(fim.minuto)}" required></label>
        <fieldset class="campo cadastro-grupo"><legend>Outros participantes</legend><div data-participantes></div></fieldset>
        <label class="campo"><span>Relato</span><textarea name="relato" rows="5" maxlength="30000">${a.relato ?? ''}</textarea></label>
        <label class="campo"><span>Próxima providência</span><textarea name="proxima_providencia" rows="2" maxlength="5000">${a.proxima_providencia ?? ''}</textarea></label>
        ${campoSituacao()}
      </div>
      ${a.cronometrado ? html`<p class="nota">Corrigir o início ou o fim retira a marca de cronômetro. O valor anterior fica no histórico.</p>` : ''}`,
    aoAbrir: (dialogo, form) => {
      ligarProcesso(form, clientes, processos, a.processo_id);

      const semTempo = () => {
        form.dia_fim.disabled = form.sem_tempo.checked;
        form.hora_fim.disabled = form.sem_tempo.checked;
      };
      form.sem_tempo.addEventListener('change', semTempo);
      semTempo();

      // Quem realizou não aparece de novo entre os participantes. Membro
      // desativado só aparece se já estava marcado.
      const participantes = () => {
        const autor = form.membro_id?.value || a.membro_id;
        const lista = estado.membros.filter((m) => (m.ativo || a.participantes.includes(m.id)) && m.id !== autor);
        dialogo.querySelector('[data-participantes]').innerHTML = String(html`${lista.map((m) => html`
          <label class="marcar"><input type="checkbox" name="participantes" value="${m.id}" ${a.participantes.includes(m.id) ? 'checked' : ''}>${m.nome_curto}</label>`)}`);
      };
      form.membro_id?.addEventListener('change', participantes);
      participantes();
    },
    aoEnviar: async (d, form) => {
      d.participantes = [...form.querySelectorAll('[name=participantes]:checked')].map((e) => e.value);
      const p = prepararAtualizacao(d, atualizacao ? a.membro_id : d.membro_id || a.membro_id);

      let salvo;
      if (atualizacao) {
        // O formulário mostra minutos. Editar só o relato não pode arredondar
        // os segundos guardados pelo servidor nem retirar a marca de cronômetro.
        if (d.dia === ini.dia && d.hora_inicio === horaDoMinuto(ini.minuto)) p.inicio = a.inicio;
        if (d.sem_tempo) p.fim = p.inicio;
        else if ((d.dia_fim || d.dia) === fim.dia && d.hora_fim === horaDoMinuto(fim.minuto)) p.fim = a.fim;
        const { membro_id: _autor, ...campos } = p;
        salvo = await db.alterar('atualizacoes', [['id', 'eq', a.id]], campos, COLUNAS_ATUALIZACAO);
      } else {
        salvo = await db.inserir('atualizacoes', p, COLUNAS_ATUALIZACAO);
      }

      await atualizarSituacao(p.processo_id, d.situacao_processo);
      notificarAtualizacoes();
      avisar('Atualização salva.');
      return salvo;
    },
  });
}
