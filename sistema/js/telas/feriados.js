// Feriados e suspensões cadastrados pela equipe (F5, parte manual). Os de
// tribunal vazio valem para todos e aparecem na Agenda. Os nacionais ainda não
// são calculados: cada data entra à mão, conferida no ato oficial.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { data, hoje } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { cabecalho, opcoes, vazio } from './comum.js';
import { abrirHistorico } from './historico.js';

const COLUNAS = 'id,data,nome,tribunal,tipo,ativo,criado_em,criado_por,alterado_em,alterado_por';
const TIPOS = [['feriado', 'Feriado'], ['suspensao', 'Suspensão de prazos']];

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
      <p class="nota">Confira o ato oficial e o calendário do tribunal antes de cadastrar. A integração com a contagem automática ainda está pendente.</p>`,
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

  const carregar = async () => {
    lista = await db.todos('feriados', {
      select: COLUNAS,
      filtros: [['data', 'gte', `${ano}-01-01`], ['data', 'lte', `${ano}-12-31`]],
      ordem: 'data.asc,id.asc',
    });
    if (!ctx.ativa()) return;

    desenhar(ctx.raiz, html`
      ${cabecalho('Feriados', 'Cadastro de feriados e suspensões por tribunal', html`
        <button class="botao botao--primario" type="button" data-acao="novo">Novo feriado / suspensão</button>`)}
      <form class="filtros">
        <label class="campo"><span>Ano</span><input type="number" name="ano" min="1900" max="2199" value="${ano}" required></label>
        <button type="submit" class="botao">Mostrar ano</button>
      </form>
      <p class="nota">Lista de datas cadastradas pela equipe. Feriados nacionais calculados e sugestões de datas móveis ainda não foram implementados.</p>
      <section class="painel">
        ${lista.length
          ? html`
            <div class="tabela-rolagem"><table class="tabela">
              <thead><tr><th>Data</th><th>Nome</th><th>Tribunal</th><th>Tipo</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${lista.map((f) => html`
                <tr class="${f.ativo ? '' : 'apagada'}">
                  <td>${data(f.data)}</td>
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
      </section>`);

    $('form', ctx.raiz).addEventListener('submit', (e) => {
      e.preventDefault();
      guardarConsulta({ ano: e.target.ano.value });
      ctx.recarregar();
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
