// Recebíveis — todas as parcelas, com filtros (preparação 6.7; DOCX §7, T08).
// Ação principal: "Receber".
//
// Situação no tempo (a vencer, vence hoje, vencida, paga…) e "paga em parte"
// são eixos diferentes: dá para filtrar parcelas pagas em parte e vencidas,
// ou em parte e ainda a vencer. Sem teto de linhas: paginação de 100 e
// exportação do filtro inteiro.
//
// Receber várias (baixa em lote, DOCX §7): cada parcela vira o seu próprio
// recebimento, com o cálculo do dia — a tela mostra o resumo antes, e o
// resultado parcela por parcela depois. Uma que falhe não desfaz as outras;
// as recebidas saem da lista e não podem ser recebidas de novo.

import { memoriaParaGravar, componentesDosEncargos } from '../../dominio/atraso.js';
import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { termoDeBusca } from '../../nucleo/consulta.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado, nomeDe, pode } from '../../nucleo/estado.js';
import { centavos, data, hoje, lerMoeda, moeda, paraReais } from '../../nucleo/formato.js';
import { $, $$, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, paginacao, seloParcela, vazio } from '../comum.js';
import { apoio, atualizarParcelas, opcoes, opcoesContasFinanceiras, receberParcela, rotuloParcela, somaCentavos } from './base.js';
import { botoesExportar, exportar } from './exportar.js';

const SITUACOES = [
  ['abertas', 'Em aberto'],
  ['vigentes', 'Do plano vigente (sem renegociadas e canceladas)'],
  ['a_vencer', 'A vencer'],
  ['vence_hoje', 'Vencem hoje'],
  ['vencida', 'Vencidas'],
  ['parcial', 'Pagas em parte (em aberto)'],
  ['paga', 'Pagas'],
  ['renegociada', 'Renegociadas'],
  ['cancelada', 'Canceladas'],
  ['todas', 'Todas'],
];
const POR_PAGINA = 100;

// Parcela renegociada tem "saldo" no banco — o que faltava pagar quando foi
// renegociada —, mas esse valor já passou para as parcelas novas. Mostrado e
// somado aqui, contava duas vezes.
const ABERTAS = ['a_vencer', 'vencida'];

export default async function telaRecebiveis(ctx) {
  const q = ctx.consulta;
  const filtro = {
    situacao: SITUACOES.some(([v]) => v === q.situacao) ? q.situacao : 'abertas',
    de: /^\d{4}-\d{2}-\d{2}$/.test(q.de ?? '') ? q.de : '',
    ate: /^\d{4}-\d{2}-\d{2}$/.test(q.ate ?? '') ? q.ate : '',
    busca: q.busca ?? '',
    responsavel: q.responsavel ?? '',
    minimo: q.minimo ?? '',
    maximo: q.maximo ?? '',
    pagina: Math.max(1, Number(q.pagina) || 1),
  };
  // Endereço antigo do Painel: ?mes=AAAA-MM.
  if (/^\d{4}-\d{2}$/.test(q.mes ?? '')) {
    const [a, m] = q.mes.split('-').map(Number);
    filtro.de = `${q.mes}-01`;
    filtro.ate = `${q.mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
  }

  desenhar(ctx.raiz, html`
    ${cabecalho('Recebíveis', 'Parcelas de todos os contratos', html`
      <a class="botao" href="#/financeiro/atraso">Em atraso, por cliente</a>`)}
    <form class="filtros" role="search">
      <label class="campo"><span>Situação</span><select name="situacao">${opcoes(SITUACOES, filtro.situacao)}</select></label>
      <label class="campo"><span>Vencimento de</span><input type="date" name="de" value="${filtro.de}"></label>
      <label class="campo"><span>até</span><input type="date" name="ate" value="${filtro.ate}"></label>
      <label class="campo campo--busca"><span>Buscar</span>
        <input type="search" name="busca" value="${filtro.busca}" placeholder="Cliente, código, contrato ou processo"></label>
      <label class="campo"><span>Responsável</span>
        <select name="responsavel">${opcoes(estado.membros.map((m) => [m.id, m.nome_curto]), filtro.responsavel, { vazio: 'Todos' })}</select></label>
      <label class="campo campo--estreito"><span>Saldo mínimo</span><input name="minimo" class="num" inputmode="decimal" value="${filtro.minimo}"></label>
      <label class="campo campo--estreito"><span>Saldo máximo</span><input name="maximo" class="num" inputmode="decimal" value="${filtro.maximo}"></label>
    </form>
    <section class="painel" data-papel="lista"><p class="carregando">Carregando…</p></section>`);

  const form = $('form', ctx.raiz);
  const lista = $('[data-papel="lista"]', ctx.raiz);
  let linhas = [];
  let pedido = 0;

  const consulta = () => {
    const filtros = [];
    const s = filtro.situacao;
    if (s === 'abertas') filtros.push(['situacao', 'in', ABERTAS]);
    else if (s === 'vigentes') filtros.push(['situacao', 'not.in', ['renegociada', 'cancelada']]);
    else if (s === 'vence_hoje') filtros.push(['situacao', 'eq', 'a_vencer'], ['vence_hoje', 'is', true]);
    else if (s === 'parcial') filtros.push(['situacao', 'in', ABERTAS], ['parcial', 'is', true]);
    else if (s !== 'todas') filtros.push(['situacao', 'eq', s]);
    if (filtro.de) filtros.push(['vencimento', 'gte', filtro.de]);
    if (filtro.ate) filtros.push(['vencimento', 'lte', filtro.ate]);
    const termo = termoDeBusca(filtro.busca);
    if (termo) filtros.push(['or', `(cliente_nome.ilike.${termo},contrato_codigo.ilike.${termo},contrato_descricao.ilike.${termo},processo.ilike.${termo})`]);
    if (filtro.responsavel) filtros.push(['responsavel_id', 'eq', filtro.responsavel]);
    const minimo = lerMoeda(filtro.minimo);
    const maximo = lerMoeda(filtro.maximo);
    if (minimo > 0) filtros.push(['saldo', 'gte', paraReais(minimo)]);
    if (maximo > 0) filtros.push(['saldo', 'lte', paraReais(maximo)]);
    return { select: '*', filtros, ordem: s === 'paga' ? 'ultimo_recebimento.desc,id.asc' : 'vencimento.asc,cliente_nome.asc,id.asc' };
  };

  const carregar = async () => {
    const este = ++pedido;
    const r = await db.pagina('v_parcelas', { ...consulta(), pagina: filtro.pagina, porPagina: POR_PAGINA });
    if (este !== pedido || !ctx.ativa()) return;
    linhas = r.linhas;
    desenhar(lista, tabela(linhas, r.total, filtro.pagina));
  };

  let espera = null;
  form.addEventListener('input', (e) => {
    Object.assign(filtro, {
      situacao: form.situacao.value, de: form.de.value, ate: form.ate.value, busca: form.busca.value,
      responsavel: form.responsavel.value, minimo: form.minimo.value, maximo: form.maximo.value, pagina: 1,
    });
    guardarConsulta(filtro);
    clearTimeout(espera);
    espera = setTimeout(() => carregar().catch(avisarErro), ['busca', 'minimo', 'maximo'].includes(e.target.name) ? 400 : 0);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  await carregar();

  const marcadas = () => $$('[name="lote"]:checked', lista).map((c) => linhas.find((p) => p.id === c.value)).filter(Boolean);
  lista.addEventListener('change', (e) => {
    if (e.target.name === 'todas') for (const c of $$('[name="lote"]', lista)) c.checked = e.target.checked;
    const n = marcadas().length;
    const botao = $('[data-acao="lote"]', lista);
    if (botao) {
      botao.hidden = !n;
      botao.textContent = `Receber ${n} ${n === 1 ? 'selecionada' : 'selecionadas'}`;
    }
  });

  return aoClicar(lista, {
    receber: async (botao) => {
      const parcela = linhas.find((p) => p.id === botao.dataset.id);
      if (parcela && (await receberParcela(parcela))) await carregar();
    },
    lote: async () => {
      if (await receberEmLote(marcadas())) await carregar();
    },
    pagina: (el) => {
      filtro.pagina = Number(el.dataset.pagina);
      guardarConsulta(filtro);
      carregar().catch(avisarErro);
      scrollTo(0, 0);
    },
    exportar: async (el) => {
      try {
        const todas = await db.todos('v_parcelas', consulta());
        await exportar({
          relatorio: 'Contas a receber',
          arquivo: 'recebiveis',
          formato: el.dataset.formato,
          colunas: COLUNAS_RECEBIVEIS,
          linhas: todas,
          filtros: [
            ['Situação', SITUACOES.find(([v]) => v === filtro.situacao)[1]],
            ['Vencimento', filtro.de || filtro.ate ? `${filtro.de ? data(filtro.de) : '…'} a ${filtro.ate ? data(filtro.ate) : '…'}` : 'qualquer'],
            ['Busca', filtro.busca || '—'], ['Responsável', filtro.responsavel ? nomeDe(filtro.responsavel) : 'Todos'],
            ['Situação calculada em', data(hoje())],
          ],
          totais: { Valor: somaCentavos(todas, 'valor'), 'Saldo em aberto': somaCentavos(todas.filter((p) => ABERTAS.includes(p.situacao)), 'saldo') },
        });
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
}

const NOMES_SITUACAO = { a_vencer: 'A vencer', vencida: 'Vencida', paga: 'Paga', renegociada: 'Renegociada', cancelada: 'Cancelada' };

export const COLUNAS_RECEBIVEIS = [
  { titulo: 'Vencimento', valor: (p) => p.vencimento, tipo: 'data' },
  { titulo: 'Cliente', valor: (p) => p.cliente_nome },
  { titulo: 'Código', valor: (p) => p.contrato_codigo },
  { titulo: 'Contrato', valor: (p) => p.contrato_descricao },
  { titulo: 'Processo', valor: (p) => p.processo },
  { titulo: 'Parcela', valor: (p) => rotuloParcela(p) },
  { titulo: 'Valor', valor: (p) => centavos(p.valor), tipo: 'moeda' },
  { titulo: 'Exigível', valor: (p) => centavos(p.exigivel ?? p.valor), tipo: 'moeda' },
  { titulo: 'Recebido (principal)', valor: (p) => centavos(p.pago_principal), tipo: 'moeda' },
  { titulo: 'Encargos recebidos', valor: (p) => centavos(p.pago_encargos), tipo: 'moeda' },
  { titulo: 'Saldo', valor: (p) => (ABERTAS.includes(p.situacao) ? centavos(p.saldo) : 0), tipo: 'moeda' },
  { titulo: 'Situação', valor: (p) => `${NOMES_SITUACAO[p.situacao] ?? p.situacao}${p.parcial && ABERTAS.includes(p.situacao) ? ' (em parte)' : ''}` },
  { titulo: 'Dias de atraso', valor: (p) => (p.situacao === 'vencida' ? p.dias_atraso : null), tipo: 'inteiro' },
  { titulo: 'Último recebimento', valor: (p) => p.ultimo_recebimento, tipo: 'data' },
  { titulo: 'Responsável', valor: (p) => (p.responsavel_id ? nomeDe(p.responsavel_id) : null) },
];

function tabela(linhas, total, pagina) {
  if (!linhas.length) return vazio('Nenhuma parcela com esses filtros.');
  const lanca = pode.lancar();
  const abertas = linhas.filter((p) => ABERTAS.includes(p.situacao));

  return html`
    <header class="painel__topo">
      <p class="sub">${total} ${total === 1 ? 'parcela' : 'parcelas'} no filtro</p>
      <div class="grupo-botoes">
        ${lanca ? html`<button type="button" class="botao botao--pequeno botao--primario" data-acao="lote" hidden>Receber selecionadas</button>` : ''}
        ${botoesExportar()}
      </div>
    </header>
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr>
            ${lanca ? html`<th>${abertas.length ? html`<input type="checkbox" name="todas" aria-label="Marcar todas as em aberto da página">` : ''}</th>` : ''}
            <th>Vencimento</th><th>Cliente</th><th>Contrato</th><th>Parcela</th>
            <th class="num">Valor</th><th class="num">Saldo</th><th>Situação</th>
            <th class="acoes"><span class="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map((p) => html`
            <tr>
              ${lanca ? html`<td>${ABERTAS.includes(p.situacao) ? html`<input type="checkbox" name="lote" value="${p.id}" aria-label="Selecionar ${rotuloParcela(p)} de ${p.cliente_nome}">` : ''}</td>` : ''}
              <td class="num">${data(p.vencimento)}${p.situacao === 'vencida' ? html`<span class="sub perigo">${p.dias_atraso} dias</span>` : p.vence_hoje && p.situacao === 'a_vencer' ? html`<span class="sub">vence hoje</span>` : ''}</td>
              <td>${p.cliente_nome}</td>
              <td>
                <a href="#/financeiro/contratos/${p.contrato_id}">${p.contrato_codigo ? html`<strong>${p.contrato_codigo}</strong> · ` : ''}${p.contrato_descricao}</a>
                ${p.responsavel_id ? html`<span class="sub">${nomeDe(p.responsavel_id)}</span>` : ''}
              </td>
              <td>${rotuloParcela(p)}</td>
              <td class="num">${moeda(centavos(p.valor))}${Number(p.ajustes_desconto) || Number(p.ajustes_acrescimo) ? html`<span class="sub">exige ${moeda(centavos(p.exigivel))}</span>` : ''}</td>
              <td class="num">${ABERTAS.includes(p.situacao) ? moeda(centavos(p.saldo)) : '—'}</td>
              <td>${seloParcela(p.situacao, p.parcial)}</td>
              <td class="acoes">
                ${ABERTAS.includes(p.situacao) && lanca
                  ? html`<button type="button" class="botao botao--pequeno" data-acao="receber" data-id="${p.id}">Receber</button>`
                  : ''}
              </td>
            </tr>`)}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="${lanca ? 5 : 4}">Nesta página: ${linhas.length} ${linhas.length === 1 ? 'parcela' : 'parcelas'}</td>
            <td class="num">${moeda(somaCentavos(linhas, 'valor'))}</td>
            <td class="num">${moeda(somaCentavos(abertas, 'saldo'))}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    ${paginacao(pagina, Math.max(1, Math.ceil(total / POR_PAGINA)), total, POR_PAGINA)}`;
}

/** Baixa em lote: resumo antes, um recebimento por parcela, resultado por linha. */
async function receberEmLote(parcelas) {
  if (!parcelas.length) return false;
  const dia = hoje();
  const [{ formas, contasFinanceiras }, itens] = await Promise.all([apoio(), atualizarParcelas(parcelas, dia)]);
  const total = itens.reduce((s, i) => s + i.calculo.total, 0);
  let resultado = null;

  await abrirDialogo({
    titulo: `Receber ${parcelas.length} ${parcelas.length === 1 ? 'parcela' : 'parcelas'}`,
    rotuloOk: 'Registrar todos',
    largo: true,
    corpo: html`
      <p class="dialogo__texto">Cada parcela recebe o valor atualizado de hoje (saldo + multa, juros e correção, se vencida), com a memória do cálculo. Confira antes de registrar.</p>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Cliente</th><th>Parcela</th><th>Vencimento</th><th class="num">Saldo</th><th class="num">A receber hoje</th><th>Resultado</th></tr></thead>
          <tbody>${itens.map(({ parcela: p, calculo }) => html`
            <tr data-linha="${p.id}">
              <td>${p.cliente_nome}<span class="sub">${p.contrato_codigo ?? ''} ${p.contrato_descricao}</span></td>
              <td>${rotuloParcela(p)}</td>
              <td class="num">${data(p.vencimento)}</td>
              <td class="num">${moeda(calculo.saldo)}</td>
              <td class="num">${moeda(calculo.total)}</td>
              <td data-resultado>—</td>
            </tr>`)}
          </tbody>
          <tfoot><tr><td colspan="4">Total</td><td class="num">${moeda(total)}</td><td></td></tr></tfoot>
        </table>
      </div>
      <div class="campos secao">
        <label class="campo campo--4"><span>Data do pagamento</span><input type="date" name="data" value="${dia}" max="${dia}" readonly></label>
        <label class="campo campo--4"><span>Forma</span><select name="forma_id">${opcoes(formas.filter((f) => f.ativo).map((f) => [f.id, f.nome]), '', { vazio: 'Não informada' })}</select></label>
        <label class="campo campo--4"><span>Entrou na conta</span><select name="conta_financeira_id">${opcoesContasFinanceiras(contasFinanceiras)}</select></label>
      </div>`,
    aoEnviar: async (d, form, dialogo) => {
      if (resultado) return true;
      resultado = { ok: 0, falhas: 0 };
      for (const { parcela: p, calculo } of itens) {
        const celula = $(`[data-linha="${p.id}"] [data-resultado]`, dialogo);
        const principal = calculo.saldo;
        const k = componentesDosEncargos(calculo, calculo.total - principal);
        try {
          await db.inserir('recebimentos', {
            parcela_id: p.id, data: dia, valor: paraReais(calculo.total), valor_principal: paraReais(principal),
            valor_encargos: paraReais(calculo.total - principal), valor_correcao: paraReais(k.correcao), valor_multa: paraReais(k.multa),
            valor_juros: paraReais(k.juros), valor_acrescimo: paraReais(k.acrescimo), forma_id: d.forma_id || null,
            conta_financeira_id: d.conta_financeira_id || null, observacao: 'Recebido em lote', memoria_calculo: memoriaParaGravar(calculo),
          }, 'id');
          celula.textContent = 'Recebido';
          resultado.ok++;
        } catch (erro) {
          celula.textContent = erro.message;
          celula.classList.add('perigo');
          resultado.falhas++;
        }
      }
      avisar(`${resultado.ok} recebida(s)${resultado.falhas ? `, ${resultado.falhas} com erro (veja a tabela)` : ''}.`, resultado.falhas ? 'erro' : 'ok');
      // Com falha, o diálogo fica aberto mostrando o resultado de cada linha.
      if (resultado.falhas) {
        $('[type="submit"]', dialogo).textContent = 'Fechar';
        return false;
      }
      return true;
    },
  });
  return Boolean(resultado?.ok);
}
