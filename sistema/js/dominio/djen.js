// DJEN — a API pública de comunicações do CNJ (preparação F6 §10.2–10.5).
// =======================================================================
//
//   GET {DJEN_URL}/comunicacao?numeroOab=…&ufOab=…&dataDisponibilizacaoInicio=…
//       &dataDisponibilizacaoFim=…&pagina=1&itensPorPagina=100
//
// Pública e gratuita, sem login, com CORS aberto — e SÓ responde a pedidos do
// Brasil. Por isso quem consulta é o navegador do escritório. Limite por IP
// (x-ratelimit-limit/remaining; 429 → esperar um minuto): uma requisição por
// vez, com pausa. Usar vários IPs para driblar o limite é abuso — nunca.
//
// sugerirPrazo e sugerirAudiencia só PREENCHEM o formulário; quem confirma é
// a pessoa, depois de ler o teor.
//
// Arquivo puro, sem DOM: é testado em sistema/testes/.

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE',
  'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO']);

/** "OAB/PR 105.790", "105790/PR", "PR 105.790" → { uf: 'PR', numero: '105790' }. */
export function lerOab(texto) {
  const t = String(texto ?? '').toUpperCase();
  if (!t.trim()) return null;
  const uf = [...t.matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1]).find((u) => UFS.has(u));
  const numero = (/(\d[\d.\s]*\d|\d)/.exec(t)?.[1] ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return uf && numero ? { uf, numero } : null;
}

export function urlDaConsulta(base, { numero, uf, de, ate, pagina = 1, itensPorPagina = 100 }) {
  const p = new URLSearchParams({
    numeroOab: numero, ufOab: uf, dataDisponibilizacaoInicio: de, dataDisponibilizacaoFim: ate,
    pagina: String(pagina), itensPorPagina: String(itensPorPagina),
  });
  return `${base}/comunicacao?${p}`;
}

export const linkDaCertidao = (base, hash) => `${base}/comunicacao/${encodeURIComponent(hash)}/certidao`;

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Teor com HTML → texto: tags fora; <br> e </p> viram quebra de linha. */
export function textoLimpo(html) {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h\d)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (entidade, d) => {
      const n = Number(d);
      return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : entidade;
    })
    .replace(/&([a-z]+|#39);/gi, (m, e) => ENTIDADES[e.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 'AAAA-MM-DD…' ou 'DD/MM/AAAA' → 'AAAA-MM-DD'. */
export function dataDoDjen(valor) {
  const t = String(valor ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Item da API → linha de importar_intimacoes (publicada_em vem depois, com os feriados). */
export function normalizarComunicacao(item, membroId = null) {
  const numero = String(item.numero_processo ?? item.numeroprocessocommascara ?? '').replace(/\D/g, '');
  return {
    djen_id: item.id,
    djen_hash: item.hash ?? null,
    disponibilizada_em: dataDoDjen(item.data_disponibilizacao ?? item.datadisponibilizacao),
    tribunal: item.siglaTribunal ?? null,
    orgao: item.nomeOrgao ?? null,
    tipo_comunicacao: item.tipoComunicacao ?? null,
    tipo_documento: item.tipoDocumento ?? null,
    classe: item.nomeClasse ?? null,
    numero_processo: numero.length === 20 ? numero : null,
    texto: textoLimpo(item.texto),
    link: /^https?:\/\/\S+$/.test(item.link ?? '') ? item.link : null,
    destinatarios: (item.destinatarios ?? []).map((d) => ({ nome: d.nome, polo: d.polo })),
    advogados: (item.destinatarioadvogados ?? []).map((a) => a.advogado ?? a)
      .map((a) => ({ nome: a.nome, numero_oab: a.numero_oab, uf_oab: a.uf_oab })),
    ativo: item.ativo !== false,
    membro_id: membroId,
  };
}

const EXTENSO = {
  um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, quarenta_e_oito: 48, setenta_e_duas: 72,
};

/** "…no prazo de 15 (quinze) dias…" → { quantidade: 15, unidade: 'dias' }; "prazo legal" → null. */
export function sugerirPrazo(texto) {
  const t = String(texto ?? '').toLowerCase();
  let m = /(\d{1,4})\s*(?:\([^)]{1,40}\)\s*)?(dias?|horas?)\b/.exec(t);
  if (m) return { quantidade: Number(m[1]), unidade: m[2].startsWith('hora') ? 'horas' : 'dias', uteis: /úteis|uteis/.test(t.slice(m.index, m.index + 60)) };
  m = /\b(vinte e (?:um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove)|quarenta e oito|setenta e duas|[a-zçê]+)\s+(dias?|horas?)\b/.exec(t);
  if (m) {
    const palavras = m[1].trim();
    const composto = /^vinte e (.+)$/.exec(palavras);
    const n = composto ? 20 + (EXTENSO[composto[1]] ?? NaN) : EXTENSO[palavras.replace(/ /g, '_')] ?? EXTENSO[palavras];
    if (Number.isFinite(n)) return { quantidade: n, unidade: m[2].startsWith('hora') ? 'horas' : 'dias', uteis: false };
  }
  return null;
}

/** "…audiência … dia 12/11/2026, às 14h30…" → { dia: '2026-11-12', hora: '14:30' }. */
export function sugerirAudiencia(texto) {
  const t = String(texto ?? '');
  const m = /audi[êe]ncia[\s\S]{0,250}?(\d{1,2})\/(\d{1,2})\/(\d{4})[\s\S]{0,40}?(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?/i.exec(t);
  if (!m) return null;
  const dois = (x) => String(x).padStart(2, '0');
  return { dia: `${m[3]}-${dois(m[2])}-${dois(m[1])}`, hora: `${dois(m[4])}:${m[5] ?? '00'}` };
}

/**
 * Reconsulta o último dia completo para pegar publicações que chegaram
 * depois da busca. Um intervalo antigo avança por blocos de 31 dias: nunca
 * descarta os dias intermediários. O djen_id evita repetir os registros.
 */
export function periodoDaBusca(ultimaCompleta, hoje, diasPrimeira = 7) {
  const menos = (iso, d) => new Date(Date.parse(`${iso}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);
  let de = ultimaCompleta?.ate ? ultimaCompleta.ate : menos(hoje, diasPrimeira - 1);
  if (de > hoje) de = hoje;
  const fimDoBloco = menos(de, -30);
  return { de, ate: fimDoBloco < hoje ? fimDoBloco : hoje };
}

/** A captura diária roda uma vez por dia útil: nenhuma consulta completa hoje. */
export function capturaPendente(consultas, hoje, diaUtil) {
  if (!diaUtil) return false;
  return !consultas.some((c) => c.situacao === 'ok' && c.ate >= hoje);
}
