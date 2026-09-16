// Contratos — com saldo e situação (preparação 6.7).
// Também é daqui que sai a entrada avulsa: consulta paga na hora,
// sucumbência, reembolso de custas.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { termoDeBusca } from '../../nucleo/consulta.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { nomeDe } from '../../nucleo/estado.js';
import { centavos, data, hoje, lerMoeda, moeda, paraReais, percentual } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { campoCliente, carregarClientes, ligarCampoCliente } from '../clientes.js';
import { cabecalho, seloContrato, TIPOS_AVULSA, TIPOS_HONORARIO, vazio } from '../comum.js';
import { apoio, opcoes, somaCentavos } from './base.js';

const SITUACOES = [
  ['abertos', 'Ativos e a apurar'],
  ['ativo', 'Ativos'],
  ['a_apurar', 'Êxito a apurar'],
  ['quitado', 'Quitados'],
  ['cancelado', 'Cancelados'],
  ['todos', 'Todos'],
];

export default async function telaContratos(ctx) {
  const filtro = {
    situacao: SITUACOES.some(([v]) => v === ctx.consulta.situacao) ? ctx.consulta.situacao : 'abertos',
    busca: ctx.consulta.busca ?? '',
  };

  desenhar(ctx.raiz, html`
    ${cabecalho('Contratos', 'Contratos financeiros de honorários', html`
      <button type="button" class="botao" data-acao="avulsa">Entrada avulsa</button>
      <a class="botao botao--primario" href="#/financeiro/contratos/novo">Novo contrato</a>`)}
    <form class="filtros" role="search">
      <label class="campo">
        <span>Situação</span>
        <select name="situacao">${opcoes(SITUACOES, filtro.situacao)}</select>
      </label>
      <label class="campo campo--busca">
        <span>Cliente</span>
        <input type="search" name="busca" value="${filtro.busca}" placeholder="Nome do cliente">
      </label>
    </form>
    <section class="painel" data-papel="lista"><p class="carregando">Carregando…</p></section>`);

  const form = $('form', ctx.raiz);
  const lista = $('[data-papel="lista"]', ctx.raiz);
  let pedido = 0;

  const carregar = async () => {
    const este = ++pedido;
    const filtros = [];
    if (filtro.situacao === 'abertos') filtros.push(['situacao', 'in', ['ativo', 'a_apurar']]);
    else if (filtro.situacao !== 'todos') filtros.push(['situacao', 'eq', filtro.situacao]);
    const termo = termoDeBusca(filtro.busca);
    if (termo) filtros.push(['cliente_nome', 'ilike', termo]);

    const linhas = await db.listar('v_contratos', {
      select: '*',
      filtros,
      ordem: 'cliente_nome.asc,criado_em.desc',
      limite: 500,
    });
    if (este !== pedido || !ctx.ativa()) return;
    desenhar(lista, tabela(linhas));
  };

  let espera = null;
  form.addEventListener('input', (e) => {
    Object.assign(filtro, { situacao: form.situacao.value, busca: form.busca.value });
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
  });
}

function tabela(linhas) {
  if (!linhas.length) return vazio('Nenhum contrato com esses filtros.');

  return html`
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
                <a href="#/financeiro/contratos/${c.id}">${c.descricao}</a>
                <span class="sub">${[c.processo, c.responsavel_id ? nomeDe(c.responsavel_id) : null].filter(Boolean).join(' · ')}</span>
              </td>
              <td>
                ${c.tipo_honorario === 'exito' && c.valor_total == null
                  ? `${TIPOS_HONORARIO.exito} de ${percentual(c.exito_pct)}`
                  : html`<span class="num">${moeda(centavos(c.valor_total))}</span>`}
                <span class="sub">${c.parcelas_ativas ? `${c.parcelas_ativas} ${c.parcelas_ativas === 1 ? 'parcela' : 'parcelas'}` : ''}</span>
              </td>
              <td class="num">${moeda(centavos(c.recebido))}</td>
              <td class="num">${moeda(centavos(c.saldo))}${c.vencidas ? html`<span class="sub perigo">${moeda(centavos(c.saldo_vencido))} vencido</span>` : ''}</td>
              <td class="num">${c.proximo_vencimento ? data(c.proximo_vencimento) : '—'}</td>
              <td>${seloContrato(c.situacao)}</td>
            </tr>`)}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">${linhas.length} ${linhas.length === 1 ? 'contrato' : 'contratos'}</td>
            <td class="num">${moeda(somaCentavos(linhas, 'recebido'))}</td>
            <td class="num">${moeda(somaCentavos(linhas, 'saldo'))}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

/** Dinheiro fora de contrato (6.2): consulta, sucumbência, reembolso de custas. */
export async function entradaAvulsa() {
  const [clientes, { formas }] = await Promise.all([carregarClientes(), apoio()]);
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
        ${campoCliente(clientes, { rotulo: 'Cliente (opcional)', obrigatorio: false })}
        <label class="campo">
          <span>Descrição</span>
          <input name="descricao" maxlength="200" placeholder="Ex.: Consulta trabalhista">
        </label>
        <label class="campo campo--6">
          <span>Valor</span>
          <input name="valor" class="num" inputmode="decimal" required>
        </label>
        <label class="campo campo--6">
          <span>Forma</span>
          <select name="forma_id">${opcoes(formas.filter((f) => f.ativo).map((f) => [f.id, f.nome]), '', { vazio: 'Não informada' })}</select>
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
        observacao: d.observacao || null,
      }, 'id');
      return true;
    },
  });
}
