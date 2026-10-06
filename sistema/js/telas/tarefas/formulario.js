// Nova tarefa / prazo, ou edição (F5).
// ====================================
//
// Prazo processual só para quem tem acesso a Prazos, e com os valores já
// conferidos pelo advogado: a contagem automática ainda não existe. Quem
// recebe um prazo sem esse acesso trabalha na tarefa, mas não muda data
// fatal nem contagem — o banco também recusa.
//
// "Bloquear a agenda" cria, junto com a tarefa, um bloqueio na agenda do
// responsável (criar_tarefa, numa transação só).

import { avisar } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado, membrosAtivos, pode } from '../../nucleo/estado.js';
import { hoje, horaDoMinuto, instante, noFuso } from '../../nucleo/formato.js';
import { $, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO } from '../../dominio/clientes.js';
import { PRIORIDADES } from '../../dominio/tarefas.js';
import { campoCliente, ligarCampoCliente } from '../clientes.js';
import { opcoes } from '../comum.js';

const ATOS = ['Petição inicial', 'Contestação', 'Impugnação', 'Réplica', 'Manifestação', 'Recurso', 'Embargos',
  'Cumprimento de sentença', 'Diligência externa', 'Preparar audiência', 'Outro'];
const CONTAGENS = [['uteis', 'Dias úteis'], ['corridos', 'Dias corridos'], ['horas', 'Horas']];

function camposDoPrazo(t, base, fatal, editaPrazo) {
  return html`
    <div class="campos" data-prazo ${t.tipo === 'prazo' ? '' : 'hidden'}>
      <p class="nota">Registro manual: confira a contagem juridicamente e informe as datas. A sugestão automática e a memória dia a dia ainda estão pendentes.</p>
      <fieldset class="campos tarefa-prazo" ${editaPrazo ? '' : 'disabled'}>
        <label class="campo campo--6"><span>Contagem informada</span><select name="contagem">${opcoes(CONTAGENS, t.contagem ?? 'uteis')}</select></label>
        <label class="campo campo--6"><span>Quantidade</span><input type="number" name="quantidade" min="1" max="3650" value="${t.quantidade ?? ''}"></label>
        <label class="campo campo--6"><span>Publicação ou intimação</span><input type="date" name="base_dia" value="${base.dia}"></label>
        <label class="campo campo--6" data-hora><span>Hora da intimação (Brasília)</span><input type="time" name="base_hora" value="${horaDoMinuto(base.minuto)}"></label>
        <label class="campo campo--6"><span>Data fatal conferida</span><input type="date" name="fatal_dia" value="${fatal.dia}"></label>
        <label class="campo campo--6" data-hora><span>Hora fatal (Brasília)</span><input type="time" name="fatal_hora" value="${horaDoMinuto(fatal.minuto)}"></label>
        <label class="opcao"><input type="checkbox" name="recesso" ${t.recesso !== false ? 'checked' : ''}> Suspensão no recesso informada pelo advogado</label>
        <label class="opcao"><input type="checkbox" name="conferi" required> Conferi a data fatal e a data de entrega.</label>
      </fieldset>
    </div>`;
}

const camposDoBloqueio = () => html`
  <label class="opcao"><input type="checkbox" name="bloquear"> Bloquear a agenda do responsável?</label>
  <div class="campos" data-bloqueio hidden>
    <label class="campo campo--4"><span>Dia do bloqueio</span><input type="date" name="bloqueio_dia" value="${hoje()}"></label>
    <label class="campo campo--4"><span>Começa</span><input type="time" name="bloqueio_inicio" value="09:00"></label>
    <label class="campo campo--4"><span>Termina</span><input type="time" name="bloqueio_fim" value="10:00"></label>
  </div>`;

/**
 * Nova tarefa (com `cliente_id` ou `iniciais`) ou edição (`tarefa`). Com
 * `iniciais.intimacao_id`, o prazo nasce ligado à intimação e a conferência
 * dela é gravada junto (criar_prazo_intimacao).
 */
export async function formularioTarefa({ tarefa = null, cliente_id = null, iniciais = {} } = {}) {
  const [clientes, processos] = await Promise.all([
    db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
    db.todos('processos', { select: COLUNAS_PROCESSO }),
  ]);
  const t = tarefa ?? { tipo: 'tarefa', responsavel_id: estado.membro.id, prioridade: 'normal', cliente_id, ...iniciais };
  // Prazo em dias vale até 23:59 da data fatal; em horas, a hora informada.
  const base = t.base_em ? noFuso(t.base_em) : { dia: hoje(), minuto: 0 };
  const fatal = t.fatal_em ? noFuso(t.fatal_em) : { dia: '', minuto: 23 * 60 + 59 };
  const editaPrazo = pode.prazos();
  const bloquear = !tarefa && pode.agenda();

  const responsaveis = membrosAtivos();
  if (t.responsavel_id && !responsaveis.some((m) => m.id === t.responsavel_id)) {
    const antigo = estado.porId.get(t.responsavel_id);
    if (antigo) responsaveis.push(antigo);
  }
  const tipos = [['tarefa', 'Tarefa'], ...(editaPrazo || t.tipo === 'prazo' ? [['prazo', 'Prazo processual']] : [])];
  const titulo = tarefa ? 'Editar tarefa / prazo' : t.intimacao_id ? 'Gerar prazo da intimação' : 'Nova tarefa / prazo';

  return abrirDialogo({
    titulo,
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--6"><span>Tipo</span><select name="tipo" ${tarefa && !editaPrazo ? 'disabled' : ''}>${opcoes(tipos, t.tipo)}</select></label>
        <label class="campo campo--6"><span>Prioridade</span><select name="prioridade">${opcoes(Object.entries(PRIORIDADES), t.prioridade)}</select></label>
        <label class="campo"><span>Título</span><input name="titulo" value="${t.titulo ?? ''}" required maxlength="200" autofocus></label>
        <label class="campo"><span>Ato</span><input name="ato" value="${t.ato ?? ''}" list="atos-tarefa" maxlength="200">
          <datalist id="atos-tarefa">${ATOS.map((a) => html`<option value="${a}"></option>`)}</datalist></label>
        ${campoCliente(clientes, { obrigatorio: false, atual: t.cliente_id })}
        <label class="campo"><span>Processo / caso</span><select name="processo_id"></select></label>
        <label class="campo campo--6"><span>Responsável</span><select name="responsavel_id" required>${opcoes(responsaveis.map((m) => [m.id, m.nome_curto + (m.ativo ? '' : ' (inativo)')]), t.responsavel_id)}</select></label>
        <label class="campo campo--6"><span>Data de entrega</span><input type="date" name="entrega" value="${t.entrega ?? ''}"></label>
        ${camposDoPrazo(t, base, fatal, editaPrazo)}
        <label class="campo"><span>Descrição / orientação</span><textarea name="descricao" rows="3" maxlength="20000">${t.descricao ?? ''}</textarea></label>
        ${bloquear ? camposDoBloqueio() : ''}
        ${t.compromisso_id ? html`<p class="nota">O bloqueio já vinculado continua na Agenda. Ajuste ou cancele por lá.</p>` : ''}
      </div>`,
    aoAbrir: (_dialogo, form) => {
      const ajustarProcessos = () => {
        const anterior = form.processo_id.value || t.processo_id;
        const casos = processos.filter((p) => p.cliente_id === form.cliente_id.value);
        desenhar(form.processo_id, opcoes(casos.map((p) => [p.id, p.titulo]), anterior, { vazio: 'Sem processo' }));
      };
      ligarCampoCliente(form, clientes, { aoMudar: ajustarProcessos });

      // Os campos do prazo só existem para prazo; as horas, só para prazo em horas.
      const ajustarTipo = () => {
        const prazo = form.tipo.value === 'prazo';
        $('[data-prazo]', form).hidden = !prazo;
        for (const nome of ['base_dia', 'fatal_dia', 'quantidade', 'conferi']) form.elements[nome].required = prazo && editaPrazo;
        const horas = form.contagem.value === 'horas';
        for (const rotulo of form.querySelectorAll('[data-hora]')) rotulo.hidden = !horas;
        form.base_hora.required = prazo && editaPrazo && horas;
        form.fatal_hora.required = prazo && editaPrazo && horas;
        if (!prazo) form.conferi.checked = false;
      };

      form.addEventListener('change', (e) => {
        if (e.target.name === 'tipo' || e.target.name === 'contagem') ajustarTipo();
        if (e.target.name === 'cliente_texto') ajustarProcessos();
        if (e.target.name === 'bloquear') $('[data-bloqueio]', form).hidden = !form.bloquear.checked;
      });
      ajustarProcessos();
      ajustarTipo();
    },
    aoEnviar: async (d) => {
      const tipo = tarefa && !editaPrazo ? t.tipo : d.tipo;
      const p = {
        tipo,
        titulo: d.titulo,
        ato: d.ato || null,
        descricao: d.descricao || null,
        cliente_id: d.cliente_id || null,
        processo_id: d.processo_id || null,
        responsavel_id: d.responsavel_id,
        prioridade: d.prioridade,
        entrega: d.entrega || null,
      };

      if (tipo === 'prazo' && editaPrazo) {
        if (!d.conferi || !d.base_dia || !d.fatal_dia || !d.quantidade) throw new Error('Preencha e confira as datas do prazo.');
        const horas = d.contagem === 'horas';
        Object.assign(p, {
          base_em: instante(d.base_dia, horas ? d.base_hora : '00:00'),
          fatal_em: instante(d.fatal_dia, horas ? d.fatal_hora : '23:59'),
          contagem: d.contagem,
          quantidade: Number(d.quantidade),
          recesso: d.recesso,
        });
        if (Date.parse(p.fatal_em) < Date.parse(p.base_em)) throw new Error('A data fatal precisa ser igual ou posterior à base.');
        if (p.entrega && p.entrega > d.fatal_dia) throw new Error('A entrega não pode ser depois da data fatal.');
        // Regravar só os horários que mudaram preserva os segundos do registro.
        if (tarefa && t.contagem === p.contagem) {
          if (base.dia === d.base_dia && (!horas || horaDoMinuto(base.minuto) === d.base_hora)) p.base_em = t.base_em;
          if (fatal.dia === d.fatal_dia && (!horas || horaDoMinuto(fatal.minuto) === d.fatal_hora)) p.fatal_em = t.fatal_em;
        }
      } else if (tipo === 'tarefa') {
        Object.assign(p, { fatal_em: null, base_em: null, quantidade: null, contagem: null, memoria_prazo: null });
      }

      if (!tarefa && d.bloquear) {
        if (!d.bloqueio_dia || d.bloqueio_fim <= d.bloqueio_inicio) throw new Error('Informe um período válido para o bloqueio.');
        p.bloquear = { inicio: instante(d.bloqueio_dia, d.bloqueio_inicio), fim: instante(d.bloqueio_dia, d.bloqueio_fim) };
      }

      let id;
      if (tarefa) id = (await db.alterar('tarefas', [['id', 'eq', tarefa.id]], p, 'id')).id;
      else if (t.intimacao_id) id = await db.rpc('criar_prazo_intimacao', { p_id: t.intimacao_id, p });
      else id = await db.rpc('criar_tarefa', { p });
      avisar(tipo === 'prazo' ? 'Prazo salvo.' : 'Tarefa salva.');
      return id;
    },
  });
}
