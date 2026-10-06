// Área dos advogados — FHL Advocacia.
// ===================================
//
// Ponto de entrada. Decide entre três telas: a de entrada (sem sessão), a de
// acesso não liberado (logado, mas o e-mail não é de nenhum membro ativo) e o
// sistema, com o menu que as permissões do membro permitem.

import { carregarMembros, estado, iniciais, PAPEIS, pode } from './nucleo/estado.js';
import { $, $$, aoClicar, desenhar, html } from './nucleo/html.js';
import { resolver, rota } from './nucleo/rotas.js';
import { aoMudarSessao, db, emailDaSessao, sair, sessaoAtual, sessaoDoLink } from './nucleo/supabase.js';
import { atualizarAvisos, mudaContadores } from './nucleo/avisos-do-dia.js';
import { ligarCronometro } from './telas/atualizacoes/cronometro.js';
import { ligarValidacaoFormularios } from './nucleo/formularios.js';

ligarValidacaoFormularios();

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Rotas — cada tela é um módulo, carregado só quando alguém a abre
// ---------------------------------------------------------------------------

const doFinanceiro = { permitido: pode.financeiro };

rota('/inicio', () => import('./telas/inicio.js'), { titulo: 'Hoje' });
rota('/agenda', () => import('./telas/agenda.js'), { titulo: 'Agenda', permitido: pode.agenda });
rota('/contatos', () => import('./telas/contatos.js'), { titulo: 'Contatos', permitido: pode.clientes });
rota('/clientes', () => import('./telas/clientes/lista.js'), { titulo: 'Clientes', permitido: pode.clientes });
rota('/clientes/:id', () => import('./telas/clientes/cliente.js'), { titulo: 'Ficha do cliente', permitido: pode.clientes });
rota('/processos', () => import('./telas/processos.js'), { titulo: 'Processos', permitido: pode.clientes });
rota('/documentos', () => import('./telas/documentos/lista.js'), { titulo: 'Documentos', permitido: pode.clientes });
rota('/documentos/novo', () => import('./telas/documentos/novo.js'), { titulo: 'Gerar documento', permitido: pode.clientes });
rota('/documentos/:id', () => import('./telas/documentos/documento.js'), { titulo: 'Documento', permitido: pode.clientes });
rota('/atualizacoes', () => import('./telas/atualizacoes/lista.js'), { titulo: 'Atualizações', permitido: pode.clientes });
rota('/atualizacoes/relatorio', () => import('./telas/atualizacoes/relatorio.js'), { titulo: 'Relatório de atividades', permitido: pode.clientes });
rota('/tarefas', () => import('./telas/tarefas/lista.js'), { titulo: 'Tarefas' });
rota('/prazos', () => import('./telas/tarefas/prazos.js'), { titulo: 'Prazos' });
rota('/feriados', () => import('./telas/feriados.js'), { titulo: 'Feriados', permitido: pode.prazos });
rota('/intimacoes', () => import('./telas/intimacoes.js'), { titulo: 'Intimações', permitido: pode.prazos });
rota('/financeiro', () => import('./telas/financeiro/painel.js'), { titulo: 'Financeiro', ...doFinanceiro });
rota('/financeiro/recebiveis', () => import('./telas/financeiro/recebiveis.js'), { titulo: 'Recebíveis', ...doFinanceiro });
rota('/financeiro/atraso', () => import('./telas/financeiro/em-atraso.js'), { titulo: 'Em atraso', ...doFinanceiro });
rota('/financeiro/contratos', () => import('./telas/financeiro/contratos.js'), { titulo: 'Contratos', ...doFinanceiro });
rota('/financeiro/contratos/novo', () => import('./telas/financeiro/contrato-novo.js'), { titulo: 'Novo contrato', ...doFinanceiro });
rota('/financeiro/contratos/:id', () => import('./telas/financeiro/contrato.js'), { titulo: 'Contrato', ...doFinanceiro });
rota('/financeiro/contas', () => import('./telas/financeiro/contas.js'), { titulo: 'Contas do escritório', ...doFinanceiro });
rota('/financeiro/fechamento', () => import('./telas/financeiro/fechamento.js'), { titulo: 'Fechamento', permitido: pode.fechamento });
rota('/financeiro/relatorios', () => import('./telas/financeiro/relatorios.js'), { titulo: 'Relatórios', ...doFinanceiro });
rota('/financeiro/configuracoes', () => import('./telas/financeiro/configuracoes.js'), { titulo: 'Configurações do Financeiro', ...doFinanceiro });
// O site institucional é editado daqui: publicações e campanhas ficam no
// Supabase, e o build do site as lê (src/data/conteudo.mjs).
const doSite = { permitido: pode.site };

rota('/site/publicacoes', () => import('./telas/site/publicacoes.js'), { titulo: 'Publicações do site', ...doSite });
rota('/site/publicacoes/:id', () => import('./telas/site/publicacao.js'), { titulo: 'Publicação', ...doSite });
rota('/site/campanhas', () => import('./telas/site/campanhas.js'), { titulo: 'Campanhas do site', ...doSite });
rota('/site/campanhas/:id', () => import('./telas/site/campanha.js'), { titulo: 'Campanha', ...doSite });
rota('/site/publicar', () => import('./telas/site/publicar.js'), { titulo: 'Publicar o site', ...doSite });
rota('/membros', () => import('./telas/membros.js'), { titulo: 'Membros', permitido: pode.administrar });
rota('/historico', () => import('./telas/historico.js'), { titulo: 'Histórico', permitido: pode.administrar });
rota('/conta', () => import('./telas/conta.js'), { titulo: 'Minha conta' });

const MENU = [
  {
    itens: [
      { caminho: '/inicio', rotulo: 'Hoje' },
      { caminho: '/agenda', rotulo: 'Agenda', permitido: pode.agenda },
    ],
  },
  {
    titulo: 'Clientes',
    permitido: pode.clientes,
    itens: [
      { caminho: '/contatos', rotulo: 'Contatos', contagem: true },
      { caminho: '/clientes', rotulo: 'Clientes' },
      { caminho: '/processos', rotulo: 'Processos' },
      { caminho: '/atualizacoes', rotulo: 'Atualizações' },
      { caminho: '/documentos', rotulo: 'Documentos' },
    ],
  },
  {
    // Tarefas e Prazos abrem para todos: quem recebe uma tarefa precisa vê-la.
    titulo: 'Tarefas e prazos',
    itens: [
      { caminho: '/tarefas', rotulo: 'Tarefas', contagem: true },
      { caminho: '/prazos', rotulo: 'Prazos' },
      { caminho: '/intimacoes', rotulo: 'Intimações', permitido: pode.prazos, contagem: true },
      { caminho: '/feriados', rotulo: 'Feriados', permitido: pode.prazos },
    ],
  },
  {
    titulo: 'Financeiro',
    permitido: pode.financeiro,
    itens: [
      { caminho: '/financeiro', rotulo: 'Painel' },
      { caminho: '/financeiro/recebiveis', rotulo: 'Recebíveis' },
      { caminho: '/financeiro/atraso', rotulo: 'Em atraso' },
      { caminho: '/financeiro/contratos', rotulo: 'Contratos' },
      { caminho: '/financeiro/contas', rotulo: 'Contas do escritório' },
      { caminho: '/financeiro/fechamento', rotulo: 'Fechamento', permitido: pode.fechamento },
      { caminho: '/financeiro/relatorios', rotulo: 'Relatórios' },
      { caminho: '/financeiro/configuracoes', rotulo: 'Configurações' },
    ],
  },
  {
    titulo: 'Site',
    permitido: pode.site,
    itens: [
      { caminho: '/site/publicacoes', rotulo: 'Publicações' },
      { caminho: '/site/campanhas', rotulo: 'Campanhas' },
      { caminho: '/site/publicar', rotulo: 'Publicar' },
    ],
  },
  {
    titulo: 'Escritório',
    permitido: pode.administrar,
    itens: [
      { caminho: '/membros', rotulo: 'Membros' },
      { caminho: '/historico', rotulo: 'Histórico' },
    ],
  },
];

const liberado = (item) => !item.permitido || item.permitido();

const marca = () => html`
  <a class="marca" href="#/inicio">
    <img class="marca__monograma" src="/sistema/img/monograma.svg" alt="FHL" width="43" height="26">
    <span class="marca__nome">Advocacia</span>
  </a>`;

// ---------------------------------------------------------------------------
// Entrada, mensagens e casca
// ---------------------------------------------------------------------------

let saindo = false;
let desligarCronometro = () => {};

async function mostrarEntrada(opcoes) {
  ++geracao;
  limparTela?.();
  limparTela = null;
  desligarCronometro();
  estado.membro = null;
  const { default: telaEntrada } = await import('./telas/entrar.js');
  telaEntrada(app, opcoes);
}

function mostrarMensagem(titulo, texto, { tentar = false } = {}) {
  ++geracao;
  limparTela?.();
  limparTela = null;
  desligarCronometro();
  app.dataset.tela = 'mensagem';
  desenhar(app, html`
    <div class="entrada">
      <section class="entrada__marca">
        ${marca()}
        <p class="entrada__frase">Área dos advogados</p>
        <p class="entrada__rodape">Fonseca Hespanha Lisboa · Paranaguá — PR</p>
      </section>
      <section class="entrada__painel">
        <div class="entrada__form">
          <h1 class="pagina__titulo">${titulo}</h1>
          <p>${texto}</p>
          ${tentar ? html`<button type="button" class="botao botao--primario" data-acao="tentar">Tentar de novo</button>` : ''}
          <button type="button" class="botao" data-acao="sair">Sair</button>
        </div>
      </section>
    </div>`);
}

function desenharCasca() {
  desligarCronometro();
  app.dataset.tela = 'sistema';
  const m = estado.membro;

  desenhar(app, html`
    <div class="casca">
      <header class="topo-movel">
        <button type="button" class="topo-movel__menu" data-acao="menu" aria-expanded="false" aria-controls="lateral">Menu</button>
        ${marca()}
      </header>
      <aside class="lateral" id="lateral">
        ${marca()}
        <nav class="menu" aria-label="Seções">
          ${MENU.filter(liberado).map((grupo) => html`
            <div class="menu__grupo">
              ${grupo.titulo ? html`<p class="menu__titulo">${grupo.titulo}</p>` : ''}
              ${grupo.itens.filter(liberado).map((item) => html`
                <a href="#${item.caminho}" data-caminho="${item.caminho}">${item.rotulo}${item.contagem ? html`<span class="menu__contagem" hidden></span>` : ''}</a>`)}
            </div>`)}
        </nav>
        <div class="lateral__rodape">
          <p class="selo-piloto" title="Supabase e Vercel nos planos gratuitos">Piloto</p>
          <a class="usuario" href="#/conta">
            <span class="avatar" data-vars="--cor:${m.cor}" aria-hidden="true">${iniciais(m.nome)}</span>
            <span>${m.nome_curto}<small>${PAPEIS[m.papel]}</small></span>
          </a>
          <a class="lateral__site" href="/" target="_blank" rel="noopener">Ver o site</a>
          <button type="button" class="lateral__sair" data-acao="sair">Sair</button>
        </div>
      </aside>
      <main class="conteudo" id="conteudo" tabindex="-1"></main>
    </div>`);
  desligarCronometro = ligarCronometro(app);
  atualizarAvisos(app);
}

let abrindo = null;

function abrirSistema({ novaSenha = false } = {}) {
  abrindo ??= (async () => {
    app.dataset.tela = 'carregando';
    desenhar(app, html`<p class="app__carregando" role="status">Carregando…</p>`);

    try {
      estado.membro = await db.rpc('iniciar_sessao');
      if (!estado.membro) {
        mostrarMensagem(
          'Acesso ainda não liberado',
          `Você entrou como ${emailDaSessao() ?? 'este usuário'}, mas este e-mail não pertence a nenhum membro ativo do escritório. Peça ao administrador para cadastrá-lo na tela Membros.`,
        );
        return;
      }
      await carregarMembros();
    } catch (erro) {
      if (!sessaoAtual()) {
        mostrarEntrada();
        return;
      }
      console.error(erro);
      mostrarMensagem('Não foi possível abrir o sistema', erro.message, { tentar: true });
      return;
    }

    desenharCasca();
    if (novaSenha) history.replaceState(null, '', '#/conta?nova=1');
    else if (!resolver()) history.replaceState(null, '', '#/inicio');
    mostrarRota();
  })().finally(() => {
    abrindo = null;
  });
  return abrindo;
}

// ---------------------------------------------------------------------------
// Troca de tela
// ---------------------------------------------------------------------------

let geracao = 0;
let limparTela = null;

async function mostrarRota() {
  if (app.dataset.tela !== 'sistema') return;
  atualizarAvisos(app);

  const r = resolver();
  if (!r) {
    history.replaceState(null, '', '#/inicio');
    mostrarRota();
    return;
  }

  for (const link of $$('.menu a', app)) {
    const caminho = link.dataset.caminho;
    const atual = r.caminho === caminho || (caminho !== '/financeiro' && r.caminho.startsWith(`${caminho}/`));
    if (atual) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  fecharMenu();

  const esta = ++geracao;
  limparTela?.();
  limparTela = null;

  // Cada tela ganha um contêiner novo: ouvintes da tela anterior vão embora
  // junto com ela.
  const raiz = document.createElement('div');
  raiz.className = 'tela';
  $('#conteudo', app).replaceChildren(raiz);
  document.title = `${r.titulo ?? 'Área dos advogados'} — FHL`;

  if (r.permitido && !r.permitido()) {
    desenhar(raiz, html`
      <h1 class="pagina__titulo">Sem acesso</h1>
      <p class="pagina__sub">Seu perfil não inclui esta área. Se precisar dela, fale com o administrador.</p>`);
    return;
  }

  desenhar(raiz, html`<p class="carregando" role="status">Carregando…</p>`);

  try {
    const modulo = await r.carregar();
    if (esta !== geracao) return;
    const ctx = {
      raiz,
      params: r.params,
      consulta: r.consulta,
      ativa: () => esta === geracao,
      recarregar: mostrarRota,
    };
    const limpeza = await modulo.default(ctx);
    if (typeof limpeza !== 'function') return;
    if (esta === geracao) limparTela = limpeza;
    else limpeza();
  } catch (erro) {
    if (esta !== geracao) return;
    console.error(erro);
    desenhar(raiz, html`
      <h1 class="pagina__titulo">Não foi possível abrir esta tela</h1>
      <p class="pagina__sub">${erro.message}</p>
      <p class="secao"><button type="button" class="botao" data-acao="tentar">Tentar de novo</button></p>`);
  }
}

function fecharMenu() {
  $('.casca', app)?.classList.remove('menu-aberto');
  $('.topo-movel__menu', app)?.setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

aoClicar(app, {
  menu: (botao) => {
    const aberto = $('.casca', app).classList.toggle('menu-aberto');
    botao.setAttribute('aria-expanded', String(aberto));
  },
  sair: async () => {
    saindo = true;
    await sair();
  },
  tentar: () => location.reload(),
});

addEventListener('hashchange', () => {
  scrollTo(0, 0);
  mostrarRota();
});
// Concluir tarefa, conferir intimação, responder contato: o número do menu
// muda na hora, sem precisar trocar de tela.
addEventListener('fhl:gravou', (e) => {
  if (mudaContadores(e.detail.caminho)) atualizarAvisos(app);
});

aoMudarSessao((sessao) => {
  if (!sessao) {
    const aviso = estado.membro && !saindo ? { aviso: 'Sua sessão terminou. Entre de novo.' } : {};
    saindo = false;
    if (app.dataset.tela !== 'entrada') mostrarEntrada(aviso);
    return;
  }
  // Entrou nesta aba, ou em outra aba do mesmo navegador.
  if (app.dataset.tela === 'entrada') abrirSistema();
});

(function iniciar() {
  let tipoDoLink = null;
  try {
    tipoDoLink = sessaoDoLink();
  } catch (erro) {
    mostrarEntrada({ erro: erro.message });
    return;
  }

  if (!sessaoAtual()) {
    mostrarEntrada();
    return;
  }
  abrirSistema({ novaSenha: tipoDoLink === 'recovery' || tipoDoLink === 'invite' });
})();
