// Relatório de atividades para o cliente (F4): escolhe cliente, processo e
// período, confere a folha e imprime, baixa ou salva. Toda saída fica gravada
// em Documentos.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { estado } from '../../nucleo/estado.js';
import { hoje, instante, somarDias } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta, navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO } from '../../dominio/clientes.js';
import { COLUNAS_ATUALIZACAO } from '../../dominio/tempo.js';
import { ajustarFolha, baixarWord, imprimirDocumento, salvarDocumento } from '../../documentos/acoes.js';
import { montarRelatorio } from '../../documentos/relatorio.js';
import { cabecalho, opcoes } from '../comum.js';

const diaValido = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');

export default async function telaRelatorio(ctx) {
  const f = {
    cliente: ctx.consulta.cliente || '',
    processo: ctx.consulta.processo || '',
    de: diaValido(ctx.consulta.de) ? ctx.consulta.de : somarDias(hoje(), -29),
    ate: diaValido(ctx.consulta.ate) ? ctx.consulta.ate : hoje(),
  };

  const [clientes, processos] = await Promise.all([
    db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
    db.todos('processos', { select: COLUNAS_PROCESSO }),
  ]);
  if (!ctx.ativa()) return;

  desenhar(ctx.raiz, html`
    ${cabecalho('Relatório de atividades', 'Confira a folha antes de entregar ao cliente', html`
      <a class="botao" href="#/atualizacoes">Atualizações</a>`)}
    <form class="filtros">
      <label class="campo"><span>Cliente</span><select name="cliente" required>${opcoes(clientes.map((c) => [c.id, c.nome]), f.cliente, { vazio: 'Escolha o cliente' })}</select></label>
      <label class="campo"><span>Processo / caso</span><select name="processo"></select></label>
      <label class="campo"><span>De</span><input type="date" name="de" value="${f.de}" required></label>
      <label class="campo"><span>Até</span><input type="date" name="ate" value="${f.ate}" required></label>
      <label class="opcao"><input type="checkbox" name="incluir_relato"> Incluir relatos internos no documento</label>
    </form>
    <div class="registro-acoes">
      <button class="botao botao--primario" data-acao="imprimir" type="button">Imprimir</button>
      <button class="botao" data-acao="word" type="button">Baixar para o Word</button>
      <button class="botao" data-acao="salvar" type="button">Salvar sem imprimir</button>
    </div>
    <div class="documento-visualizacao secao"><article class="documento-folha" aria-label="Relatório de atividades"></article></div>`);

  const form = $('form', ctx.raiz);
  const folha = $('.documento-folha', ctx.raiz);
  const desligarFolha = ajustarFolha($('.documento-visualizacao', ctx.raiz));
  let atividades = [];
  let pedido = 0;
  let ocupado = false;
  let incluirRelato = false;

  const processosDoCliente = () => desenhar(form.elements.processo, opcoes(
    processos.filter((p) => p.cliente_id === f.cliente).map((p) => [p.id, p.titulo]), f.processo, { vazio: 'Todos os processos' }));
  const periodoValido = () => form.checkValidity() && f.ate >= f.de;

  const mostrar = () => desenhar(folha, montarRelatorio({
    cliente: clientes.find((c) => c.id === f.cliente),
    atividades,
    processos,
    membros: estado.membros,
    de: f.de,
    ate: f.ate,
    dia: hoje(),
    incluirRelato,
  }));

  const carregar = async () => {
    const este = ++pedido;
    processosDoCliente();
    guardarConsulta(f);
    if (!f.cliente) {
      folha.textContent = 'Escolha o cliente para gerar o relatório.';
      return;
    }
    if (!periodoValido()) {
      folha.textContent = 'Confira as datas do período.';
      return;
    }
    const lista = await db.todos('atualizacoes', {
      select: COLUNAS_ATUALIZACAO,
      filtros: [['cliente_id', 'eq', f.cliente], ['inicio', 'gte', instante(f.de)], ['inicio', 'lt', instante(somarDias(f.ate, 1))]],
      ordem: 'inicio.asc,id.asc',
    });
    if (este !== pedido || !ctx.ativa()) return;
    atividades = lista.filter((a) => !f.processo || a.processo_id === f.processo);
    mostrar();
  };

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', async (e) => {
    if (ocupado) return;
    try {
      if (e.target.name === 'incluir_relato') {
        incluirRelato = e.target.checked;
        if (f.cliente && periodoValido()) mostrar();
        return;
      }
      Object.assign(f, {
        cliente: form.elements.cliente.value,
        processo: form.elements.processo.value,
        de: form.elements.de.value,
        ate: form.elements.ate.value,
      });
      if (e.target.name === 'cliente') f.processo = '';
      await carregar();
    } catch (erro) {
      avisarErro(erro);
    }
  });
  await carregar();

  const executar = async (acao) => {
    if (ocupado) return;
    if (!form.reportValidity() || f.ate < f.de || !f.cliente) return;
    ocupado = true;
    try {
      // Relê o banco antes de gravar: o papel sai com o que existe agora.
      await carregar();
      if (!ctx.ativa()) return;
      const salvo = await salvarDocumento({
        modelo: 'relatorio_atividades',
        titulo: 'Relatório de Atividades',
        cliente_id: f.cliente,
        processo_id: f.processo || null,
        dados: { de: f.de, ate: f.ate, incluir_relato: incluirRelato, acao },
        conteudo: folha.innerHTML,
      });
      if (acao === 'imprimir') imprimirDocumento(folha);
      else if (acao === 'word') baixarWord(folha, 'Relatório de atividades');
      avisar('Relatório registrado.');
      navegar(`/documentos/${salvo.id}`);
    } catch (erro) {
      avisarErro(erro);
    } finally {
      ocupado = false;
    }
  };

  const desligar = aoClicar(ctx.raiz, {
    salvar: () => executar('salvar'),
    imprimir: () => executar('imprimir'),
    word: () => executar('word'),
  });
  return () => {
    desligar();
    desligarFolha();
  };
}
