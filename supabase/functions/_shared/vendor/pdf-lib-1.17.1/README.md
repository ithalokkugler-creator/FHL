# Analisador PDF da verificação de anexos

Cópia local fixa de `pdf-lib@1.17.1`, distribuída pelo projeto
[pdf-lib](https://github.com/Hopding/pdf-lib/tree/v1.17.1), licença MIT.
O bundle conserva os avisos dos componentes incorporados (incluindo os
decodificadores derivados de Mozilla PDF.js). `origem.json` registra o pacote,
a integridade SHA-512 original e os hashes do módulo original e da cópia local.

A cópia é usada somente para leitura estrutural na função privada de anexos.
Não executa ações PDF, não altera os bytes enviados e não consulta serviços.
Não é enviada pelo build do site nem substitui antivírus.

Limites locais adicionados, por documento:

- 4 MiB por buffer de descompressão; 16 MiB decodificados no total;
- 25.000 objetos indiretos ou declarados em um fluxo de objetos;
- 100.000 nós lidos e profundidade máxima 64.

Esses limites interrompem a leitura antes de grandes alocações de buffers.
PDFs cifrados, inválidos, com codificação não suportada nos objetos ou que
ultrapassem os limites são recusados com motivo; não recebem estado verificado.
Imagens/conteúdo gráfico de páginas não precisam ser descomprimidos para
inspecionar os objetos e ações. PDFs modernos com fluxos de objetos comuns
continuam aceitos.

Reprodução: extrair o pacote npm indicado em `origem.json` e executar
`node scripts/preparar-verificador-pdf.mjs <pasta/package> <arquivo.tgz>`.
O preparador verifica a integridade do arquivo e exige trechos exatos para
as alterações de limites. Não baixar/regerar código durante o deploy.

Ao atualizar a versão, revisar os pontos de limite e executar os testes de
anexos, PDF comprimido, conteúdo ativo, arquivos inválidos e expansão excessiva.
