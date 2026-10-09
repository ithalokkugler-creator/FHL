// Validação comum: motivo visível, dados preservados e foco no campo errado.
import { data } from './formato.js';

let proximoId = 0;

export class ErroCampo extends Error {
  constructor(campo, mensagem) {
    super(mensagem);
    this.campo = campo;
  }
}

const ROTULOS = {
  cliente_id: 'cliente_texto', fatal_em: 'fatal_dia', base_em: 'base_dia',
  inicio: 'inicio_dia', fim: 'fim_dia', numero_processo: 'numero',
};

// Erros de domínio antigos já têm mensagens claras. Resolve o campo quando
// a mensagem o identifica; falhas de rede/permissão ficam no resumo.
const CAMPOS_MENSAGEM = [
  [/senhas não são iguais/i, ['repeticao']],
  [/(?:CPF|CNPJ).*representante/i, ['representante_documento']],
  [/telefone para recados/i, ['recado_telefone']],
  [/UF/i, ['uf']],
  [/nascimento|constituição/i, ['nascimento']],
  [/concordância/i, ['flexao']],
  [/estado civil/i, ['estado_civil']],
  [/nome completo/i, ['nome']],
  [/área jurídica/i, ['area']],
  [/situação.*processo/i, ['situacao']],
  [/tipo.*atividade/i, ['tipo']],
  [/percentual.*êxito/i, ['exito_pct']],
  [/endereço da página/i, ['slug']],
  [/fim.*campanha/i, ['fim']],
  [/fim.*período/i, ['ate']],
  [/multa/i, ['multa_pct']],
  [/juros/i, ['juros_mes_pct']],
  [/carência/i, ['carencia_dias']],
  [/correção monetária/i, ['correcao']],
  [/data.*pagamento/i, ['data_pagamento', 'data']],
  [/entrada paga.*data/i, ['data_entrada']],
  [/valor inválido|valor pago|valor recebido|valor dos honorários|precisa de valor|Informe o valor\./i, ['valor']],
  [/dia vai de/i, ['dia']],
  [/tribunal/i, ['tribunal']],
  [/datas.*publicação|data de publicação/i, ['publicada_em']],
  [/leu e conferiu/i, ['conferi']],
  [/assunto.*cliente/i, ['titulo', 'cliente_texto']],
  [/último.*dia/i, ['ultimo']],
  [/mês válido/i, ['mes']],
  [/^Direitos:/i, ['direitos']],
  [/^Como funciona:/i, ['passos']],
  [/^Perguntas frequentes:/i, ['faq']],
  [/CPF|CNPJ/i, ['documento', 'representante_documento']],
  [/telefone|DDD/i, ['telefone']],
  [/CEP/i, ['cep']],
  [/CNJ|número.*processo/i, ['numero', 'numero_processo']],
  [/processo.*cliente|cliente.*processo/i, ['processo_id', 'cliente_texto']],
  [/cliente/i, ['cliente_texto']],
  [/entrega/i, ['entrega']],
  [/fatal/i, ['fatal_dia']],
  [/responsável/i, ['responsavel_id', 'membro_id']],
  [/quantidade|parcelas/i, ['quantidade', 'total']],
  [/vencimento/i, ['primeiro', 'vencimento']],
  [/valor total|soma.*valor/i, ['total', 'valor']],
  [/entrada/i, ['entrada']],
  [/fim|término|posterior.*início|grade.*terminar/i, ['hora_fim', 'fim_hora', 'fim', 'bloqueio_fim']],
  [/motivo/i, ['motivo']],
  [/título/i, ['titulo']],
  [/e-mail/i, ['email']],
  [/senha/i, ['senha']],
];

function visivel(campo) {
  return campo && !campo.disabled && campo.type !== 'hidden'
    && !campo.closest?.('[hidden]') && campo.getClientRects?.().length > 0;
}

function acharCampo(form, falha) {
  if (typeof falha?.campo === 'object' && visivel(falha.campo)) return falha.campo;
  const bloco = falha?.message?.match(/^Bloco (\d+)/);
  if (bloco) {
    const i = Number(bloco[1]) - 1;
    const atributo = /link/i.test(falha.message) ? 'data-campo="url"' : /imagem/i.test(falha.message) ? 'data-papel="imagem"'
      : /legenda/i.test(falha.message) ? 'data-campo="legenda"' : 'data-campo="itens"';
    const campo = form.querySelector(`[data-i="${i}"][${atributo}]`);
    if (visivel(campo)) return campo;
  }
  const nomes = falha?.campo ? [ROTULOS[falha.campo] || falha.campo, falha.campo] : [];
  if (!nomes.length) {
    const regra = CAMPOS_MENSAGEM.find(([re]) => re.test(falha?.message || ''));
    if (regra) nomes.push(...regra[1]);
  }
  return nomes.map((nome) => form.elements.namedItem(nome)).find(visivel);
}

function resumo(form) {
  let caixa = form.querySelector('.dialogo__erro, .erro-formulario, [role="alert"]');
  if (!caixa) {
    caixa = document.createElement('p');
    caixa.className = 'erro-formulario campo';
    caixa.setAttribute('role', 'alert');
    form.prepend(caixa);
  }
  caixa.tabIndex = -1;
  return caixa;
}

function limparCampo(campo) {
  if (!campo?.dataset?.erroFormulario) return;
  const id = campo.dataset.erroFormulario;
  campo.removeAttribute('aria-invalid');
  const ids = (campo.getAttribute('aria-describedby') || '').split(' ').filter((v) => v && v !== id);
  if (ids.length) campo.setAttribute('aria-describedby', ids.join(' '));
  else campo.removeAttribute('aria-describedby');
  document.getElementById(id)?.remove();
  delete campo.dataset.erroFormulario;
}

export function limparErrosFormulario(form) {
  for (const campo of form.elements) limparCampo(campo);
  const caixa = form.querySelector('.dialogo__erro, .erro-formulario, [role="alert"]');
  if (caixa) caixa.hidden = true;
}

function marcar(campo, mensagem) {
  limparCampo(campo);
  const ajuda = document.createElement('span');
  ajuda.id = `erro-campo-${++proximoId}`;
  ajuda.className = 'campo__erro';
  ajuda.textContent = mensagem;
  const rotulo = campo.closest('.campo, .opcao');
  (rotulo || campo.parentElement).append(ajuda);
  campo.dataset.erroFormulario = ajuda.id;
  campo.setAttribute('aria-invalid', 'true');
  campo.setAttribute('aria-describedby', [campo.getAttribute('aria-describedby'), ajuda.id].filter(Boolean).join(' '));
}

function levarAoCampo(campo) {
  campo.focus({ preventScroll: true });
  campo.scrollIntoView({ block: 'center', behavior: 'instant' });
}

export function mostrarErroFormulario(form, falha) {
  const erro = typeof falha === 'string' ? new Error(falha) : falha;
  const caixa = resumo(form);
  caixa.textContent = erro?.message || 'Não foi possível salvar. Tente novamente.';
  caixa.hidden = false;
  const campo = acharCampo(form, erro);
  if (campo) {
    marcar(campo, caixa.textContent);
    levarAoCampo(campo);
  } else levarAoCampo(caixa);
}

function rotulo(campo) {
  return campo.getAttribute('aria-label') || campo.labels?.[0]?.querySelector('span')?.textContent.trim()
    || campo.closest('.campo')?.querySelector('span')?.textContent.trim() || 'Este campo';
}

export function motivoInvalido(campo) {
  const v = campo.validity;
  if (v.customError) return campo.validationMessage;
  if (v.valueMissing || (campo.required && campo.type !== 'password' && !campo.value.trim())) {
    return campo.type === 'checkbox' ? 'Marque esta confirmação para continuar.' : `Preencha ${rotulo(campo)}.`;
  }
  if (v.typeMismatch) return campo.type === 'email' ? 'Informe um e-mail válido, como nome@exemplo.com.' : 'Informe um endereço válido.';
  if (v.rangeUnderflow) return campo.type === 'date' ? `Informe uma data igual ou posterior a ${data(campo.min)}.` : `Informe um valor igual ou maior que ${campo.min}.`;
  if (v.rangeOverflow) return campo.type === 'date' ? `Informe uma data igual ou anterior a ${data(campo.max)}.` : `Informe um valor igual ou menor que ${campo.max}.`;
  if (v.stepMismatch) return campo.step === 'any' ? 'Confira o valor informado.' : 'Informe um valor no intervalo permitido (sem frações quando forem unidades inteiras).';
  if (v.tooShort) return `Use pelo menos ${campo.minLength} caracteres.`;
  if (v.tooLong) return `Use no máximo ${campo.maxLength} caracteres.`;
  if (v.badInput) return 'Informe um número válido.';
  if (v.patternMismatch) return campo.title || 'Confira o formato indicado para este campo.';
  return 'Confira o valor informado.';
}

export function validarFormulario(form) {
  limparErrosFormulario(form);
  const erros = [...form.elements].filter((c) => c.willValidate && visivel(c)
    && (!c.validity.valid || (c.required && !['checkbox', 'radio', 'password'].includes(c.type) && !c.value.trim())));
  if (!erros.length) return true;
  for (const campo of erros) marcar(campo, motivoInvalido(campo));
  const caixa = resumo(form);
  caixa.textContent = `${erros.length > 1 ? `Revise os ${erros.length} campos destacados. ` : ''}${rotulo(erros[0])}: ${motivoInvalido(erros[0])}`;
  caixa.hidden = false;
  levarAoCampo(erros[0]);
  return false;
}

/** Delegação atende também telas e diálogos montados depois da inicialização. */
export function ligarValidacaoFormularios(raiz = document) {
  raiz.addEventListener('submit', (e) => {
    if (e.target.tagName !== 'FORM') return;
    if (!validarFormulario(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  const aoCorrigir = (e) => {
    const campo = e.target;
    const form = campo.form;
    limparCampo(campo);
    if (form && !form.querySelector('[data-erro-formulario]')) {
      const caixa = form.querySelector('.dialogo__erro, .erro-formulario, [role="alert"]');
      if (caixa) caixa.hidden = true;
    }
  };
  raiz.addEventListener('input', aoCorrigir);
  raiz.addEventListener('change', aoCorrigir);
}
