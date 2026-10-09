// Valor por extenso, para o recibo (preparação T07).
// =================================================
//
// R$ 1.234,56 → "mil, duzentos e trinta e quatro reais e cinquenta e seis
// centavos". Regras do português: "cem" sozinho e "cento" com resto; "mil"
// sem "um"; "e" entre centenas, dezenas e unidades; "de reais" depois de
// milhão redondo ("um milhão de reais").
//
// Arquivo puro: é testado em sistema/testes/.

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos',
  'oitocentos', 'novecentos'];

/** 0 a 999. */
function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) partes.push(resto < 20 ? UNIDADES[resto] : DEZENAS[Math.floor(resto / 10)] + (resto % 10 ? ` e ${UNIDADES[resto % 10]}` : ''));
  return partes.join(' e ');
}

const ESCALAS = [
  [1e9, 'bilhão', 'bilhões'],
  [1e6, 'milhão', 'milhões'],
  [1e3, 'mil', 'mil'],
];

/** Inteiro por extenso: 1001 → "mil e um"; 2500000 → "dois milhões e quinhentos mil". */
export function numeroPorExtenso(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zero';
  const grupos = [];
  let resto = n;
  for (const [valor, um, varios] of ESCALAS) {
    const q = Math.floor(resto / valor);
    if (!q) continue;
    resto %= valor;
    grupos.push({ q, texto: valor === 1e3 && q === 1 ? 'mil' : `${ate999(q)} ${q === 1 ? um : varios}` });
  }
  if (resto) grupos.push({ q: resto, texto: ate999(resto) });
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda:
  // "mil e um", "dois milhões e quinhentos mil", "mil, duzentos e trinta".
  const ultimo = grupos.at(-1);
  if (grupos.length > 1 && (ultimo.q < 100 || ultimo.q % 100 === 0)) {
    return `${grupos.slice(0, -1).map((g) => g.texto).join(', ')} e ${ultimo.texto}`;
  }
  return grupos.map((g) => g.texto).join(', ');
}

/** Centavos → "mil reais e cinco centavos" (nunca "um mil"). */
export function valorPorExtenso(centavos) {
  const total = Math.round(Math.abs(Number(centavos) || 0));
  const reais = Math.floor(total / 100);
  const cent = total % 100;
  const partes = [];
  if (reais) {
    const milhaoRedondo = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${numeroPorExtenso(reais)}${milhaoRedondo ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cent) partes.push(`${numeroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}
