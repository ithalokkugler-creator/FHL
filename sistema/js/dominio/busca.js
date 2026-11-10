// Busca rápida (09/11/2026): de qualquer tela, achar um cliente, um processo
// ou uma tela do sistema digitando um pedaço do que se lembra — parte do nome,
// CPF/CNPJ ou telefone com ou sem pontuação, número ou título do processo.
// Regra pura: quem busca os dados e desenha a lista é telas/busca-rapida.js.

import { semAcento, soDigitos } from '../nucleo/formato.js';
import { buscarClientes } from './clientes.js';

const normal = (s) => semAcento(s).toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();

// Palavras que não distinguem ninguém: sozinhas não buscam, e junto de outras
// não atrapalham ("ação de" acha também a "Ação antiga").
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'd', 'e', 'em', 'a', 'o']);

/** Menos que isto não busca: uma letra só acharia quase todo mundo. */
export const MINIMO_BUSCA = 2;

/**
 * @param {{ clientes?: object[], processos?: object[], paginas?: { caminho: string, rotulo: string, grupo?: string }[] }} dados
 * @param {string} texto
 * @returns {{ clientes: { cliente: object, por: string }[], processos: { processo: object, cliente: object|null }[], paginas: object[], total: number }}
 *   `por` diz por onde o cliente foi achado: 'nome', 'documento', 'telefone' ou 'email'.
 *   `total` conta tudo o que bateu, antes do corte de `limite` por grupo.
 */
export function buscaRapida({ clientes = [], processos = [], paginas = [] } = {}, texto, { limite = 8 } = {}) {
  // O travessão separa nome e documento no campo Cliente dos formulários;
  // aqui é só mais um espaço.
  const limpo = String(texto ?? '').replace(/[—–]/g, ' ');
  const busca = normal(limpo);
  const vazio = { clientes: [], processos: [], paginas: [], total: 0 };
  if (busca.length < MINIMO_BUSCA) return vazio;

  const temLetra = /[a-z]/.test(busca);
  const digitos = temLetra ? '' : soDigitos(busca);
  const termos = busca.split(/[^a-z0-9]+/).filter((t) => t && !LIGACOES.has(t));
  // Só pontuação, ou só "de", "da", "d'": não há o que procurar.
  if (!termos.length) return vazio;
  // Telefone digitado com o 55 do país na frente acha o cadastro sem ele.
  const semPais = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos;

  // Clientes: nome e CPF/CNPJ pela mesma regra do campo Cliente dos
  // formulários; depois telefone (4 dígitos ou mais) e e-mail.
  const achados = new Map();
  // "Nome — 123.456.789-09", copiado de um campo Cliente, continua valendo
  // como nome e documento; travessão sem documento depois é só espaço.
  const paraClientes = /\S\s—\s.*\d/.test(String(texto ?? '')) ? String(texto) : limpo;
  for (const { cliente, nota } of buscarClientes(clientes, paraClientes)) {
    achados.set(cliente.id, { cliente, nota, por: temLetra ? 'nome' : 'documento' });
  }
  for (const cliente of clientes) {
    if (achados.has(cliente.id)) continue;
    const fone = soDigitos(cliente.telefone);
    if (digitos.length >= 4 && (fone.includes(digitos) || fone.includes(semPais))) achados.set(cliente.id, { cliente, nota: 3, por: 'telefone' });
    else if (temLetra && busca.length >= 3 && normal(cliente.email).includes(busca)) achados.set(cliente.id, { cliente, nota: 3, por: 'email' });
  }
  // Inativos por último: quem se procura quase sempre está ativo.
  const listaClientes = [...achados.values()].sort((a, b) => Number(a.cliente.ativo === false) - Number(b.cliente.ativo === false) || a.nota - b.nota
    || a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR', { sensitivity: 'base' }));

  // Processos: o número pelos dígitos (4 ou mais, com ou sem máscara), ou
  // todas as palavras digitadas no começo de palavras do título ou da
  // referência ("usuc" acha Usucapião).
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const listaProcessos = [];
  for (const processo of processos) {
    const alvo = normal(`${processo.titulo ?? ''} ${processo.referencia ?? ''}`).split(/[^a-z0-9]+/).filter(Boolean);
    const peloNumero = digitos.length >= 4 && soDigitos(processo.numero).includes(digitos);
    const peloTexto = temLetra && termos.every((t) => alvo.some((p) => p.startsWith(t)));
    if (peloNumero || peloTexto) listaProcessos.push({ processo, cliente: porId.get(processo.cliente_id) ?? null });
  }
  listaProcessos.sort((a, b) => Number(a.processo.situacao === 'encerrado') - Number(b.processo.situacao === 'encerrado')
    || String(a.processo.titulo ?? '').localeCompare(String(b.processo.titulo ?? ''), 'pt-BR', { sensitivity: 'base' }));

  // Telas do menu, pelo começo das palavras: "fin" acha Financeiro, "praz"
  // acha Prazos, "contas fin" acha Contas financeiras — mas "ros" não acha
  // Membros.
  const listaPaginas = temLetra
    ? paginas.filter((p) => {
      const alvo = normal(`${p.grupo ?? ''} ${p.rotulo}`).split(/[^a-z0-9]+/).filter(Boolean);
      return termos.every((t) => alvo.some((palavra) => palavra.startsWith(t)));
    })
    : [];

  return {
    clientes: listaClientes.slice(0, limite).map(({ cliente, por }) => ({ cliente, por })),
    processos: listaProcessos.slice(0, limite),
    paginas: listaPaginas.slice(0, limite),
    total: listaClientes.length + listaProcessos.length + listaPaginas.length,
  };
}
