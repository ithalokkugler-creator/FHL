// Feriados para a contagem de prazos (preparação F5 §9.3).
// ========================================================
//
// Entram SOZINHOS só os nove feriados nacionais fixos em lei. Carnaval,
// Sexta-feira Santa e Corpus Christi são datas móveis que a tela Feriados
// SUGERE a cada ano — alguém confere e marca. Feriados do TJPR, do TRT9, do
// TRF4 e de Paranaguá só contam se estiverem cadastrados.
//
// Na dúvida, o dia é útil: um feriado esquecido faz o sistema sugerir um
// prazo MAIS CURTO que o real — o erro seguro. O contrário faria perder prazo.
//
// Arquivo puro: é testado em sistema/testes/.

const dois = (n) => String(n).padStart(2, '0');

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) → 'AAAA-MM-DD'. */
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

const somar = (iso, dias) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

const FIXOS = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
];

/** Os nove feriados nacionais fixos em lei: Map 'AAAA-MM-DD' → nome. */
export function feriadosNacionaisFixos(ano) {
  return new Map(FIXOS.map(([md, nome]) => [`${ano}-${md}`, nome]));
}

/** Datas móveis para a tela OFERECER — nunca entram na contagem sozinhas. */
export function sugestoesDoAno(ano) {
  const p = pascoa(ano);
  return [
    { data: somar(p, -48), nome: 'Carnaval (segunda-feira)' },
    { data: somar(p, -47), nome: 'Carnaval (terça-feira)' },
    { data: somar(p, -2), nome: 'Sexta-feira Santa' },
    { data: somar(p, 60), nome: 'Corpus Christi' },
  ];
}

/**
 * Os dias que não contam como úteis num conjunto de anos: os fixos nacionais
 * e os cadastrados ativos sem tribunal (todos) ou do tribunal do processo.
 * Map 'AAAA-MM-DD' → nome, para a memória da contagem dizer por que pulou.
 *
 * @param {{ data: string, nome: string, tribunal?: string|null, ativo?: boolean }[]} cadastrados
 * @param {string|null} tribunal  'TJPR', 'TRT9'… ou nulo
 * @param {number[]} anos
 */
export function diasNaoUteis(cadastrados = [], tribunal = null, anos = []) {
  const mapa = new Map();
  for (const ano of anos) for (const [d, n] of feriadosNacionaisFixos(ano)) mapa.set(d, n);
  const t = (tribunal ?? '').toUpperCase();
  for (const f of cadastrados) {
    if (f.ativo === false) continue;
    if (f.tribunal && f.tribunal.toUpperCase() !== t) continue;
    if (!mapa.has(f.data)) mapa.set(f.data, f.nome + (f.tribunal ? ` (${f.tribunal})` : ''));
  }
  return mapa;
}
