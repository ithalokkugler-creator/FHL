// Recebíveis — todas as parcelas, com filtros (preparação 6.7).
// Ação principal: "Receber".

import { avisarErro } from '../../nucleo/avisos.js';
import { termoDeBusca } from '../../nucleo/consulta.js';
import { estado, nomeDe } from '../../nucleo/estado.js';
import { centavos, data, fimDoMes, moeda } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, seloParcela, vazio } from '../comum.js';
import { opcoes, receberParcela, rotuloParcela, somaCentavos } from './base.js';

const SITUACOES = [
  ['abertas', 'Em aberto'],
  ['a_vencer', 'A vencer'],
  ['vencida', 'Vencidas'],
  ['paga', 'Pagas'],
  ['todas', 'Todas'],
];
const LIMITE = 500;

export default async function telaRecebiveis(ctx) {
  const filtro = {
    situacao: SITUACOES.some(([v]) => v === ctx.consulta.situacao) ? ctx.consulta.situacao : 'abertas',
    mes: /^\d{4}-\d{2}$/.test(ctx.consulta.mes ?? '') ? ctx.consulta.mes : '',
    busca: ctx.consulta.busca ?? '',
    responsavel: ctx.consulta.responsavel ?? '',
  };

  desenhar(ctx.raiz, html`
    ${cabecalho('Recebíveis', 'Parcelas de todos os contratos', html`
      <a class="botao" href="#/financeiro/atraso">Em atraso</a>
      <a class="botao botao--primario" href="#/financeiro/contratos/novo">Novo contrato</a>`)}
    <form class="filtros" role="search">
      <label class="campo">
        <span>Situação</span>
        <select name="situacao">${opcoes(SITUACOES, filtro.situacao)}</select>
      </label>
      <label class="campo">
        <span>Mês do vencimento</span>
        <input type="month" name="mes" value="${filtro.mes}">
      </label>
      <label class="campo campo--busca">
        <span>Cliente</span>
        <input type="search" name="busca" value="${filtro.busca}" placeholder="Nome do cliente">
      </label>
      <label class="campo">
        <span>Responsável</span>
        <select name="responsavel">${opcoes(estado.membros.map((m) => [m.id, m.nome_curto]), filtro.responsavel, { vazio: 'Todos' })}</select>
      </label>
    </form>
    <section class="painel" data-papel="lista"><p class="carregando">Carregando…</p></section>`);

  const form = $('form', ctx.raiz);
  const lista = $('[data-papel="lista"]', ctx.raiz);
  let linhas = [];
  let pedido = 0;

  const carregar = async () => {
    const este = ++pedido;
    const filtros = [];
    if (filtro.situacao === 'abertas') filtros.push(['situacao', 'in', ['a_vencer', 'vencida']]);
    else if (filtro.situacao !== 'todas') filtros.push(['situacao', 'eq', filtro.situacao]);
    if (filtro.mes) filtros.push(['vencimento', 'gte', `${filtro.mes}-01`], ['vencimento', 'lte', fimDoMes(`${filtro.mes}-01`)]);
    const termo = termoDeBusca(filtro.busca);
    if (termo) filtros.push(['cliente_nome', 'ilike', termo]);
    if (filtro.responsavel) filtros.push(['responsavel_id', 'eq', filtro.responsavel]);

    const resultado = await db.listar('v_parcelas', {
      select: '*',
      filtros,
      ordem: filtro.situacao === 'paga' ? 'ultimo_recebimento.desc' : 'vencimento.asc,cliente_nome.asc',
      limite: LIMITE,
    });
    if (este !== pedido || !ctx.ativa()) return;
    linhas = resultado;
    desenhar(lista, tabela(linhas));
  };

  let espera = null;
  form.addEventListener('input', (e) => {
    Object.assign(filtro, {
      situacao: form.situacao.value,
      mes: form.mes.value,
      busca: form.busca.value,
      responsavel: form.responsavel.value,
    });
    guardarConsulta(filtro);
    clearTimeout(espera);
    espera = setTimeout(() => carregar().catch(avisarErro), e.target.name === 'busca' ? 300 : 0);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  await carregar();

  return aoClicar(lista, {
    receber: async (botao) => {
      const parcela = linhas.find((p) => p.id === botao.dataset.id);
      if (parcela && (await receberParcela(parcela))) await carregar();
    },
  });
}

function tabela(linhas) {
  if (!linhas.length) return vazio('Nenhuma parcela com esses filtros.');

  return html`
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr>
            <th>Vencimento</th><th>Cliente</th><th>Contrato</th><th>Parcela</th>
            <th class="num">Valor</th><th class="num">Saldo</th><th>Situação</th>
            <th class="acoes"><span class="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map((p) => html`
            <tr>
              <td class="num">${data(p.vencimento)}${p.situacao === 'vencida' ? html`<span class="sub perigo">${p.dias_atraso} dias</span>` : ''}</td>
              <td>${p.cliente_nome}</td>
              <td>
                <a href="#/financeiro/contratos/${p.contrato_id}">${p.contrato_descricao}</a>
                ${p.responsavel_id ? html`<span class="sub">${nomeDe(p.responsavel_id)}</span>` : ''}
              </td>
              <td>${rotuloParcela(p)}</td>
              <td class="num">${moeda(centavos(p.valor))}</td>
              <td class="num">${moeda(centavos(p.saldo))}</td>
              <td>${seloParcela(p.situacao, p.parcial)}</td>
              <td class="acoes">
                ${['a_vencer', 'vencida'].includes(p.situacao)
                  ? html`<button type="button" class="botao botao--pequeno" data-acao="receber" data-id="${p.id}">Receber</button>`
                  : ''}
              </td>
            </tr>`)}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4">${linhas.length} ${linhas.length === 1 ? 'parcela' : 'parcelas'}${linhas.length === LIMITE ? ` — mostrando as primeiras ${LIMITE}` : ''}</td>
            <td class="num">${moeda(somaCentavos(linhas, 'valor'))}</td>
            <td class="num">${moeda(somaCentavos(linhas, 'saldo'))}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}
