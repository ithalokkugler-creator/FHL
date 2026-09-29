// Identidade e dados de contato da FHL. Ponto único de verdade: qualquer
// alteração aqui se propaga para as 16 páginas na próxima build.
//
// Dados extraídos do sistema interno da FHL (fhl-site-etapa6-1…html).

export const MARCA = 'FHL';
export const MARCA_LONGA = 'FHL Advocacia';
export const RAZAO = 'FHL Advocacia — Fonseca Hespanha Lisboa';
export const SLOGAN = 'Advocacia estratégica e institucional';

// Inscrição da SOCIEDADE na OAB e CNPJ — [CONFIRMAR], não constam em lugar
// nenhum. Vazios de propósito: o site mostrava "OAB/PR nº 00.000" no rodapé,
// no menu e no contato, e número inventado num site de advocacia é pior do
// que nenhum. Enquanto estiverem vazios, o rodapé mostra a inscrição
// de cada advogado (src/data/equipe.mjs) e a Política de Privacidade omite o
// CNPJ. Preenchidos, aparecem sozinhos em todos esses lugares.
export const OAB = '';    // ex.: 'OAB/PR nº 12.345'
export const CNPJ = '';   // ex.: '12.345.678/0001-90'

export const ENDERECO = 'Rua Dr. Leocádio, 282 — Centro';
export const CIDADE = 'Paranaguá — PR';
export const TEL = '(41) 2152-2607';
export const TEL_HREF = '+554121522607';
export const WHATS = '554121522607';
export const EMAIL = 'contato@fhladvocacia.com.br';  // [CONFIRMAR] não constava no sistema

// Horário de atendimento. Aparecia escrito à mão em sete lugares.
export const HORARIO = 'Segunda a sexta, das 9h às 18h';
export const HORARIO_CURTO = 'Seg. a sex., 9h às 18h';

// Anos de atuação, no bloco de números (src/partials/institucional.mjs).
// [CONFIRMAR] Era 10, sem fonte nenhuma. A única referência é o Vinícius na
// reunião de 11/09: "hoje eu já estou há seis anos" — compatível com a
// inscrição dele na OAB (105.790). Pode ser o tempo dele, não o do escritório.
export const ANOS_DE_ATUACAO = 6;

// Envio do formulário de contato. Vazio enquanto não há backend: o formulário
// valida tudo e entrega a mensagem pronta no WhatsApp do escritório, em vez de
// fingir um envio que não aconteceu. Com um endpoint (ex.: uma função do
// Supabase que grava no módulo Contatos), vira um POST com os campos em JSON.
export const FORM_ENDPOINT = '';

// Endereço público do site. Vira URL absoluta no canonical, no og:image e no
// sitemap — buscadores e redes sociais não aceitam caminho relativo ali.
// A variável de ambiente SITE_URL sobrescreve no build: serve para testar a
// prévia de links num endereço provisório (o da Vercel, por exemplo) antes de
// o domínio oficial existir.
export const DOMINIO = (process.env.SITE_URL || 'https://fhladvocacia.com.br')  // [CONFIRMAR] domínio
  .replace(/\/+$/, '');

// Perfis oficiais nas redes. Os campos do sistema interno nunca foram
// preenchidos — [CONFIRMAR]. Vazio não aparece em lugar nenhum; preenchido,
// entra no JSON-LD do escritório (sameAs), que ajuda o Google a ligar o site
// aos perfis.
export const REDES = {
  instagram: '',
  facebook: '',
  linkedin: '',
};

const END_Q = 'Rua+Dr.+Leocadio,+282+-+Centro,+Paranagua+-+PR';
export const MAPS = 'https://www.google.com/maps/search/?api=1&query=' + END_Q;
export const MAPS_EMBED = 'https://www.google.com/maps?q=' + END_Q + '&output=embed';

/** Link do WhatsApp. `texto` pré-preenche a mensagem — é assim que o escritório
 *  sabe de qual página ou campanha o contato veio. */
export const whatsappUrl = (texto = '') =>
  `https://wa.me/${WHATS}` + (texto ? `?text=${encodeURIComponent(texto)}` : '');

export const NAV = [
  ['index.html', 'Início'],
  ['escritorio.html', 'O Escritório'],
  ['atuacao.html', 'Atuação'],
  ['equipe.html', 'Quem somos'],
  ['publicacoes.html', 'Publicações'],
  ['contato.html', 'Contato'],
];
