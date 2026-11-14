import { db } from '../nucleo/supabase.js';
import { higienizar } from '../nucleo/higienizar.js';

const MODELOS = 'id,chave_oficial,tipo,versao_atual_id,arquivado_em,motivo_arquivo';
const RESUMO = 'id,modelo_id,numero,revisao,nome,titulo,categoria,publicado_em,publicado_por,criado_por,alterado_por,fonte';
const FILTRO = (id) => [['id','eq',id]];
const indisponivel = (erro) => ['42P01', 'PGRST205'].includes(erro?.codigo);

export async function carregarCatalogo({ tolerarAusencia = false } = {}) {
  let modelos;
  try {
    modelos = await db.todos('modelos_documento', { select: MODELOS });
  } catch (erro) {
    if (tolerarAusencia && indisponivel(erro)) return [];
    throw erro;
  }
  if (!modelos.length) return [];
  const todas = await db.todos('modelos_documento_versoes', { select: RESUMO, ordem: 'numero.desc,id.desc' });
  const porModelo = new Map();
  for (const v of todas) {
    if (!porModelo.has(v.modelo_id)) porModelo.set(v.modelo_id, []);
    porModelo.get(v.modelo_id).push(v);
  }
  return modelos.map((m) => {
    const versoes = porModelo.get(m.id) || [];
    return { ...m, versoes, atual: versoes.find((v) => v.id === m.versao_atual_id), rascunho: versoes.find((v) => !v.publicado_em) };
  });
}

export const carregarVersao = (id) => db.um('modelos_documento_versoes', {
  select: RESUMO + ',definicao,origem_id',
  filtros: FILTRO(id),
});

export const acaoModelo = (acao, p) => db.rpc('modelo_documento_acao', { p_acao: acao, p });
export async function legadoArquivado(chave) {
  try {
    return await db.rpc('modelo_legado_arquivado', {p_chave:chave});
  } catch (erro) {
    if (['PGRST202','42883'].includes(erro?.codigo)) return false;
    throw erro;
  }
}

export function salvarEmissao(p) {
  const conteudo = higienizar(p.conteudo);
  if (!conteudo.trim() || conteudo.length > 400000) throw new Error('Revise o tamanho e o conteúdo do documento.');
  return db.rpc('emitir_documento_modelo', { p: { ...p, conteudo } });
}
export const repetirEmissao = (p) => db.rpc('emitir_documento_modelo', { p });

