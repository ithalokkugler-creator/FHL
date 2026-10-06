// Pública porque o visitante não tem login. A chave de serviço fica na borda;
// registrar_contato não pode ser chamada por anon nem authenticated.
import { criarRecebedor } from './handler.js';

let chaves: Record<string, string> = {};
try {
  const recebidas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  if (recebidas && typeof recebidas === 'object' && !Array.isArray(recebidas)) {
    for (const [nome, valor] of Object.entries(recebidas)) {
      if (typeof valor === 'string' && valor) chaves[nome] = valor;
    }
  }
} catch { /* Sem chave: o handler retorna 503. */ }

Deno.serve(criarRecebedor({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  chave: chaves.default ?? Object.values(chaves)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  sal: Deno.env.get('CONTATO_SAL') ?? '',
}));
