import test from 'node:test';
import assert from 'node:assert/strict';
import { descreverErroBanco } from '../js/nucleo/erros-banco.js';

test('Erro de quantidade aponta campo e limites sem mostrar os dados da linha', () => {
  const erro = descreverErroBanco({ code: '23514', message: 'new row violates check constraint "tarefas_quantidade_check"', details: 'Failing row contains (CPF PRIVADO, 0)' }, 400);
  assert.equal(erro.campo, 'quantidade');
  assert.match(erro.mensagem, /inteiro de 1 a 3650/);
  assert.doesNotMatch(erro.mensagem, /PRIVADO|Failing row/);
});
test('Erro de regra do prazo explica a relação entre datas', () => {
  const erro = descreverErroBanco({ code: '23514', message: 'violates check constraint "tarefa_prazo_completo"' }, 400);
  assert.equal(erro.campo, 'fatal_dia');
  assert.match(erro.mensagem, /entrega não pode ser posterior/);
});
test('Erros escritos pelo domínio preservam motivo e falhas SQL não vazam detalhes', () => {
  assert.equal(descreverErroBanco({ code: 'P0001', message: 'O responsável precisa ser um membro ativo.' }, 400).mensagem, 'O responsável precisa ser um membro ativo.');
  assert.doesNotMatch(descreverErroBanco({ code: 'XX000', message: 'SQL com dados privados', details: 'CPF PRIVADO' }, 500).mensagem, /SQL|PRIVADO/);
  assert.match(descreverErroBanco({}, 401).mensagem, /sessão expirou/);
});
test('Coluna obrigatória e vínculo recusado apontam o campo correto', () => {
  assert.equal(descreverErroBanco({ code: '23502', message: 'null value in column "responsavel_id" of relation "tarefas" violates not-null constraint' }, 400).campo, 'responsavel_id');
  assert.equal(descreverErroBanco({ code: '23503', message: 'violates foreign key constraint "tarefas_processo_id_fkey"' }, 400).campo, 'processo_id');
  assert.match(descreverErroBanco({ code: '23505', message: 'violates unique constraint "clientes_documento_unico"' }, 400).mensagem, /CPF \/ CNPJ/);
});
