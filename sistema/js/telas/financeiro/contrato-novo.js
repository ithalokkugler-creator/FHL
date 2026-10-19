// Novo contrato financeiro (preparação 6.4 A) — em menos de um minuto.
// ====================================================================
//
// As parcelas aparecem antes de salvar, e dá para ajustar data e valor de
// cada uma. O banco confere a soma de novo (criar_contrato): a tela ajuda,
// quem garante é ele. O código (C001/2026) é dado pelo banco ao salvar.
//
// DOCX §6: data de formalização; parcelas pela quantidade OU pelo valor de
// cada uma (o resto na última); mensal ou quinzenal; vencimento antes da
// formalização só confirmado, com motivo — e o banco confere de novo.
//
// Out/2026 (pedidos do Vinícius):
//   · Fixo + êxito: o valor fixo gera as parcelas agora; o percentual fica
//     para "Apurar êxito", no fim do processo.
//   · Acordo com repasse: valor bruto que a parte contrária paga ao
//     escritório, com a cota do escritório — o resto é do cliente.
//   · Contrato encadeado: se o cliente já tem contrato em andamento, um
//     atalho põe a 1ª parcela um mês depois do fim dele e registra o vínculo.

import { ErroCampo, limparErrosFormulario, mostrarErroFormulario } from '../../nucleo/formularios.js';
import {
  divisaoDoRepasse, gerarParcelas, gerarParcelasPorValor, inicioDepoisDe, nomeDaParcela, somaDasParcelas,
} from '../../dominio/parcelas.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { avisar } from '../../nucleo/avisos.js';
import { estado, membrosAtivos } from '../../nucleo/estado.js';
import {
  ateDuasCasas, data, decimal, entre, hoje, lerMoeda, lerNumero, moeda, paraReais, percentual, somarMeses,
} from '../../nucleo/formato.js';
import { $, $$, desenhar, html, lerFormulario } from '../../nucleo/html.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { campoCliente, carregarClientes, ligarCampoCliente } from '../clientes.js';
import { cabecalho } from '../comum.js';
import { apoio, camposCriterio, criterioEmTexto, lerCriterio, opcoes, opcoesContasFinanceiras } from './base.js';

export default async function telaNovoContrato(ctx) {
  const [clientes, { config, formas, contasFinanceiras }, centros] = await Promise.all([
    carregarClientes(), apoio(),
    db.listar('centros_custo', { select: 'id,nome,ativo', filtros: [['ativo', 'is', true]], ordem: 'nome.asc' }),
  ]);
  if (!ctx.ativa()) return;

  const dia = hoje();
  const advogados = membrosAtivos().filter((m) => m.papel !== 'secretaria');
  const eu = advogados.some((m) => m.id === estado.membro.id) ? estado.membro.id : '';

  desenhar(ctx.raiz, html`
    <a class="pagina__voltar" href="#/financeiro/contratos">← Contratos</a>
    ${cabecalho('Novo contrato', 'Contrato financeiro de honorários, ou acordo com repasse ao cliente')}

    <form class="painel" novalidate>
      <div class="painel__corpo campos">
        ${campoCliente(clientes, { classe: 'campo--8', atual: ctx.consulta.cliente })}
        <label class="campo campo--4">
          <span>Nº do processo</span>
          <input name="processo" maxlength="40" placeholder="Opcional">
        </label>
        <label class="campo campo--8">
          <span>Descrição</span>
          <input name="descricao" required maxlength="200" placeholder="Ex.: Honorários — ação trabalhista">
        </label>
        <label class="campo campo--4">
          <span>Data do contrato</span>
          <input type="date" name="data_contrato" value="${dia}" max="${dia}" required>
          <span class="campo__ajuda">Quando foi formalizado (não a data de hoje, se for antigo).</span>
        </label>

        <div class="nota nota--info campo" data-papel="encadeado" hidden></div>
        <input type="hidden" name="inicia_apos_contrato_id" value="">

        <fieldset class="fieldset campos">
          <legend>Honorários</legend>
          <label class="opcao campo--4"><input type="radio" name="tipo" value="fixo" checked> Valor fixo, à vista ou parcelado</label>
          <label class="opcao campo--4"><input type="radio" name="tipo" value="exito"> Êxito — percentual do que o cliente receber</label>
          <label class="opcao campo--4"><input type="radio" name="tipo" value="misto"> Valor fixo + êxito no fim do processo</label>

          <div class="campos" data-tipo="fixo misto">
            <label class="opcao campo" data-tipo="fixo"><input type="checkbox" name="acordo">
              Acordo ou valor recebido em nome do cliente: parte dele é do cliente e é repassada</label>
            <div class="campos campo" data-papel="acordo" hidden>
              <label class="campo campo--4">
                <span>Cota do escritório (%)</span>
                <input name="cota" class="num" inputmode="decimal" placeholder="30" autocomplete="off">
                <span class="campo__ajuda">O resto de cada parcela recebida é do cliente.</span>
              </label>
              <p class="campo campo--8 campo__ajuda" data-papel="resumo-acordo">Informe o valor bruto e a cota.</p>
            </div>
            <label class="campo campo--4">
              <span data-papel="rotulo-total">Valor total</span>
              <input name="total" class="num" inputmode="decimal" placeholder="0,00" autocomplete="off">
            </label>
            <label class="campo campo--4">
              <span>Entrada</span>
              <input name="entrada" class="num" inputmode="decimal" placeholder="0,00" autocomplete="off">
            </label>
            <label class="campo campo--4">
              <span>Data da entrada</span>
              <input type="date" name="data_entrada" value="${dia}">
            </label>
            <fieldset class="fieldset campos campo">
              <legend>Parcelas depois da entrada</legend>
              <label class="opcao campo--6"><input type="radio" name="modo" value="quantidade" checked> Pelo número de parcelas</label>
              <label class="opcao campo--6"><input type="radio" name="modo" value="valor"> Pelo valor de cada parcela</label>
              <label class="campo campo--4" data-modo="quantidade">
                <span>Número de parcelas</span>
                <input type="number" name="quantidade" min="0" max="120" value="1">
              </label>
              <label class="campo campo--4" data-modo="valor" hidden>
                <span>Valor de cada parcela</span>
                <input name="valor_parcela" class="num" inputmode="decimal" placeholder="0,00" autocomplete="off">
                <span class="campo__ajuda">O que sobrar fica na última.</span>
              </label>
              <label class="campo campo--4">
                <span>Vencimento da 1ª parcela</span>
                <input type="date" name="primeiro" value="${somarMeses(dia, 1)}">
              </label>
              <label class="campo campo--4">
                <span>Frequência</span>
                <select name="frequencia">${opcoes([['mensal', 'Mensal'], ['quinzenal', 'Quinzenal (a cada 15 dias)']], 'mensal')}</select>
              </label>
            </fieldset>
            <label class="opcao campo--4"><input type="checkbox" name="entrada_recebida"> A entrada já foi paga</label>
            <label class="campo campo--8" data-papel="conta-entrada" hidden>
              <span>A entrada entrou na conta</span>
              <select name="conta_entrada">${opcoesContasFinanceiras(contasFinanceiras)}</select>
            </label>

            <div class="campo">
              <span>Parcelas — confira antes de salvar</span>
              <div class="tabela-rolagem">
                <table class="tabela parcelas-editor">
                  <thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th class="num" data-papel="col-escritorio" hidden>Escritório</th></tr></thead>
                  <tbody data-papel="parcelas"></tbody>
                  <tfoot><tr><td colspan="2">Soma</td><td class="num" data-papel="soma">—</td><td class="num" data-papel="soma-escritorio" hidden></td></tr></tfoot>
                </table>
              </div>
              <span class="campo__ajuda">Mudar total, entrada, quantidade ou vencimento gera as parcelas de novo. A diferença de centavos fica na última.</span>
            </div>
          </div>

          <div class="campos" data-tipo="exito misto" hidden>
            <label class="campo campo--4">
              <span>Percentual de êxito</span>
              <input name="exito_pct" class="num" inputmode="decimal" placeholder="30">
            </label>
            <p class="campo campo--8 campo__ajuda" data-tipo="exito">
              O contrato fica "a apurar", sem parcelas. Quando o resultado sair, use
              "Apurar êxito" no contrato para gerar o que o cliente vai pagar.
            </p>
            <p class="campo campo--8 campo__ajuda" data-tipo="misto" hidden>
              A parte fixa gera as parcelas agora. O êxito fica "a apurar": quando o
              resultado sair, use "Apurar êxito" no contrato.
            </p>
          </div>
        </fieldset>

        <label class="campo campo--6">
          <span>Forma de pagamento prevista</span>
          <select name="forma_prevista_id">${opcoes(formas.filter((f) => f.ativo).map((f) => [f.id, f.nome]), '', { vazio: 'Não definida' })}</select>
        </label>
        <label class="campo campo--6">
          <span>Sócio responsável</span>
          <select name="responsavel_id">${opcoes(advogados.map((m) => [m.id, m.nome_curto]), eu, { vazio: 'Não definido' })}</select>
        </label>
        <label class="campo campo--6">
          <span>Vigência até (opcional)</span>
          <input type="date" name="data_fim">
          <span class="campo__ajuda">Fim do contrato jurídico, se houver. Avisa quando estiver perto.</span>
        </label>
        <label class="campo campo--6">
          <span>Centro de custo (opcional)</span>
          <select name="centro_custo_id">${opcoes(centros.map((c) => [c.id, c.nome]), '', { vazio: 'Não informado' })}</select>
        </label>

        <fieldset class="fieldset campos">
          <legend>Atraso</legend>
          <label class="opcao"><input type="radio" name="criterio" value="padrao" checked> Critério do escritório: ${criterioEmTexto(config)}</label>
          <label class="opcao"><input type="radio" name="criterio" value="proprio"> Critério próprio deste contrato</label>
          <div class="campos" data-papel="criterio" hidden>${camposCriterio(config)}</div>
        </fieldset>

        <label class="campo">
          <span>Observações</span>
          <textarea name="observacoes" rows="2"></textarea>
        </label>
      </div>

      <p class="erro-formulario" role="alert" hidden></p>
      <footer class="painel__rodape grupo-botoes">
        <button class="botao botao--primario" type="submit">Salvar contrato</button>
        <a class="botao" href="#/financeiro/contratos">Cancelar</a>
      </footer>
    </form>`);

  const form = $('form', ctx.raiz);
  const corpoParcelas = $('[data-papel="parcelas"]', form);
  const celulaSoma = $('[data-papel="soma"]', form);
  const caixaEncadeado = $('[data-papel="encadeado"]', form);
  let parcelas = [];
  let anteriores = [];
  let encadeamento = null; // { antes, definidas }: as datas antes e depois do encadear
  let avisoParcelas = ''; // por que as parcelas não puderam ser geradas

  /** Cota do escritório em vigor: só no fixo marcado como acordo. */
  const cotaAtual = () => {
    if (form.tipo.value !== 'fixo' || !form.acordo.checked) return null;
    const cota = lerNumero(form.cota.value);
    return entre(cota, 0.01, 99.99) && ateDuasCasas(cota) ? cota : null;
  };

  ligarCampoCliente(form, clientes, { aoMudar: (cliente) => mostrarAnteriores(cliente) });
  // Veio da ficha do cliente (?cliente=): os contratos dele já aparecem.
  if (form.cliente_id.value) mostrarAnteriores(clientes.find((c) => c.id === form.cliente_id.value) ?? null);

  const mostrarErro = (falha) => {
    if (falha) mostrarErroFormulario(form, falha);
    else limparErrosFormulario(form);
  };

  const atualizarSoma = (aviso = '') => {
    const total = lerMoeda(form.total.value) ?? 0;
    const soma = somaDasParcelas(parcelas);
    celulaSoma.classList.toggle('perigo', Boolean(aviso) || (parcelas.length > 0 && soma !== total));
    if (aviso) celulaSoma.textContent = aviso;
    else if (!parcelas.length) celulaSoma.textContent = '—';
    else celulaSoma.textContent = soma === total ? moeda(soma) : `${moeda(soma)} — diferença de ${moeda(total - soma)}`;
    atualizarAcordo();
  };

  /** Coluna "Escritório" e o resumo bruto · escritório · cliente. */
  const atualizarAcordo = () => {
    const cota = cotaAtual();
    const ligado = form.tipo.value === 'fixo' && form.acordo.checked;
    $('[data-papel="acordo"]', form).hidden = !ligado;
    $('[data-papel="rotulo-total"]', form).textContent = ligado ? 'Valor bruto do acordo' : 'Valor total';
    for (const el of $$('[data-papel="col-escritorio"], [data-papel="soma-escritorio"], [data-papel="escritorio"]', form)) el.hidden = cota == null;
    if (!ligado) return;
    const resumo = $('[data-papel="resumo-acordo"]', form);
    const total = lerMoeda(form.total.value);
    if (cota == null || !(total > 0)) {
      resumo.textContent = 'Informe o valor bruto e a cota do escritório (de 0,01% a 99,99%, até duas casas decimais).';
      return;
    }
    const escritorio = parcelas.reduce((s, p) => s + divisaoDoRepasse(p.valor, cota).escritorio, 0);
    resumo.textContent = `Valor bruto ${moeda(total)} · escritório (${percentual(cota)}) ${moeda(escritorio)} · `
      + `repasse ao cliente ${moeda(total - escritorio)}.`;
    $('[data-papel="soma-escritorio"]', form).textContent = moeda(escritorio);
    for (const celula of $$('[data-papel="escritorio"]', form)) {
      const p = parcelas[Number(celula.dataset.i)];
      celula.textContent = p ? moeda(divisaoDoRepasse(p.valor, cota).escritorio) : '—';
    }
  };

  const gerar = () => {
    const total = lerMoeda(form.total.value);
    let aviso = '';
    try {
      const comum = {
        total,
        entrada: lerMoeda(form.entrada.value) ?? 0,
        dataEntrada: form.data_entrada.value,
        primeiroVencimento: form.primeiro.value,
        frequencia: form.frequencia.value,
      };
      parcelas = !(total > 0) ? []
        : form.modo.value === 'valor'
          ? gerarParcelasPorValor({ ...comum, valorParcela: lerMoeda(form.valor_parcela.value) })
          : gerarParcelas({ ...comum, quantidade: Number(form.quantidade.value || 0) });
    } catch (falha) {
      parcelas = [];
      aviso = falha.message;
    }
    avisoParcelas = aviso;

    const quantas = parcelas.filter((p) => p.numero > 0).length;
    desenhar(corpoParcelas, parcelas.length
      ? parcelas.map((p, i) => html`
          <tr>
            <td>${p.numero === 0 ? nomeDaParcela(0) : `${p.numero}/${quantas}`}</td>
            <td><input type="date" data-i="${i}" data-campo="vencimento" value="${p.vencimento}" aria-label="Vencimento"></td>
            <td><input class="num" inputmode="decimal" data-i="${i}" data-campo="valor" value="${decimal(p.valor)}" aria-label="Valor"></td>
            <td class="num" data-papel="escritorio" data-i="${i}" hidden></td>
          </tr>`)
      : html`<tr><td colspan="3" class="sub">${aviso || 'Preencha o valor total para ver as parcelas.'}</td></tr>`);
    atualizarSoma(aviso);
  };

  // ---------------------------------------------------------------------------
  // Contrato encadeado
  // ---------------------------------------------------------------------------

  // As datas de antes do "Começar depois dele": desfeito o vínculo (ou trocado
  // o cliente), voltam — senão o contrato saía sem vínculo e com a 1ª parcela
  // na data do contrato anterior do outro cliente.
  function desfazerEncadeamento() {
    if (encadeamento) {
      for (const campo of ['primeiro', 'data_entrada']) {
        if (form[campo].value === encadeamento.definidas[campo]) form[campo].value = encadeamento.antes[campo];
      }
      encadeamento = null;
      gerar();
    }
    form.inicia_apos_contrato_id.value = '';
  }

  /** Os contratos em andamento do cliente escolhido, com o atalho. */
  async function mostrarAnteriores(cliente) {
    desfazerEncadeamento();
    anteriores = [];
    caixaEncadeado.hidden = true;
    if (!cliente) return;
    const lista = await db.listar('v_contratos', {
      select: 'id,codigo,descricao,ultimo_vencimento,data_fim,situacao',
      filtros: [['cliente_id', 'eq', cliente.id], ['ciclo', 'eq', 'ativo']],
    }).catch(() => []);
    if (!ctx.ativa() || form.cliente_id.value !== cliente.id) return;
    // Em andamento: ainda tem parcela ou vigência daqui para a frente. O que
    // termina por último primeiro.
    const fim = (c) => [c.ultimo_vencimento, c.data_fim].filter(Boolean).sort().at(-1) ?? '';
    anteriores = lista.filter((c) => fim(c) >= dia).sort((a, b) => fim(b).localeCompare(fim(a)));
    if (!anteriores.length) return;
    desenhar(caixaEncadeado, html`
      <p>${anteriores.length === 1 ? 'Este cliente tem um contrato em andamento' : `Este cliente tem ${anteriores.length} contratos em andamento`}.
        O novo pode começar quando ele terminar:</p>
      <div class="grupo-botoes">
        <select name="anterior" aria-label="Contrato anterior">${opcoes(anteriores.map((c) => [c.id, rotuloAnterior(c)]), anteriores[0].id)}</select>
        <button type="button" class="botao botao--pequeno" data-papel="encadear">Começar depois dele</button>
      </div>
      <p class="sub" data-papel="encadeado-feito" hidden></p>`);
    caixaEncadeado.hidden = false;
  }

  const rotuloAnterior = (c) => {
    const fim = [c.ultimo_vencimento && `última parcela em ${data(c.ultimo_vencimento)}`, c.data_fim && `vigência até ${data(c.data_fim)}`]
      .filter(Boolean).join(', ');
    return `${c.codigo ? `${c.codigo} — ` : ''}${c.descricao}${fim ? ` (${fim})` : ''}`;
  };

  caixaEncadeado.addEventListener('click', (e) => {
    if (e.target.closest('[data-papel="encadear"]')) {
      const anterior = anteriores.find((c) => c.id === caixaEncadeado.querySelector('[name="anterior"]').value);
      const inicio = anterior && inicioDepoisDe(anterior);
      if (!inicio) return;
      const antes = encadeamento?.antes ?? { primeiro: form.primeiro.value, data_entrada: form.data_entrada.value };
      form.inicia_apos_contrato_id.value = anterior.id;
      // Com entrada, ela vai para o início; as parcelas, um mês depois.
      const comEntrada = (lerMoeda(form.entrada.value) ?? 0) > 0;
      if (comEntrada) {
        form.data_entrada.value = inicio;
        form.primeiro.value = somarMeses(inicio, 1);
      } else {
        form.primeiro.value = inicio;
      }
      encadeamento = { antes, definidas: { primeiro: form.primeiro.value, data_entrada: form.data_entrada.value } };
      gerar();
      const feito = $('[data-papel="encadeado-feito"]', caixaEncadeado);
      desenhar(feito, html`Começa depois de <strong>${anterior.codigo ?? anterior.descricao}</strong>${form.tipo.value === 'exito'
        ? ': o vínculo fica registrado, e as parcelas do êxito vêm na apuração.'
        : html`: ${comEntrada ? 'entrada' : '1ª parcela'} em ${data(inicio)}. Confira as parcelas abaixo.`}
        <button type="button" class="botao-link" data-papel="desfazer-encadeado">desfazer o vínculo</button>`);
      feito.hidden = false;
    }
    if (e.target.closest('[data-papel="desfazer-encadeado"]')) {
      desfazerEncadeamento();
      $('[data-papel="encadeado-feito"]', caixaEncadeado).hidden = true;
    }
  });

  // ---------------------------------------------------------------------------

  corpoParcelas.addEventListener('input', (e) => {
    const parcela = parcelas[Number(e.target.dataset.i)];
    if (!parcela) return;
    if (e.target.dataset.campo === 'vencimento') parcela.vencimento = e.target.value;
    else parcela.valor = lerMoeda(e.target.value) || 0;
    atualizarSoma();
  });

  form.addEventListener('input', (e) => {
    if (['total', 'entrada', 'data_entrada', 'quantidade', 'primeiro', 'valor_parcela', 'frequencia', 'modo'].includes(e.target.name)) gerar();
    if (e.target.name === 'cota') atualizarAcordo();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo' || e.target.name === 'acordo') {
      for (const bloco of $$('[data-tipo]', form)) bloco.hidden = !bloco.dataset.tipo.split(' ').includes(form.tipo.value);
      atualizarAcordo();
    }
    if (e.target.name === 'modo') {
      for (const bloco of $$('[data-modo]', form)) bloco.hidden = bloco.dataset.modo !== form.modo.value;
      gerar();
    }
    if (e.target.name === 'entrada_recebida') $('[data-papel="conta-entrada"]', form).hidden = !form.entrada_recebida.checked;
    if (e.target.name === 'criterio') $('[data-papel="criterio"]', form).hidden = form.criterio.value !== 'proprio';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarErro('');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const botao = $('[type="submit"]', form);
    try {
      const contrato = montar(lerFormulario(form));
      // Vencimento antes da formalização: a pessoa confirma e diz por quê.
      const antes = (contrato.parcelas ?? []).filter((x) => x.vencimento < contrato.data_contrato);
      if (antes.length) {
        const motivo = await abrirDialogo({
          titulo: 'Vencimento antes da data do contrato',
          rotuloOk: 'Confirmar e salvar',
          corpo: html`
            <p class="dialogo__texto">${antes.length === 1 ? 'Uma parcela vence' : `${antes.length} parcelas vencem`} antes de
              ${data(contrato.data_contrato)}, a data do contrato (${antes.map((x) => data(x.vencimento)).join(', ')}).
              Se está certo — por exemplo, um serviço já prestado —, confirme com o motivo.</p>
            <label class="campo"><span>Motivo</span><textarea name="motivo" rows="2" required autofocus></textarea></label>`,
          aoEnviar: async ({ motivo }) => motivo,
        });
        if (!motivo) return;
        Object.assign(contrato, { confirmar_vencimento_anterior: true, motivo_vencimento_anterior: motivo });
      }
      botao.disabled = true;
      const id = await db.rpc('criar_contrato', { p: contrato });
      avisar('Contrato criado.');
      navegar(`/financeiro/contratos/${id}`);
    } catch (falha) {
      mostrarErro(falha);
      botao.disabled = false;
    }
  });

  gerar();

  function montar(d) {
    if (!d.cliente_id) throw new Error('Escolha o cliente, ou cadastre um novo.');

    if (!d.data_contrato) throw new ErroCampo('data_contrato', 'Informe a data do contrato.');
    if (d.data_contrato > hoje()) throw new ErroCampo('data_contrato', 'A data do contrato não pode estar no futuro.');
    if (d.data_fim && d.data_fim < d.data_contrato) throw new ErroCampo('data_fim', 'A vigência termina antes da data do contrato.');
    const contrato = {
      cliente_id: d.cliente_id,
      processo: d.processo || null,
      descricao: d.descricao,
      tipo_honorario: d.tipo,
      forma_prevista_id: d.forma_prevista_id || null,
      responsavel_id: d.responsavel_id || null,
      observacoes: d.observacoes || null,
      data_contrato: d.data_contrato,
      data_fim: d.data_fim || null,
      centro_custo_id: d.centro_custo_id || null,
      inicia_apos_contrato_id: d.inicia_apos_contrato_id || null,
    };

    if (d.criterio === 'proprio') Object.assign(contrato, lerCriterio(d));

    let percentualExito = null;
    if (d.tipo === 'exito' || d.tipo === 'misto') {
      percentualExito = lerNumero(d.exito_pct);
      if (!entre(percentualExito, 0.01, 100)) throw new ErroCampo('exito_pct', 'Informe o percentual de êxito, maior que zero e até 100.');
      if (!ateDuasCasas(percentualExito)) throw new ErroCampo('exito_pct', 'O percentual de êxito aceita até duas casas decimais (ex.: 12,5 ou 33,33).');
    }
    if (d.tipo === 'exito') return { ...contrato, exito_pct: percentualExito, parcelas: [] };

    const total = lerMoeda(d.total);
    if (!(total > 0)) throw new ErroCampo('total', d.tipo === 'fixo' && d.acordo ? 'Informe o valor bruto do acordo.' : 'Informe o valor total.');
    if (!parcelas.length) throw new ErroCampo('quantidade', avisoParcelas || 'Confira entrada, número de parcelas e vencimento.');
    const incorreta = parcelas.findIndex((p) => !p.vencimento || !(p.valor > 0));
    if (incorreta >= 0) {
      const campo = parcelas[incorreta].vencimento ? 'valor' : 'vencimento';
      throw new ErroCampo(corpoParcelas.querySelector(`[data-i="${incorreta}"][data-campo="${campo}"]`), 'Toda parcela precisa de data e de valor maior que zero.');
    }
    const soma = somaDasParcelas(parcelas);
    if (soma !== total) throw new ErroCampo('total', `A soma das parcelas (${moeda(soma)}) não fecha com o valor total (${moeda(total)}).`);

    const entrada = parcelas.find((p) => p.numero === 0);
    if (d.entrada_recebida && !entrada) throw new Error('Marcou "a entrada já foi paga", mas o contrato não tem entrada.');
    if (d.entrada_recebida && entrada.vencimento > hoje()) throw new Error('A entrada paga não pode ter data no futuro.');

    let cota = null;
    if (d.tipo === 'fixo' && d.acordo) {
      cota = lerNumero(d.cota);
      if (!entre(cota, 0.01, 99.99)) throw new ErroCampo('cota', 'Informe a cota do escritório, de 0,01% a 99,99%. Se tudo é do escritório, desmarque o acordo.');
      if (!ateDuasCasas(cota)) throw new ErroCampo('cota', 'A cota do escritório aceita até duas casas decimais (ex.: 30 ou 33,33).');
    }

    return {
      ...contrato,
      valor_total: paraReais(total),
      ...(percentualExito != null ? { exito_pct: percentualExito } : {}),
      ...(cota != null ? { cota_escritorio_pct: cota } : {}),
      parcelas: parcelas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: paraReais(p.valor) })),
      entrada_recebida: d.entrada_recebida
        ? { data: entrada.vencimento, forma_id: d.forma_prevista_id || null, conta_financeira_id: d.conta_entrada || null }
        : null,
    };
  }
}
