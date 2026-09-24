// Formatos brasileiros e datas no fuso de Paranaguá.
// ===================================================
//
// Dinheiro circula em CENTAVOS inteiros dentro do sistema: 0,1 + 0,2 não dá
// 0,3 em ponto flutuante, e erro de centavo em cobrança é erro de cobrança.
// O banco guarda reais em numeric(12,2); a conversão acontece só na borda.
//
// Datas de calendário (vencimento, pagamento) são texto 'AAAA-MM-DD' e nunca
// passam por fuso. Instantes (início de compromisso, carimbo de auditoria)
// são timestamptz e sempre aparecem no horário de Brasília.
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

export const FUSO = 'America/Sao_Paulo';

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPercentual = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

/** Reais vindos do banco (número ou texto) → centavos. */
export const centavos = (reais) => Math.round(Number(reais ?? 0) * 100);

/** Centavos → reais, para gravar no banco. */
export const paraReais = (c) => Math.round(c) / 100;

/** Centavos → "R$ 1.234,56". */
export const moeda = (c) => fmtMoeda.format(Math.round(c) / 100);

/** Centavos → "1.234,56", para preencher campo. */
export const decimal = (c) => fmtDecimal.format(Math.round(c) / 100);

export const percentual = (p) => `${fmtPercentual.format(Number(p ?? 0))}%`;

/** Texto digitado → centavos. Aceita "1.234,56", "1234,56", "R$ 1.234,56" e
 *  "1234.56". Vazio → null; inválido → NaN. */
export function lerMoeda(texto) {
  let t = String(texto ?? '').replace(/[R$\s ]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

/** "10", "10,5", "1.5" → número. Vazio → null; inválido → NaN. */
export function lerNumero(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Número preenchido e dentro da faixa. `null >= 0` é true em JavaScript — um
 *  campo em branco passava por "entre 0 e 100" e chegava vazio ao banco. */
export const entre = (n, min, max) => typeof n === 'number' && !Number.isNaN(n) && n >= min && n <= max;

// ---------------------------------------------------------------------------
// Datas de calendário — 'AAAA-MM-DD'
// ---------------------------------------------------------------------------

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const dois = (n) => String(n).padStart(2, '0');
const partes = (iso) => iso.split('-').map(Number);
const emMs = (iso) => {
  const [a, m, d] = partes(iso);
  return Date.UTC(a, m - 1, d);
};
const deMs = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Hoje em Paranaguá, não no relógio de quem abriu a tela. */
export function hoje(agora = new Date()) {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

export const diasEntre = (de, ate) => Math.round((emMs(ate) - emMs(de)) / 86_400_000);
export const somarDias = (iso, dias) => deMs(emMs(iso) + dias * 86_400_000);
export const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
export const diaDaSemana = (iso) => new Date(emMs(iso)).getUTCDay();

/** Soma meses mantendo o dia: 31/01 + 1 mês = 28/02 (ou 29), nunca 03/03.
 *  `dia` fixa o dia desejado — quem gera parcelas passa sempre o da primeira,
 *  para 31/01 → 28/02 → 31/03 não virar 31/01 → 28/02 → 28/03. */
export function somarMeses(iso, meses, dia = partes(iso)[2]) {
  const [a, m] = partes(iso);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12 + 1;
  return `${ano}-${dois(mes)}-${dois(Math.min(dia, ultimoDia(ano, mes)))}`;
}

export const inicioDoMes = (iso) => `${iso.slice(0, 7)}-01`;
export const fimDoMes = (iso) => {
  const [a, m] = partes(iso);
  return `${iso.slice(0, 7)}-${dois(ultimoDia(a, m))}`;
};

/** Segunda-feira da semana do dia. */
export const inicioDaSemana = (iso) => somarDias(iso, -((diaDaSemana(iso) + 6) % 7));

export const data = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const nomeDoMes = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
export const mesAbreviado = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}/${iso.slice(2, 4)}`;
export const nomeDoDia = (iso) => DIAS[diaDaSemana(iso)];

/** "terça, 15 de setembro". */
export const dataExtensa = (iso) =>
  `${nomeDoDia(iso)}, ${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

// ---------------------------------------------------------------------------
// Instantes — timestamptz
// ---------------------------------------------------------------------------

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const fmtPartes = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export const dataHora = (ts) => (ts ? fmtDataHora.format(new Date(ts)) : '');
export const hora = (ts) => (ts ? fmtHora.format(new Date(ts)) : '');

/** Instante → dia e minuto do dia em Brasília: { dia: 'AAAA-MM-DD', minuto: 870 }. */
export function noFuso(ts) {
  const p = Object.fromEntries(fmtPartes.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, minuto: Number(p.hour) * 60 + Number(p.minute) };
}

// O Brasil não tem horário de verão desde 2019. O deslocamento é calculado
// mesmo assim, para o sistema não errar a hora se ele voltar.
const fmtDeslocamento = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, timeZoneName: 'longOffset' });

function deslocamento(dia, hhmm) {
  try {
    const nome = fmtDeslocamento
      .formatToParts(new Date(`${dia}T${hhmm}:00-03:00`))
      .find((x) => x.type === 'timeZoneName')?.value ?? '';
    const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(nome);
    return m ? `${m[1]}:${m[2] ?? '00'}` : '-03:00';
  } catch {
    return '-03:00';
  }
}

/** Dia + "HH:MM" em Brasília → instante ISO com o deslocamento certo. */
export const instante = (dia, hhmm = '00:00') => `${dia}T${hhmm}:00${deslocamento(dia, hhmm)}`;

export const horaDoMinuto = (minuto) => `${dois(Math.floor(minuto / 60))}:${dois(minuto % 60)}`;

// ---------------------------------------------------------------------------
// Documentos e contato
// ---------------------------------------------------------------------------

export const soDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

/** CPF ou CNPJ — inclusive o alfanumérico — sem máscara, em maiúsculas. */
export const limparDocumento = (texto) => String(texto ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Confere os dígitos verificadores de CPF e CNPJ — inclusive o CNPJ
 *  alfanumérico, em que cada caractere vale o código ASCII menos 48. */
export function documentoValido(valor) {
  const d = limparDocumento(valor);

  if (d.length === 11) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    const dv = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      return ((soma * 10) % 11) % 10;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }

  if (d.length === 14) {
    if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\w)\1{13}$/.test(d)) return false;
    const dv = (n) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let soma = 0;
      for (let i = 0; i < n; i++) soma += (d.charCodeAt(i) - 48) * pesos[i];
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }

  return false;
}

export function documento(valor) {
  const d = limparDocumento(valor);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/^(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})$/, '$1.$2.$3/$4-$5');
  return d;
}

export function telefone(valor) {
  let d = soDigitos(valor);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return d;
}

/** Link do WhatsApp com a mensagem já escrita. Nada é enviado sozinho (5.4). */
export function linkWhatsApp(fone, texto = '') {
  let d = soDigitos(fone);
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
