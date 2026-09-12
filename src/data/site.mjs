// Identidade e dados de contato da FHL. Ponto único de verdade: qualquer
// alteração aqui se propaga para as 16 páginas na próxima build.
//
// Dados extraídos do sistema interno da FHL (fhl-site-etapa6-1…html).

export const MARCA = 'FHL';
export const MARCA_LONGA = 'FHL Advocacia';
export const RAZAO = 'FHL Advocacia — Fonseca Hespanha Lisboa';
export const SLOGAN = 'Advocacia estratégica e institucional';
export const OAB = 'OAB/PR nº 00.000';               // [CONFIRMAR] inscrição da sociedade
export const ENDERECO = 'Rua Dr. Leocádio, 282 — Centro';
export const CIDADE = 'Paranaguá — PR';
export const TEL = '(41) 2152-2607';
export const TEL_HREF = '+554121522607';
export const WHATS = '554121522607';
export const EMAIL = 'contato@fhladvocacia.com.br';  // [CONFIRMAR] não constava no sistema

export const DOMINIO = 'https://fhladvocacia.com.br';

const END_Q = 'Rua+Dr.+Leocadio,+282+-+Centro,+Paranagua+-+PR';
export const MAPS = 'https://www.google.com/maps/search/?api=1&query=' + END_Q;
export const MAPS_EMBED = 'https://www.google.com/maps?q=' + END_Q + '&output=embed';

export const NAV = [
  ['index.html', 'Início'],
  ['escritorio.html', 'O Escritório'],
  ['atuacao.html', 'Atuação'],
  ['equipe.html', 'Quem somos'],
  ['publicacoes.html', 'Publicações'],
  ['contato.html', 'Contato'],
];
