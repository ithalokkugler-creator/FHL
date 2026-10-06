// Histórico — quem fez o quê e quando (preparação 5.3).
// =====================================================
//
// Duas formas: a tela do administrador, com tudo, e o diálogo "Histórico"
// que cada registro abre. O diálogo mostra só o que a política da tabela
// auditoria deixa a pessoa ver — a mesma permissão do módulo.

import { avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { estado, nomeDe } from '../nucleo/estado.js';
import { data, dataHora, hoje, instante, somarDias } from '../nucleo/formato.js';
import { $, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { cabecalho, vazio } from './comum.js';

const TABELAS = {
  contratos: 'Contrato',
  parcelas: 'Parcela',
  recebimentos: 'Recebimento',
  renegociacoes: 'Renegociação',
  cobrancas: 'Cobrança',
  contas: 'Conta',
  contas_recorrentes: 'Conta recorrente',
  fechamentos: 'Fechamento',
  clientes: 'Cliente',
  clientes_detalhes: 'Dados completos do cliente',
  processos: 'Processo / caso',
  contatos: 'Contato',
  documentos: 'Documento',
  atualizacoes: 'Atualização',
  tarefas: 'Tarefa / prazo',
  feriados: 'Feriado / suspensão',
  intimacoes: 'Intimação',
  intimacoes_consultas: 'Consulta ao diário',
  membros: 'Membro',
  compromissos: 'Compromisso',
  categorias: 'Categoria',
  formas_pagamento: 'Forma de pagamento',
  divisao_cotas: 'Divisão entre sócios',
  config_financeiro: 'Configuração do Financeiro',
  config_agenda: 'Configuração da Agenda',
  publicacoes: 'Publicação do site',
  campanhas: 'Campanha do site',
  site_deploys: 'Publicação do site no ar',
};

const ACOES = {
  criou: 'criou',
  alterou: 'alterou',
  cancelou: 'cancelou',
  estornou: 'estornou',
  desativou: 'desativou',
  reativou: 'reativou',
  fechou: 'fechou',
  reabriu: 'reabriu',
};

const CAMPOS = {
  prioridade:'prioridade', ato:'ato', contagem:'contagem', base_em:'publicação / intimação',
  quantidade:'quantidade', recesso:'suspensão no recesso', concluida_por:'concluída por',
  conferida_por:'conferida por', disponibilizada_em:'disponibilização / recebimento',
  publicada_em:'publicação', intimacao_id:'intimação de origem', texto:'teor',
  tipo_pessoa: 'tipo de pessoa', flexao: 'concordância nos documentos', rg: 'RG / inscrição estadual',
  nascimento: 'nascimento / constituição', recado_nome: 'nome para recados', recado_relacao: 'relação / parentesco',
  recado_telefone: 'telefone para recados', recado_observacao: 'observação para recados',
  representante_nome: 'nome do representante', representante_documento: 'CPF / CNPJ do representante',
  representante_relacao: 'relação com o cliente', representante_qualificacao: 'qualificação do representante',
  situacao: 'situação',
  observacoes: 'observações',
  recebido_em: 'recebido em',
  convertido_em: 'convertido em',
  consentimento_em: 'consentimento em',
  motivo_cancelamento: 'motivo',
  motivo_estorno: 'motivo do estorno',
  motivo_reabertura: 'motivo da reabertura',
  data_pagamento: 'data de pagamento',
  valor_total: 'valor total',
  valor_principal: 'saldo abatido',
  valor_encargos: 'encargos',
  multa_pct: 'multa (%)',
  juros_mes_pct: 'juros ao mês (%)',
  carencia_dias: 'carência (dias)',
  pago_por_id: 'pago por',
  responsavel_id: 'responsável',
  membro_id: 'responsável',
  user_id: 'login',
  acesso_agenda: 'acesso à agenda',
  acesso_financeiro: 'acesso ao financeiro',
  acesso_site: 'acesso ao site',
  acesso_clientes: 'acesso aos clientes',
  acesso_prazos: 'acesso aos prazos',
  cliente_id: 'cliente',
  processo_id: 'processo',
  fatal_em: 'prazo fatal',
  entrega: 'prazo de entrega',
  proxima_providencia: 'próxima providência',
  concluida_em: 'concluída em',
  conferida_em: 'conferida em',
  renegociacao_id: 'renegociação',
  chegada_em: 'chegada do cliente',
};

const nomeCampo = (c) => CAMPOS[c] ?? c.replace(/_id$/, '').replace(/_/g, ' ');

function legivel(campo, v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (campo === 'participantes' && Array.isArray(v)) return v.map(nomeDe).join(' + ') || '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 140);
  if (estado.porId.has(v)) return nomeDe(v);
  if (/_id$/.test(campo)) return `registro …${String(v).slice(-6)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return data(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return dataHora(v);
  return String(v);
}

export function itemHistorico(a) {
  const quem = a.membro_id ? nomeDe(a.membro_id) : a.usuario_id ? 'Login sem membro' : 'Sistema';
  return html`
    <li class="historico__item">
      <span class="historico__quando">${dataHora(a.em)}</span>
      <span>
        <strong>${quem}</strong> ${ACOES[a.acao] ?? a.acao} <span class="selo">${TABELAS[a.tabela] ?? a.tabela}</span>
        ${a.campos?.length
          ? html`<ul class="historico__campos">${a.campos.map((c) => html`
              <li>${nomeCampo(c)}: <s>${legivel(c, a.antes?.[c])}</s> → ${legivel(c, a.depois?.[c])}</li>`)}</ul>`
          : ''}
      </span>
    </li>`;
}

/** O histórico de um ou mais registros — um contrato com as parcelas e os
 *  recebimentos dele, por exemplo. */
export async function abrirHistorico({ titulo, registros }) {
  try {
    const linhas = await db.listar('auditoria', {
      select: '*',
      filtros: [['registro_id', 'in', registros]],
      ordem: 'em.desc',
      limite: 300,
    });
    return abrirDialogo({
      titulo: `Histórico — ${titulo}`,
      largo: true,
      somenteLeitura: true,
      corpo: linhas.length ? html`<ul class="historico">${linhas.map(itemHistorico)}</ul>` : vazio('Nada registrado.'),
    });
  } catch (erro) {
    avisarErro(erro);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tela do administrador
// ---------------------------------------------------------------------------

export default async function telaHistorico(ctx) {
  const dia = hoje();
  const filtro = {
    tabela: TABELAS[ctx.consulta.tabela] ? ctx.consulta.tabela : '',
    membro: ctx.consulta.membro ?? '',
    de: /^\d{4}-\d{2}-\d{2}$/.test(ctx.consulta.de ?? '') ? ctx.consulta.de : somarDias(dia, -30),
    ate: /^\d{4}-\d{2}-\d{2}$/.test(ctx.consulta.ate ?? '') ? ctx.consulta.ate : dia,
  };

  desenhar(ctx.raiz, html`
    ${cabecalho('Histórico', 'Tudo o que foi criado, alterado, cancelado ou estornado — nada é apagado')}
    <form class="filtros">
      <label class="campo">
        <span>O quê</span>
        <select name="tabela">
          <option value="">Tudo</option>
          ${Object.entries(TABELAS).map(([v, r]) => html`<option value="${v}" ${v === filtro.tabela ? 'selected' : ''}>${r}</option>`)}
        </select>
      </label>
      <label class="campo">
        <span>Quem</span>
        <select name="membro">
          <option value="">Todos</option>
          ${estado.membros.map((m) => html`<option value="${m.id}" ${m.id === filtro.membro ? 'selected' : ''}>${m.nome_curto}</option>`)}
        </select>
      </label>
      <label class="campo"><span>De</span><input type="date" name="de" value="${filtro.de}"></label>
      <label class="campo"><span>Até</span><input type="date" name="ate" value="${filtro.ate}"></label>
    </form>
    <section class="painel" data-papel="lista"><p class="carregando">Carregando…</p></section>`);

  const form = $('form', ctx.raiz);
  const lista = $('[data-papel="lista"]', ctx.raiz);
  let pedido = 0;

  const carregar = async () => {
    const este = ++pedido;
    const filtros = [['em', 'gte', instante(filtro.de)], ['em', 'lt', instante(somarDias(filtro.ate, 1))]];
    if (filtro.tabela) filtros.push(['tabela', 'eq', filtro.tabela]);
    if (filtro.membro) filtros.push(['membro_id', 'eq', filtro.membro]);
    const linhas = await db.listar('auditoria', { select: '*', filtros, ordem: 'em.desc', limite: 300 });
    if (este !== pedido || !ctx.ativa()) return;
    desenhar(lista, linhas.length
      ? html`<ul class="historico">${linhas.map(itemHistorico)}</ul>
          ${linhas.length === 300 ? html`<p class="painel__rodape sub">Mostrando os 300 mais recentes. Estreite o período para ver o resto.</p>` : ''}`
      : vazio('Nada registrado com esses filtros.'));
  };

  form.addEventListener('input', () => {
    Object.assign(filtro, { tabela: form.tabela.value, membro: form.membro.value, de: form.de.value || filtro.de, ate: form.ate.value || filtro.ate });
    guardarConsulta(filtro);
    carregar().catch(avisarErro);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  await carregar();
}
