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

import { ErroCampo, limparErrosFormulario, mostrarErroFormulario } from '../../nucleo/formularios.js';
import { gerarParcelas, gerarParcelasPorValor, nomeDaParcela, somaDasParcelas } from '../../dominio/parcelas.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { avisar } from '../../nucleo/avisos.js';
import { estado, membrosAtivos } from '../../nucleo/estado.js';
import { data, decimal, entre, hoje, lerMoeda, lerNumero, moeda, paraReais, somarMeses } from '../../nucleo/formato.js';
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
    ${cabecalho('Novo contrato', 'Contrato financeiro de honorários')}

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

        <fieldset class="fieldset campos">
          <legend>Honorários</legend>
          <label class="opcao campo--6"><input type="radio" name="tipo" value="fixo" checked> Valor fixo, à vista ou parcelado</label>
          <label class="opcao campo--6"><input type="radio" name="tipo" value="exito"> Êxito — percentual do que o cliente receber</label>

          <div class="campos" data-tipo="fixo">
            <label class="campo campo--4">
              <span>Valor total</span>
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
                  <thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th></tr></thead>
                  <tbody data-papel="parcelas"></tbody>
                  <tfoot><tr><td colspan="2">Soma</td><td class="num" data-papel="soma">—</td></tr></tfoot>
                </table>
              </div>
              <span class="campo__ajuda">Mudar total, entrada, quantidade ou vencimento gera as parcelas de novo. A diferença de centavos fica na última.</span>
            </div>
          </div>

          <div class="campos" data-tipo="exito" hidden>
            <label class="campo campo--4">
              <span>Percentual de êxito</span>
              <input name="exito_pct" class="num" inputmode="decimal" placeholder="30">
            </label>
            <p class="campo campo--8 campo__ajuda">
              O contrato fica "a apurar", sem parcelas. Quando o resultado sair, use
              "Apurar êxito" no contrato para gerar o que o cliente vai pagar.
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
  let parcelas = [];

  ligarCampoCliente(form, clientes);

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

    const quantas = parcelas.filter((p) => p.numero > 0).length;
    desenhar(corpoParcelas, parcelas.length
      ? parcelas.map((p, i) => html`
          <tr>
            <td>${p.numero === 0 ? nomeDaParcela(0) : `${p.numero}/${quantas}`}</td>
            <td><input type="date" data-i="${i}" data-campo="vencimento" value="${p.vencimento}" aria-label="Vencimento"></td>
            <td><input class="num" inputmode="decimal" data-i="${i}" data-campo="valor" value="${decimal(p.valor)}" aria-label="Valor"></td>
          </tr>`)
      : html`<tr><td colspan="3" class="sub">Preencha o valor total para ver as parcelas.</td></tr>`);
    atualizarSoma(aviso);
  };

  corpoParcelas.addEventListener('input', (e) => {
    const parcela = parcelas[Number(e.target.dataset.i)];
    if (!parcela) return;
    if (e.target.dataset.campo === 'vencimento') parcela.vencimento = e.target.value;
    else parcela.valor = lerMoeda(e.target.value) || 0;
    atualizarSoma();
  });

  form.addEventListener('input', (e) => {
    if (['total', 'entrada', 'data_entrada', 'quantidade', 'primeiro', 'valor_parcela', 'frequencia', 'modo'].includes(e.target.name)) gerar();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo') {
      for (const bloco of $$('[data-tipo]', form)) bloco.hidden = bloco.dataset.tipo !== form.tipo.value;
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
    };

    if (d.criterio === 'proprio') Object.assign(contrato, lerCriterio(d));

    if (d.tipo === 'exito') {
      const percentual = lerNumero(d.exito_pct);
      if (!entre(percentual, 0.01, 100)) throw new Error('Informe o percentual de êxito, entre 0 e 100.');
      return { ...contrato, exito_pct: percentual, parcelas: [] };
    }

    const total = lerMoeda(d.total);
    if (!(total > 0)) throw new Error('Informe o valor total.');
    if (!parcelas.length) throw new ErroCampo('quantidade', 'Confira entrada, número de parcelas e vencimento.');
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

    return {
      ...contrato,
      valor_total: paraReais(total),
      parcelas: parcelas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: paraReais(p.valor) })),
      entrada_recebida: d.entrada_recebida
        ? { data: entrada.vencimento, forma_id: d.forma_prevista_id || null, conta_financeira_id: d.conta_entrada || null }
        : null,
    };
  }
}
