#!/usr/bin/env node
// Testes do banco: `npm run banco:test`.
// =====================================
//
// Aplica todas as migrações num PostgreSQL isolado (PGlite, em memória) e roda
// os arquivos de supabase/testes/. Nada sai desta máquina: nenhum teste toca
// o Supabase de verdade. Cada arquivo devolve linhas { ok, teste, detalhe };
// qualquer `ok = false` faz o comando terminar com erro.
//
//   npm run banco:test                 todos os arquivos
//   npm run banco:test -- financeiro   só os que têm "financeiro" no nome

import { readdir, readFile } from 'node:fs/promises';
import { aplicarMigracoes, criarBanco } from './local/banco.mjs';

// Os seis primeiros na ordem em que foram escritos; os novos depois, por nome.
const PRIMEIROS = ['permissoes.sql', 'financeiro.sql', 'clientes.sql', 'documentos-atualizacoes.sql', 'prazos.sql', 'avisos.sql'];

const filtro = process.argv[2] ?? '';
const todos = (await readdir('supabase/testes')).filter((n) => n.endsWith('.sql'));
const arquivos = [...PRIMEIROS.filter((n) => todos.includes(n)), ...todos.filter((n) => !PRIMEIROS.includes(n)).sort()]
  .filter((n) => n.includes(filtro));

const inicio = Date.now();
const db = await criarBanco();
// O piloto tem três sócios ativos: Marlon saiu em outubro (CLAUDE.md §1).
await db.exec("update public.membros set ativo = false where nome_curto = 'Marlon'");
console.log(`Migrações aplicadas em ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);

let total = 0;
let falhas = 0;
for (const nome of arquivos) {
  let conjuntos;
  try {
    conjuntos = await db.exec(await readFile(`supabase/testes/${nome}`, 'utf8'));
  } catch (erro) {
    console.error(`\n✗ ${nome} não terminou: ${erro.message}`);
    if (erro.where) console.error(erro.where);
    falhas++;
    continue;
  }
  const linhas = conjuntos.flatMap((r) => r.rows).filter((r) => 'ok' in r);
  const ruins = linhas.filter((r) => !r.ok);
  total += linhas.length;
  falhas += ruins.length + (linhas.length ? 0 : 1);
  console.log(`${ruins.length || !linhas.length ? '✗' : '✓'} ${nome}: ${linhas.length - ruins.length}/${linhas.length}`);
  for (const r of ruins) console.log(`    ✗ ${r.teste} — ${r.detalhe ?? ''}`);
}
await db.close();

// Ensaio da migração sobre dados no formato antigo: o banco de produção
// (até 20261006211332) recebe os dados de antes.sql; depois entram as
// migrações novas, e depois.sql confere que nada mudou de valor.
if (!filtro || 'migracao'.includes(filtro)) {
  const PRODUCAO = '20261006211332';
  const velho = await criarBanco({ ate: PRODUCAO });
  let linhas = [];
  try {
    await velho.exec(await readFile('supabase/testes/migracao/antes.sql', 'utf8'));
    await aplicarMigracoes(velho, { desde: PRODUCAO });
    linhas = (await velho.exec(await readFile('supabase/testes/migracao/depois.sql', 'utf8')))
      .flatMap((r) => r.rows).filter((r) => 'ok' in r);
  } catch (erro) {
    console.error(`\n✗ ensaio da migração não terminou: ${erro.message}`);
    falhas++;
  }
  await velho.close();
  const ruins = linhas.filter((r) => !r.ok);
  total += linhas.length;
  falhas += ruins.length;
  console.log(`${ruins.length || !linhas.length ? '✗' : '✓'} migração sobre dados antigos: ${linhas.length - ruins.length}/${linhas.length}`);
  for (const r of ruins) console.log(`    ✗ ${r.teste} — ${r.detalhe ?? ''}`);
}
console.log(`\n${total - falhas} de ${total} verificações aprovadas.`);
if (falhas) process.exitCode = 1;
