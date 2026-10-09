// Central de alertas do Financeiro (DOCX §12, preparação T12).
// ============================================================
//
// Duas listas:
//   · PENDÊNCIAS — calculadas na hora: parcelas e despesas vencendo ou
//     vencidas, despesa sem valor, plano de contrato que não fecha, vigência
//     terminando, formalização a confirmar, envio de anexo pela metade, mês
//     passado sem fechamento. Somem sozinhas quando se resolvem.
//   · EVENTOS — o que aconteceu e merece ser visto: fechou/reabriu mês ou
//     ano, estorno, mudança de acesso, mudança de configuração. Cada pessoa
//     marca como lido, resolvido ou silenciado até uma data — só para si.
//
// Nada daqui é enviado por e-mail ou WhatsApp: a central avisa, não envia.

import { avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { centavos, data, dataHora, hoje, moeda, somarDias } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, indicador, opcoes, plural, vazio } from '../comum.js';

const GRUPOS = {
  parcela_vencida: 'Parcelas vencidas',
  parcela_a_vencer: 'Parcelas vencendo',
  despesa_vencida: 'Despesas vencidas',
  despesa_a_vencer: 'Despesas vencendo',
  despesa_sem_valor: 'Despesas sem valor',
  plano_divergente: 'Parcelas que não fecham com o contrato',
  contrato_terminando: 'Contratos com vigência terminando',
  mes_aberto: 'Meses passados sem fechamento',
  formalizacao_a_confirmar: 'Contratos com data de formalização a confirmar',
  anexo_pendente: 'Envios de anexo não concluídos',
};
const ESTADOS = [['abertos', 'Novos e lidos'], ['novo', 'Só os novos'], ['resolvido', 'Resolvidos'], ['silenciado', 'Silenciados'], ['todos', 'Todos']];

export default async function telaAlertas(ctx) {
  const f = {
    dias: [3, 7, 15, 30].includes(Number(ctx.consulta.dias)) ? Number(ctx.consulta.dias) : 7,
    estado: ESTADOS.some(([v]) => v === ctx.consulta.estado) ? ctx.consulta.estado : 'abertos',
  };
  let eventos = [];

  const carregar = async () => {
    const [pendencias, lista] = await Promise.all([
      db.rpc('pendencias_financeiras', { p_dias: f.dias }),
      db.listar('v_alertas', { select: '*', ordem: 'criado_em.desc,id.asc', limite: 200 }),
    ]);
    if (!ctx.ativa()) return;
    eventos = lista;
    desenhar(ctx.raiz, tela(pendencias, eventos, f));
    $('form.filtros', ctx.raiz).addEventListener('change', (e) => {
      f[e.target.name] = e.target.name === 'dias' ? Number(e.target.value) : e.target.value;
      guardarConsulta(f);
      carregar().catch(avisarErro);
    });
  };
  await carregar();

  const marcar = async (id, acao, ate = null) => {
    await db.rpc('marcar_alerta', { p_evento: id, p_acao: acao, p_ate: ate });
    await carregar();
  };

  return aoClicar(ctx.raiz, {
    lido: (el) => marcar(el.dataset.id, 'lido').catch(avisarErro),
    resolvido: (el) => marcar(el.dataset.id, 'resolvido').catch(avisarErro),
    reabrir: (el) => marcar(el.dataset.id, 'reabrir').catch(avisarErro),
    silenciar: async (el) => {
      const ate = await abrirDialogo({
        titulo: 'Silenciar alerta',
        rotuloOk: 'Silenciar',
        corpo: html`<label class="campo"><span>Até</span><input type="date" name="ate" value="${somarDias(hoje(), 7)}" min="${hoje()}" required autofocus></label>`,
        aoEnviar: async ({ ate: d }) => d,
      });
      if (ate) await marcar(el.dataset.id, 'silenciar', ate).catch(avisarErro);
    },
    'todos-lidos': async () => {
      try {
        for (const e of eventos.filter((x) => x.estado === 'novo')) await db.rpc('marcar_alerta', { p_evento: e.id, p_acao: 'lido' });
        await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
}

function tela(pendencias, eventos, f) {
  const porTipo = new Map();
  for (const p of pendencias) porTipo.set(p.tipo, [...(porTipo.get(p.tipo) ?? []), p]);
  const soma = (tipo) => (porTipo.get(tipo) ?? []).reduce((s, p) => s + centavos(p.valor ?? 0), 0);
  const visiveis = eventos.filter((e) => (f.estado === 'todos' ? true
    : f.estado === 'abertos' ? ['novo', 'lido'].includes(e.estado) : e.estado === f.estado));
  const novos = eventos.filter((e) => e.estado === 'novo').length;

  return html`
    ${cabecalho('Alertas do Financeiro', 'O que pede atenção — calculado agora e registrado', html`
      ${novos ? html`<button type="button" class="botao" data-acao="todos-lidos">Marcar ${plural(novos, 'novo como lido', 'novos como lidos')}</button>` : ''}`)}
    <form class="filtros">
      <label class="campo"><span>Vencendo nos próximos</span><select name="dias">${opcoes([[3, '3 dias'], [7, '7 dias'], [15, '15 dias'], [30, '30 dias']], f.dias)}</select></label>
      <label class="campo"><span>Eventos</span><select name="estado">${opcoes(ESTADOS, f.estado)}</select></label>
    </form>

    <div class="indicadores indicadores--4">
      ${indicador('Parcelas vencidas', moeda(soma('parcela_vencida')), plural(porTipo.get('parcela_vencida')?.length ?? 0, 'parcela', 'parcelas'),
        { tom: porTipo.has('parcela_vencida') ? 'perigo' : '', href: '#/financeiro/atraso' })}
      ${indicador(`Vencendo em ${f.dias} dias`, moeda(soma('parcela_a_vencer')), plural(porTipo.get('parcela_a_vencer')?.length ?? 0, 'parcela', 'parcelas'),
        { href: `#/financeiro/recebiveis?situacao=a_vencer&de=${hoje()}&ate=${somarDias(hoje(), f.dias)}` })}
      ${indicador('Despesas a pagar', moeda(soma('despesa_vencida') + soma('despesa_a_vencer')),
        `${porTipo.get('despesa_vencida')?.length ?? 0} vencida(s) · ${porTipo.get('despesa_sem_valor')?.length ?? 0} sem valor`,
        { tom: porTipo.has('despesa_vencida') ? 'perigo' : '', href: '#/financeiro/contas' })}
      ${indicador('Eventos novos', String(novos), 'fechamentos, estornos, acessos', { tom: novos ? 'alerta' : '' })}
    </div>

    <section class="painel">
      <header class="painel__topo"><h2 class="painel__titulo">Pendências</h2></header>
      ${pendencias.length ? html`
        <div class="painel__corpo alertas-grupos">
          ${Object.entries(GRUPOS).filter(([tipo]) => porTipo.has(tipo)).map(([tipo, titulo]) => html`
            <details ${['parcela_vencida', 'plano_divergente', 'mes_aberto', 'despesa_vencida'].includes(tipo) ? 'open' : ''}>
              <summary><strong>${titulo}</strong> · ${porTipo.get(tipo).length}${soma(tipo) ? ` · ${moeda(soma(tipo))}` : ''}</summary>
              <ul class="lista">${porTipo.get(tipo).map((p) => html`
                <li>${p.link ? html`<a class="lista__item" href="${p.link}">${conteudo(p)}</a>` : html`<div class="lista__item">${conteudo(p)}</div>`}</li>`)}
              </ul>
            </details>`)}
        </div>` : vazio('Nenhuma pendência. Tudo em dia.')}
    </section>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Eventos</h2></header>
      ${visiveis.length ? html`
        <ul class="lista">${visiveis.map((e) => html`
          <li class="lista__item ${e.estado === 'novo' ? 'lista__item--novo' : ''}">
            <span><span class="selo selo--${e.gravidade === 'perigo' ? 'perigo' : e.gravidade === 'alerta' ? 'alerta' : 'escuro'}">${({ novo: 'Novo', lido: 'Lido', resolvido: 'Resolvido', silenciado: 'Silenciado' })[e.estado]}</span>
              ${e.link ? html`<a href="${e.link}">${e.titulo}</a>` : e.titulo}
              <span class="sub">${dataHora(e.criado_em)}${e.detalhe ? ` · ${e.detalhe}` : ''}${e.silenciado_ate && e.estado === 'silenciado' ? ` · até ${data(e.silenciado_ate)}` : ''}</span></span>
            <span class="grupo-botoes">
              ${e.estado === 'novo' ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="lido" data-id="${e.id}">Lido</button>` : ''}
              ${['novo', 'lido'].includes(e.estado) ? html`
                <button type="button" class="botao botao--pequeno botao--discreto" data-acao="resolvido" data-id="${e.id}">Resolvido</button>
                <button type="button" class="botao botao--pequeno botao--discreto" data-acao="silenciar" data-id="${e.id}">Silenciar</button>`
                : html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="reabrir" data-id="${e.id}">Reabrir</button>`}
            </span>
          </li>`)}</ul>` : vazio('Nenhum evento neste filtro.')}
      <p class="painel__rodape sub">Lido, resolvido e silenciado valem só para você. Ninguém recebe aqui o que o próprio acesso não deixa ver.</p>
    </section>`;
}

const conteudo = (p) => html`
  <span>${p.titulo}<span class="sub">${p.detalhe ?? ''}</span></span>
  <span class="num">${p.valor != null ? moeda(centavos(p.valor)) : ''}${p.data ? html`<span class="sub">${data(p.data)}</span>` : ''}</span>`;
