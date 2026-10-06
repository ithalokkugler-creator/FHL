// Exemplos fictícios de F8; nenhuma consulta ou cálculo de feriados reais.
import { hoje, instante, somarDias } from '../../sistema/js/nucleo/formato.js';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function complementarAgenda(d) {
  d.feriados.push({ id: id(961), data: hoje(), nome: 'Feriado fictício de teste', tribunal: null, ativo: true, tipo: 'feriado' },
    { id: id(962), data: hoje(), nome: 'Suspensão fictícia só do tribunal', tribunal: 'TJPR', ativo: true, tipo: 'suspensao' },
    { id: id(963), data: hoje(), nome: 'Feriado fictício inativo', tribunal: 'TRT9', ativo: false, tipo: 'feriado' });
  const bloqueio = { id: id(607), membro_id: id(1), tipo: 'bloqueio', modalidade: 'diligencia', titulo: 'Bloqueio Fictício de Vários Dias',
    inicio: instante(somarDias(hoje(),1)), fim: instante(somarDias(hoje(),4)), dia_inteiro: true,
    cliente_id: null, processo: null, local_ou_link: null, observacoes: 'OBSERVAÇÃO INTERNA NÃO EXPORTAR',
    particular: false, situacao: 'agendado', cancelado_em: null, lembrete_minutos: null };
  d.compromissos.push(bloqueio, { ...bloqueio, id: id(608), membro_id: id(2), particular: true, titulo: 'PARTICULAR DE VÁRIOS DIAS OCULTO', local_ou_link: 'LOCAL PARTICULAR OCULTO' });
  return d;
}
