// Contratos — com saldo e situação (preparação 6.7; DOCX §6 e T08).
// Também é daqui que sai a entrada avulsa: consulta paga na hora,
// sucumbência, reembolso de custas.
//
// Sem teto de linhas: a lista é paginada (100 por página) e o total é o do
// filtro inteiro; a exportação leva o universo filtrado completo, não a
// página. A busca acha cliente, código (C001/2026), descrição e processo.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { termoDeBusca } from '../../nucleo/consulta.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado, nomeDe, pode } from '../../nucleo/estado.js';
import { centavos, data, hoje, lerMoeda, moeda, paraReais, percentual, somarDias } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { campoCliente, carregarClientes, ligarCampoCliente } from '../clientes.js';
import { cabecalho, paginacao, seloContrato, TIPOS_AVULSA, TIPOS_HONORARIO, vazio } from '../comum.js';
import { apoio, opcoes, opcoesContasFinanceiras, somaCentavos } from './base.js';
import { botoesExportar, exportar } from './exportar.js';

const SITUACOES = [
  ['abertos', 'Ativos e a apurar'],
  ['com_pendencia', 'Com pendência (vencidas)'],
  ['atencao', 'Com atenção (atraso, plano ou vigência)'],
  ['em_andamento', 'Em andamento, em dia'],
  ['renegociado', 'Renegociados'],
  ['a_apurar', 'Êxito a apurar'],
  ['quitado', 'Quitados'],
  ['arquivado', 'Arquivados'],
  ['cancelado', 'Cancelados'],
  ['formalizacao', 'Data de formalização a confirmar'],
  ['todos', 'Todos'],
];
const POR_PAGINA = 100;

export default async function telaContratos(ctx) {
  const filtro = {
    situacao: SITUACOES.some(([v]) => v === ctx.consulta.situacao) ? ctx.consulta.situacao : 'abertos',
    busca: ctx.consulta.busca ?? '',
    responsavel: ctx.consulta.responsavel ?? '',
    pagina: Math.max(1, Number(ctx.consulta.pagina) || 1),
  };

  desenhar(ctx.raiz, html`
    ${cabecalho('Contratos', 'Contratos financeiros de honorários', html`
      ${pode.lancar() ? html`
        <button type="button" class="botao" data-acao="avulsa">Entrada avulsa</button>
        <a class="botao botao--primario" href="#/financeiro/contratos/novo">Novo contrato</a>` : ''}`)}
    <form class="filtros" role="search">
      <label class="campo">
        <span>Situação</span>
        <select name="situacao">${opcoes(SITUACOES, filtro.situacao)}</select>
      </label>
      <label class="campo campo--busca">
        <span>Buscar</span>
        <input type="search" name="busca" value="${filtro.busca}" placeholder="Cliente, código, descrição ou processo">
      </label>
      <label class="campo">
        <span>Responsável</span>
        <select name="responsavel">${opcoes(estado.membros.map((m) => [m.id, m.nome_curto]), filtro.responsavel, { vazio: 'Todos' })}</select>
      </label>
    </form>
    <section class="painel" data-papel="lista"><p class="carregando">Carregando…</p></section>`);

  const form = $('form', ctx.raiz);
  const lista = $('[data-papel="lista"]', ctx.raiz);
  let pedido = 0;

  const consulta = () => {
    const filtros = [];
    if (filtro.situacao === 'abertos') filtros.push(['ciclo', 'eq', 'ativo'], ['situacao', 'in', ['ativo', 'a_apurar']]);
    else if (filtro.situacao === 'atencao') filtros.push(['ciclo', 'eq', 'ativo'],
      ['and', `(or(vencidas.gt.0,diferenca_plano.neq.0,and(data_fim.gte.${hoje()},data_fim.lte.${somarDias(hoje(), 30)})))`]);
    else if (filtro.situacao === 'formalizacao') filtros.push(['data_contrato_origem', 'eq', 'a_confirmar'], ['ciclo', 'neq', 'cancelado']);
    else if (filtro.situacao !== 'todos') filtros.push(['rotulo', 'eq', filtro.situacao]);
    const termo = termoDeBusca(filtro.busca);
    if (termo) filtros.push(['or', `(cliente_nome.ilike.${termo},codigo.ilike.${termo},descricao.ilike.${termo},processo.ilike.${termo})`]);
    if (filtro.responsavel) filtros.push(['responsavel_id', 'eq', filtro.responsavel]);
    return { select: '*', filtros, ordem: 'cliente_nome.asc,criado_em.desc,id.asc' };
  };

  const carregar = async () => {
    const este = ++pedido;
    const { linhas, total } = await db.pagina('v_contratos', { ...consulta(), pagina: filtro.pagina, porPagina: POR_PAGINA });
    if (este !== pedido || !ctx.ativa()) return;
    desenhar(lista, tabela(linhas, total, filtro.pagina));
  };

  let espera = null;
  form.addEventListener('input', (e) => {
    Object.assign(filtro, { situacao: form.situacao.value, busca: form.busca.value, responsavel: form.responsavel.value, pagina: 1 });
    guardarConsulta(filtro);
    clearTimeout(espera);
    espera = setTimeout(() => carregar().catch(avisarErro), e.target.name === 'busca' ? 300 : 0);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  await carregar();

  return aoClicar(ctx.raiz, {
    avulsa: async () => {
      if (await entradaAvulsa()) avisar('Entrada registrada.');
    },
    pagina: (el) => {
      filtro.pagina = Number(el.dataset.pagina);
      guardarConsulta(filtro);
      carregar().catch(avisarErro);
      scrollTo(0, 0);
    },
    exportar: async (el) => {
      try {
        const todos = await db.todos('v_contratos', consulta());
        await exportar({
          relatorio: 'Posição por contrato',
          arquivo: 'contratos',
          formato: el.dataset.formato,
          colunas: COLUNAS_EXPORTACAO,
          linhas: todos,
          filtros: [['Situação', SITUACOES.find(([v]) => v === filtro.situacao)[1]], ['Busca', filtro.busca || '—'],
            ['Responsável', filtro.responsavel ? nomeDe(filtro.responsavel) : 'Todos'], ['Posição em', data(hoje())]],
          totais: { 'Saldo em aberto': somaCentavos(todos, 'saldo'), Recebido: somaCentavos(todos, 'recebido') },
        });
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
}

const ROTULOS = Object.fromEntries(SITUACOES);

export const COLUNAS_EXPORTACAO = [
  { titulo: 'Código', valor: (c) => c.codigo },
  { titulo: 'Cliente', valor: (c) => c.cliente_nome },
  { titulo: 'Descrição', valor: (c) => c.descricao },
  { titulo: 'Processo', valor: (c) => c.processo },
  { titulo: 'Data do contrato', valor: (c) => c.data_contrato, tipo: 'data' },
  { titulo: 'Honorários', valor: (c) => (c.tipo_honorario === 'exito' ? `Êxito ${String(c.exito_pct).replace('.', ',')}%` : 'Valor fixo') },
  { titulo: 'Valor do contrato', valor: (c) => (c.valor_total != null ? centavos(c.valor_total) : null), tipo: 'moeda' },
  { titulo: 'Exigível vigente', valor: (c) => centavos(c.exigivel_total), tipo: 'moeda' },
  { titulo: 'Recebido', valor: (c) => centavos(c.recebido), tipo: 'moeda' },
  { titulo: 'Saldo em aberto', valor: (c) => centavos(c.saldo), tipo: 'moeda' },
  { titulo: 'Saldo vencido', valor: (c) => centavos(c.saldo_vencido), tipo: 'moeda' },
  { titulo: 'Parcelas vencidas', valor: (c) => c.vencidas, tipo: 'inteiro' },
  { titulo: 'Próximo vencimento', valor: (c) => c.proximo_vencimento, tipo: 'data' },
  { titulo: 'Situação', valor: (c) => ROTULOS[c.rotulo] ?? c.rotulo },
  { titulo: 'Responsável', valor: (c) => (c.responsavel_id ? nomeDe(c.responsavel_id) : null) },
];

function tabela(linhas, total, pagina) {
  if (!linhas.length) return vazio('Nenhum contrato com esses filtros.');

  return html`
    <header class="painel__topo">
      <p class="sub">${total} ${total === 1 ? 'contrato' : 'contratos'} no filtro</p>
      <div class="grupo-botoes">${botoesExportar()}</div>
    </header>
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr>
            <th>Cliente</th><th>Contrato</th><th>Honorários</th>
            <th class="num">Recebido</th><th class="num">Saldo</th><th>Próximo vencimento</th><th>Situação</th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map((c, i) => html`
            <tr>
              <td>${i === 0 || linhas[i - 1].cliente_id !== c.cliente_id ? html`<strong>${c.cliente_nome}</strong>` : ''}</td>
              <td>
                <a href="#/financeiro/contratos/${c.id}">${c.codigo ? html`<strong>${c.codigo}</strong> · ` : ''}${c.descricao}</a>
                <span class="sub">${[c.processo, c.responsavel_id ? nomeDe(c.responsavel_id) : null,
                  c.data_contrato ? `de ${data(c.data_contrato)}` : 'formalização a confirmar'].filter(Boolean).join(' · ')}</span>
              </td>
              <td>
                ${c.tipo_honorario === 'exito' && c.valor_total == null
                  ? `${TIPOS_HONORARIO.exito} de ${percentual(c.exito_pct)}`
                  : html`<span class="num">${moeda(centavos(c.valor_total))}</span>`}
                <span class="sub">${c.parcelas_ativas ? `${c.parcelas_ativas} ${c.parcelas_ativas === 1 ? 'parcela' : 'parcelas'}` : ''}${c.parcelas_parciais ? ` · ${c.parcelas_parciais} paga(s) em parte` : ''}</span>
              </td>
              <td class="num">${moeda(centavos(c.recebido))}</td>
              <td class="num">${moeda(centavos(c.saldo))}${c.vencidas ? html`<span class="sub perigo">${moeda(centavos(c.saldo_vencido))} vencido</span>` : ''}</td>
              <td class="num">${c.proximo_vencimento ? data(c.proximo_vencimento) : '—'}</td>
              <td>${seloContrato(c.rotulo ?? c.situacao)}</td>
            </tr>`)}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Nesta página: ${linhas.length} ${linhas.length === 1 ? 'contrato' : 'contratos'}</td>
            <td class="num">${moeda(somaCentavos(linhas, 'recebido'))}</td>
            <td class="num">${moeda(somaCentavos(linhas, 'saldo'))}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    ${paginacao(pagina, Math.max(1, Math.ceil(total / POR_PAGINA)), total, POR_PAGINA)}`;
}

/** Dinheiro fora de contrato (6.2): consulta, sucumbência, reembolso de custas. */
export async function entradaAvulsa() {
  const [clientes, { formas, contasFinanceiras }] = await Promise.all([carregarClientes(), apoio()]);
  const dia = hoje();

  return abrirDialogo({
    titulo: 'Entrada avulsa',
    rotuloOk: 'Registrar entrada',
    corpo: html`
      <div class="campos">
        <label class="campo campo--6">
          <span>Tipo</span>
          <select name="tipo_avulsa" required>${opcoes(Object.entries(TIPOS_AVULSA), 'consulta')}</select>
        </label>
        <label class="campo campo--6">
          <span>Data</span>
          <input type="date" name="data" value="${dia}" max="${dia}" required>
        </label>
        ${campoCliente(clientes, { rotulo: 'Cliente (opcional; necessário para o recibo)', obrigatorio: false })}
        <label class="campo">
          <span>Descrição</span>
          <input name="descricao" maxlength="200" placeholder="Ex.: Consulta trabalhista">
        </label>
        <label class="campo campo--4">
          <span>Valor</span>
          <input name="valor" class="num" inputmode="decimal" required>
        </label>
        <label class="campo campo--4">
          <span>Forma</span>
          <select name="forma_id">${opcoes(formas.filter((f) => f.ativo).map((f) => [f.id, f.nome]), '', { vazio: 'Não informada' })}</select>
        </label>
        <label class="campo campo--4">
          <span>Entrou na conta</span>
          <select name="conta_financeira_id">${opcoesContasFinanceiras(contasFinanceiras)}</select>
        </label>
        <label class="campo">
          <span>Observação</span>
          <input name="observacao" maxlength="500">
        </label>
      </div>`,
    aoAbrir: (_, form) => ligarCampoCliente(form, clientes),
    aoEnviar: async (d) => {
      const valor = lerMoeda(d.valor);
      if (!(valor > 0)) throw new Error('Informe o valor.');
      await db.inserir('recebimentos', {
        tipo_avulsa: d.tipo_avulsa,
        cliente_id: d.cliente_id || null,
        descricao: d.descricao || null,
        data: d.data,
        valor: paraReais(valor),
        valor_principal: paraReais(valor),
        valor_encargos: 0,
        forma_id: d.forma_id || null,
        conta_financeira_id: d.conta_financeira_id || null,
        observacao: d.observacao || null,
      }, 'id');
      return true;
    },
  });
}
