// Tarefas e prazos processuais informados à mão (F5, parte manual).
// ==================================================================
//
// Prazo é uma tarefa com data fatal. A contagem jurídica ainda não é feita
// pelo sistema: quem tem acesso a Prazos informa base, contagem, quantidade e
// fatal já conferidos. Aqui ficam só as regras de tela — quem pode mexer, que
// alerta mostrar e o filtro das listas.

import { fimDoMes, hoje, inicioDaSemana, inicioDoMes, noFuso, semAcento, somarDias } from '../nucleo/formato.js';

export const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
export const SITUACOES_TAREFA = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };

export const COLUNAS_TAREFA = 'id,tipo,titulo,ato,descricao,cliente_id,cliente_nome,processo_id,processo_numero,'
  + 'processo_titulo,tribunal,area,responsavel_id,prioridade,situacao,entrega,fatal_em,contagem,base_em,quantidade,'
  + 'recesso,concluida_em,concluida_por,compromisso_id,cancelado_em,motivo_cancelamento,criado_em,criado_por,'
  + 'alterado_em,alterado_por,alerta,motivo_reabertura,intimacao_id';

/** Botões de concluir, editar e cancelar: autor, responsável ou administrador.
 *  O banco confere de novo (política "tarefas: alterar"). */
export const podeAlterarTarefa = (t, m) =>
  !t.cancelado_em && (m?.papel === 'admin' || t.criado_por === m?.id || t.responsavel_id === m?.id);

/** O mesmo cálculo de `v_tarefas.alerta`, para quando a tela já tem a linha. */
export function alertaTarefa(t, agora = new Date()) {
  const dia = hoje(agora);
  if (t.cancelado_em) return 'cancelada';
  if (t.situacao === 'concluida') return 'concluida';
  if (t.fatal_em && Date.parse(t.fatal_em) < +agora) return 'vencida';
  if (t.fatal_em && noFuso(t.fatal_em).dia === dia) return 'fatal_hoje';
  if (t.entrega && t.entrega < dia) return 'atrasada';
  return t.entrega === dia ? 'entrega_hoje' : 'em_dia';
}

/** Período do resumo de Prazos: hoje, semana, mês, ano ou tudo em aberto. */
export function periodoPrazos(aba, dia = hoje()) {
  if (aba === 'hoje') return { de: dia, ate: dia };
  if (aba === 'semana') {
    const de = inicioDaSemana(dia);
    return { de, ate: somarDias(de, 6) };
  }
  if (aba === 'mes') return { de: inicioDoMes(dia), ate: fimDoMes(dia) };
  if (aba === 'ano') return { de: `${dia.slice(0, 4)}-01-01`, ate: `${dia.slice(0, 4)}-12-31` };
  return { de: '', ate: '' };
}

/** O dia que conta para o período: a data fatal (em Brasília) ou a entrega. */
export const diaDaTarefa = (t) => (t.fatal_em ? noFuso(t.fatal_em).dia : t.entrega);

/**
 * Lista de Tarefas e de Prazos. Sem situação escolhida, mostra só as abertas.
 * A ordem é a da data que vence primeiro; sem data, vai para o fim.
 */
export function filtrarTarefas(lista, f, eu) {
  const busca = semAcento(f.busca ?? '').toLowerCase();
  const abertas = !f.situacao || f.situacao === 'abertas';

  return lista
    .filter((t) => {
      if (f.visao === 'minhas' && t.responsavel_id !== eu) return false;
      if (f.visao === 'deleguei' && t.criado_por !== eu) return false;
      if (f.cliente && t.cliente_id !== f.cliente) return false;
      if (f.responsavel && t.responsavel_id !== f.responsavel) return false;
      if (f.prioridade && t.prioridade !== f.prioridade) return false;

      const situacao = t.cancelado_em ? 'cancelada' : t.situacao;
      if (abertas && (t.cancelado_em || t.situacao === 'concluida')) return false;
      if (!abertas && f.situacao !== 'todos' && situacao !== f.situacao) return false;
      if (f.soPrazos && t.tipo !== 'prazo') return false;

      const dia = diaDaTarefa(t);
      if ((f.de || f.ate) && (!dia || (f.de && dia < f.de) || (f.ate && dia > f.ate))) return false;

      return !busca || semAcento([t.titulo, t.ato, t.cliente_nome, t.processo_numero, t.processo_titulo, t.descricao].join(' '))
        .toLowerCase().includes(busca);
    })
    .sort((a, b) => (a.fatal_em || a.entrega || 'z').localeCompare(b.fatal_em || b.entrega || 'z')
      || a.titulo.localeCompare(b.titulo));
}
