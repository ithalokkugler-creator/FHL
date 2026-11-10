// Busca rápida (09/11/2026): uma janela que abre de qualquer tela — pelo botão
// "Buscar" do menu, por Ctrl+K ou pela barra "/" — e leva direto à ficha do
// cliente, ao cliente de um processo ou a uma tela do sistema.
//
// Só lê: clientes e processos que o banco já entrega a quem tem o módulo
// Clientes. Nada fica guardado no navegador; a lista em memória é refeita a
// cada minuto e some ao sair.

import { documento, numeroCnj, telefone } from '../nucleo/formato.js';
import { desenhar, html } from '../nucleo/html.js';
import { navegar } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { buscaRapida, MINIMO_BUSCA } from '../dominio/busca.js';

const VALIDADE = 60_000;
let dados = null; // { clientes, processos, quando }
let lendo = null;
let aberto = null;
let sessao = 0; // muda a cada saída: leitura que chega depois não é guardada
let ultimaFalha = 0;

function carregar() {
  const desta = sessao;
  lendo ??= Promise.all([
    db.todos('clientes', { select: 'id,nome,documento,telefone,email,ativo', ordem: 'nome.asc,id.asc' }),
    db.todos('processos', { select: 'id,cliente_id,numero,referencia,titulo,situacao' }),
  ]).then(([clientes, processos]) => {
    if (desta !== sessao) return null;
    dados = { clientes, processos, quando: Date.now() };
    return dados;
  }).catch((erro) => {
    if (desta === sessao) ultimaFalha = Date.now();
    throw erro;
  }).finally(() => { if (desta === sessao) lendo = null; });
  return lendo;
}

/** Ao sair do sistema: fecha a janela e esquece a lista (inclusive a que
 *  ainda estiver chegando do banco). */
export function esquecerBuscaRapida() {
  sessao += 1;
  dados = null;
  lendo = null;
  ultimaFalha = 0;
  if (aberto?.open) aberto.close();
  aberto?.remove();
  aberto = null;
}

const item = (i, caminho, titulo, sub, tipo) => html`
  <li id="busca-opcao-${i}" role="option" class="busca-rapida__opcao" data-i="${i}" data-caminho="${caminho}" aria-selected="false">
    <span class="busca-rapida__texto"><strong>${titulo}</strong>${sub ? html`<span class="sub">${sub}</span>` : ''}</span>
    <span class="selo">${tipo}</span>
  </li>`;

const POR = { telefone: 'pelo telefone', email: 'pelo e-mail' };

function lista(r, texto) {
  if (texto.trim().length < MINIMO_BUSCA) {
    return html`<li class="busca-rapida__nota" role="presentation">Digite parte do nome, o CPF/CNPJ, o telefone ou o número do processo.</li>`;
  }
  if (!r.total) return html`<li class="busca-rapida__nota" role="presentation">Nada encontrado com “${texto.trim()}”. Confira a grafia ou tente só o sobrenome.</li>`;
  let i = 0;
  const grupo = (titulo, itens) => (itens.length ? html`<li class="busca-rapida__grupo rotulo" role="presentation">${titulo}</li>${itens}` : '');
  const mostrados = r.clientes.length + r.processos.length + r.paginas.length;
  return html`
    ${grupo('Clientes', r.clientes.map(({ cliente: c, por }) => item(i++, `/clientes/${c.id}`, c.nome,
      [c.documento ? documento(c.documento) : '', c.telefone ? telefone(c.telefone) : '', POR[por] ?? '', c.ativo === false ? 'inativo' : ''].filter(Boolean).join(' · '),
      'Cliente')))}
    ${grupo('Processos e casos', r.processos.map(({ processo: p, cliente: c }) => item(i++, `/clientes/${p.cliente_id}`, p.titulo,
      [p.numero ? numeroCnj(p.numero) : p.referencia, c?.nome, p.situacao === 'encerrado' ? 'encerrado' : ''].filter(Boolean).join(' · '),
      'Processo')))}
    ${grupo('Telas do sistema', r.paginas.map((p) => item(i++, p.caminho, p.rotulo, p.grupo ?? '', 'Tela')))}
    ${r.total > mostrados ? html`<li class="busca-rapida__nota" role="presentation">E mais ${r.total - mostrados}. Continue digitando para achar.</li>` : ''}`;
}

/**
 * @param {{ paginas?: { caminho: string, rotulo: string, grupo?: string }[] }} p telas que este membro vê no menu
 */
export function abrirBuscaRapida({ paginas = [] } = {}) {
  // A saída por inatividade tira os diálogos da página sem fechá-los.
  if (aberto && !aberto.isConnected) aberto = null;
  if (aberto) {
    aberto.querySelector('input')?.focus();
    return;
  }
  // Com um formulário aberto por cima, o atalho não faz nada: a busca
  // trocaria de tela e o que estava sendo digitado ficaria para trás.
  if (document.querySelector('dialog[open]')) return;

  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo busca-rapida';
  dialogo.setAttribute('aria-label', 'Busca rápida');
  document.body.append(dialogo);
  aberto = dialogo;
  desenhar(dialogo, html`
    <div class="busca-rapida__topo">
      <input type="text" inputmode="search" class="busca-rapida__campo" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="busca-rapida-lista"
        aria-label="Buscar cliente, processo ou tela" autocomplete="off" spellcheck="false" enterkeyhint="go" maxlength="120"
        placeholder="Nome, CPF, telefone ou número do processo">
      <button type="button" class="dialogo__fechar" data-fechar aria-label="Fechar a busca">×</button>
    </div>
    <ul class="busca-rapida__lista" id="busca-rapida-lista" role="listbox" aria-label="Resultados"></ul>
    <p class="busca-rapida__rodape sub"><span data-estado role="status"></span><span class="so-computador">↑ ↓ escolhem · Enter abre · Esc fecha</span></p>`);

  const campo = dialogo.querySelector('input');
  const caixa = dialogo.querySelector('[role="listbox"]');
  const estado = dialogo.querySelector('[data-estado]');
  let ativo = -1;

  const opcoes = () => [...caixa.querySelectorAll('[role="option"]')];
  const destacar = (i) => {
    const todas = opcoes();
    ativo = todas.length ? Math.max(0, Math.min(i, todas.length - 1)) : -1;
    for (const li of todas) li.setAttribute('aria-selected', String(Number(li.dataset.i) === ativo));
    const li = todas[ativo];
    if (li) {
      campo.setAttribute('aria-activedescendant', li.id);
      // Rola só a lista (scrollIntoView rolaria também a página por trás).
      const a = li.getBoundingClientRect();
      const c = caixa.getBoundingClientRect();
      if (ativo === 0) caixa.scrollTop = 0;
      else if (a.top < c.top) caixa.scrollTop -= c.top - a.top;
      else if (a.bottom > c.bottom) caixa.scrollTop += a.bottom - c.bottom;
    } else campo.removeAttribute('aria-activedescendant');
  };

  const mostrar = () => {
    const texto = campo.value;
    if (!dados) {
      // Sem a lista: ou ela está chegando, ou a leitura falhou — aí as telas
      // do menu continuam valendo e a próxima tecla tenta de novo.
      if (lendo) desenhar(caixa, html`<li class="busca-rapida__nota" role="presentation">Carregando clientes e processos…</li>`);
      else {
        const r = buscaRapida({ paginas }, texto);
        desenhar(caixa, html`<li class="busca-rapida__nota" role="presentation">Não foi possível carregar clientes e processos. Confira a internet; a busca tenta de novo quando você digitar.</li>${r.total ? lista(r, texto) : ''}`);
      }
      destacar(0);
      return;
    }
    desenhar(caixa, lista(buscaRapida({ ...dados, paginas }, texto), texto));
    destacar(0);
  };

  // Lê a lista do banco e redesenha. Depois de uma falha, espera 3 segundos
  // antes de tentar outra vez (cada tecla chamaria o banco).
  const atualizar = () => {
    const promessa = carregar();
    if (!dados) mostrar();
    promessa.then(() => {
      if (aberto !== dialogo) return;
      estado.textContent = '';
      const antes = ativo;
      mostrar();
      if (antes > 0) destacar(antes);
    }).catch((erro) => {
      if (aberto !== dialogo) return;
      console.error(erro);
      if (dados) estado.textContent = 'Não foi possível atualizar a lista agora. ';
      else mostrar();
    });
  };

  // Limpa na hora, sem esperar o evento `close` (que o Chromium atrasa com a
  // aba em segundo plano — ver nucleo/dialogo.js).
  let encerrado = false;
  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    removeEventListener('hashchange', fechar);
    dialogo.remove();
    if (aberto === dialogo) aberto = null;
  };
  function fechar() {
    if (dialogo.open) dialogo.close();
    encerrar();
  }
  const ir = (li) => {
    const caminho = li?.dataset.caminho;
    if (!caminho) return;
    fechar();
    navegar(caminho);
  };

  campo.addEventListener('input', () => {
    if (!dados && !lendo && Date.now() - ultimaFalha > 3000) atualizar();
    else mostrar();
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const quantas = opcoes().length;
      if (quantas) destacar(e.key === 'ArrowDown' ? (ativo + 1) % quantas : (ativo <= 0 ? quantas : ativo) - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ir(opcoes()[ativo]);
    } else if (e.key === 'Escape') {
      // Esc fecha sempre, com ou sem texto digitado.
      e.preventDefault();
      fechar();
    }
  });
  caixa.addEventListener('click', (e) => ir(e.target.closest('[role="option"]')));
  dialogo.addEventListener('click', (e) => {
    // Clique no fundo escuro (o próprio <dialog>) ou no × fecha: aqui não há
    // nada digitado que se perca.
    if (e.target === dialogo || e.target.closest('[data-fechar]')) fechar();
  });
  // Trocou de tela por outro caminho (Voltar do navegador): a janela sai.
  addEventListener('hashchange', fechar);
  dialogo.addEventListener('close', encerrar);

  dialogo.showModal();
  campo.focus();
  mostrar();

  // Mostra já o que está na memória e busca de novo se passou do minuto:
  // cliente cadastrado agora há pouco precisa aparecer.
  if (!dados || Date.now() - dados.quando > VALIDADE) atualizar();
}
