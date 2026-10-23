// Reproduz a cópia fixa usada pela função de anexos. Não baixa nada nem publica.
// Antes: extrair o pacote npm pdf-lib@1.17.1 em uma pasta local de ferramentas.
// Uso: node scripts/preparar-verificador-pdf.mjs <pasta/package> <arquivo.tgz>
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const [source, archive] = process.argv.slice(2);
if (!source || !archive) throw new Error('Informe a pasta package extraída e o arquivo pdf-lib-1.17.1.tgz.');
const integrity = 'V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==';
if (createHash('sha512').update(await readFile(archive)).digest('base64') !== integrity) throw new Error('Integridade do pacote PDF divergente.');
let code = await readFile(join(source, 'dist/pdf-lib.esm.js'), 'utf8');
const originalHash = createHash('sha256').update(code).digest('hex');
const change = (from, to) => {
  if (code.split(from).length !== 2) throw new Error('Trecho de limite PDF divergente: ' + from.slice(0, 65));
  code = code.replace(from, () => to);
};
const helpers = `
// FL: orçamento por documento; somente inspeção, nenhum arquivo é regravado.
function flPdfBudget(context) {
    return context.flInspectionBudget || (context.flInspectionBudget = { nodes: 0, depth: 0, decoded: 0 });
}
function flPdfLimit() { throw new Error('FL_PDF_INSPECTION_LIMIT'); }
`;
code = helpers + code;
change('    DecodeStream.prototype.ensureBuffer = function (requested) {', `    DecodeStream.prototype.ensureBuffer = function (requested) {
        if (!Number.isFinite(requested) || requested > 4 * 1024 * 1024) flPdfLimit();`);
change('        if (maybeMinBufferLength) {\n            // Compute the first power', `        if (maybeMinBufferLength && (!Number.isFinite(maybeMinBufferLength) || maybeMinBufferLength > 4 * 1024 * 1024)) flPdfLimit();
        if (maybeMinBufferLength) {
            // Compute the first power`);
change('    PDFObjectParser.prototype.parseObject = function () {', `    PDFObjectParser.prototype.parseObject = function () {
        var budget = flPdfBudget(this.context);
        if (++budget.nodes > 100000 || ++budget.depth > 64) flPdfLimit();
        try { return this.flParseObject(); } finally { budget.depth--; }
    };
    PDFObjectParser.prototype.flParseObject = function () {`);
change('    PDFContext.prototype.assign = function (ref, object) {', `    PDFContext.prototype.assign = function (ref, object) {
        if (!this.indirectObjects.has(ref) && this.indirectObjects.size >= 25000) flPdfLimit();`);
change('        _this.objectCount = dict.lookup(PDFName.of(\'N\'), PDFNumber).asNumber();', `        _this.objectCount = dict.lookup(PDFName.of('N'), PDFNumber).asNumber();
        if (!Number.isSafeInteger(_this.objectCount) || _this.objectCount < 0 || _this.objectCount > 25000
            || !Number.isSafeInteger(_this.firstOffset) || _this.firstOffset < 0) flPdfLimit();`);
const start = code.indexOf('var decodePDFRawStream = function');
const end = code.indexOf('\n};', start);
if (start < 0 || end < 0) throw new Error('Decodificador PDF não encontrado.');
const segment = code.slice(start, end);
const limited = segment.replace('    return stream;', `    var originalDecode = stream.decode;
    stream.decode = function () {
        var decoded = originalDecode.call(this);
        var budget = flPdfBudget(dict.context);
        budget.decoded += decoded.length;
        if (budget.decoded > 16 * 1024 * 1024) flPdfLimit();
        return decoded;
    };
    return stream;`);
if (segment === limited) throw new Error('Saída do decodificador não encontrada.');
code = code.slice(0, start) + limited + code.slice(end);
code = code.replace('//# sourceMappingURL=pdf-lib.esm.js.map', '');
const dest=resolve('supabase/functions/_shared/vendor/pdf-lib-1.17.1');
await mkdir(dest,{recursive:true});
await writeFile(join(dest,'pdf-lib.js'),code);
await writeFile(join(dest,'LICENSE.md'),await readFile(join(source,'LICENSE.md')));
await writeFile(join(dest,'origem.json'),JSON.stringify({name:'pdf-lib',version:'1.17.1',url:'https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz',integrity:'sha512-'+integrity,upstreamSha256:originalHash,localSha256:createHash('sha256').update(code).digest('hex'),modifications:'Limites de descompressão, quantidade de objetos/nós e profundidade, por documento. Reprodução: scripts/preparar-verificador-pdf.mjs. Sem alterações de serialização.'},null,2)+'\n');
console.log('Analisador PDF fixo preparado com integridade conferida e limites de leitura.');
