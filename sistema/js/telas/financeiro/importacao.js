// Importar a planilha financeira antiga (DOCX §18, preparação T15).
// ================================================================
//
//   1. Baixe o modelo, copie os dados da planilha antiga para ele (ou use a
//      própria, se as colunas tiverem os mesmos nomes) e escolha o arquivo.
//   2. O sistema lê CSV ou XLSX — sem executar fórmula nem abrir link — e
//      manda as linhas para a área de conferência. Nada entra nos contratos
//      ainda.
//   3. O banco confere linha a linha e aponta erros (soma das parcelas,
//      código repetido, mês fechado…) e o que já existe (mesmo CPF/CNPJ).
//   4. Linha de teste ou repetida: "Excluir da carga", com motivo.
//   5. Sem erros, quem tem o Financeiro completo carrega — tudo de uma vez.
//      Carregar o mesmo arquivo de novo é recusado; a mesma linha em outro
//      arquivo é ignorada.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { baixarArquivo, gerarCsv, lerCsv } from '../../nucleo/csv.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { nomeDe, pode } from '../../nucleo/estado.js';
import { dataHora, moeda } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { lerXlsx } from '../../nucleo/xlsx.js';
import {
  COLUNAS_DESPESA, COLUNAS_PARCELA, hashDoArquivo, linhasDoModelo, normalizarPlanilha, VERSAO_PARSER,
} from '../../dominio/importacao.js';
import { cabecalho, indicador, opcoes, vazio } from '../comum.js';

const LIMITE = 15 * 1024 * 1024;
const ESTADOS = { rascunho: ['Com erros', 'perigo'], validada: ['Pronta para carregar', 'ok'], carregada: ['Carregada', 'ok'], cancelada: ['Cancelada', 'escuro'] };
const ESTADOS_LINHA = { ok: ['OK', 'ok'], aviso: ['Aviso', 'alerta'], erro: ['Erro', 'perigo'], excluida: ['Excluída', 'escuro'], pendente: ['…', ''] };
const selo = ([r, t]) => html`<span class="selo selo--${t || 'escuro'}">${r}</span>`;

export default async function telaImportacao(ctx) {
  return ctx.consulta.id ? detalhe(ctx) : inicio(ctx);
}

// ---------------------------------------------------------------------------
// Início: modelo, envio e importações anteriores
// ---------------------------------------------------------------------------

async function inicio(ctx) {
  const anteriores = await db.listar('importacoes', { select: '*', ordem: 'criado_em.desc', limite: 30 });
  if (!ctx.ativa()) return;

  desenhar(ctx.raiz, html`
    ${cabecalho('Importar planilha', 'Contratos, parcelas, recebimentos e despesas da planilha antiga', html`
      <button type="button" class="botao" data-acao="modelo">Baixar o modelo (CSV)</button>`)}
    <p class="nota nota--info">Nada entra direto: as linhas vão para uma área de conferência, o banco aponta erros e
      divergências, e só depois de tudo certo alguém com o Financeiro completo carrega. Use primeiro uma cópia da planilha.</p>

    <section class="painel">
      <header class="painel__topo"><h2 class="painel__titulo">Enviar arquivo</h2></header>
      <div class="painel__corpo campos">
        <label class="campo campo--8"><span>Planilha (.xlsx ou .csv)</span><input type="file" name="arquivo" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <p class="campo campo--4"><button type="button" class="botao botao--primario" data-acao="ler">Ler o arquivo</button></p>
        <div class="campo" data-papel="previa"></div>
      </div>
    </section>

    <details class="painel secao">
      <summary class="painel__topo"><h2 class="painel__titulo">Colunas do modelo</h2></summary>
      <div class="grade grade--2 painel__corpo">
        <div><h3>Parcela de contrato</h3><ul class="lista-simples">${COLUNAS_PARCELA.map(([c, d]) => html`<li><code>${c}</code> — ${d}</li>`)}</ul></div>
        <div><h3>Despesa</h3><ul class="lista-simples">${COLUNAS_DESPESA.map(([c, d]) => html`<li><code>${c}</code> — ${d}</li>`)}</ul></div>
      </div>
      <p class="painel__rodape sub">No .xlsx, abas chamadas "Parcelas" e "Despesas" dispensam a coluna "tipo". Linhas de total são ignoradas.</p>
    </details>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Importações</h2></header>
      ${anteriores.length ? html`
        <ul class="lista">${anteriores.map((i) => html`
          <li><a class="lista__item" href="#/financeiro/importacao?id=${i.id}">
            <span>${i.nome_arquivo}<span class="sub">${dataHora(i.criado_em)} por ${nomeDe(i.criado_por)} · ${i.totais?.linhas ?? 0} linhas</span></span>
            ${selo(ESTADOS[i.estado] ?? [i.estado, ''])}
          </a></li>`)}</ul>` : vazio('Nenhuma importação ainda.')}
    </section>`);

  let lida = null;
  return aoClicar(ctx.raiz, {
    modelo: () => {
      const [cab, ...linhas] = linhasDoModelo();
      baixarArquivo('modelo-importacao-fl.csv', gerarCsv(cab.map((c, i) => ({ titulo: c, valor: (l) => l[i] })), linhas));
    },
    ler: async () => {
      const arquivo = $('[name="arquivo"]', ctx.raiz).files[0];
      const previa = $('[data-papel="previa"]', ctx.raiz);
      if (!arquivo) return avisar('Escolha o arquivo.', 'erro');
      if (arquivo.size > LIMITE) return avisar('Arquivo maior que 15 MB.', 'erro');
      try {
        lida = await lerArquivo(arquivo);
        const comErro = lida.linhas.filter((l) => l.mensagens.length).length;
        desenhar(previa, html`
          <p><strong>${lida.linhas.length} linhas</strong> lidas (${lida.linhas.filter((l) => l.tipo === 'parcela').length} parcelas,
            ${lida.linhas.filter((l) => l.tipo === 'despesa').length} despesas)${lida.ignoradas ? `, ${lida.ignoradas} de total ignoradas` : ''}.
            ${comErro ? html`<span class="perigo">${comErro} com problema de leitura.</span>` : ''}
            ${lida.formulasSemValor ? html`<span class="perigo">${lida.formulasSemValor} célula(s) com fórmula sem resultado guardado — abra e salve no Excel antes.</span>` : ''}</p>
          <p><button type="button" class="botao botao--primario" data-acao="enviar" ${lida.linhas.length && !lida.formulasSemValor ? '' : 'disabled'}>Enviar para conferência</button></p>`);
      } catch (erro) {
        lida = null;
        desenhar(previa, html`<p class="nota nota--perigo">${erro.message}</p>`);
      }
    },
    enviar: async (botao) => {
      if (!lida || lida.formulasSemValor) return;
      botao.disabled = true;
      try {
        const id = await db.rpc('registrar_importacao', {
          p: { nome_arquivo: lida.nome, sha256: lida.sha256, versao_parser: VERSAO_PARSER, linhas: lida.linhas },
        });
        avisar('Linhas na área de conferência.');
        navegar('/financeiro/importacao', { id });
      } catch (erro) {
        botao.disabled = false;
        avisarErro(erro);
      }
    },
  });
}

async function lerArquivo(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const sha256 = await hashDoArquivo(bytes);
  let abas;
  let formulasSemValor = 0;
  if (/\.xlsx$/i.test(arquivo.name)) {
    const r = await lerXlsx(bytes);
    abas = r.abas;
    formulasSemValor = r.formulasSemValor;
  } else if (/\.csv$/i.test(arquivo.name) || arquivo.type === 'text/csv') {
    // Excel brasileiro salva CSV em Windows-1252; tenta UTF-8 primeiro.
    let texto = new TextDecoder('utf-8').decode(bytes);
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(bytes);
    abas = [{ nome: '', linhas: lerCsv(texto) }];
  } else {
    throw new Error('Envie um arquivo .xlsx ou .csv. Planilhas .xls antigas: abra no Excel e salve como .xlsx.');
  }
  const linhas = [];
  let ignoradas = 0;
  for (const aba of abas) {
    const r = normalizarPlanilha(aba.linhas, aba.nome);
    linhas.push(...r.linhas);
    ignoradas += r.ignoradas;
  }
  if (linhas.length > 20000) throw new Error('Mais de 20.000 linhas: divida o arquivo.');
  return { nome: arquivo.name, sha256, linhas, ignoradas, formulasSemValor };
}

// ---------------------------------------------------------------------------
// Uma importação: conferência linha a linha
// ---------------------------------------------------------------------------

async function detalhe(ctx) {
  const id = ctx.consulta.id;
  let filtro = ctx.consulta.estado ?? 'problemas';
  let imp;
  let linhas = [];

  const carregar = async () => {
    [imp, linhas] = await Promise.all([
      db.um('importacoes', { select: '*', filtros: [['id', 'eq', id]] }),
      db.todos('importacao_linhas', { select: '*', filtros: [['importacao_id', 'eq', id]], ordem: 'aba.asc,linha.asc,id.asc' }),
    ]);
    if (!ctx.ativa()) return;
    if (!imp) {
      desenhar(ctx.raiz, html`<a class="pagina__voltar" href="#/financeiro/importacao">← Importações</a>${cabecalho('Importação não encontrada')}`);
      return;
    }
    desenhar(ctx.raiz, tela());
    $('[name="estado"]', ctx.raiz)?.addEventListener('change', (e) => {
      filtro = e.target.value;
      desenhar($('[data-papel="linhas"]', ctx.raiz), tabelaLinhas());
    });
  };

  const visiveis = () => linhas.filter((l) => (filtro === 'todas' ? true : filtro === 'problemas' ? ['erro', 'aviso'].includes(l.estado) : l.estado === filtro));

  const tabelaLinhas = () => {
    const v = visiveis();
    const aberta = ['rascunho', 'validada'].includes(imp.estado);
    return v.length ? html`
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Linha</th><th>Tipo</th><th>Dados</th><th class="num">Valor</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${v.slice(0, 1000).map((l) => html`
            <tr class="${l.estado === 'excluida' ? 'apagada' : ''}">
              <td class="num">${l.aba ? `${l.aba} · ` : ''}${l.linha}</td>
              <td>${l.tipo === 'parcela' ? 'Parcela' : 'Despesa'}</td>
              <td>${l.tipo === 'parcela'
                ? html`${l.normalizado.cliente_nome ?? '—'}<span class="sub">${[l.normalizado.codigo, l.normalizado.descricao, l.normalizado.parcela != null ? `parcela ${l.normalizado.parcela}` : null, l.normalizado.vencimento].filter(Boolean).join(' · ')}</span>`
                : html`${l.normalizado.descricao ?? '—'}<span class="sub">${[l.normalizado.categoria, l.normalizado.vencimento].filter(Boolean).join(' · ')}</span>`}
                ${l.mensagens.map((m) => html`<span class="sub ${m.nivel === 'erro' ? 'perigo' : ''}">${m.texto}</span>`)}
                ${l.motivo_exclusao ? html`<span class="sub">Excluída: ${l.motivo_exclusao}</span>` : ''}</td>
              <td class="num">${l.normalizado.valor != null ? moeda(Math.round(l.normalizado.valor * 100)) : '—'}${l.normalizado.valor_pago ? html`<span class="sub">pago ${moeda(Math.round(l.normalizado.valor_pago * 100))}</span>` : ''}</td>
              <td>${selo(ESTADOS_LINHA[l.estado] ?? [l.estado, ''])}</td>
              <td class="acoes">${aberta && l.estado !== 'excluida' && pode.lancar() ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="excluir" data-id="${l.id}">Excluir da carga</button>` : ''}</td>
            </tr>`)}</tbody>
        </table>
      </div>
      ${v.length > 1000 ? html`<p class="painel__rodape sub">Mostrando 1.000 de ${v.length}.</p>` : ''}` : vazio('Nenhuma linha neste filtro.');
  };

  const tela = () => {
    const t = imp.totais ?? {};
    const aberta = ['rascunho', 'validada'].includes(imp.estado);
    const c = t.carregados;
    return html`
      <a class="pagina__voltar" href="#/financeiro/importacao">← Importações</a>
      ${cabecalho(imp.nome_arquivo, html`Enviada em ${dataHora(imp.criado_em)} por ${nomeDe(imp.criado_por)} · ${selo(ESTADOS[imp.estado] ?? [imp.estado, ''])}`, html`
        ${aberta && pode.lancar() ? html`<button type="button" class="botao" data-acao="validar">Conferir de novo</button>` : ''}
        ${aberta && pode.lancar() ? html`<button type="button" class="botao botao--discreto" data-acao="cancelar">Cancelar importação</button>` : ''}
        ${imp.estado === 'validada' && pode.ajustar() ? html`<button type="button" class="botao botao--primario" data-acao="carregar">Carregar no sistema</button>` : ''}`)}
      ${imp.estado === 'validada' && !pode.ajustar() ? html`<p class="nota">Pronta. Quem tem o Financeiro completo carrega.</p>` : ''}
      ${imp.estado === 'carregada' && c ? html`<p class="nota nota--info">Carregada em ${dataHora(imp.carregada_em)} por ${nomeDe(imp.carregada_por)}:
        ${c.contratos} contrato(s), ${c.recebimentos} recebimento(s), ${c.despesas} despesa(s) e ${c.pagamentos} pagamento(s).</p>` : ''}
      <div class="indicadores indicadores--4">
        ${indicador('Linhas', String(t.linhas ?? 0), `${t.contratos ?? 0} contrato(s) · ${t.despesas ?? 0} despesa(s)`)}
        ${indicador('Com erro', String(t.erros ?? 0), 'impedem a carga', { tom: t.erros ? 'perigo' : '' })}
        ${indicador('Com aviso', String(t.avisos ?? 0), 'conferir; não impedem')}
        ${indicador('Excluídas', String(t.excluidas ?? 0), 'ficam fora, com motivo')}
        ${indicador('Parcelas', moeda(Math.round((t.valor_parcelas ?? 0) * 100)), `já recebido ${moeda(Math.round((t.valor_recebido ?? 0) * 100))}`)}
        ${indicador('Despesas', moeda(Math.round((t.valor_despesas ?? 0) * 100)), '')}
      </div>
      <section class="painel">
        <header class="painel__topo">
          <h2 class="painel__titulo">Linhas</h2>
          <label class="campo"><span class="sr-only">Mostrar</span><select name="estado">${opcoes([['problemas', 'Com erro ou aviso'], ['erro', 'Só erros'], ['ok', 'OK'], ['excluida', 'Excluídas'], ['todas', 'Todas']], filtro)}</select></label>
        </header>
        <div data-papel="linhas">${tabelaLinhas()}</div>
      </section>
      <p class="sub secao">Arquivo: SHA-256 ${imp.sha256.slice(0, 16)}… · leitura ${imp.versao_parser}</p>`;
  };

  await carregar();
  return aoClicar(ctx.raiz, {
    validar: async () => {
      try {
        await db.rpc('validar_importacao', { p_id: id });
        await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
    excluir: async (el) => {
      const motivo = await pedirMotivo({ titulo: 'Excluir linha da carga', texto: 'A linha continua registrada, marcada como excluída, com o motivo.', rotuloOk: 'Excluir da carga', rotulo: 'Motivo (ex.: registro de teste, linha repetida)' });
      if (!motivo) return;
      try {
        await db.rpc('excluir_linha_importacao', { p_linha: el.dataset.id, p_motivo: motivo });
        await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
    cancelar: async () => {
      const motivo = await pedirMotivo({ titulo: 'Cancelar importação', rotuloOk: 'Cancelar importação' });
      if (!motivo) return;
      try {
        await db.alterar('importacoes', [['id', 'eq', id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id');
        await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
    carregar: async () => {
      const t = imp.totais;
      const ok = await abrirDialogo({
        titulo: 'Carregar no sistema',
        rotuloOk: 'Carregar',
        corpo: html`<p class="dialogo__texto">Vão entrar ${t.contratos} contrato(s) com ${moeda(Math.round(t.valor_parcelas * 100))} em parcelas
          (${moeda(Math.round(t.valor_recebido * 100))} já recebidos) e ${t.despesas} despesa(s). Tudo numa operação só: se algo falhar, nada entra.
          Depois, a correção é feita pelos caminhos normais (estorno, cancelamento, renegociação) — não há "desfazer importação".</p>`,
        aoEnviar: async () => db.rpc('carregar_importacao', { p_id: id }),
      });
      if (ok) {
        avisar('Importação carregada.');
        await carregar();
      }
    },
  });
}
