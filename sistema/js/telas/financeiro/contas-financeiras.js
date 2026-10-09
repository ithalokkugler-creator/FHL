// Contas financeiras: onde o dinheiro está (DOCX §9, preparação T03).
// ===================================================================
//
// O Caixa, a conta corrente, a conta digital. Cadastro manual — sem
// integração bancária, sem senha de banco. Cada recebimento novo entra numa
// conta; cada pagamento sai de uma (ou do bolso de um sócio, que depois é
// reembolsado de uma conta). Transferência entre contas não é receita nem
// despesa: tira de uma, põe na outra.
//
// O saldo daqui é o que o sistema conhece a partir do saldo inicial
// informado — não é extrato bancário. Recebimentos anteriores a 08/10/2026
// ficam como "origem legada não informada".

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { nomeDe, pode } from '../../nucleo/estado.js';
import { centavos, data, decimal, fimDoMes, hoje, inicioDoMes, lerMoeda, moeda, paraReais } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, indicador, opcoes, paginacao, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { esquecerApoio, opcoesContasFinanceiras } from './base.js';

const TIPOS = { caixa: 'Caixa', corrente: 'Conta corrente', poupanca: 'Poupança', digital: 'Conta digital', aplicacao: 'Aplicação', outra: 'Outra' };
const ORIGENS = { recebimento: 'Recebimento', pagamento: 'Pagamento de despesa', reembolso_socio: 'Reembolso a sócio', transferencia: 'Transferência' };
const POR_PAGINA = 100;

export default async function telaContasFinanceiras(ctx) {
  const filtro = {
    conta: ctx.consulta.conta ?? '',
    de: /^\d{4}-\d{2}-\d{2}$/.test(ctx.consulta.de ?? '') ? ctx.consulta.de : inicioDoMes(hoje()),
    ate: /^\d{4}-\d{2}-\d{2}$/.test(ctx.consulta.ate ?? '') ? ctx.consulta.ate : fimDoMes(hoje()),
    pagina: Number(ctx.consulta.pagina) || 1,
  };
  let saldos = [];
  let contas = [];
  let movimentos = { linhas: [], total: 0 };
  let transferencias = [];

  const carregar = async () => {
    [saldos, contas, transferencias] = await Promise.all([
      db.listar('v_saldos_contas', { select: '*', ordem: 'padrao.desc,nome.asc' }),
      db.listar('contas_financeiras', { select: '*', ordem: 'padrao.desc,nome.asc' }),
      db.listar('transferencias_financeiras', { select: '*', ordem: 'data.desc,criado_em.desc', limite: 30 }),
    ]);
    const filtros = [['data', 'gte', filtro.de], ['data', 'lte', filtro.ate]];
    if (filtro.conta === 'legado') filtros.push(['conta_financeira_id', 'is', null]);
    else if (filtro.conta) filtros.push(['conta_financeira_id', 'eq', filtro.conta]);
    movimentos = await db.pagina('v_movimentacoes_financeiras', {
      select: '*', filtros, ordem: 'data.desc,origem_id.asc,direcao.asc', pagina: filtro.pagina, porPagina: POR_PAGINA,
    });
    if (!ctx.ativa()) return;
    desenhar(ctx.raiz, tela());
    $('form.filtros', ctx.raiz).addEventListener('change', (e) => {
      const f = e.currentTarget;
      Object.assign(filtro, { conta: f.conta.value, de: f.de.value || filtro.de, ate: f.ate.value || filtro.ate, pagina: 1 });
      guardarConsulta(filtro);
      carregar().catch(avisarErro);
    });
  };

  const nomeConta = (id) => contas.find((c) => c.id === id)?.nome ?? 'Origem legada não informada';
  const admin = pode.administrar();
  const lanca = pode.lancar();

  const tela = () => {
    const total = saldos.filter((s) => s.ativo).reduce((s, c) => s + centavos(c.saldo), 0);
    const paginas = Math.max(1, Math.ceil(movimentos.total / POR_PAGINA));
    return html`
      ${cabecalho('Contas financeiras', 'Onde o dinheiro do escritório está', html`
        ${lanca ? html`<button type="button" class="botao" data-acao="transferir">Transferir entre contas</button>` : ''}
        ${admin ? html`<button type="button" class="botao botao--primario" data-acao="nova">Nova conta</button>` : ''}`)}
      <p class="nota nota--info">Saldo calculado pelo sistema a partir do saldo inicial de cada conta e dos lançamentos — não é o extrato do banco. Confira com o extrato de vez em quando.</p>

      <div class="indicadores">
        ${saldos.filter((s) => s.ativo).map((s) => indicador(s.nome, moeda(centavos(s.saldo)),
          `${TIPOS[s.tipo] ?? s.tipo}${s.padrao ? ' · padrão' : ''}${s.ultimo_movimento ? ` · último ${data(s.ultimo_movimento)}` : ''}`,
          { tom: centavos(s.saldo) < 0 ? 'perigo' : '', href: `#/financeiro/contas-financeiras?conta=${s.id}&de=${filtro.de}&ate=${filtro.ate}` }))}
        ${indicador('Total nas contas', moeda(total), 'soma das contas ativas')}
      </div>

      <section class="painel secao">
        <header class="painel__topo"><h2 class="painel__titulo">Contas</h2></header>
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Conta</th><th>Tipo</th><th class="num">Saldo inicial</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${saldos.map((s) => {
              const c = contas.find((x) => x.id === s.id) ?? {};
              return html`
                <tr class="${s.ativo ? '' : 'apagada'}">
                  <td>${s.nome}${c.banco ? html`<span class="sub">${[c.banco, c.agencia && `ag. ${c.agencia}`, c.numero && `conta ${c.numero}`].filter(Boolean).join(' · ')}</span>` : ''}</td>
                  <td>${TIPOS[s.tipo] ?? s.tipo}</td>
                  <td class="num">${moeda(centavos(s.saldo_inicial))}${s.saldo_inicial_em ? html`<span class="sub">em ${data(s.saldo_inicial_em)}</span>` : ''}</td>
                  <td class="num">${moeda(centavos(s.entradas))}</td>
                  <td class="num">${moeda(centavos(s.saidas))}</td>
                  <td class="num forte">${moeda(centavos(s.saldo))}</td>
                  <td>${s.padrao ? html`<span class="selo selo--ok">Padrão</span>` : ''}${s.ativo ? '' : html`<span class="selo">Inativa</span>`}</td>
                  <td class="acoes">
                    ${admin ? html`
                      <button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar" data-id="${s.id}">Editar</button>
                      ${!s.padrao && s.ativo ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="padrao" data-id="${s.id}">Tornar padrão</button>` : ''}` : ''}
                    <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${s.id}">Histórico</button>
                  </td>
                </tr>`;
            })}</tbody>
          </table>
        </div>
      </section>

      <section class="painel secao">
        <header class="painel__topo"><h2 class="painel__titulo">Movimentos</h2></header>
        <form class="filtros painel__corpo">
          <label class="campo"><span>Conta</span>
            <select name="conta">${opcoes([...contas.map((c) => [c.id, c.nome]), ['legado', 'Origem legada não informada']], filtro.conta, { vazio: 'Todas' })}</select></label>
          <label class="campo"><span>De</span><input type="date" name="de" value="${filtro.de}"></label>
          <label class="campo"><span>Até</span><input type="date" name="ate" value="${filtro.ate}"></label>
        </form>
        ${movimentos.linhas.length ? html`
          <div class="tabela-rolagem">
            <table class="tabela">
              <thead><tr><th>Data</th><th>Conta</th><th>Movimento</th><th>Descrição</th><th class="num">Entrada</th><th class="num">Saída</th></tr></thead>
              <tbody>${movimentos.linhas.map((m) => html`
                <tr class="${m.estornado_em ? 'apagada' : ''}">
                  <td class="num">${data(m.data)}</td>
                  <td>${nomeConta(m.conta_financeira_id)}</td>
                  <td>${ORIGENS[m.origem] ?? m.origem}${m.estornado_em ? html`<span class="sub">estornado</span>` : ''}</td>
                  <td>${m.descricao ?? '—'}</td>
                  <td class="num">${m.direcao === 'entrada' ? moeda(centavos(m.valor)) : ''}</td>
                  <td class="num">${m.direcao === 'saida' ? moeda(centavos(m.valor)) : ''}</td>
                </tr>`)}
              </tbody>
            </table>
          </div>
          ${paginacao(filtro.pagina, paginas, movimentos.total)}` : vazio('Nenhum movimento no período.')}
      </section>

      <section class="painel secao">
        <header class="painel__topo"><h2 class="painel__titulo">Transferências recentes</h2></header>
        ${transferencias.length ? html`
          <ul class="lista">${transferencias.map((t) => html`
            <li class="lista__item ${t.estornado_em ? 'apagada' : ''}">
              <span>${data(t.data)} · ${nomeConta(t.origem_id)} → ${nomeConta(t.destino_id)}
                <span class="sub">${t.justificativa} · ${nomeDe(t.criado_por)}${t.estornado_em ? ` · estornada: ${t.motivo_estorno}` : ''}</span></span>
              <span class="num">${moeda(centavos(t.valor))}
                ${!t.estornado_em && lanca ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="estornar" data-id="${t.id}">Estornar</button>` : ''}</span>
            </li>`)}</ul>` : vazio('Nenhuma transferência.')}
      </section>`;
  };

  await carregar();
  if (!ctx.ativa()) return;

  const depois = (promessa) => promessa.then((ok) => {
    if (ok) {
      esquecerApoio();
      return carregar();
    }
    return null;
  }).catch(avisarErro);

  return aoClicar(ctx.raiz, {
    nova: () => depois(editarConta(null)),
    editar: (el) => depois(editarConta(contas.find((c) => c.id === el.dataset.id))),
    padrao: (el) => depois(db.rpc('definir_conta_padrao', { p_id: el.dataset.id }).then(() => avisar('Conta padrão trocada.')).then(() => true)),
    historico: (el) => abrirHistorico({ titulo: nomeConta(el.dataset.id), registros: [el.dataset.id] }),
    transferir: () => depois(transferir(contas)),
    estornar: async (el) => {
      const motivo = await pedirMotivo({ titulo: 'Estornar transferência', texto: 'As duas pernas deixam de contar; o registro fica visível.', rotuloOk: 'Estornar' });
      if (motivo) {
        depois(db.alterar('transferencias_financeiras', [['id', 'eq', el.dataset.id]], { estornado_em: new Date().toISOString(), motivo_estorno: motivo }, 'id')
          .then(() => avisar('Transferência estornada.')).then(() => true));
      }
    },
    pagina: (el) => {
      filtro.pagina = Number(el.dataset.pagina);
      guardarConsulta(filtro);
      carregar().catch(avisarErro);
    },
  });
}

function editarConta(c) {
  return abrirDialogo({
    titulo: c ? `Editar — ${c.nome}` : 'Nova conta financeira',
    corpo: html`
      <div class="campos">
        <label class="campo campo--8"><span>Nome</span><input name="nome" value="${c?.nome ?? ''}" required maxlength="100" autofocus placeholder="Ex.: Banco X — conta do escritório"></label>
        <label class="campo campo--4"><span>Tipo</span><select name="tipo">${opcoes(Object.entries(TIPOS), c?.tipo ?? 'corrente')}</select></label>
        <label class="campo campo--4"><span>Banco</span><input name="banco" value="${c?.banco ?? ''}" maxlength="100"></label>
        <label class="campo campo--4"><span>Agência</span><input name="agencia" value="${c?.agencia ?? ''}" maxlength="20"></label>
        <label class="campo campo--4"><span>Número da conta</span><input name="numero" value="${c?.numero ?? ''}" maxlength="30"></label>
        <label class="campo campo--6"><span>Saldo inicial</span><input name="saldo_inicial" class="num" inputmode="decimal" value="${decimal(centavos(c?.saldo_inicial ?? 0))}"></label>
        <label class="campo campo--6"><span>Saldo inicial em</span><input type="date" name="saldo_inicial_em" value="${c?.saldo_inicial_em ?? hoje()}">
          <span class="campo__ajuda">Movimentos antes desta data não entram no saldo.</span></label>
        <label class="campo"><span>Observações</span><input name="observacoes" value="${c?.observacoes ?? ''}" maxlength="500"></label>
        ${c && !c.padrao ? html`<label class="opcao"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Ativa (inativa continua no histórico, mas não recebe lançamento novo)</label>` : ''}
      </div>
      <p class="nota">Só identificação. Nunca guarde aqui senha, token ou acesso ao banco.</p>`,
    aoEnviar: async (d) => {
      const saldo = lerMoeda(d.saldo_inicial) ?? 0;
      if (Number.isNaN(saldo)) throw new Error('Saldo inicial inválido.');
      const registro = {
        nome: d.nome, tipo: d.tipo, banco: d.banco || null, agencia: d.agencia || null, numero: d.numero || null,
        saldo_inicial: paraReais(saldo), saldo_inicial_em: d.saldo_inicial_em || null, observacoes: d.observacoes || null,
      };
      if (c) await db.alterar('contas_financeiras', [['id', 'eq', c.id]], c.padrao ? registro : { ...registro, ativo: d.ativo }, 'id');
      else await db.inserir('contas_financeiras', registro, 'id');
      avisar(c ? 'Conta salva.' : 'Conta cadastrada.');
      return true;
    },
  });
}

function transferir(contas) {
  const dia = hoje();
  const ativas = contas.filter((c) => c.ativo);
  return abrirDialogo({
    titulo: 'Transferir entre contas',
    rotuloOk: 'Registrar transferência',
    corpo: html`
      <div class="campos">
        <label class="campo campo--6"><span>De</span><select name="origem_id" required>${opcoesContasFinanceiras(ativas)}</select></label>
        <label class="campo campo--6"><span>Para</span><select name="destino_id" required>${opcoes(ativas.map((c) => [c.id, c.nome]), ativas.find((c) => !c.padrao)?.id)}</select></label>
        <label class="campo campo--6"><span>Valor</span><input name="valor" class="num" inputmode="decimal" required autofocus></label>
        <label class="campo campo--6"><span>Data</span><input type="date" name="data" value="${dia}" max="${dia}" required></label>
        <label class="campo"><span>Justificativa</span><input name="justificativa" required maxlength="300" placeholder="Ex.: depósito do caixa no banco"></label>
      </div>
      <p class="sub secao">Não é receita nem despesa: o resultado do mês não muda.</p>`,
    aoEnviar: async (d) => {
      const valor = lerMoeda(d.valor);
      if (!(valor > 0)) throw new Error('Informe o valor.');
      if (d.origem_id === d.destino_id) throw new Error('Escolha contas diferentes.');
      await db.inserir('transferencias_financeiras', {
        origem_id: d.origem_id, destino_id: d.destino_id, valor: paraReais(valor), data: d.data, justificativa: d.justificativa,
      }, 'id');
      avisar(`Transferência de ${moeda(valor)} registrada.`);
      return true;
    },
  });
}

