// Consulta paginada: preserva o que já chegou quando a API falha ou limita.
import { urlDaConsulta } from './djen.js';

export async function consultarOab(base, oab, periodo, {
  buscar = fetch, pausar = (ms) => new Promise((r) => setTimeout(r, ms)),
  sinal, aoProgresso, maxPaginas = 30, porPagina = 100,
} = {}) {
  const itens = [];
  let limitada = false;
  try {
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      if (sinal?.aborted) throw new Error('Busca interrompida.');
      aoProgresso?.(`OAB ${oab.chave}: página ${pagina}…`);
      const resposta = await buscar(urlDaConsulta(base, { ...oab, ...periodo, pagina, itensPorPagina: porPagina }), {
        signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(sinal ? [sinal] : [])]),
        headers: { Accept: 'application/json' },
      });
      if (resposta.status === 429) {
        limitada = true;
        throw new Error('O CNJ limitou as consultas deste endereço.');
      }
      if (!resposta.ok) throw new Error(`O DJEN respondeu ${resposta.status}.`);
      const corpo = await resposta.json();
      if (!Array.isArray(corpo?.items)) throw new Error('Resposta do DJEN sem a lista de comunicações.');
      itens.push(...corpo.items);
      const cabecalho = resposta.headers.get('x-ratelimit-remaining');
      // Um cabeçalho ausente (ou não exposto pelo CORS) não significa zero.
      const restantes = cabecalho?.trim() ? Number(cabecalho) : NaN;
      limitada = Number.isFinite(restantes) && restantes <= 0;
      const completa = corpo.items.length < porPagina
        || (Number.isFinite(corpo.count) && itens.length >= corpo.count);
      if (completa) return { itens, completa: true, limitada, erro: '' };
      if (limitada) throw new Error('Limite de consultas do CNJ atingido no meio da busca.');
      if (pagina === maxPaginas) throw new Error(`Busca incompleta: limite de ${maxPaginas} páginas atingido. Divida o período.`);
      await pausar(700);
    }
  } catch (erro) {
    return { itens, completa: false, limitada, erro: erro.name === 'TimeoutError' ? 'sem resposta em 20 s' : erro.message };
  }
}
