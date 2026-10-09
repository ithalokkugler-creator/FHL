// Formatação da folha: o que a barra oferece e a regra de cada opção.
// ===================================================================
//
// Pedido do escritório (08/10/2026): um Word simplificado na geração de
// documentos — fonte, tamanho, cor, realce, alinhamento e recuo.
//
// Toda formatação é uma classe `doc-*`, nunca style="": a CSP da área
// (style-src 'self') bloqueia estilo inline — o Chrome até grava o atributo,
// mas não o aplica —, e a lista branca (nucleo/higienizar.js) só guarda as
// classes doc-*. Assim, o que se vê na tela é o que se grava, imprime e baixa.
//
// Este arquivo é a fonte única das regras: o .doc as recebe de cssFormatacao(''),
// e o bloco "formatação da folha" de sistema.css é cssFormatacao('.documento-folha ')
// copiado — o teste documentos-tempo.test.mjs confere que os dois não divergem.

// [id, nome na barra, font-family]
export const FONTES = [
  ['times', 'Times New Roman', "'Times New Roman', Times, serif"],
  ['arial', 'Arial', 'Arial, Helvetica, sans-serif'],
  ['calibri', 'Calibri', 'Calibri, Carlito, Arial, sans-serif'],
  ['garamond', 'Garamond', "Garamond, 'EB Garamond', 'Times New Roman', serif"],
  ['georgia', 'Georgia', 'Georgia, serif'],
  ['courier', 'Courier New', "'Courier New', Courier, monospace"],
];

// Em pontos, como no Word. O texto da folha nasce em 12.
export const TAMANHOS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28];

// [id, nome, cor]. "Automática" é a ausência de classe.
export const CORES = [
  ['cinza', 'Cinza', '#595959'],
  ['vermelho', 'Vermelho', '#C00000'],
  ['laranja', 'Laranja', '#C55A11'],
  ['verde', 'Verde', '#38761D'],
  ['azul', 'Azul', '#1F4E79'],
  ['azul-claro', 'Azul-claro', '#2E75B6'],
  ['roxo', 'Roxo', '#7030A0'],
  ['petroleo', 'Verde-petróleo', '#2E615D'],
  ['vinho', 'Vinho', '#6E5551'],
];

export const REALCES = [
  ['amarelo', 'Amarelo', '#FFF176'],
  ['verde', 'Verde', '#C8E6C9'],
  ['azul', 'Azul', '#BBDEFB'],
  ['rosa', 'Rosa', '#F8BBD0'],
  ['laranja', 'Laranja', '#FFE0B2'],
  ['cinza', 'Cinza', '#E0E0E0'],
];

// [id, nome, text-align]. Vai no parágrafo, não no trecho.
export const ALINHAMENTOS = [
  ['esquerda', 'Alinhar à esquerda', 'left'],
  ['centro', 'Centralizar', 'center'],
  ['direita', 'Alinhar à direita', 'right'],
  ['justificar', 'Justificar', 'justify'],
];

// Recuo do parágrafo em degraus de 1,25 cm — a tabulação padrão do Word.
export const RECUOS = 4;
const RECUO_CM = 1.25;

/**
 * Categorias de trecho: cada uma vira `doc-<prefixo>-<id>` num <span>. Um
 * trecho tem no máximo uma classe de cada categoria (a barra troca, não
 * empilha).
 */
export const CATEGORIAS = {
  fonte: { prefixo: 'fonte', valores: FONTES.map(([id]) => id) },
  tamanho: { prefixo: 'tam', valores: TAMANHOS.map(String) },
  cor: { prefixo: 'cor', valores: CORES.map(([id]) => id) },
  realce: { prefixo: 'realce', valores: REALCES.map(([id]) => id) },
};

export const classeDe = (categoria, valor) => `doc-${CATEGORIAS[categoria].prefixo}-${valor}`;

/** A categoria de uma classe doc-*, ou null: 'doc-cor-azul' → 'cor'. */
export function categoriaDaClasse(classe) {
  for (const [nome, c] of Object.entries(CATEGORIAS)) {
    if (classe.startsWith(`doc-${c.prefixo}-`) && c.valores.includes(classe.slice(c.prefixo.length + 5))) return nome;
  }
  return null;
}

/** As regras, uma por linha. `escopo` é o prefixo do seletor ('.documento-folha ' na tela, '' no Word). */
export function cssFormatacao(escopo = '') {
  const regra = (classe, corpo) => `${escopo}.${classe} { ${corpo}; }`;
  return [
    ...FONTES.map(([id, , familia]) => regra(classeDe('fonte', id), `font-family: ${familia}`)),
    ...TAMANHOS.map((t) => regra(classeDe('tamanho', t), `font-size: ${t}pt`)),
    ...CORES.map(([id, , cor]) => regra(classeDe('cor', id), `color: ${cor}`)),
    ...REALCES.map(([id, , cor]) => regra(classeDe('realce', id), `background-color: ${cor}`)),
    ...ALINHAMENTOS.map(([id, , valor]) => regra(`doc-alinhar-${id}`, `text-align: ${valor}`)),
    ...Array.from({ length: RECUOS }, (_, i) => regra(`doc-recuo-${i + 1}`, `margin-left: ${(RECUO_CM * (i + 1)).toFixed(2)}cm`)),
    // Tirar o negrito de um título: o Chrome faria com style="", que a CSP bloqueia.
    regra('doc-sem-negrito', 'font-weight: normal'),
    regra('doc-sem-italico', 'font-style: normal'),
  ].join('\n');
}
