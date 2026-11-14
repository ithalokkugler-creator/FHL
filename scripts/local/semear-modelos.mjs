import { MODELOS_OFICIAIS_INICIAIS } from './modelos-iniciais.mjs';
import { validarModelo } from '../../sistema/js/documentos/modelos-editaveis.js';
import { blocosOficiais } from '../../sistema/js/documentos/modelos-oficiais.js';

// Somente para os bancos descartáveis da prévia. Nenhuma matriz de redação
// é publicada num projeto hospedado pela migração de infraestrutura.
export async function semearModelosDocumento(db) {
  await db.transaction(async (tx) => {
    for (const modelo of MODELOS_OFICIAIS_INICIAIS) {
      // A migração 48 já carrega os modelos; aqui só entra o que faltar.
      const { rows: existe } = await tx.query('select 1 from public.modelos_documento where chave_oficial = $1', [modelo.chave]);
      if (existe.length) continue;
      validarModelo(modelo.definicao, { publicar: true, extras: blocosOficiais(modelo.chave) });
      const definicao = JSON.stringify(modelo.definicao);
      await tx.query('select privado.validar_campos_modelo_documento($1::jsonb, $2)', [definicao, modelo.chave]);
      const { rows: [{ id }] } = await tx.query(
        'insert into public.modelos_documento (chave_oficial, tipo) values ($1,$2) returning id',
        [modelo.chave, modelo.tipo],
      );
      const { rows: [{ id: versao }] } = await tx.query(
        "insert into public.modelos_documento_versoes (modelo_id,numero,nome,titulo,categoria,definicao,fonte,publicado_em) values ($1,1,$2,$3,$4,$5::jsonb,$6,case when $7::boolean then null else now() end) returning id",
        [id, modelo.nome, modelo.titulo, modelo.categoria, definicao, modelo.fonte, modelo.rascunho],
      );
      if (!modelo.rascunho) {
        await tx.query('update public.modelos_documento set versao_atual_id=$1 where id=$2', [versao, id]);
      }
    }
  });
}

