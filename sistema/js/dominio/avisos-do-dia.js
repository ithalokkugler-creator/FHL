import { hoje, noFuso, somarDias } from '../nucleo/formato.js';

/** Uma tarefa aparece em apenas um grupo, mesmo quando entrega e fatal coincidem. */
export function tarefasParaHoje(lista, agora = new Date()) {
  const dia = hoje(agora), ate = somarDias(dia, 7);
  return lista.filter((t) => !t.cancelado_em && t.situacao !== 'concluida').flatMap((t) => {
    const fatal = t.fatal_em ? noFuso(t.fatal_em).dia : null;
    const atrasada = Boolean(t.entrega && t.entrega < dia || t.fatal_em && Date.parse(t.fatal_em) < +agora);
    const grupo = atrasada ? 'atrasadas' : t.entrega === dia || fatal === dia ? 'hoje'
      : [t.entrega, fatal].some((d) => d && d > dia && d <= ate) ? 'proximas' : null;
    return grupo ? [{ ...t, grupo }] : [];
  }).sort((a, b) => ['atrasadas', 'hoje', 'proximas'].indexOf(a.grupo) - ['atrasadas', 'hoje', 'proximas'].indexOf(b.grupo)
    || (a.fatal_em || a.entrega).localeCompare(b.fatal_em || b.entrega) || a.id.localeCompare(b.id));
}
