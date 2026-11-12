// Minha conta: dados de acesso e troca de senha.

import { avisar } from '../nucleo/avisos.js';
import { ErroCampo, mostrarErroFormulario } from '../nucleo/formularios.js';
import { estado, NIVEIS_AGENDA, NIVEIS_FINANCEIRO, PAPEIS } from '../nucleo/estado.js';
import { $, desenhar, html, lerFormulario } from '../nucleo/html.js';
import { emailDaSessao, trocarSenha } from '../nucleo/supabase.js';
import {
  guardarPreferencia, notificacoesLigadas, notificarComputador, pedirPermissao, permissaoNotificacao,
} from '../nucleo/notificar.js';
import { cabecalho } from './comum.js';

export default function telaConta({ raiz, consulta }) {
  const m = estado.membro;

  desenhar(raiz, html`
    ${cabecalho('Minha conta', m.nome)}
    ${consulta.nova ? html`<p class="nota nota--info">Crie uma senha nova para continuar usando o sistema.</p>` : ''}
    <div class="grade grade--2 secao">
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Acesso</h2></header>
        <dl class="dados">
          <div><dt>E-mail de entrada</dt><dd>${emailDaSessao() ?? '—'}</dd></div>
          <div><dt>Perfil</dt><dd>${PAPEIS[m.papel]}</dd></div>
          <div><dt>Agenda</dt><dd>${NIVEIS_AGENDA[m.acesso_agenda]}</dd></div>
          <div><dt>Financeiro</dt><dd>${NIVEIS_FINANCEIRO[m.acesso_financeiro]}</dd></div>
        </dl>
        <p class="painel__rodape sub">Perfil e acessos são definidos pelo administrador, na tela Membros.</p>
      </section>

      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Trocar senha</h2></header>
        <form class="painel__corpo campos" novalidate>
          <label class="campo">
            <span>Nova senha</span>
            <input name="senha" type="password" minlength="8" autocomplete="new-password" required ${consulta.nova ? 'autofocus' : ''}>
            <span class="campo__ajuda">Pelo menos 8 caracteres, com letras e números.</span>
          </label>
          <label class="campo">
            <span>Repita a nova senha</span>
            <input name="repeticao" type="password" minlength="8" autocomplete="new-password" required>
          </label>
          <p class="nota nota--perigo campo" role="alert" hidden></p>
          <div class="campo"><button class="botao botao--primario" type="submit">Salvar senha</button></div>
        </form>
      </section>
    </div>

    <section class="painel secao" data-papel="notificacoes">
      <header class="painel__topo"><h2 class="painel__titulo">Avisos de compromissos e tarefas</h2></header>
      <div class="painel__corpo" data-notificacoes></div>
    </section>`);

  // Notificações do computador (12/11/2026): só com a permissão do navegador,
  // pedida por este botão — nunca sozinha.
  const caixaNotificacoes = $('[data-notificacoes]', raiz);
  const desenharNotificacoes = () => {
    const permissao = permissaoNotificacao();
    const ligadas = notificacoesLigadas();
    desenhar(caixaNotificacoes, html`
      <p>Com o sistema aberto em alguma aba (mesmo minimizado), os lembretes dos seus compromissos, os prazos em horas e o
        resumo das suas tarefas do dia aparecem <strong>no canto da tela</strong>, até você dispensar.</p>
      <p class="secao--curta">Também podem aparecer <strong>nas notificações do computador</strong> (a barra do Windows), mesmo com
        outra janela na frente. Vale para este computador e este navegador.</p>
      <p class="secao--curta">${
        permissao === 'indisponivel' ? html`<span class="selo">Indisponível</span> Este navegador não mostra notificações do computador. No celular os avisos ficam só na tela do sistema.`
          : permissao === 'denied' ? html`<span class="selo selo--perigo">Bloqueadas no navegador</span> Para liberar: clique no cadeado ao lado do endereço do site → Notificações → Permitir, e recarregue a página.`
            : ligadas ? html`<span class="selo selo--ok">Ligadas neste computador</span>`
              : html`<span class="selo">Desligadas neste computador</span>`}</p>
      <p class="grupo-botoes secao--curta">
        ${permissao === 'default' || (permissao === 'granted' && !ligadas)
          ? html`<button type="button" class="botao botao--primario" data-acao-notificacao="ligar">Ligar notificações do computador</button>` : ''}
        ${ligadas ? html`
          <button type="button" class="botao" data-acao-notificacao="testar">Testar</button>
          <button type="button" class="botao botao--discreto" data-acao-notificacao="desligar">Desligar neste computador</button>` : ''}
      </p>
      <p class="sub">Com o navegador fechado (ou depois de sair por falta de uso) não chega aviso — quem tem o Google Agenda continua
        recebendo o alerta dele. Os lembretes de cada compromisso se escolhem em Agenda → Editar.</p>`);
  };
  desenharNotificacoes();
  caixaNotificacoes.addEventListener('click', async (e) => {
    const alvo = e.target.closest('[data-acao-notificacao]');
    if (!alvo) return;
    const acao = alvo.dataset.acaoNotificacao;
    if (acao === 'ligar') {
      if (permissaoNotificacao() === 'granted') guardarPreferencia(true);
      else {
        const resposta = await pedirPermissao();
        if (resposta === 'denied') avisar('O navegador bloqueou as notificações. Veja como liberar logo abaixo.', 'erro', 7000);
      }
      if (notificacoesLigadas()) avisar('Notificações do computador ligadas.');
    } else if (acao === 'desligar') {
      guardarPreferencia(false);
      avisar('Notificações do computador desligadas neste computador. Os avisos continuam no canto da tela.');
    } else if (acao === 'testar') {
      const n = notificarComputador({ titulo: 'Teste do sistema FL', corpo: 'É assim que os lembretes vão aparecer.', tag: 'fl-teste' });
      avisar(n ? 'Notificação de teste enviada. Se não apareceu, confira o "Não perturbe" do Windows.' : 'Não foi possível mostrar a notificação neste navegador.', n ? 'ok' : 'erro');
    }
    desenharNotificacoes();
  });

  const form = $('form', raiz);
  const erro = $('[role="alert"]', form);
  if (consulta.nova) form.senha.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.hidden = true;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const { senha, repeticao } = lerFormulario(form);
    if (senha !== repeticao) {
      mostrarErroFormulario(form, new ErroCampo('repeticao', 'As duas senhas não são iguais.'));
      return;
    }
    const botao = $('[type="submit"]', form);
    botao.disabled = true;
    try {
      await trocarSenha(senha);
      form.reset();
      avisar('Senha trocada.');
    } catch (falha) {
      mostrarErroFormulario(form, falha);
    } finally {
      botao.disabled = false;
    }
  });
}
