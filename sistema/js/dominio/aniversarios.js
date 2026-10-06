import { diasEntre, ultimoDia } from '../nucleo/formato.js';

const valida = (dia) => typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia)
  && Number.isFinite(Date.parse(dia)) && new Date(dia).toISOString().slice(0, 10) === dia;

/** Datas de calendário; 29/02 é lembrado em 28/02 nos anos não bissextos. */
export function proximoAniversario(nascimento, hoje) {
  if (!valida(nascimento) || !valida(hoje) || nascimento > hoje) return null;
  const [anoNascimento, mes, dia] = nascimento.split('-').map(Number);
  let ano = Number(hoje.slice(0, 4));
  const em = (a) => `${a}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia(a, mes))).padStart(2, '0')}`;
  if (em(ano) < hoje) ano++;
  const data = em(ano);
  return { data, dias: diasEntre(hoje, data), idade: ano - anoNascimento };
}

/** Lista de clientes com tipo_pessoa e nascimento já associados ao cadastro. */
export function aniversariantes(lista, hoje, dias = 7) {
  return lista.filter((c) => c.ativo && c.tipo_pessoa === 'fisica').flatMap((c) => {
    const aniversario = proximoAniversario(c.nascimento, hoje);
    return aniversario && aniversario.dias <= dias ? [{ ...c, aniversario }] : [];
  }).sort((a, b) => a.aniversario.dias - b.aniversario.dias || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
}
