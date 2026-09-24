// Em atraso — a lista de cobrança (preparação 6.4 C e 6.7).
// ==========================================================
//
// "Tem muito dinheiro perdido na praça… eu fiquei quase um ano sem cobrar o
// cliente." Cada cliente com o valor já atualizado, a memória do cálculo, a
// última cobrança registrada e as três saídas: cobrar, receber, renegociar.

import { avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { nomeDe } from '../../nucleo/estado.js';
import { data, dataHora, hoje, moeda, telefone } from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, CANAIS, indicador, plural, vazio } from '../comum.js';
import {
  apoio, atualizarParcelas, criterioEmTexto, memoria, prepararCobranca, receberParcela,
  renegociarContrato, rotuloParcela,
} from './base.js';

export default async function telaEmAtraso(ctx) {
  let grupos = [];

  const mostrar = async () => {
    const dados = await carregar();
    if (!ctx.ativa()) return;
    grupos = dados.grupos;
    desenhar(ctx.raiz, tela(dados));
  };
  await mostrar();

  const grupoDe = (id) => grupos.find((g) => g.cliente_id === id);
  const itemDe = (id) => grupos.flatMap((g) => g.itens).find((i) => i.parcela.id === id);

  return aoClicar(ctx.raiz, {
    cobrar: async (botao) => {
      if (await prepararCobranca(grupoDe(botao.dataset.cliente))) await mostrar().catch(avisarErro);
    },
    receber: async (botao) => {
      if (await receberParcela(itemDe(botao.dataset.id).parcela)) await mostrar().catch(avisarErro);
    },
    renegociar: async (botao) => {
      if (await renegociarContrato(botao.dataset.contrato)) await mostrar().catch(avisarErro);
    },
    calculo: (botao) => {
      const { parcela, calculo } = itemDe(botao.dataset.id);
      abrirDialogo({
        titulo: `${parcela.cliente_nome} — ${rotuloParcela(parcela)}`,
        somenteLeitura: true,
        corpo: html`
          <p class="dialogo__texto">${parcela.contrato_descricao} · vencida em ${data(parcela.vencimento)} · atualizado para hoje, ${data(hoje())}</p>
          ${memoria(calculo)}`,
      });
    },
  });
}

async function carregar() {
  const [vencidas, { config }] = await Promise.all([
    db.todos('v_parcelas', { select: '*', filtros: [['situacao', 'eq', 'vencida']] }),
    apoio(),
  ]);
  vencidas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const [itens, cobrancas] = await Promise.all([
    atualizarParcelas(vencidas),
    cobrancasDe([...new Set(vencidas.map((p) => p.cliente_id))]),
  ]);
  const ultimaCobranca = new Map();
  for (const c of cobrancas) if (!ultimaCobranca.has(c.cliente_id)) ultimaCobranca.set(c.cliente_id, c);

  const porCliente = new Map();
  for (const item of itens) {
    const p = item.parcela;
    if (!porCliente.has(p.cliente_id)) {
      porCliente.set(p.cliente_id, {
        cliente_id: p.cliente_id,
        cliente_nome: p.cliente_nome,
        cliente_telefone: p.cliente_telefone,
        itens: [],
        ultimaCobranca: ultimaCobranca.get(p.cliente_id) ?? null,
      });
    }
    porCliente.get(p.cliente_id).itens.push(item);
  }

  const grupos = [...porCliente.values()]
    .map((g) => ({ ...g, total: g.itens.reduce((s, i) => s + i.calculo.total, 0), saldo: g.itens.reduce((s, i) => s + i.calculo.saldo, 0) }))
    .sort((a, b) => b.total - a.total);

  return { grupos, config, indisponivel: itens.some((i) => i.calculo.indice?.indisponivel) };
}

/** As cobranças só dos clientes em atraso. Buscar as mil últimas do escritório
 *  inteiro, como antes, deixava de fora quem foi cobrado há mais tempo — e ele
 *  aparecia como "nunca cobrado". De cem em cem ids, para o endereço não
 *  passar do tamanho que o servidor aceita. */
async function cobrancasDe(clientes) {
  const lotes = [];
  for (let i = 0; i < clientes.length; i += 100) lotes.push(clientes.slice(i, i + 100));
  const resultados = await Promise.all(lotes.map((ids) => db.todos('cobrancas', {
    select: 'id,cliente_id,canal,criado_em,criado_por',
    filtros: [['cliente_id', 'in', ids]],
  })));
  return resultados.flat().sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

function tela({ grupos, config, indisponivel }) {
  const total = grupos.reduce((s, g) => s + g.total, 0);
  const saldo = grupos.reduce((s, g) => s + g.saldo, 0);
  const parcelas = grupos.reduce((s, g) => s + g.itens.length, 0);
  const nuncaCobrados = grupos.filter((g) => !g.ultimaCobranca).length;

  return html`
    ${cabecalho('Em atraso', 'Valores atualizados até hoje, por cliente', html`<a class="botao" href="#/financeiro/recebiveis?situacao=vencida">Ver como lista</a>`)}

    <div class="indicadores">
      ${indicador('Total atualizado', moeda(total), `saldo de ${moeda(saldo)} + ${moeda(total - saldo)} de encargos`, { tom: total ? 'perigo' : '' })}
      ${indicador('Clientes', String(grupos.length), plural(parcelas, 'parcela vencida', 'parcelas vencidas'))}
      ${indicador('Sem cobrança registrada', String(nuncaCobrados),
        nuncaCobrados === 1 ? 'cliente nunca cobrado pelo sistema' : 'clientes nunca cobrados pelo sistema',
        { tom: nuncaCobrados ? 'perigo' : '' })}
    </div>

    ${indisponivel ? html`<p class="nota">O Banco Central não respondeu agora: os valores abaixo estão sem correção monetária. Recarregue daqui a pouco.</p>` : ''}
    <p class="sub">Critério: ${criterioEmTexto(config)}. <a href="#/financeiro/configuracoes">Configurar</a></p>

    <div class="grade secao">
      ${grupos.length ? grupos.map(cartao) : html`<section class="painel">${vazio('Nenhuma parcela em atraso.')}</section>`}
    </div>`;
}

function cartao(g) {
  const contratos = [...new Map(g.itens.map((i) => [i.parcela.contrato_id, i.parcela.contrato_descricao])).entries()];
  const c = g.ultimaCobranca;

  return html`
    <section class="painel">
      <header class="painel__topo">
        <div>
          <h2 class="painel__titulo">${g.cliente_nome}</h2>
          <p class="sub">
            ${g.cliente_telefone ? `${telefone(g.cliente_telefone)} · ` : ''}
            ${c ? `Última cobrança em ${dataHora(c.criado_em)}, por ${nomeDe(c.criado_por)} (${CANAIS[c.canal] ?? c.canal})` : html`<span class="perigo">Nunca cobrado pelo sistema</span>`}
          </p>
        </div>
        <div class="grupo-botoes">
          <strong class="num">${moeda(g.total)}</strong>
          <button type="button" class="botao botao--primario botao--pequeno" data-acao="cobrar" data-cliente="${g.cliente_id}">Preparar mensagem</button>
        </div>
      </header>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Contrato</th><th>Parcela</th><th>Vencimento</th><th class="num">Dias</th>
              <th class="num">Saldo</th><th class="num">Correção</th><th class="num">Multa</th><th class="num">Juros</th><th class="num">Total hoje</th>
              <th class="acoes"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            ${g.itens.map(({ parcela: p, calculo: k }) => html`
              <tr>
                <td><a href="#/financeiro/contratos/${p.contrato_id}">${p.contrato_descricao}</a></td>
                <td>${rotuloParcela(p)}${p.parcial ? html`<span class="sub">paga em parte</span>` : ''}</td>
                <td class="num">${data(p.vencimento)}</td>
                <td class="num">${k.dias}</td>
                <td class="num">${moeda(k.saldo)}</td>
                <td class="num">${moeda(k.correcao)}</td>
                <td class="num">${moeda(k.multa)}</td>
                <td class="num">${moeda(k.juros)}</td>
                <td class="num forte">${moeda(k.total)}</td>
                <td class="acoes">
                  <button type="button" class="botao botao--pequeno botao--discreto" data-acao="calculo" data-id="${p.id}">Cálculo</button>
                  <button type="button" class="botao botao--pequeno" data-acao="receber" data-id="${p.id}">Receber</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      <footer class="painel__rodape grupo-botoes">
        ${contratos.map(([id, descricao]) => html`
          <button type="button" class="botao botao--pequeno" data-acao="renegociar" data-contrato="${id}">Renegociar ${contratos.length > 1 ? descricao : 'o contrato'}</button>`)}
      </footer>
    </section>`;
}
