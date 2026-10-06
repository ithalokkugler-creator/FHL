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
import { ErroCampo, limparErrosFormulario } from '../../nucleo/formularios.js';
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
      <p class="nota campo">Informe a data fatal já conferida pelo advogado. Em dias, o horário fatal é 23:59 de Brasília. A data de entrega é opcional e não pode ser posterior à data fatal.</p>
      <fieldset class="campos tarefa-prazo fieldset" ${editaPrazo ? '' : 'disabled'}>
        <legend>Prazo processual</legend>
        <label class="campo campo--6"><span>Contagem informada</span><select name="contagem">${opcoes(CONTAGENS, t.contagem ?? 'uteis')}</select></label>
        <label class="campo campo--6"><span>Quantidade</span><input type="number" name="quantidade" min="1" max="3650" step="1" value="${t.quantidade ?? ''}"><span class="campo__ajuda">De 1 a 3650, em unidades inteiras.</span></label>
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
  <fieldset class="campos fieldset" data-bloqueio hidden disabled>
    <legend>Bloqueio na agenda</legend>
    <label class="campo campo--4"><span>Dia do bloqueio</span><input type="date" name="bloqueio_dia" value="${hoje()}"></label>
    <label class="campo campo--4"><span>Começa</span><input type="time" name="bloqueio_inicio" value="09:00"></label>
    <label class="campo campo--4"><span>Termina</span><input type="time" name="bloqueio_fim" value="10:00"></label>
  </fieldset>`;

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
        <p class="campo sub" data-ajuda-tarefa>Para uma tarefa, basta informar o título e o responsável. Cliente, processo, ato e data de entrega são opcionais.</p>
        <label class="campo"><span>Título</span><input name="titulo" value="${t.titulo ?? ''}" required maxlength="200" autofocus></label>
        <label class="campo"><span>Ato</span><input name="ato" value="${t.ato ?? ''}" list="atos-tarefa" maxlength="200">
          <datalist id="atos-tarefa">${ATOS.map((a) => html`<option value="${a}"></option>`)}</datalist></label>
        ${campoCliente(clientes, { obrigatorio: false, atual: t.cliente_id })}
        <label class="campo"><span>Processo / caso</span><select name="processo_id"></select></label>
        <label class="campo campo--6"><span>Responsável</span><select name="responsavel_id" required>${opcoes(responsaveis.map((m) => [m.id, m.nome_curto + (m.ativo ? '' : ' (inativo)')]), t.responsavel_id)}</select></label>
        <label class="campo campo--6"><span>Data de entrega (opcional)</span><input type="date" name="entrega" value="${t.entrega ?? ''}"><span class="campo__ajuda">Data interna para terminar a tarefa. Pode ficar em branco.</span></label>
        ${camposDoPrazo(t, base, fatal, editaPrazo)}
        <label class="campo"><span>Descrição / orientação</span><textarea name="descricao" rows="3" maxlength="20000">${t.descricao ?? ''}</textarea></label>
        ${bloquear ? camposDoBloqueio() : ''}
        ${t.compromisso_id ? html`<p class="nota">O bloqueio já vinculado continua na Agenda. Ajuste ou cancele por lá.</p>` : ''}
      </div>`,
    aoAbrir: (_dialogo, form) => {
      let primeiroAjuste = true;
      const ajustarProcessos = () => {
        const anterior = primeiroAjuste ? t.processo_id : form.processo_id.value;
        primeiroAjuste = false;
        const casos = processos.filter((p) => p.cliente_id === form.cliente_id.value);
        desenhar(form.processo_id, opcoes(casos.map((p) => [p.id, p.titulo]), anterior, { vazio: 'Sem processo' }));
        form.processo_id.disabled = !form.cliente_id.value || !casos.length;
      };
      ligarCampoCliente(form, clientes, { aoMudar: ajustarProcessos });

      // Os campos do prazo só existem para prazo; as horas, só para prazo em horas.
      const ajustarTipo = () => {
        const prazo = form.tipo.value === 'prazo';
        $('[data-ajuda-tarefa]', form).hidden = prazo;
        $('[data-prazo]', form).hidden = !prazo;
        $('.tarefa-prazo', form).disabled = !prazo || !editaPrazo;
        for (const nome of ['base_dia', 'fatal_dia', 'quantidade', 'conferi']) form.elements[nome].required = prazo && editaPrazo;
        const horas = form.contagem.value === 'horas';
        for (const rotulo of form.querySelectorAll('[data-hora]')) rotulo.hidden = !horas;
        form.base_hora.disabled = form.fatal_hora.disabled = !prazo || !editaPrazo || !horas;
        form.base_hora.required = prazo && editaPrazo && horas;
        form.fatal_hora.required = prazo && editaPrazo && horas;
        if (!prazo) form.conferi.checked = false;
        limparErrosFormulario(form);
      };

      const ajustarBloqueio = () => {
        const campos = $('[data-bloqueio]', form);
        if (!campos) return;
        campos.hidden = campos.disabled = !form.bloquear.checked;
        for (const nome of ['bloqueio_dia', 'bloqueio_inicio', 'bloqueio_fim']) form.elements[nome].required = form.bloquear.checked;
        limparErrosFormulario(form);
      };

      form.addEventListener('change', (e) => {
        if (e.target.name === 'tipo' || e.target.name === 'contagem') ajustarTipo();
        if (e.target.name === 'cliente_texto') ajustarProcessos();
        if (e.target.name === 'bloquear') ajustarBloqueio();
      });
      ajustarProcessos();
      ajustarTipo();
      ajustarBloqueio();
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
        if (!d.conferi) throw new ErroCampo('conferi', 'Confirme que conferiu a data fatal e a entrega.');
        const horas = d.contagem === 'horas';
        Object.assign(p, {
          base_em: instante(d.base_dia, horas ? d.base_hora : '00:00'),
          fatal_em: instante(d.fatal_dia, horas ? d.fatal_hora : '23:59'),
          contagem: d.contagem,
          quantidade: Number(d.quantidade),
          recesso: d.recesso,
        });
        if (Date.parse(p.fatal_em) < Date.parse(p.base_em)) throw new ErroCampo(horas && d.base_dia === d.fatal_dia ? 'fatal_hora' : 'fatal_dia', 'A data e hora fatal precisam ser iguais ou posteriores à publicação/intimação.');
        if (p.entrega && p.entrega > d.fatal_dia) throw new ErroCampo('entrega', 'A entrega não pode ser depois da data fatal. Antecipe a entrega ou confira a data fatal.');
        // Regravar só os horários que mudaram preserva os segundos do registro.
        if (tarefa && t.contagem === p.contagem) {
          if (base.dia === d.base_dia && (!horas || horaDoMinuto(base.minuto) === d.base_hora)) p.base_em = t.base_em;
          if (fatal.dia === d.fatal_dia && (!horas || horaDoMinuto(fatal.minuto) === d.fatal_hora)) p.fatal_em = t.fatal_em;
        }
      } else if (tipo === 'tarefa') {
        // Na RPC, uma chave JSON nula não é um NULL de SQL. Omitir na criação;
        // na edição, limpar os campos de um prazo convertido para tarefa.
        if (tarefa) Object.assign(p, { fatal_em: null, base_em: null, quantidade: null, contagem: null, memoria_prazo: null });
      }

      if (!tarefa && d.bloquear) {
        if (d.bloqueio_fim <= d.bloqueio_inicio) throw new ErroCampo('bloqueio_fim', 'O bloqueio precisa terminar depois do início, no mesmo dia.');
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
