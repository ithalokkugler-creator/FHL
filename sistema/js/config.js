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
// navegador — são duas constantes e nada mais.

export const SUPABASE_URL = 'https://ulnpnbzibwbrzrpomgia.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_AlYu4_kFqmiep4QsQaTZsg_qCz4arVD';
