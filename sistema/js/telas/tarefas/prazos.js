// Prazos (F5): o resumo filtrável — hoje, semana, mês, ano — que o Vinícius
// pediu (CLAUDE.md §4: "não é agenda"), com impressão. As datas são as
// informadas e conferidas pelo advogado; a contagem automática dá uma sugestão.

import { avisarErro } from '../../nucleo/avisos.js';
import { estado, membrosAtivos } from '../../nucleo/estado.js';
import { data, hoje, inicioDaSemana, somarDias } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { alertaTarefa, COLUNAS_TAREFA, diaDaTarefa, filtrarTarefas, periodoPrazos } from '../../dominio/tarefas.js';
import { cabecalho, cabecalhoImpressao, indicador, opcoes } from '../comum.js';
import { formularioTarefa } from './formulario.js';
import { ligarAcoesTarefas, SITUACOES_FILTRO, tabelaTarefas } from './lista.js';

const PERIODOS = [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['todos', 'Todos abertos']];
const diaValido = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');

function indicadores(lista) {
  const abertas = lista.filter((t) => !t.cancelado_em && t.situacao !== 'concluida');
  const dia = hoje();
  const de = inicioDaSemana(dia);
  const ate = somarDias(de, 6);
  const atrasados = abertas.filter((t) => ['vencida', 'atrasada'].includes(alertaTarefa(t))).length;
  return html`
    <div class="indicadores">
      ${indicador('Vencem hoje', abertas.filter((t) => diaDaTarefa(t) === dia).length)}
      ${indicador('Nesta semana', abertas.filter((t) => { const d = diaDaTarefa(t); return d && d >= de && d <= ate; }).length)}
      ${indicador('Atrasados', atrasados, '', { tom: atrasados ? 'perigo' : '' })}
    </div>`;
}

export default async function telaPrazos(ctx) {
  const c = ctx.consulta;
  const aba = PERIODOS.some(([v]) => v === c.aba) ? c.aba : 'semana';
  const periodo = periodoPrazos(aba);
  const f = {
    aba,
    de: diaValido(c.de) ? c.de : periodo.de,
    ate: diaValido(c.ate) ? c.ate : periodo.ate,
    responsavel: c.responsavel ?? '',
    situacao: SITUACOES_FILTRO.some(([v]) => v === c.situacao) ? c.situacao : 'abertas',
    soPrazos: c.soPrazos === 'true',
  };
  let lista = [];
  let limparAcoes = () => {};

  const carregar = async () => {
    lista = await db.todos('v_tarefas', { select: COLUNAS_TAREFA, ordem: 'criado_em.desc,id.desc' });
    if (!ctx.ativa()) return;

    desenhar(ctx.raiz, html`
      ${cabecalho('Prazos', 'Datas fatais e entregas internas; a contagem jurídica exige conferência', html`
        <button class="botao botao--primario" type="button" data-acao="novo">Nova tarefa / prazo</button>
        <button class="botao" type="button" data-acao="imprimir">Imprimir</button>`)}
      ${cabecalhoImpressao()}
      ${indicadores(lista)}
      <form class="filtros nao-imprimir">
        <label class="campo"><span>Período</span><select name="aba">${opcoes(PERIODOS, f.aba)}</select></label>
        <label class="campo"><span>De</span><input name="de" type="date" value="${f.de}"></label>
        <label class="campo"><span>Até</span><input name="ate" type="date" value="${f.ate}"></label>
        <label class="campo"><span>Responsável</span><select name="responsavel">${opcoes(membrosAtivos().map((m) => [m.id, m.nome_curto]), f.responsavel, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes(SITUACOES_FILTRO, f.situacao)}</select></label>
        <label class="opcao"><input type="checkbox" name="soPrazos" ${f.soPrazos ? 'checked' : ''}> Só prazos processuais</label>
      </form>
      <p class="so-impressao" data-filtros-impressao></p>
    <p class="nota">As datas são conferidas pelo advogado. Ao criar ou editar um prazo, a contagem automática sugere a data fatal e mostra a memória de cálculo.</p>
      <section class="painel" data-lista></section>`);

    const form = $('form.filtros', ctx.raiz);
    const mostrar = () => {
      // No papel, o que foi filtrado — quem lê a folha impressa precisa saber.
      $('[data-filtros-impressao]', ctx.raiz).textContent = [
        `Período: ${data(f.de) || 'sem início'} a ${data(f.ate) || 'sem fim'}`,
        `Responsável: ${form.responsavel.selectedOptions[0]?.textContent ?? 'Todos'}`,
        `Situação: ${form.situacao.selectedOptions[0]?.textContent ?? ''}`,
        ...(f.soPrazos ? ['Só prazos processuais'] : []),
      ].join(' · ');
      desenhar($('[data-lista]', ctx.raiz), f.de && f.ate && f.ate < f.de
        ? html`<p class="nota">A data final precisa ser igual ou depois da inicial.</p>`
        : tabelaTarefas(filtrarTarefas(lista, f, estado.membro.id), { resumo: true }));
    };

    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', (e) => {
      if (e.target.name === 'aba') {
        const p = periodoPrazos(form.aba.value);
        form.de.value = p.de;
        form.ate.value = p.ate;
      }
      Object.assign(f, Object.fromEntries(new FormData(form)), { soPrazos: form.soPrazos.checked });
      guardarConsulta(f);
      mostrar();
    });
    mostrar();

    limparAcoes();
    limparAcoes = ligarAcoesTarefas(ctx.raiz, lista, carregar);
  };

  await carregar();
  if (!ctx.ativa()) return;

  // Imprimir abre as descrições recolhidas, e fecha de novo depois.
  let fecharDescricoes = () => {};
  const limpar = aoClicar(ctx.raiz, {
    imprimir: () => {
      fecharDescricoes();
      const fechadas = [...ctx.raiz.querySelectorAll('details:not([open])')];
      fechadas.forEach((d) => { d.open = true; });
      const restaurar = () => {
        fechadas.forEach((d) => { d.open = false; });
        removeEventListener('afterprint', restaurar);
      };
      fecharDescricoes = restaurar;
      addEventListener('afterprint', restaurar, { once: true });
      print();
    },
    novo: async () => {
      try {
        if (await formularioTarefa() && ctx.ativa()) await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
  return () => {
    limpar();
    limparAcoes();
    fecharDescricoes();
  };
}
