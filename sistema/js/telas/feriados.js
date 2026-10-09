// Feriados e prazos (F5 §9.3 e F6 §10.7).
// =======================================
//
// O que a contagem automática de prazos considera dia não útil:
//   · os nove feriados nacionais fixos em lei — entram sozinhos;
//   · as datas móveis (Carnaval, Sexta-feira Santa, Corpus Christi) — o
//     sistema SUGERE a cada ano e alguém confere e cadastra;
//   · os feriados e suspensões cadastrados aqui: tribunal vazio vale para
//     todos e aparece na Agenda; com tribunal (TJPR, TRT9…), só para os
//     processos daquele tribunal.
//
// Na dúvida, o dia é útil: um feriado esquecido faz o sistema sugerir um
// prazo MAIS CURTO que o real — o erro seguro.
//
// Aqui também ficam as regras da busca no DJEN e da data de entrega.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { data, hoje } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { feriadosNacionaisFixos, sugestoesDoAno } from '../dominio/feriados.js';
import { cabecalho, opcoes, vazio } from './comum.js';
import { abrirHistorico } from './historico.js';

const COLUNAS = 'id,data,nome,tribunal,tipo,ativo,criado_em,criado_por,alterado_em,alterado_por';
const TIPOS = [['feriado', 'Feriado'], ['suspensao', 'Suspensão de prazos']];
const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaDaSemana = (iso) => DIAS_DA_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

function formularioFeriado(f = null) {
  return abrirDialogo({
    titulo: f ? 'Editar feriado / suspensão' : 'Novo feriado / suspensão',
    corpo: html`
      <div class="campos">
        <label class="campo campo--6"><span>Data</span><input type="date" name="data" required value="${f?.data ?? hoje()}"></label>
        <label class="campo campo--6"><span>Tipo</span><select name="tipo">${opcoes(TIPOS, f?.tipo ?? 'feriado')}</select></label>
        <label class="campo"><span>Nome</span><input name="nome" required maxlength="200" value="${f?.nome ?? ''}"></label>
        <label class="campo"><span>Tribunal</span><input name="tribunal" maxlength="10" value="${f?.tribunal ?? ''}" placeholder="TJPR, TRT9, TRF4…" autocapitalize="characters">
          <span class="campo__ajuda">Vazio: vale para todos os tribunais e aparece na Agenda.</span></label>
        <label class="opcao"><input type="checkbox" name="ativo" ${f?.ativo !== false ? 'checked' : ''}> Ativo</label>
      </div>
      <p class="nota">Confira o ato oficial e o calendário do tribunal antes de cadastrar. A data passa a valer na contagem automática dos prazos.</p>`,
    aoEnviar: async (d) => {
      const tribunal = d.tribunal.toUpperCase().replace(/\s+/g, '');
      if (tribunal && !/^[A-Z0-9]{2,10}$/.test(tribunal)) throw new Error('Tribunal: use a sigla, só letras e números (ex.: TJPR, TRT9).');
      const registro = { ...d, tribunal: tribunal || null };
      try {
        if (f) await db.alterar('feriados', [['id', 'eq', f.id]], registro, 'id');
        else await db.inserir('feriados', registro, 'id');
      } catch (erro) {
        if (erro.codigo === '23505') {
          throw new Error(`Já existe um registro em ${data(d.data)} para ${tribunal || 'todos os tribunais'}. Edite o existente.`);
        }
        throw erro;
      }
      avisar(f ? 'Registro salvo.' : 'Registro cadastrado.');
      return true;
    },
  });
}

export default async function telaFeriados(ctx) {
  const ano = /^\d{4}$/.test(ctx.consulta.ano ?? '') ? ctx.consulta.ano : hoje().slice(0, 4);
  let lista = [];
  let config = null;

  const carregar = async () => {
    [lista, config] = await Promise.all([
      db.todos('feriados', {
        select: COLUNAS,
        filtros: [['data', 'gte', `${ano}-01-01`], ['data', 'lte', `${ano}-12-31`]],
        ordem: 'data.asc,id.asc',
      }),
      db.um('config_prazos', { select: '*' }),
    ]);
    if (!ctx.ativa()) return;

    const nacionais = [...feriadosNacionaisFixos(Number(ano))];
    const cadastrada = (d) => lista.some((f) => f.data === d && !f.tribunal);
    const moveis = sugestoesDoAno(Number(ano));

    desenhar(ctx.raiz, html`
      ${cabecalho('Feriados e prazos', 'O que a contagem automática considera dia não útil', html`
        <button class="botao botao--primario" type="button" data-acao="novo">Novo feriado / suspensão</button>`)}
      <form class="filtros" data-papel="ano">
        <label class="campo"><span>Ano</span><input type="number" name="ano" min="1900" max="2199" value="${ano}" required></label>
        <button type="submit" class="botao">Mostrar ano</button>
      </form>
      <p class="nota">A contagem é uma <strong>sugestão</strong>: o advogado confere a data fatal antes de salvar. Recesso de 20/12 a 20/01 é considerado
        quando marcado no prazo. Feriados municipais (Paranaguá), estaduais e do tribunal só contam se cadastrados abaixo.</p>

      <div class="grade grade--2">
        <section class="painel">
          <header class="painel__topo"><h2 class="painel__titulo">Nacionais fixos de ${ano}</h2></header>
          <ul class="lista">${nacionais.map(([d, nome]) => html`
            <li class="lista__item"><span>${nome}</span><span class="num">${data(d)} <span class="sub">${diaDaSemana(d)}</span></span></li>`)}</ul>
          <p class="painel__rodape sub">Entram sozinhos na contagem — não precisa cadastrar.</p>
        </section>

        <section class="painel">
          <header class="painel__topo"><h2 class="painel__titulo">Datas móveis de ${ano} (sugestão)</h2></header>
          <form data-papel="moveis">
            <ul class="lista">${moveis.map((m) => html`
              <li class="lista__item">
                ${cadastrada(m.data)
                  ? html`<span>${m.nome}</span><span class="num">${data(m.data)} <span class="selo selo--ok">Cadastrada</span></span>`
                  : html`<label class="opcao"><input type="checkbox" name="movel" value="${m.data}|${m.nome}"> ${m.nome}</label><span class="num">${data(m.data)} <span class="sub">${diaDaSemana(m.data)}</span></span>`}
              </li>`)}</ul>
            <footer class="painel__rodape">
              <button type="submit" class="botao botao--pequeno" ${moveis.every((m) => cadastrada(m.data)) ? 'disabled' : ''}>Cadastrar as marcadas</button>
              <span class="sub">Calculadas pela Páscoa. Confira o calendário do tribunal: nem toda data móvel suspende prazo em todo lugar.</span>
            </footer>
          </form>
        </section>
      </div>

      <section class="painel secao">
        <header class="painel__topo"><h2 class="painel__titulo">Cadastrados em ${ano}</h2></header>
        ${lista.length
          ? html`
            <div class="tabela-rolagem"><table class="tabela">
              <thead><tr><th>Data</th><th>Nome</th><th>Tribunal</th><th>Tipo</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${lista.map((f) => html`
                <tr class="${f.ativo ? '' : 'apagada'}">
                  <td>${data(f.data)} <span class="sub">${diaDaSemana(f.data)}</span></td>
                  <td>${f.nome}</td>
                  <td>${f.tribunal ?? 'Todos'}</td>
                  <td>${f.tipo === 'feriado' ? 'Feriado' : 'Suspensão'}</td>
                  <td>${f.ativo ? html`<span class="selo selo--ok">Ativo</span>` : html`<span class="selo">Inativo</span>`}</td>
                  <td class="acoes">
                    <button class="botao botao--pequeno" type="button" data-acao="editar" data-id="${f.id}">Editar</button>
                    <button class="botao botao--pequeno botao--discreto" type="button" data-acao="historico" data-id="${f.id}">Histórico</button>
                  </td>
                </tr>`)}
              </tbody>
            </table></div>`
          : vazio('Nenhuma data cadastrada neste ano.')}
      </section>

      ${config ? html`
        <form class="painel secao" data-papel="config" novalidate>
          <header class="painel__topo"><h2 class="painel__titulo">Busca no DJEN e data de entrega</h2></header>
          <div class="painel__corpo campos">
            <label class="opcao campo"><input type="checkbox" name="busca_automatica" ${config.busca_automatica ? 'checked' : ''}>
              Buscar no diário automaticamente, uma vez por dia útil, quando alguém com acesso a Prazos abrir o sistema</label>
            <label class="campo campo--6"><span>Na primeira busca, olhar quantos dias para trás</span>
              <input type="number" name="dias_primeira_busca" min="1" max="31" value="${config.dias_primeira_busca}"></label>
            <label class="campo campo--6"><span>Entrega interna: dias úteis antes da data fatal</span>
              <input type="number" name="entrega_dias_uteis" min="0" max="30" value="${config.entrega_dias_uteis}">
              <span class="campo__ajuda">Sugerida no prazo; pode ser mudada em cada um.</span></label>
          </div>
          <footer class="painel__rodape"><button type="submit" class="botao botao--primario">Salvar</button></footer>
        </form>` : ''}`);

    $('[data-papel="ano"]', ctx.raiz).addEventListener('submit', (e) => {
      e.preventDefault();
      guardarConsulta({ ano: e.target.ano.value });
      ctx.recarregar();
    });

    $('[data-papel="moveis"]', ctx.raiz).addEventListener('submit', async (e) => {
      e.preventDefault();
      const marcadas = [...e.target.querySelectorAll('[name="movel"]:checked')].map((c) => c.value.split('|'));
      if (!marcadas.length) return avisar('Marque pelo menos uma data.', 'erro');
      try {
        await db.inserir('feriados', marcadas.map(([d, nome]) => ({ data: d, nome, tipo: 'feriado', tribunal: null, ativo: true })), 'id');
        avisar(`${marcadas.length} data(s) cadastrada(s).`);
        await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    });

    $('[data-papel="config"]', ctx.raiz)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const dias = Number(form.dias_primeira_busca.value);
      const entrega = Number(form.entrega_dias_uteis.value);
      if (!Number.isInteger(dias) || dias < 1 || dias > 31) return avisar('Primeira busca: de 1 a 31 dias.', 'erro');
      if (!Number.isInteger(entrega) || entrega < 0 || entrega > 30) return avisar('Entrega: de 0 a 30 dias úteis.', 'erro');
      try {
        await db.alterar('config_prazos', [['id', 'eq', config.id]], {
          busca_automatica: form.busca_automatica.checked, dias_primeira_busca: dias, entrega_dias_uteis: entrega,
        }, 'id');
        avisar('Salvo.');
        await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    });
  };

  await carregar();
  if (!ctx.ativa()) return;

  const registro = (el) => lista.find((f) => f.id === el.dataset.id);
  const depois = async (promessa) => {
    try {
      if (await promessa && ctx.ativa()) await carregar();
    } catch (erro) {
      avisarErro(erro);
    }
  };
  return aoClicar(ctx.raiz, {
    novo: () => depois(formularioFeriado()),
    editar: (el) => depois(formularioFeriado(registro(el))),
    historico: (el) => abrirHistorico({ titulo: registro(el).nome, registros: [el.dataset.id] }),
  });
}
