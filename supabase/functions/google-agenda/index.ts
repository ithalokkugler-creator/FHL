// Google Agenda nos dois sentidos. A chave do servidor e o segredo do Google
// ficam aqui; a autorização da conta do escritório fica no banco (privado).
import { criarSincronizador } from './handler.js';

let chaves: Record<string, string> = {};
try {
  const recebidas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  if (recebidas && typeof recebidas === 'object' && !Array.isArray(recebidas)) {
    for (const [nome, valor] of Object.entries(recebidas)) {
      if (typeof valor === 'string' && valor) chaves[nome] = valor;
    }
  }
} catch { /* Sem chave: o handler retorna 503. */ }

const url = Deno.env.get('SUPABASE_URL') ?? '';

Deno.serve(criarSincronizador({
  url,
  chave: chaves.default ?? Object.values(chaves)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  clienteId: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
  segredo: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
  // O mesmo endereço cadastrado no Google Cloud como "URI de redirecionamento".
  retorno: Deno.env.get('GOOGLE_REDIRECT_URI') ?? `${url}/functions/v1/google-agenda`,
  sistema: Deno.env.get('SISTEMA_URL') ?? 'https://advocaciafl.com.br/sistema/',
  conta: (Deno.env.get('GOOGLE_CONTA') ?? 'contato@advocaciafl.com.br').toLowerCase(),
}));
