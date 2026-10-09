// Relatórios e exportação (preparação 6.4 F; DOCX §11, T11).
// ===========================================================
//
// Os oito relatórios do DOCX, com filtros comuns, para ler (imprimir / salvar
// em PDF pelo navegador) e para o contador (Excel .xlsx ou CSV). Toda saída
// traz escritório, relatório, período, filtros, quando e por quem foi
// emitida. A tela, a impressão e a planilha usam a MESMA consulta: o total de
// uma é o total das outras.
//
// A cópia operacional (JSON) continua aqui: é o que este login pode ler, num
// arquivo — útil para conferência e migração, mas NÃO é backup do sistema
// (não leva arquivos, logins nem a auditoria inteira). O backup de verdade
// está em docs/operacao/backup-restauracao.md.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { baixarArquivo } from '../../nucleo/csv.js';
import { estado, nomeDe, pode } from '../../nucleo/estado.js';
import { centavos, data, dataHora, fimDoMes, hoje, inicioDoMes, mesAbreviado, moeda } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { nomeDaParcela } from '../../dominio/parcelas.js';
import { termoDeBusca } from '../../nucleo/consulta.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, opcoes, TIPOS_AVULSA, vazio } from '../comum.js';
import { RAZAO } from '../../escritorio.js';
import { apoio, atualizarParcelas, nomeContaFinanceira, somaCentavos } from './base.js';
import { COLUNAS_EXPORTACAO as COLUNAS_CONTRATOS } from './contratos.js';
import { COLUNAS_RECEBIVEIS } from './recebiveis.js';
import { botoesExportar, exportar } from './exportar.js';

const RELATORIOS = [
  ['fluxo', 'Fluxo financeiro'],
  ['receber', 'Contas a receber'],
  ['inadimplencia', 'Inadimplência'],
  ['contratos', 'Posição por contrato'],
  ['recebimentos', 'Recebimentos'],
  ['despesas', 'Despesas (obrigações)'],
  ['pagamentos', 'Pagamentos de despesas (caixa)'],
  ['anual', 'Fechamento anual'],
  ['auditoria', 'Auditoria'],
];
const TELA_MAX = 2000;

export default async function telaRelatorios(ctx) {
  const q = ctx.consulta;
  const dia = hoje();
  const f = {
    relatorio: RELATORIOS.some(([v]) => v === q.relatorio) ? q.relatorio : 'fluxo',
    de: /^\d{4}-\d{2}-\d{2}$/.test(q.de ?? '') ? q.de : inicioDoMes(dia),
    ate: /^\d{4}-\d{2}-\d{2}$/.test(q.ate ?? '') ? q.ate : fimDoMes(dia),
    agrupar: q.agrupar === 'dia' ? 'dia' : 'mes',
    busca: q.busca ?? '',
    conta: q.conta ?? '',
    responsavel: q.responsavel ?? '',
    categoria: q.categoria ?? '',
    situacao: q.situacao ?? '',
    estornados: q.estornados === '1',
    ano: /^\d{4}$/.test(q.ano ?? '') ? q.ano : String(Number(dia.slice(0, 4)) - 1),
  };
  // Endereços antigos: ?tipo=mes&mes=AAAA-MM / ?tipo=ano&ano=AAAA.
  if (/^\d{4}-\d{2}$/.test(q.mes ?? '')) {
    f.de = `${q.mes}-01`;
    f.ate = fimDoMes(f.de);
  }
  if (q.tipo === 'ano' && /^\d{4}$/.test(q.ano ?? '')) {
    f.de = `${q.ano}-01-01`;
    f.ate = `${q.ano}-12-31`;
  }
  const { contasFinanceiras, categorias } = await apoio();
  if (!ctx.ativa()) return;
  let atual = null;
  let pedido = 0;

  desenhar(ctx.raiz, html`
    ${cabecalho('Relatórios', 'Para ler, imprimir e mandar ao contador', html`
      <button type="button" class="botao" data-acao="imprimir">Imprimir / PDF</button>
      <button type="button" class="botao" data-acao="copia" title="Tudo o que este login pode ler, em JSON">Cópia operacional</button>`)}
    <form class="filtros" data-papel="filtros"></form>
    <div data-papel="corpo"><p class="carregando">Carregando…</p></div>`);
  const form = $('[data-papel="filtros"]', ctx.raiz);
  const corpo = $('[data-papel="corpo"]', ctx.raiz);

  const desenharFiltros = () => desenhar(form, html`
    <label class="campo"><span>Relatório</span><select name="relatorio">${opcoes(RELATORIOS.filter(([v]) => v !== 'anual' || pode.fechamento()).filter(([v]) => v !== 'auditoria' || pode.auditoria()), f.relatorio)}</select></label>
    ${f.relatorio === 'anual' ? html`
      <label class="campo"><span>Ano</span><input type="number" name="ano" min="2000" max="2200" value="${f.ano}"></label>` : html`
      <label class="campo campo--data"><span>${['receber', 'inadimplencia'].includes(f.relatorio) ? 'Vencimento de' : ['despesas'].includes(f.relatorio) ? 'Competência de' : 'De'}</span><input type="date" name="de" value="${f.de}"></label>
      <label class="campo campo--data"><span>até</span><input type="date" name="ate" value="${f.ate}"></label>`}
    ${f.relatorio === 'fluxo' ? html`<label class="campo"><span>Agrupar por</span><select name="agrupar">${opcoes([['mes', 'Mês'], ['dia', 'Dia']], f.agrupar)}</select></label>` : ''}
    ${['receber', 'inadimplencia', 'contratos', 'recebimentos', 'auditoria'].includes(f.relatorio) ? html`
      <label class="campo campo--busca"><span>Buscar</span><input type="search" name="busca" value="${f.busca}" placeholder="${f.relatorio === 'auditoria' ? 'Tabela (ex.: contratos)' : 'Cliente, código ou contrato'}"></label>` : ''}
    ${['recebimentos', 'pagamentos'].includes(f.relatorio) ? html`
      <label class="campo"><span>Conta financeira</span><select name="conta">${opcoes([...contasFinanceiras.map((c) => [c.id, c.nome]), ['legado', 'Origem legada não informada']], f.conta, { vazio: 'Todas' })}</select></label>
      <label class="opcao"><input type="checkbox" name="estornados" ${f.estornados ? 'checked' : ''}> Incluir estornados</label>` : ''}
    ${['receber', 'inadimplencia', 'contratos', 'recebimentos'].includes(f.relatorio) ? html`
      <label class="campo"><span>Responsável</span><select name="responsavel">${opcoes(estado.membros.map((m) => [m.id, m.nome_curto]), f.responsavel, { vazio: 'Todos' })}</select></label>` : ''}
    ${['despesas', 'pagamentos'].includes(f.relatorio) ? html`
      <label class="campo"><span>Categoria</span><select name="categoria">${opcoes(categorias.map((c) => [c.id, c.nome]), f.categoria, { vazio: 'Todas' })}</select></label>` : ''}
    ${f.relatorio === 'receber' ? html`
      <label class="campo"><span>Situação</span><select name="situacao">${opcoes([['', 'Em aberto'], ['a_vencer', 'A vencer'], ['vencida', 'Vencidas'], ['parcial', 'Pagas em parte'], ['paga', 'Pagas'], ['todas', 'Todas']], f.situacao)}</select></label>` : ''}`);

  const mostrar = async () => {
    const este = ++pedido;
    desenharFiltros();
    atual = null;
    corpo.innerHTML = '<p class="carregando">Carregando…</p>';
    let r;
    try {
      if (f.relatorio !== 'anual' && f.de > f.ate) throw new Error('A data inicial precisa ser anterior ou igual à data final.');
      r = await GERAR[f.relatorio](f, contasFinanceiras);
    } catch (erro) {
      if (este === pedido && ctx.ativa()) desenhar(corpo, html`<p class="nota nota--perigo" role="alert">${erro.message}</p>`);
      return;
    }
    if (f.responsavel && ['receber', 'inadimplencia', 'contratos', 'recebimentos'].includes(f.relatorio)) r.filtros.push(['Responsável', nomeDe(f.responsavel)]);
    if (f.categoria && ['despesas', 'pagamentos'].includes(f.relatorio)) r.filtros.push(['Categoria', categorias.find((c) => c.id === f.categoria)?.nome ?? f.categoria]);
    if (este !== pedido || !ctx.ativa()) return;
    atual = r;
    desenhar(corpo, folha(r, f));
  };

  form.addEventListener('change', (e) => {
    const c = e.target;
    if (!c.name) return;
    f[c.name] = c.type === 'checkbox' ? c.checked : c.value;
    guardarConsulta({ ...f, estornados: f.estornados ? '1' : '' });
    mostrar().catch(avisarErro);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  await mostrar();

  return aoClicar(ctx.raiz, {
    imprimir: () => atual ? print() : avisar('Escolha um período válido e aguarde o relatório.', 'erro'),
    exportar: (el) => exportar({
      relatorio: atual.titulo,
      arquivo: `relatorio-${f.relatorio}`,
      formato: el.dataset.formato,
      colunas: atual.colunas,
      linhas: atual.linhas,
      filtros: atual.filtros,
      totais: atual.totais,
      outrasAbas: atual.outrasAbas ?? [],
    }).catch(avisarErro),
    copia: async (botao) => {
      botao.disabled = true;
      botao.textContent = 'Preparando…';
      try {
        const copia = await copiaOperacional();
        baixarArquivo(`fl-copia-operacional-${hoje()}.json`, JSON.stringify(copia, null, 2), 'application/json');
        avisar('Cópia operacional baixada. Ela não substitui o backup do sistema.');
      } catch (erro) {
        avisarErro(erro);
      } finally {
        botao.disabled = false;
        botao.textContent = 'Cópia operacional';
      }
    },
  });
}

// ---------------------------------------------------------------------------
// A folha: cabeçalho com parâmetros, totais, tabela
// ---------------------------------------------------------------------------

function folha(r, f) {
  const linhasTela = r.linhas.slice(0, TELA_MAX);
  return html`
    <div class="so-impressao relatorio-cabecalho">
      <p class="rotulo">${RAZAO}</p>
      <h2>${r.titulo}</h2>
      ${r.filtros.map(([k, v]) => html`<p><strong>${k}:</strong> ${v}</p>`)}
      <p>Emitido em ${dataHora(new Date().toISOString())} por ${estado.membro.nome}</p>
    </div>
    <section class="painel">
      <header class="painel__topo">
        <div>
          <h2 class="painel__titulo">${r.titulo}</h2>
          <p class="sub">${r.filtros.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
        </div>
        <div class="grupo-botoes">${botoesExportar()}</div>
      </header>
      ${r.aviso ? html`<p class="nota painel__corpo">${r.aviso}</p>` : ''}
      ${Object.keys(r.totais).length ? html`
        <div class="indicadores painel__corpo">${Object.entries(r.totais).map(([k, v]) => html`
          <div class="indicador"><span class="rotulo">${k}</span><span class="indicador__valor">${moeda(v)}</span></div>`)}</div>` : ''}
      ${r.linhas.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela tabela--relatorio">
            <thead><tr>${r.colunas.map((c) => html`<th class="${['moeda', 'numero', 'inteiro', 'data'].includes(c.tipo) ? 'num' : ''}">${c.titulo}</th>`)}</tr></thead>
            <tbody>${linhasTela.map((l) => html`
              <tr class="${l.estornado_em ? 'apagada' : ''}">${r.colunas.map((c) => {
                const v = c.valor(l);
                const tipo = c.tipo ?? 'texto';
                return html`<td class="${tipo === 'texto' ? '' : 'num'}">${v == null || v === '' ? '' : tipo === 'moeda' ? moeda(v) : tipo === 'data' ? data(v) : String(v)}</td>`;
              })}</tr>`)}
            </tbody>
          </table>
        </div>
        <p class="painel__rodape sub">${r.linhas.length} ${r.linhas.length === 1 ? 'linha' : 'linhas'}${r.linhas.length > TELA_MAX ? ` — a tela mostra as primeiras ${TELA_MAX}; a planilha leva todas` : ''}.</p>`
        : vazio('Nada neste período com esses filtros.')}
    </section>
    ${r.extra ?? ''}`;
}

const periodoTexto = (f) => `${data(f.de)} a ${data(f.ate)}`;
const filtroBusca = (f) => (f.busca ? [['Busca', f.busca]] : []);

// ---------------------------------------------------------------------------
// Os relatórios
// ---------------------------------------------------------------------------

const GERAR = {
  async fluxo(f) {
    if (f.agrupar === 'mes') {
      const r = await db.rpc('resumo_financeiro', { p: { de: f.de, ate: f.ate } });
      let acumulado = 0;
      const linhas = r.serie.map((s) => {
        const resultado = centavos(s.receita_recebida) - centavos(s.despesa_paga);
        acumulado += resultado;
        return { ...s, resultado, acumulado };
      });
      return {
        titulo: 'Fluxo financeiro mensal',
        filtros: [['Período', periodoTexto(f)], ['Base', 'previsto: vencimento (receitas) e competência (despesas); realizado: caixa']],
        colunas: [
          { titulo: 'Mês', valor: (l) => mesAbreviado(l.competencia) },
          { titulo: 'Receita prevista', valor: (l) => centavos(l.receita_prevista), tipo: 'moeda' },
          { titulo: 'Receita recebida', valor: (l) => centavos(l.receita_recebida), tipo: 'moeda' },
          { titulo: 'Despesa prevista', valor: (l) => centavos(l.despesa_prevista), tipo: 'moeda' },
          { titulo: 'Despesa paga', valor: (l) => centavos(l.despesa_paga), tipo: 'moeda' },
          { titulo: 'Resultado (caixa)', valor: (l) => l.resultado, tipo: 'moeda' },
          { titulo: 'Acumulado', valor: (l) => l.acumulado, tipo: 'moeda' },
        ],
        linhas,
        totais: {
          'Receita recebida': linhas.reduce((s, l) => s + centavos(l.receita_recebida), 0),
          'Despesa paga': linhas.reduce((s, l) => s + centavos(l.despesa_paga), 0),
          Resultado: linhas.reduce((s, l) => s + l.resultado, 0),
        },
        aviso: 'Transferências entre contas não entram: não são receita nem despesa.',
      };
    }
    const [entradas, saidas] = await Promise.all([
      db.todos('recebimentos', { select: 'id,data,valor', filtros: [['data', 'gte', f.de], ['data', 'lte', f.ate], ['estornado_em', 'is', null]] }),
      db.todos('pagamentos_despesa', { select: 'id,data,valor', filtros: [['data', 'gte', f.de], ['data', 'lte', f.ate], ['estornado_em', 'is', null]] }),
    ]);
    const dias = new Map();
    for (const e of entradas) dias.set(e.data, { ...(dias.get(e.data) ?? { entradas: 0, saidas: 0 }), entradas: (dias.get(e.data)?.entradas ?? 0) + centavos(e.valor) });
    for (const s of saidas) dias.set(s.data, { ...(dias.get(s.data) ?? { entradas: 0, saidas: 0 }), saidas: (dias.get(s.data)?.saidas ?? 0) + centavos(s.valor) });
    let acumulado = 0;
    const linhas = [...dias].sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => {
      acumulado += v.entradas - v.saidas;
      return { data: d, ...v, resultado: v.entradas - v.saidas, acumulado };
    });
    return {
      titulo: 'Fluxo financeiro diário',
      filtros: [['Período', periodoTexto(f)], ['Base', 'caixa (data do recebimento e do pagamento)']],
      colunas: [
        { titulo: 'Data', valor: (l) => l.data, tipo: 'data' },
        { titulo: 'Entradas', valor: (l) => l.entradas, tipo: 'moeda' },
        { titulo: 'Saídas', valor: (l) => l.saidas, tipo: 'moeda' },
        { titulo: 'Resultado', valor: (l) => l.resultado, tipo: 'moeda' },
        { titulo: 'Acumulado', valor: (l) => l.acumulado, tipo: 'moeda' },
      ],
      linhas,
      totais: { Entradas: somaCentavos(entradas, 'valor'), Saídas: somaCentavos(saidas, 'valor') },
    };
  },

  async receber(f) {
    const filtros = [['vencimento', 'gte', f.de], ['vencimento', 'lte', f.ate]];
    if (f.responsavel) filtros.push(['responsavel_id', 'eq', f.responsavel]);
    if (!f.situacao) filtros.push(['situacao', 'in', ['a_vencer', 'vencida']]);
    else if (f.situacao === 'parcial') filtros.push(['situacao', 'in', ['a_vencer', 'vencida']], ['parcial', 'is', true]);
    else if (f.situacao !== 'todas') filtros.push(['situacao', 'eq', f.situacao]);
    const termo = termoDeBusca(f.busca);
    if (termo) filtros.push(['or', `(cliente_nome.ilike.${termo},contrato_codigo.ilike.${termo},contrato_descricao.ilike.${termo})`]);
    const linhas = await db.todos('v_parcelas', { select: '*', filtros, ordem: 'vencimento.asc,cliente_nome.asc,id.asc' });
    const abertas = linhas.filter((p) => ['a_vencer', 'vencida'].includes(p.situacao));
    return {
      titulo: 'Contas a receber',
      filtros: [['Vencimento', periodoTexto(f)], ['Situação', f.situacao || 'em aberto'], ...filtroBusca(f), ['Situação calculada em', data(hoje())]],
      colunas: COLUNAS_RECEBIVEIS,
      linhas,
      totais: { 'Valor das parcelas': somaCentavos(linhas, 'valor'), 'Saldo em aberto': somaCentavos(abertas, 'saldo') },
    };
  },

  async inadimplencia(f) {
    const filtros = [['situacao', 'eq', 'vencida'], ['vencimento', 'gte', f.de], ['vencimento', 'lte', f.ate]];
    if (f.responsavel) filtros.push(['responsavel_id', 'eq', f.responsavel]);
    const termo = termoDeBusca(f.busca);
    if (termo) filtros.push(['or', `(cliente_nome.ilike.${termo},contrato_codigo.ilike.${termo},contrato_descricao.ilike.${termo})`]);
    const vencidas = await db.todos('v_parcelas', { select: '*', filtros, ordem: 'vencimento.asc,id.asc' });
    const itens = await atualizarParcelas(vencidas);
    const linhas = itens.map(({ parcela, calculo }) => ({ ...parcela, calculo }));
    const indisponivel = itens.some((i) => i.calculo.indice?.indisponivel);
    return {
      titulo: 'Inadimplência',
      filtros: [['Vencimento', periodoTexto(f)], ...filtroBusca(f), ['Encargos calculados para', data(hoje())]],
      colunas: [
        { titulo: 'Cliente', valor: (l) => l.cliente_nome },
        { titulo: 'Código', valor: (l) => l.contrato_codigo },
        { titulo: 'Contrato', valor: (l) => l.contrato_descricao },
        { titulo: 'Parcela', valor: (l) => nomeDaParcela(l.numero) },
        { titulo: 'Vencimento', valor: (l) => l.vencimento, tipo: 'data' },
        { titulo: 'Dias', valor: (l) => l.calculo.dias, tipo: 'inteiro' },
        { titulo: 'Saldo (principal)', valor: (l) => l.calculo.saldo, tipo: 'moeda' },
        { titulo: 'Correção (estimada)', valor: (l) => l.calculo.correcao, tipo: 'moeda' },
        { titulo: 'Multa (estimada)', valor: (l) => l.calculo.multa, tipo: 'moeda' },
        { titulo: 'Juros (estimados)', valor: (l) => l.calculo.juros, tipo: 'moeda' },
        { titulo: 'Total atualizado', valor: (l) => l.calculo.total, tipo: 'moeda' },
      ],
      linhas,
      totais: {
        'Saldo em atraso': linhas.reduce((s, l) => s + l.calculo.saldo, 0),
        'Total atualizado': linhas.reduce((s, l) => s + l.calculo.total, 0),
      },
      aviso: `Encargos são estimativa pelo critério de atraso de cada contrato; viram receita só quando recebidos.${indisponivel ? ' O Banco Central não respondeu: sem correção monetária nesta emissão.' : ''}`,
    };
  },

  async contratos(f) {
    const filtros = [];
    if (f.responsavel) filtros.push(['responsavel_id', 'eq', f.responsavel]);
    const termo = termoDeBusca(f.busca);
    if (termo) filtros.push(['or', `(cliente_nome.ilike.${termo},codigo.ilike.${termo},descricao.ilike.${termo},processo.ilike.${termo})`]);
    const linhas = await db.todos('v_contratos', { select: '*', filtros, ordem: 'cliente_nome.asc,codigo.asc,id.asc' });
    return {
      titulo: 'Posição por contrato',
      filtros: [...filtroBusca(f), ['Posição em', data(hoje())]],
      colunas: COLUNAS_CONTRATOS,
      linhas,
      totais: { 'Exigível vigente': somaCentavos(linhas, 'exigivel_total'), Recebido: somaCentavos(linhas, 'recebido'), 'Saldo em aberto': somaCentavos(linhas, 'saldo') },
      aviso: 'Para a posição numa data passada (como 31/12), use o relatório Fechamento anual.',
    };
  },

  async recebimentos(f, contasFinanceiras) {
    const filtros = [['data', 'gte', f.de], ['data', 'lte', f.ate]];
    if (f.responsavel) filtros.push(['contrato_responsavel_id', 'eq', f.responsavel]);
    if (!f.estornados) filtros.push(['estornado_em', 'is', null]);
    if (f.conta === 'legado') filtros.push(['conta_financeira_id', 'is', null]);
    else if (f.conta) filtros.push(['conta_financeira_id', 'eq', f.conta]);
    const termo = termoDeBusca(f.busca);
    if (termo) filtros.push(['or', `(cliente_nome.ilike.${termo},contrato_descricao.ilike.${termo},descricao.ilike.${termo})`]);
    const linhas = await db.todos('v_recebimentos', { select: '*', filtros, ordem: 'data.asc,criado_em.asc,id.asc' });
    const validos = linhas.filter((r) => !r.estornado_em);
    return {
      titulo: 'Recebimentos',
      filtros: [['Período (caixa)', periodoTexto(f)], ['Conta', f.conta ? (f.conta === 'legado' ? 'origem legada' : contasFinanceiras.find((c) => c.id === f.conta)?.nome) : 'todas'],
        ['Estornados', f.estornados ? 'incluídos (riscados)' : 'fora'], ...filtroBusca(f)],
      colunas: [
        { titulo: 'Data', valor: (r) => r.data, tipo: 'data' },
        { titulo: 'Cliente', valor: (r) => r.cliente_nome },
        { titulo: 'Origem', valor: (r) => (r.parcela_id ? `${r.contrato_descricao} · ${nomeDaParcela(r.parcela_numero)}` : `${TIPOS_AVULSA[r.tipo_avulsa] ?? r.tipo_avulsa} (avulsa)`) },
        { titulo: 'Forma', valor: (r) => r.forma_nome },
        { titulo: 'Conta', valor: (r) => nomeContaFinanceira(r.conta_financeira_nome) },
        { titulo: 'Principal', valor: (r) => centavos(r.valor_principal), tipo: 'moeda' },
        { titulo: 'Correção', valor: (r) => (r.encargos_discriminados ? centavos(r.valor_correcao) : null), tipo: 'moeda' },
        { titulo: 'Multa', valor: (r) => (r.encargos_discriminados ? centavos(r.valor_multa) : null), tipo: 'moeda' },
        { titulo: 'Juros', valor: (r) => (r.encargos_discriminados ? centavos(r.valor_juros) : null), tipo: 'moeda' },
        { titulo: 'Acréscimo', valor: (r) => (r.encargos_discriminados ? centavos(r.valor_acrescimo) : null), tipo: 'moeda' },
        { titulo: 'Encargos (total)', valor: (r) => centavos(r.valor_encargos), tipo: 'moeda' },
        { titulo: 'Valor', valor: (r) => centavos(r.valor), tipo: 'moeda' },
        { titulo: 'Lançado por', valor: (r) => nomeDe(r.criado_por) },
        { titulo: 'Estorno', valor: (r) => (r.estornado_em ? `${dataHora(r.estornado_em)} — ${r.motivo_estorno}` : null) },
      ],
      linhas,
      totais: { Recebido: somaCentavos(validos, 'valor'), Principal: somaCentavos(validos, 'valor_principal'), Encargos: somaCentavos(validos, 'valor_encargos') },
      aviso: 'Recebimentos anteriores a 08/10/2026 não discriminam multa, juros e correção (aparece só o total de encargos).',
    };
  },

  async despesas(f) {
    const filtros = [['competencia', 'gte', inicioDoMes(f.de)], ['competencia', 'lte', f.ate], ['situacao', 'neq', 'cancelada']];
    if (f.categoria) filtros.push(['categoria_id', 'eq', f.categoria]);
    const [registradas, previsoes, { categorias }, fornecedores, centros] = await Promise.all([db.todos('v_contas', {
      select: '*',
      filtros,
      ordem: 'competencia.asc,vencimento.asc,id.asc',
    }), db.rpc('previsao_recorrentes', { p_de: f.de, p_ate: f.ate }), apoio(),
    db.todos('fornecedores', { select: 'id,nome' }), db.todos('centros_custo', { select: 'id,nome' })]);
    const linhas = [...registradas, ...previsoes.filter((p) => !f.categoria || p.categoria_id === f.categoria).map((p) => ({
      ...p, categoria_nome: categorias.find((c) => c.id === p.categoria_id)?.nome,
      fornecedor_nome: fornecedores.find((c) => c.id === p.fornecedor_id)?.nome,
      centro_custo_nome: centros.find((c) => c.id === p.centro_custo_id)?.nome,
      pago_total: 0, saldo: p.valor, situacao: 'previsão (a gerar)',
    }))].sort((a, b) => a.competencia.localeCompare(b.competencia) || a.vencimento.localeCompare(b.vencimento));
    return {
      titulo: 'Despesas (obrigações)',
      filtros: [['Competência', periodoTexto(f)], ['Base', 'competência (o mês da despesa), não o dia do pagamento']],
      colunas: [
        { titulo: 'Competência', valor: (c) => `${c.competencia.slice(5, 7)}/${c.competencia.slice(0, 4)}` },
        { titulo: 'Vencimento', valor: (c) => c.vencimento, tipo: 'data' },
        { titulo: 'Descrição', valor: (c) => c.descricao },
        { titulo: 'Categoria', valor: (c) => c.categoria_nome },
        { titulo: 'Tipo', valor: (c) => c.tipo },
        { titulo: 'Fornecedor', valor: (c) => c.fornecedor_nome },
        { titulo: 'Centro de custo', valor: (c) => c.centro_custo_nome ?? 'não informado' },
        { titulo: 'Previsto', valor: (c) => (c.valor != null ? centavos(c.valor) : null), tipo: 'moeda' },
        { titulo: 'Pago', valor: (c) => centavos(c.pago_total), tipo: 'moeda' },
        { titulo: 'Saldo', valor: (c) => (c.saldo != null ? centavos(c.saldo) : null), tipo: 'moeda' },
        { titulo: 'Situação', valor: (c) => `${c.situacao}${c.parcial ? ' (em parte)' : ''}` },
      ],
      linhas,
      totais: { Previsto: somaCentavos(linhas, 'valor'), Pago: somaCentavos(linhas, 'pago_total'), 'A pagar': linhas.reduce((s, c) => s + (c.situacao === 'paga' ? 0 : centavos(c.saldo ?? 0)), 0) },
      aviso: 'Inclui recorrências previstas ainda não geradas. Valor a confirmar fica em branco.',
    };
  },

  async pagamentos(f, contasFinanceiras) {
    const filtros = [['data', 'gte', f.de], ['data', 'lte', f.ate]];
    if (f.categoria) filtros.push(['categoria_id', 'eq', f.categoria]);
    if (!f.estornados) filtros.push(['estornado_em', 'is', null]);
    if (f.conta === 'legado') filtros.push(['conta_financeira_id', 'is', null], ['pago_por_id', 'is', null]);
    else if (f.conta) filtros.push(['conta_financeira_id', 'eq', f.conta]);
    const linhas = await db.todos('v_pagamentos_despesa', { select: '*', filtros, ordem: 'data.asc,criado_em.asc,id.asc' });
    const validos = linhas.filter((p) => !p.estornado_em);
    return {
      titulo: 'Pagamentos de despesas (caixa)',
      filtros: [['Período (caixa)', periodoTexto(f)], ['Conta', f.conta ? (f.conta === 'legado' ? 'origem legada' : contasFinanceiras.find((c) => c.id === f.conta)?.nome) : 'todas'],
        ['Estornados', f.estornados ? 'incluídos (riscados)' : 'fora']],
      colunas: [
        { titulo: 'Pago em', valor: (p) => p.data, tipo: 'data' },
        { titulo: 'Descrição', valor: (p) => p.descricao },
        { titulo: 'Categoria', valor: (p) => p.categoria_nome },
        { titulo: 'Competência', valor: (p) => `${p.competencia.slice(5, 7)}/${p.competencia.slice(0, 4)}` },
        { titulo: 'Fornecedor', valor: (p) => p.fornecedor_nome },
        { titulo: 'Forma', valor: (p) => p.forma_nome },
        { titulo: 'Saiu de', valor: (p) => (p.pago_por_id ? `${nomeDe(p.pago_por_id)} (do bolso)` : nomeContaFinanceira(p.conta_financeira_nome)) },
        { titulo: 'Reembolsado em', valor: (p) => p.reembolsado_em, tipo: 'data' },
        { titulo: 'Valor', valor: (p) => centavos(p.valor), tipo: 'moeda' },
        { titulo: 'Origem', valor: (p) => (p.origem === 'legado' ? 'antes de 08/10/2026' : p.origem) },
        { titulo: 'Estorno', valor: (p) => (p.estornado_em ? `${dataHora(p.estornado_em)} — ${p.motivo_estorno}` : null) },
      ],
      linhas,
      totais: { Pago: somaCentavos(validos, 'valor') },
    };
  },

  async anual(f) {
    const ano = Number(f.ano);
    const [registro, previa] = await Promise.all([
      db.um('fechamentos_anuais', { select: '*', filtros: [['ano', 'eq', ano]] }),
      db.rpc('previa_fechamento_anual', { p_ano: ano }),
    ]);
    let foto = previa;
    let origem = 'prévia calculada agora';
    if (registro?.fechado) {
      const versao = await db.um('fechamentos_anuais_versoes', { select: 'versao,foto,criado_em', filtros: [['fechamento_id', 'eq', registro.id], ['versao', 'eq', registro.versao]] });
      if (versao) {
        foto = versao.foto;
        origem = `fechamento aprovado — versão ${versao.versao}, de ${dataHora(versao.criado_em)}`;
      }
    }
    const t = foto.totais;
    return {
      titulo: `Fechamento anual de ${ano}`,
      filtros: [['Exercício', String(ano)], ['Posição em', data(foto.corte)], ['Origem', origem], ['Regra', foto.regra]],
      colunas: [
        { titulo: 'Código', valor: (l) => l.codigo },
        { titulo: 'Cliente', valor: (l) => l.cliente_nome },
        { titulo: 'Contrato', valor: (l) => l.descricao },
        { titulo: 'Valor original', valor: (l) => (l.valor_total != null ? centavos(l.valor_total) : null), tipo: 'moeda' },
        { titulo: 'Exigível no corte', valor: (l) => centavos(l.exigivel), tipo: 'moeda' },
        { titulo: 'Principal recebido', valor: (l) => centavos(l.recebido_principal), tipo: 'moeda' },
        { titulo: 'Encargos recebidos', valor: (l) => centavos(l.encargos_recebidos), tipo: 'moeda' },
        { titulo: 'Ajustes', valor: (l) => centavos(l.ajustes), tipo: 'moeda' },
        { titulo: 'Vencido no corte', valor: (l) => centavos(l.saldo_vencido), tipo: 'moeda' },
        { titulo: 'A vencer no corte', valor: (l) => centavos(l.saldo_futuro), tipo: 'moeda' },
        { titulo: 'Próximo vencimento', valor: (l) => l.proximo_vencimento, tipo: 'data' },
        { titulo: 'Situação no corte', valor: (l) => l.situacao },
      ],
      linhas: foto.posicao ?? [],
      totais: {
        'Receitas previstas': centavos(t.receitas_previstas), 'Receitas recebidas': centavos(t.receitas_recebidas),
        'Despesas previstas': centavos(t.despesas_previstas), 'Despesas pagas': centavos(t.despesas_pagas),
        'Vencido em 31/12': centavos(t.vencido_no_corte), 'A vencer em 31/12': centavos(t.a_vencer_no_corte),
      },
      outrasAbas: [{
        nome: 'Mês a mês',
        colunas: [
          { titulo: 'Mês', valor: (m) => mesAbreviado(m.competencia) },
          { titulo: 'Fechado', valor: (m) => (m.fechado ? 'sim' : 'não') },
          { titulo: 'Entradas', valor: (m) => centavos(m.entradas), tipo: 'moeda' },
          { titulo: 'Saídas', valor: (m) => centavos(m.saidas), tipo: 'moeda' },
          { titulo: 'Resultado', valor: (m) => centavos(m.resultado), tipo: 'moeda' },
        ],
        linhas: foto.meses ?? [],
      }],
      aviso: `Taxa de recebimento das parcelas que venceram no ano: ${t.taxa_recebimento == null ? 'não se aplica' : `${String(t.taxa_recebimento).replace('.', ',')}%`}. Para fechar o ano, use Fechamento › Anual.`,
    };
  },

  async auditoria(f) {
    const filtros = [['em', 'gte', `${f.de}T00:00:00-03:00`], ['em', 'lte', `${f.ate}T23:59:59-03:00`]];
    if (f.busca.trim()) filtros.push(['tabela', 'eq', f.busca.trim().toLowerCase()]);
    const linhas = await db.todos('auditoria', { select: '*', filtros, ordem: 'em.asc,id.asc' });
    return {
      titulo: 'Auditoria',
      filtros: [['Período', periodoTexto(f)], ['Tabela', f.busca || 'todas que este login pode ver']],
      colunas: [
        { titulo: 'Quando', valor: (a) => dataHora(a.em) },
        { titulo: 'Quem', valor: (a) => (a.membro_id ? nomeDe(a.membro_id) : 'sistema / migração') },
        { titulo: 'Tabela', valor: (a) => a.tabela },
        { titulo: 'Registro', valor: (a) => a.registro_id },
        { titulo: 'Ação', valor: (a) => a.acao },
        { titulo: 'Campos', valor: (a) => (a.campos ?? []).join(', ') },
        { titulo: 'Antes', valor: (a) => (a.antes ? JSON.stringify(a.antes) : null) },
        { titulo: 'Depois', valor: (a) => (a.depois ? JSON.stringify(a.depois) : null) },
      ],
      linhas,
      totais: {},
      aviso: 'O histórico mostra só o que o seu acesso permite ver. Ninguém altera a auditoria — nem o administrador.',
    };
  },
};

/** Tudo o que este login pode ler, num arquivo só (conferência e migração). */
async function copiaOperacional() {
  const tabelas = ['clientes', 'membros', 'categorias', 'formas_pagamento', 'config_financeiro',
    'contratos', 'parcelas', 'recebimentos', 'renegociacoes', 'cobrancas', 'contas', 'contas_recorrentes',
    'pagamentos_despesa', 'contas_financeiras', 'transferencias_financeiras', 'ajustes_financeiros',
    'fornecedores', 'centros_custo', 'anexos', 'anexos_versoes'];
  if (pode.fechamento()) tabelas.push('fechamentos', 'divisao_cotas', 'fechamentos_anuais', 'fechamentos_anuais_versoes');
  if (pode.agenda()) tabelas.push('config_agenda', 'compromissos');
  if (pode.site()) tabelas.push('publicacoes', 'campanhas', 'site_deploys');
  tabelas.push('processos', 'tarefas', 'feriados');
  if (pode.prazos()) tabelas.push('intimacoes', 'intimacoes_consultas');
  if (pode.clientes()) tabelas.push('contatos', 'clientes_detalhes', 'clientes_contatos', 'documentos', 'atualizacoes');

  const copia = {
    gerado_em: new Date().toISOString(),
    sistema: 'Fonseca Lisboa Advocacia — área dos advogados',
    aviso: 'Cópia operacional: só o que este login lê, sem arquivos anexados, logins nem a auditoria completa. Não é o backup do sistema.',
    tabelas: {},
  };
  for (const tabela of tabelas) copia.tabelas[tabela] = await db.todos(tabela, { select: '*' });
  return copia;
}
