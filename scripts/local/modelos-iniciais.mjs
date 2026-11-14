import { readFileSync } from 'node:fs';

// Catálogo do banco descartável. Regenerar com importar-modelos-docx.py.
export const MODELOS_OFICIAIS_INICIAIS = JSON.parse(
  readFileSync(new URL('./modelos-docx.json', import.meta.url), 'utf8'),
);
