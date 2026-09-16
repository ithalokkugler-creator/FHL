// Configurações do Financeiro (preparação 6.7).
// =============================================
//
// Critério de atraso, dados da cobrança, regra de divisão entre sócios,
// categorias e formas de pagamento. Todos os níveis do Financeiro leem; só o
// administrador muda (o banco garante).

import { atualizar } from '../../dominio/atraso.js';
import { correcaoPara, INDICES } from '../../dominio/indices.js';
import { mensagemDeCobranca } from '../../dominio/cobranca.js';
import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado, pode } from '../../nucleo/estado.js';
import { hoje, lerNumero, percentual, somarDias } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html, lerFormulario } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { apoio, esquecerApoio, memoria, opcoes } from './base.js';

const CORRECOES = [['nenhuma', 'Sem correção monetária'], ...Object.entries(INDICES).map(([v, i]) => [v, i.nome])];
const texto = (n) => String(Number(n)).replace('.', ',');

export default async function telaConfiguracoes(ctx) {
  const mostrar = async () => {
    esquecerApoio();
    const [{ config, categorias, formas }, cotas] = await Promise.all([
      apoio(),
      pode.fechamento() ? db.listar('divisao_cotas', { select: '*' }) : [],
    ]);
    if (!ctx.ativa()) return;
    const admin = pode.administrar();
    desenhar(ctx.raiz, tela({ config, categorias, formas, cotas, admin }));
    if (admin) ligar(ctx.raiz, { config, cotas, recarregar: mostrar });
    atualizarExemplo(ctx.raiz, config);
  };
  await mostrar();

  return aoClicar(ctx.raiz, {
    historico: () => mostrarHistoricoConfig(),
    'nova-categoria': () => editarItem('categorias', null).then((ok) => ok && mostrar()).catch(avisarErro),
    'nova-forma': () => editarItem('formas_pagamento', null).then((ok) => ok && mostrar()).catch(avisarErro),
    'editar-item': async (el) => {
      const lista = el.dataset.tabela;
      const item = (await apoio())[lista === 'categorias' ? 'categorias' : 'formas'].find((i) => i.id === el.dataset.id);
      if (await editarItem(lista, item)) await mostrar();
    },
  });
}

async function mostrarHistoricoConfig() {
  const { config } = await apoio();
  const cotas = pode.fechamento() ? await db.listar('divisao_cotas', { select: 'id' }) : [];
  abrirHistorico({ titulo: 'configurações do Financeiro', registros: [config.id, ...cotas.map((c) => c.id)] });
}

function tela({ config, categorias, formas, cotas, admin }) {
  const trava = admin ? '' : 'disabled';
  const socios = estado.membros.filter((m) => ['admin', 'socio'].includes(m.papel) || cotas.some((c) => c.membro_id === m.id));

  return html`
    ${cabecalho('Configurações do Financeiro', admin ? 'Só o administrador altera' : 'Somente leitura — só o administrador altera', html`
      <button type="button" class="botao" data-acao="historico">Histórico</button>`)}

    <div class="grade grade--2">
      <form class="painel" data-papel="criterio" novalidate>
        <header class="painel__topo"><h2 class="painel__titulo">Atraso</h2></header>
        <div class="painel__corpo campos">
          <p class="campo sub">Critério padrão, usado em todo contrato sem critério próprio. Vale para o cálculo de hoje em diante; recebimentos já lançados guardam o cálculo do dia.</p>
          <label class="campo campo--6"><span>Multa (%)</span><input name="multa_pct" class="num" inputmode="decimal" value="${texto(config.multa_pct)}" required ${trava}></label>
          <label class="campo campo--6"><span>Juros ao mês (%)</span><input name="juros_mes_pct" class="num" inputmode="decimal" value="${texto(config.juros_mes_pct)}" required ${trava}></label>
          <label class="campo campo--6"><span>Correção monetária</span><select name="correcao" ${trava}>${opcoes(CORRECOES, config.correcao)}</select></label>
          <label class="campo campo--6"><span>Carência (dias)</span><input type="number" name="carencia_dias" min="0" max="90" value="${config.carencia_dias}" required ${trava}></label>
          <div class="campo">
            <span>Exemplo: parcela de R$ 1.000,00 vencida há 45 dias</span>
            <div data-papel="exemplo"><p class="sub">Calculando…</p></div>
            <span class="campo__ajuda">Multa e juros simples sobre o saldo corrigido; juros proporcionais aos dias (÷ 30). A ordem das etapas é decisão jurídica do escritório — confira com casos reais.</span>
          </div>
        </div>
        ${admin ? html`<footer class="painel__rodape"><button class="botao botao--primario" type="submit">Salvar critério</button></footer>` : ''}
      </form>

      <form class="painel" data-papel="cobranca" novalidate>
        <header class="painel__topo"><h2 class="painel__titulo">Cobrança</h2></header>
        <div class="painel__corpo campos">
          <label class="campo campo--6"><span>Chave Pix do escritório</span><input name="pix_chave" value="${config.pix_chave ?? ''}" maxlength="140" ${trava}></label>
          <label class="campo campo--6"><span>Titular da chave</span><input name="pix_titular" value="${config.pix_titular ?? ''}" maxlength="140" ${trava}></label>
          <label class="campo">
            <span>Modelo da mensagem</span>
            <textarea name="mensagem_cobranca" rows="8" required ${trava}>${config.mensagem_cobranca}</textarea>
            <span class="campo__ajuda">Trocados na hora: {cliente} (primeiro nome), {remetente} (quem está logado), {parcelas}, {total} e {pix}.</span>
          </label>
          <div class="campo">
            <span>Como fica</span>
            <p class="nota nota--info" data-papel="previa-mensagem"></p>
          </div>
        </div>
        ${admin ? html`<footer class="painel__rodape"><button class="botao botao--primario" type="submit">Salvar cobrança</button></footer>` : ''}
      </form>
    </div>

    ${pode.fechamento() ? html`
      <form class="painel secao" data-papel="divisao" novalidate>
        <header class="painel__topo"><h2 class="painel__titulo">Divisão entre os sócios</h2></header>
        <div class="painel__corpo campos">
          <p class="nota campo">A regra de divisão ainda não foi definida pelo escritório. Até lá: partes iguais, depois das despesas.</p>
          <label class="campo campo--6">
            <span>Modelo</span>
            <select name="divisao_modelo" ${trava}>${opcoes([['igual', 'Partes iguais'], ['cotas', 'Cotas (percentual de cada sócio)']], config.divisao_modelo)}</select>
          </label>
          <label class="opcao campo--6"><input type="checkbox" name="divisao_despesas_antes" ${config.divisao_despesas_antes ? 'checked' : ''} ${trava}> As despesas saem antes da divisão</label>
          <div class="campo">
            <div class="tabela-rolagem">
              <table class="tabela">
                <thead><tr><th>Sócio</th><th>Participa</th><th class="num">Cota (%)</th></tr></thead>
                <tbody>
                  ${socios.map((m) => {
                    const cota = cotas.find((c) => c.membro_id === m.id);
                    return html`
                      <tr>
                        <td>${m.nome_curto}${m.ativo ? '' : html`<span class="sub">inativo</span>`}</td>
                        <td><input type="checkbox" name="participa_${m.id}" ${cota?.participa ? 'checked' : ''} ${trava} aria-label="${m.nome_curto} participa"></td>
                        <td class="num"><input class="entrada-texto num" name="percentual_${m.id}" inputmode="decimal" value="${cota ? texto(cota.percentual) : '0'}" ${trava} aria-label="Cota de ${m.nome_curto}"></td>
                      </tr>`;
                  })}
                </tbody>
              </table>
            </div>
            <span class="campo__ajuda" data-papel="soma-cotas"></span>
          </div>
        </div>
        ${admin ? html`<footer class="painel__rodape"><button class="botao botao--primario" type="submit">Salvar divisão</button></footer>` : ''}
      </form>` : ''}

    <div class="grade grade--2 secao">
      ${listaSimples('Categorias de despesa', 'categorias', categorias, admin, 'nova-categoria')}
      ${listaSimples('Formas de pagamento', 'formas_pagamento', formas, admin, 'nova-forma')}
    </div>`;
}

function listaSimples(titulo, tabela, itens, admin, acaoNova) {
  return html`
    <section class="painel">
      <header class="painel__topo">
        <h2 class="painel__titulo">${titulo}</h2>
        ${admin ? html`<button type="button" class="botao botao--pequeno" data-acao="${acaoNova}">Adicionar</button>` : ''}
      </header>
      ${itens.length ? html`
        <ul class="lista">
          ${itens.map((i) => html`
            <li class="lista__item">
              <span class="${i.ativo ? '' : 'sub'}">${i.nome}${i.ativo ? '' : ' (desativada)'}</span>
              ${admin ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar-item" data-tabela="${tabela}" data-id="${i.id}">Editar</button>` : ''}
            </li>`)}
        </ul>` : vazio('Nenhum item.')}
    </section>`;
}

async function atualizarExemplo(raiz, config) {
  const caixa = $('[data-papel="exemplo"]', raiz);
  const form = $('[data-papel="criterio"]', raiz);
  const cobranca = $('[data-papel="cobranca"]', raiz);
  if (!caixa || !form) return;

  const calcular = async () => {
    const dia = hoje();
    const vencimento = somarDias(dia, -45);
    const multa = lerNumero(form.multa_pct.value);
    const juros = lerNumero(form.juros_mes_pct.value);
    const carencia = Number(form.carencia_dias.value || 0);
    if (!(multa >= 0) || !(juros >= 0)) {
      caixa.textContent = 'Preencha multa e juros.';
      return;
    }
    const correcao = await correcaoPara(form.correcao.value, vencimento, dia);
    const r = atualizar({ saldo: 100000, vencimento, dataCalculo: dia, multaPct: multa, jurosMesPct: juros, carenciaDias: carencia, correcao });
    desenhar(caixa, memoria(r));

    const previa = $('[data-papel="previa-mensagem"]', cobranca);
    if (previa) {
      previa.textContent = mensagemDeCobranca({
        modelo: cobranca.mensagem_cobranca.value,
        cliente: 'Maria da Silva',
        remetente: estado.membro.nome_curto,
        parcelas: [{ numero: 2, vencimento, total: r.total }],
        total: r.total,
        pix: { chave: cobranca.pix_chave.value, titular: cobranca.pix_titular.value },
      });
    }
  };

  form.addEventListener('input', () => calcular().catch(avisarErro));
  cobranca.addEventListener('input', () => calcular().catch(avisarErro));
  await calcular().catch(() => {
    caixa.textContent = 'Não foi possível calcular o exemplo agora.';
  });
}

function ligar(raiz, { config, cotas, recarregar }) {
  const salvarConfig = async (form, mudanca, aviso) => {
    const botao = $('[type="submit"]', form);
    botao.disabled = true;
    try {
      await db.alterar('config_financeiro', [['id', 'eq', config.id]], mudanca, 'id');
      avisar(aviso);
      await recarregar();
    } catch (erro) {
      avisarErro(erro);
      botao.disabled = false;
    }
  };

  const criterio = $('[data-papel="criterio"]', raiz);
  criterio.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = lerFormulario(criterio);
    const multa = lerNumero(d.multa_pct);
    const juros = lerNumero(d.juros_mes_pct);
    const carencia = Number(d.carencia_dias);
    if (!(multa >= 0 && multa <= 100) || !(juros >= 0 && juros <= 100) || !(carencia >= 0 && carencia <= 90)) {
      avisarErro(new Error('Multa e juros vão de 0 a 100%; carência, de 0 a 90 dias.'));
      return;
    }
    salvarConfig(criterio, { multa_pct: multa, juros_mes_pct: juros, correcao: d.correcao, carencia_dias: carencia }, 'Critério de atraso salvo.');
  });

  const cobranca = $('[data-papel="cobranca"]', raiz);
  cobranca.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = lerFormulario(cobranca);
    if (!d.mensagem_cobranca) {
      avisarErro(new Error('O modelo da mensagem não pode ficar vazio.'));
      return;
    }
    salvarConfig(cobranca, { pix_chave: d.pix_chave || null, pix_titular: d.pix_titular || null, mensagem_cobranca: d.mensagem_cobranca }, 'Dados da cobrança salvos.');
  });

  const divisao = $('[data-papel="divisao"]', raiz);
  if (!divisao) return;

  const somaCotas = () => {
    const d = lerFormulario(divisao);
    const soma = Object.entries(d)
      .filter(([k, v]) => k.startsWith('participa_') && v)
      .reduce((s, [k]) => s + (lerNumero(d[`percentual_${k.slice(10)}`]) || 0), 0);
    $('[data-papel="soma-cotas"]', divisao).textContent = d.divisao_modelo === 'cotas'
      ? `Soma das cotas de quem participa: ${percentual(soma)}${Math.abs(soma - 100) < 0.01 ? '' : ' — precisa dar 100%'}`
      : 'Em partes iguais, a cota digitada não é usada.';
    return { d, soma };
  };
  divisao.addEventListener('input', somaCotas);
  somaCotas();

  divisao.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { d, soma } = somaCotas();
    if (d.divisao_modelo === 'cotas' && Math.abs(soma - 100) >= 0.01) {
      avisarErro(new Error('No modelo de cotas, as cotas de quem participa precisam somar 100%.'));
      return;
    }
    const botao = $('[type="submit"]', divisao);
    botao.disabled = true;
    try {
      const membros = Object.keys(d).filter((k) => k.startsWith('participa_')).map((k) => k.slice(10));
      for (const membroId of membros) {
        const participa = Boolean(d[`participa_${membroId}`]);
        const pct = lerNumero(d[`percentual_${membroId}`]) || 0;
        const cota = cotas.find((c) => c.membro_id === membroId);
        if (cota && (cota.participa !== participa || Number(cota.percentual) !== pct)) {
          await db.alterar('divisao_cotas', [['id', 'eq', cota.id]], { participa, percentual: pct }, 'id');
        } else if (!cota && participa) {
          await db.inserir('divisao_cotas', { membro_id: membroId, participa, percentual: pct }, 'id');
        }
      }
      await db.alterar('config_financeiro', [['id', 'eq', config.id]], {
        divisao_modelo: d.divisao_modelo,
        divisao_despesas_antes: Boolean(d.divisao_despesas_antes),
      }, 'id');
      avisar('Divisão salva. Vale para os próximos fechamentos.');
      await recarregar();
    } catch (erro) {
      avisarErro(erro);
      botao.disabled = false;
    }
  });
}

function editarItem(tabela, item) {
  const nomes = { categorias: 'categoria', formas_pagamento: 'forma de pagamento' };
  return abrirDialogo({
    titulo: item ? `Editar ${nomes[tabela]}` : `Nova ${nomes[tabela]}`,
    corpo: html`
      <div class="campos">
        <label class="campo campo--8"><span>Nome</span><input name="nome" value="${item?.nome ?? ''}" required maxlength="80" autofocus></label>
        <label class="campo campo--4"><span>Ordem</span><input type="number" name="ordem" value="${item?.ordem ?? 50}" min="0" max="999"></label>
        ${item ? html`<label class="opcao"><input type="checkbox" name="ativo" ${item.ativo ? 'checked' : ''}> Ativa — desativada, some das listas mas continua nos lançamentos antigos</label>` : ''}
      </div>`,
    aoEnviar: async (d) => {
      const registro = { nome: d.nome, ordem: Number(d.ordem || 0) };
      if (item) await db.alterar(tabela, [['id', 'eq', item.id]], { ...registro, ativo: d.ativo }, 'id');
      else await db.inserir(tabela, registro, 'id');
      esquecerApoio();
      avisar('Salvo.');
      return true;
    },
  });
}
