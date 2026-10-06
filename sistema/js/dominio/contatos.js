import { semAcento, soDigitos } from '../nucleo/formato.js';

export const COLUNAS_CONTATO = 'id,canal,nome,email,telefone,empresa,mensagem,pagina,campanha,consentimento_em,recebido_em,situacao,responsavel_id,cliente_id,convertido_em,observacoes';

export function origemContato(c) {
  if (c.canal !== 'site') return ({ whatsapp: 'WhatsApp', telefone: 'Telefone', presencial: 'Presencial', indicacao: 'Indicação', outro: 'Outro' })[c.canal] ?? c.canal;
  if (c.campanha) return `Site · campanha ${c.campanha}`;
  return `Site · ${c.pagina === '/' || c.pagina === '/index.html' ? 'Início' : c.pagina === '/contato.html' ? 'Contato' : c.pagina || 'página não informada'}`;
}

export function filtrarContatos(lista, f) {
  const busca = semAcento(f.busca).toLocaleLowerCase('pt-BR').trim();
  const digitos = soDigitos(busca);
  return lista.filter((c) => {
    if (f.situacao === 'abertos' && !['novo', 'em_atendimento', 'contatado'].includes(c.situacao)) return false;
    if (f.situacao && !['abertos', 'todas'].includes(f.situacao) && c.situacao !== f.situacao) return false;
    if (f.canal && c.canal !== f.canal) return false;
    if (f.campanha && c.campanha !== f.campanha) return false;
    const dia = c.recebido_em.slice(0, 10);
    if (f.de && dia < f.de || f.ate && dia > f.ate) return false;
    return !busca || semAcento(`${c.nome} ${c.email ?? ''} ${c.telefone ?? ''}`).toLocaleLowerCase('pt-BR').includes(busca)
      || (digitos.length >= 3 && /^[\d\s()+.-]+$/.test(busca) && soDigitos(c.telefone).includes(digitos));
  });
}

/** O resumo tem seu próprio período, independentemente dos filtros da lista. */
export function resumirOrigens(lista, desde) {
  const contagem = new Map();
  const limite = Date.parse(desde);
  for (const c of lista.filter((c) => Date.parse(c.recebido_em) >= limite)) {
    const origem = origemContato(c);
    contagem.set(origem, (contagem.get(origem) ?? 0) + 1);
  }
  return [...contagem].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}
