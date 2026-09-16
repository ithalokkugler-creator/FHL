// O que as telas do Financeiro compartilham.
// ==========================================
//
// Configuração e listas de apoio, o valor atualizado das parcelas — com cada
// índice buscado uma vez por tela — e os diálogos que aparecem em mais de um
// lugar: receber, cobrar e renegociar.

import { atualizar, memoriaParaGravar } from '../../dominio/atraso.js';
import { mensagemDeCobranca } from '../../dominio/cobranca.js';
import { fatorDoPeriodo, INDICES, variacoes } from '../../dominio/indices.js';
import { gerarParcelas, somaDasParcelas } from '../../dominio/parcelas.js';
import { avisar } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado } from '../../nucleo/estado.js';
import {
  centavos, data, decimal, hoje, lerMoeda, linkWhatsApp, moeda, paraReais, percentual, somarMeses,
} from '../../nucleo/formato.js';
import { $, $$, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { CANAIS, opcoes } from '../comum.js';

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

let apoioEmCache = null;

/** Configuração, categorias e formas de pagamento. */
export function apoio() {
  apoioEmCache ??= Promise.all([
    db.um('config_financeiro', { select: '*' }),
    db.listar('categorias', { select: 'id,nome,ordem,ativo', ordem: 'ordem.asc,nome.asc' }),
    db.listar('formas_pagamento', { select: 'id,nome,ordem,ativo', ordem: 'ordem.asc,nome.asc' }),
  ])
    .then(([config, categorias, formas]) => ({ config, categorias, formas }))
    .catch((erro) => {
      apoioEmCache = null;
      throw erro;
    });
  return apoioEmCache;
}

export const esquecerApoio = () => {
  apoioEmCache = null;
};

export const somaCentavos = (linhas, campo) => linhas.reduce((s, l) => s + centavos(l[campo]), 0);

export const rotuloParcela = (p) => (p.numero === 0 ? 'Entrada' : `Parcela ${p.numero}`);

export { opcoes };

/** "multa de 10% · juros de 1% ao mês · correção pelo IPCA · sem carência" */
export function criterioEmTexto(c) {
  const partes = [`multa de ${percentual(c.multa_pct)}`, `juros de ${percentual(c.juros_mes_pct)} ao mês`];
  partes.push(INDICES[c.correcao] ? `correção pelo ${INDICES[c.correcao].nome}` : 'sem correção monetária');
  partes.push(Number(c.carencia_dias) ? `carência de ${c.carencia_dias} dias` : 'sem carência');
  return partes.join(' · ');
}

// ---------------------------------------------------------------------------
// Valor atualizado (6.5)
// ---------------------------------------------------------------------------

/** Atualiza várias linhas de v_parcelas numa data, buscando cada índice uma
 *  vez só. Devolve [{ parcela, calculo }]. */
export async function atualizarParcelas(parcelas, dataCalculo = hoje()) {
  const desde = {};
  for (const p of parcelas) {
    if (INDICES[p.correcao] && (!desde[p.correcao] || p.vencimento < desde[p.correcao])) {
      desde[p.correcao] = p.vencimento;
    }
  }

  const mapas = {};
  await Promise.all(Object.entries(desde).map(async ([indice, inicio]) => {
    mapas[indice] = await variacoes(indice, inicio, dataCalculo).catch(() => null);
  }));

  return parcelas.map((p) => {
    let correcao = null;
    if (INDICES[p.correcao]) {
      const mapa = mapas[p.correcao];
      correcao = {
        nome: INDICES[p.correcao].nome,
        ...fatorDoPeriodo(mapa ?? new Map(), p.vencimento, dataCalculo),
        indisponivel: !mapa,
      };
    }
    const calculo = atualizar({
      saldo: centavos(p.saldo),
      vencimento: p.vencimento,
      dataCalculo,
      multaPct: Number(p.multa_pct),
      jurosMesPct: Number(p.juros_mes_pct),
      carenciaDias: Number(p.carencia_dias),
      correcao,
    });
    return { parcela: p, calculo };
  });
}

/** A memória do cálculo como tabela (6.5). */
export function memoria(calculo) {
  return html`
    <table class="memoria">
      <tbody>
        ${calculo.passos.map((passo) => html`
          <tr class="${passo.total ? 'total' : ''}">
            <td>${passo.rotulo}${passo.detalhe ? html`<span class="sub">${passo.detalhe}</span>` : ''}</td>
            <td>${moeda(passo.valor)}</td>
          </tr>`)}
      </tbody>
    </table>`;
}

/** A memória gravada num recebimento, em reais. */
export function memoriaGravada(m) {
  if (!m?.passos) return html`<p class="sub">Recebimento lançado sem memória de cálculo.</p>`;
  return html`
    <table class="memoria">
      <tbody>
        ${m.passos.map((passo, i) => html`
          <tr class="${i === m.passos.length - 1 ? 'total' : ''}">
            <td>${passo.rotulo}${passo.detalhe ? html`<span class="sub">${passo.detalhe}</span>` : ''}</td>
            <td>${moeda(centavos(passo.valor))}</td>
          </tr>`)}
      </tbody>
    </table>
    <p class="memoria__criterio">Calculado para ${data(m.calculado_em)}, com vencimento em ${data(m.vencimento)}.</p>`;
}

// ---------------------------------------------------------------------------
// Receber (6.4 B) — dois cliques no caso comum
// ---------------------------------------------------------------------------

/** Diálogo de recebimento de uma linha de v_parcelas. Devolve true se gravou. */
export async function receberParcela(p) {
  const [{ formas }, [{ calculo: inicial }]] = await Promise.all([apoio(), atualizarParcelas([p])]);
  let calculo = inicial;
  let recalculo = Promise.resolve();
  let valorDigitado = false;
  const dia = hoje();

  return abrirDialogo({
    titulo: `Receber — ${p.cliente_nome}`,
    rotuloOk: 'Registrar recebimento',
    corpo: html`
      <p class="dialogo__texto">${p.contrato_descricao} · ${rotuloParcela(p)} · vence ${data(p.vencimento)}</p>
      <div class="campos">
        <label class="campo campo--4">
          <span>Data do pagamento</span>
          <input type="date" name="data" value="${dia}" max="${dia}" required>
        </label>
        <label class="campo campo--4">
          <span>Valor recebido</span>
          <input name="valor" class="num" inputmode="decimal" value="${decimal(calculo.total)}" required autofocus>
        </label>
        <label class="campo campo--4">
          <span>Forma</span>
          <select name="forma_id">${opcoes(formas.filter((f) => f.ativo).map((f) => [f.id, f.nome]), '', { vazio: 'Não informada' })}</select>
        </label>
        <label class="campo">
          <span>Observação</span>
          <input name="observacao" maxlength="500">
        </label>
      </div>
      <div class="secao" data-papel="memoria"></div>
      <p class="nota nota--info" data-papel="efeito"></p>`,

    aoAbrir: (dialogo, form) => {
      const efeito = () => {
        const caixa = $('[data-papel="efeito"]', dialogo);
        const valor = lerMoeda(form.valor.value);
        if (!(valor > 0)) {
          caixa.textContent = 'Informe o valor recebido.';
          return;
        }
        const principal = Math.min(valor, calculo.saldo);
        const encargos = valor - principal;
        if (valor < calculo.saldo) {
          caixa.textContent = `Pagamento parcial: abate ${moeda(principal)} e ficam ${moeda(calculo.saldo - principal)} em aberto na parcela.`;
        } else if (encargos > 0) {
          caixa.textContent = `Quita a parcela: ${moeda(principal)} de saldo e ${moeda(encargos)} de multa, juros e correção.`;
        } else {
          caixa.textContent = 'Quita a parcela, sem encargos.';
        }
      };
      const redesenhar = () => {
        desenhar($('[data-papel="memoria"]', dialogo), memoria(calculo));
        efeito();
      };

      form.data.addEventListener('change', () => {
        if (!form.data.value) return;
        recalculo = atualizarParcelas([p], form.data.value).then(([r]) => {
          calculo = r.calculo;
          if (!valorDigitado) form.valor.value = decimal(calculo.total);
          redesenhar();
        });
      });
      form.valor.addEventListener('input', () => {
        valorDigitado = true;
        efeito();
      });
      redesenhar();
    },

    aoEnviar: async (dados) => {
      await recalculo;
      const valor = lerMoeda(dados.valor);
      if (!(valor > 0)) throw new Error('Informe o valor recebido.');
      if (dados.data > hoje()) throw new Error('A data do pagamento não pode estar no futuro.');

      const principal = Math.min(valor, calculo.saldo);
      await db.inserir('recebimentos', {
        parcela_id: p.id,
        data: dados.data,
        valor: paraReais(valor),
        valor_principal: paraReais(principal),
        valor_encargos: paraReais(valor - principal),
        forma_id: dados.forma_id || null,
        observacao: dados.observacao || null,
        memoria_calculo: memoriaParaGravar(calculo),
      }, 'id');
      avisar(valor < calculo.saldo ? 'Pagamento parcial registrado.' : 'Recebimento registrado.');
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Cobrar (6.4 C) — avisa, não envia
// ---------------------------------------------------------------------------

/** grupo: { cliente_id, cliente_nome, cliente_telefone, itens: [{ parcela, calculo }] } */
export async function prepararCobranca(grupo) {
  const { config } = await apoio();
  const total = grupo.itens.reduce((s, i) => s + i.calculo.total, 0);
  const texto = mensagemDeCobranca({
    modelo: config.mensagem_cobranca,
    cliente: grupo.cliente_nome,
    remetente: estado.membro.nome_curto,
    parcelas: grupo.itens.map(({ parcela, calculo }) => ({ numero: parcela.numero, vencimento: parcela.vencimento, total: calculo.total })),
    total,
    pix: { chave: config.pix_chave, titular: config.pix_titular },
  });

  return abrirDialogo({
    titulo: `Cobrança — ${grupo.cliente_nome}`,
    largo: true,
    rotuloOk: 'Registrar cobrança',
    corpo: html`
      <p class="dialogo__texto">
        O texto já traz o valor atualizado até hoje (${moeda(total)}). Revise, copie ou abra no
        WhatsApp — nada é enviado sozinho. Depois, registre a cobrança: é a prova de que o
        escritório cobrou.
      </p>
      ${config.pix_chave ? '' : html`<p class="nota">A chave Pix do escritório ainda não foi cadastrada em Financeiro › Configurações.</p>`}
      <label class="campo">
        <span>Mensagem</span>
        <textarea name="texto" rows="10">${texto}</textarea>
      </label>
      <p class="grupo-botoes secao">
        <button type="button" class="botao" data-papel="copiar">Copiar texto</button>
        ${grupo.cliente_telefone
          ? html`<a class="botao" data-papel="whatsapp" target="_blank" rel="noopener" href="${linkWhatsApp(grupo.cliente_telefone, texto)}">Abrir no WhatsApp</a>`
          : html`<span class="sub">Cliente sem telefone cadastrado.</span>`}
      </p>
      <fieldset class="fieldset campos secao">
        <legend>Registrar que cobrou</legend>
        <label class="campo campo--4">
          <span>Canal</span>
          <select name="canal">${opcoes(Object.entries(CANAIS), 'whatsapp')}</select>
        </label>
        <label class="campo campo--8">
          <span>Observação</span>
          <input name="observacao" maxlength="500" placeholder="Ex.: prometeu pagar na sexta">
        </label>
      </fieldset>`,

    aoAbrir: (dialogo, form) => {
      const whatsapp = $('[data-papel="whatsapp"]', dialogo);
      form.texto.addEventListener('input', () => {
        if (whatsapp) whatsapp.href = linkWhatsApp(grupo.cliente_telefone, form.texto.value);
      });
      $('[data-papel="copiar"]', dialogo).addEventListener('click', async (e) => {
        try {
          await navigator.clipboard.writeText(form.texto.value);
          e.target.textContent = 'Copiado';
        } catch {
          form.texto.select();
          e.target.textContent = 'Use Ctrl+C';
        }
      });
    },

    aoEnviar: async (dados) => {
      await db.inserir('cobrancas', {
        cliente_id: grupo.cliente_id,
        parcelas: grupo.itens.map((i) => i.parcela.id),
        canal: dados.canal,
        texto: dados.texto,
        total_na_data: paraReais(total),
        observacao: dados.observacao || null,
      }, 'id');
      avisar('Cobrança registrada.');
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Renegociar (6.4 C) — as antigas ficam, como "renegociadas"
// ---------------------------------------------------------------------------

export async function renegociarContrato(contratoId) {
  const abertas = await db.listar('v_parcelas', {
    select: '*',
    filtros: [['contrato_id', 'eq', contratoId], ['situacao', 'in', ['a_vencer', 'vencida']]],
    ordem: 'numero.asc',
  });
  if (!abertas.length) {
    avisar('Este contrato não tem parcelas em aberto para renegociar.', 'erro');
    return null;
  }

  const itens = await atualizarParcelas(abertas);
  const dia = hoje();

  return abrirDialogo({
    titulo: `Renegociar — ${abertas[0].cliente_nome}`,
    largo: true,
    rotuloOk: 'Renegociar',
    corpo: html`
      <p class="dialogo__texto">
        As parcelas marcadas saem do saldo como "renegociadas" — continuam no contrato e no
        histórico — e as novas entram no lugar.
      </p>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th><span class="sr-only">Incluir</span></th><th>Parcela</th><th>Vencimento</th><th class="num">Saldo</th><th class="num">Atualizado hoje</th></tr></thead>
          <tbody>
            ${itens.map(({ parcela: p, calculo: c }) => html`
              <tr>
                <td><input type="checkbox" name="p_${p.id}" checked aria-label="Incluir ${rotuloParcela(p)}"></td>
                <td>${rotuloParcela(p)}</td>
                <td class="num">${data(p.vencimento)}</td>
                <td class="num">${moeda(c.saldo)}</td>
                <td class="num">${moeda(c.total)}</td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      <div class="campos secao">
        <fieldset class="fieldset">
          <legend>Valor renegociado</legend>
          <label class="opcao"><input type="radio" name="base" value="atualizado" checked> Saldo atualizado, com encargos — <strong data-papel="atualizado"></strong></label>
          <label class="opcao"><input type="radio" name="base" value="saldo"> Só o saldo, sem encargos — <strong data-papel="saldo"></strong></label>
          <label class="opcao"><input type="radio" name="base" value="livre"> Outro valor <input name="valor_livre" class="entrada-texto num" inputmode="decimal" aria-label="Outro valor"></label>
        </fieldset>
        <label class="campo campo--4">
          <span>Número de parcelas</span>
          <input type="number" name="quantidade" min="1" max="120" value="1" required>
        </label>
        <label class="campo campo--4">
          <span>Primeiro vencimento</span>
          <input type="date" name="primeiro" value="${somarMeses(dia, 1)}" min="${dia}" required>
        </label>
        <label class="campo">
          <span>Motivo</span>
          <textarea name="motivo" rows="2" required placeholder="Ex.: cliente pediu para dividir o atraso em 3 vezes"></textarea>
        </label>
      </div>
      <p class="nota nota--info" data-papel="previa"></p>`,

    aoAbrir: (dialogo, form) => {
      const atualizarPrevia = () => {
        const r = montar(form);
        $('[data-papel="atualizado"]', dialogo).textContent = moeda(r.atualizado);
        $('[data-papel="saldo"]', dialogo).textContent = moeda(r.saldo);
        const caixa = $('[data-papel="previa"]', dialogo);
        if (r.erro) {
          caixa.textContent = r.erro;
          return;
        }
        const valores = [...new Set(r.novas.map((n) => moeda(n.valor)))].join(' ou ');
        caixa.textContent = `${r.novas.length} × ${valores}, a partir de ${data(r.novas[0].vencimento)}. Total ${moeda(r.valor)}.`;
      };
      form.addEventListener('input', atualizarPrevia);
      atualizarPrevia();
    },

    aoEnviar: async (_, form) => {
      const r = montar(form);
      if (r.erro) throw new Error(r.erro);
      await db.rpc('renegociar', {
        p: {
          contrato_id: contratoId,
          parcelas: r.escolhidas.map((i) => i.parcela.id),
          motivo: form.motivo.value.trim(),
          novas: r.novas.map((n) => ({ vencimento: n.vencimento, valor: paraReais(n.valor) })),
          memoria: {
            base: form.base.value,
            data: dia,
            saldo: paraReais(r.saldo),
            atualizado: paraReais(r.atualizado),
            parcelas: r.escolhidas.map((i) => memoriaParaGravar(i.calculo)),
          },
        },
      });
      avisar('Renegociação registrada.');
      return true;
    },
  });

  function montar(form) {
    const escolhidas = itens.filter((i) => form[`p_${i.parcela.id}`]?.checked);
    const saldo = escolhidas.reduce((s, i) => s + i.calculo.saldo, 0);
    const atualizado = escolhidas.reduce((s, i) => s + i.calculo.total, 0);
    const base = $$('[name="base"]', form).find((r) => r.checked)?.value;
    const valor = base === 'saldo' ? saldo : base === 'livre' ? lerMoeda(form.valor_livre.value) : atualizado;
    const quantidade = Number(form.quantidade.value);

    if (!escolhidas.length) return { saldo, atualizado, erro: 'Marque pelo menos uma parcela.' };
    if (!(valor > 0)) return { saldo, atualizado, erro: 'Informe o valor renegociado.' };
    try {
      const novas = gerarParcelas({ total: valor, quantidade, primeiroVencimento: form.primeiro.value });
      return { escolhidas, saldo, atualizado, valor: somaDasParcelas(novas), novas };
    } catch (erro) {
      return { saldo, atualizado, erro: erro.message };
    }
  }
}
