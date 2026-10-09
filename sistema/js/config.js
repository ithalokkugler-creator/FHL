// Projeto Supabase do piloto: "fhl-advocacia", organização Haderach solutions,
// plano gratuito, região São Paulo.
//
// A chave publicável é pública por natureza — vai em todo navegador que abre o
// sistema. Quem protege os dados são as políticas do banco
// (supabase/migrations/). Nunca coloque aqui a chave secreta nem a service_role.
//
// Este arquivo é lido em dois lugares: pelo navegador, aqui na área dos
// advogados, e pelo Node, no build do site (src/data/conteudo.mjs), que busca
// as publicações e as campanhas. Por isso não pode depender de nada do
// navegador — são constantes e nada mais.

export const SUPABASE_URL = 'https://ulnpnbzibwbrzrpomgia.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_AlYu4_kFqmiep4QsQaTZsg_qCz4arVD';

// API pública e gratuita do CNJ (DJEN). Só responde a pedidos vindos do
// Brasil — por isso quem consulta é o navegador do escritório, não um
// servidor. Precisa estar no connect-src da CSP (vercel.json).
export const DJEN_URL = 'https://comunicaapi.pje.jus.br/api/v1';

// Consulta de CEP (ViaCEP, gratuita). Só o CEP sai daqui; o resto do
// endereço é preenchido na tela e pode ser corrigido à mão.
export const CEP_URL = 'https://viacep.com.br/ws';
