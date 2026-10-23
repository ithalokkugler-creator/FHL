// Inspeção estrutural, inclusive objetos comprimidos e referências indiretas.
// O original não é regravado: assinatura digital e SHA-256 ficam intactos.
import { PDFArray, PDFDict, PDFName, PDFParser, PDFRawStream } from './vendor/pdf-lib-1.17.1/pdf-lib.js';

const PROIBIDOS = new Map([
  ['JavaScript', 'O PDF tem JavaScript embutido.'], ['JS', 'O PDF tem JavaScript embutido.'],
  ['Launch', 'O PDF tenta abrir outro programa.'], ['EmbeddedFile', 'O PDF tem arquivo embutido.'],
  ['XFA', 'O PDF tem formulário dinâmico com conteúdo ativo.'],
  ['RichMedia', 'O PDF tem conteúdo multimídia ativo.'],
]);
const ACOES_ATIVAS = new Set([
  'GoToR', 'GoToE', 'Launch', 'Thread', 'Sound', 'Movie', 'Hide', 'Named',
  'SubmitForm', 'ResetForm', 'ImportData', 'JavaScript', 'SetOCGState',
  'Rendition', 'Trans', 'GoTo3DView',
]);

/** Retorna o motivo da recusa, ou null depois de uma inspeção completa. */
export async function riscoEstruturalNoPdf(bytes) {
  try {
    if (!/%%EOF\s*$/.test(new TextDecoder('latin1').decode(bytes.subarray(-2048)))) {
      return 'Não foi possível verificar a estrutura do PDF. Envie um PDF válido sem conteúdo ativo.';
    }
    // O parser de leitura não cria um catálogo novo quando a entrada está
    // incompleta, ao contrário da API de edição de documentos.
    const context = await PDFParser.forBytesWithOptions(bytes, 100, true).parseDocument();
    if (context.trailerInfo.Encrypt) return 'O PDF está protegido por criptografia e não pode ser verificado. Envie uma cópia sem proteção.';
    const catalogo = context.lookup(context.trailerInfo.Root);
    if (!(catalogo instanceof PDFDict) || catalogo.lookup(PDFName.of('Type')) !== PDFName.of('Catalog')
        || !(context.lookup(catalogo.get(PDFName.of('Pages'))) instanceof PDFDict)) {
      return 'Não foi possível verificar a estrutura do PDF. Envie um PDF válido sem conteúdo ativo.';
    }
    const vistos = new Set();
    const fila = context.enumerateIndirectObjects().map(([, obj]) => obj);
    let quantidade = 0;
    while (fila.length) {
      const obj = fila.pop();
      if (!obj || vistos.has(obj)) continue;
      vistos.add(obj);
      if (++quantidade > 100000) return 'O PDF excede o limite de complexidade para verificação.';
      if (obj instanceof PDFName) {
        const motivo = PROIBIDOS.get(obj.decodeText());
        if (motivo) return motivo;
      } else if (obj instanceof PDFRawStream) {
        fila.push(obj.dict);
      } else if (obj instanceof PDFDict) {
        // Links comuns (URI) e destinos internos (GoTo) continuam utilizáveis.
        // Ações automáticas e ações que alteram/enviam dados são recusadas,
        // inclusive quando seus dicionários estão em objetos comprimidos.
        if (obj.has(PDFName.of('AA'))) return 'O PDF tem ações automáticas adicionais.';
        const aoAbrir = context.lookup(obj.get(PDFName.of('OpenAction')));
        if (aoAbrir instanceof PDFDict) return 'O PDF tem uma ação automática ao abrir.';
        const acao = context.lookup(obj.get(PDFName.of('S')));
        const tipo = context.lookup(obj.get(PDFName.of('Type')));
        if (acao instanceof PDFName && PROIBIDOS.has(acao.decodeText())) return PROIBIDOS.get(acao.decodeText());
        if (acao instanceof PDFName && ACOES_ATIVAS.has(acao.decodeText())) {
          return 'O PDF tem uma ação ativa de formulário, arquivo ou multimídia.';
        }
        if (tipo === PDFName.of('Action') && (!(acao instanceof PDFName)
            || !['URI', 'GoTo'].includes(acao.decodeText()))) {
          return 'O PDF tem uma ação que não pode ser verificada.';
        }
        for (const [nome, valor] of obj.entries()) fila.push(nome, valor);
      } else if (obj instanceof PDFArray) {
        for (let i = 0; i < obj.size(); i++) fila.push(obj.get(i));
      }
      // Referências não são expandidas aqui: todo objeto indireto já está
      // na fila. Isso também evita ciclos e inspeções repetidas.
    }
    return null;
  } catch (erro) {
    if (erro?.name === 'EncryptedPDFError' || /encrypted/i.test(erro?.message ?? '')) {
      return 'O PDF está protegido por criptografia e não pode ser verificado. Envie uma cópia sem proteção.';
    }
    if (/FL_PDF_INSPECTION_LIMIT/.test(erro?.message ?? '')) return 'O PDF excede o limite de complexidade para verificação.';
    return 'Não foi possível verificar a estrutura do PDF. Envie um PDF válido sem conteúdo ativo.';
  }
}
