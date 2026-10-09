// Mensagens preparadas para a equipe conferir e enviar.
// =====================================================
//
// O sistema só escreve o texto: enviar continua sendo um gesto da pessoa, no
// WhatsApp ou no e-mail dela (CLAUDE.md §4, Notificações — "avisa, não envia").

import { dataExtensa, hora, noFuso } from '../nucleo/formato.js';
import { CIDADE, ENDERECO } from '../escritorio.js';

const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/)[0];

export function mensagemAniversario({ cliente, remetente }) {
  return `Olá, ${primeiroNome(cliente.nome)}! Aqui é ${remetente}, da Fonseca Lisboa Advocacia. `
    + 'Passando para desejar um feliz aniversário — muita saúde, muita sorte, e que Deus te abençoe! '
    + 'Precisando de alguma coisa, estamos à disposição.';
}

/** Lembrete do atendimento de amanhã: dia, hora de Brasília, advogado e onde. */
export function mensagemLembrete({ compromisso: c, remetente, advogado }) {
  const online = c.modalidade === 'online';
  const local = c.local_ou_link || (online ? 'O link será confirmado pela equipe.' : `${ENDERECO}, ${CIDADE}.`);
  return `Olá, ${primeiroNome(c.cliente_nome)}! Aqui é ${remetente}, da Fonseca Lisboa Advocacia. `
    + `Lembrando do seu atendimento em ${dataExtensa(noFuso(c.inicio).dia)}, às ${hora(c.inicio)}`
    + `${advogado ? `, com ${advogado}` : ''}. `
    + `${online ? 'Atendimento online: ' : 'Local: '}${local} `
    + 'Se precisar remarcar, é só responder esta mensagem. Estamos à disposição.';
}

// Como a pessoa chegou até o escritório, na frase "Recebemos seu contato …".
const ORIGENS = {
  site: 'pelo site',
  whatsapp: 'pelo WhatsApp',
  telefone: 'por telefone',
  presencial: 'aqui no escritório',
  indicacao: 'por indicação',
};

export function mensagemRespostaContato({ contato, remetente }) {
  const origem = ORIGENS[contato.canal];
  return `Olá, ${primeiroNome(contato.nome)}! Aqui é ${remetente}, da Fonseca Lisboa Advocacia. `
    + `Recebemos seu contato${origem ? ` ${origem}` : ''} e estamos à disposição para conversar sobre a sua situação. `
    + 'Qual seria um bom horário para falar?';
}
