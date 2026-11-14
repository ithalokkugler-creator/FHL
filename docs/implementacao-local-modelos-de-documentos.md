# Implementação local do catálogo de modelos de documentos

**13 de novembro de 2026 · Área dos advogados da Fonseca Lisboa Advocacia**

A prévia local passou a oferecer **Clientes → Documentos → Modelos**. O catálogo, as matrizes iniciais e os testes usam dados fictícios. Não houve push, deploy, alteração no Supabase remoto ou modificação nos arquivos originais da pasta “Modelos novos”. Para executar, use `npm run testar:local` no repositório com PGlite instalado e abra `http://127.0.0.1:8125/sistema/?perfil=admin#/documentos/modelos`. O modo `--simulado` é a prévia antiga e não serve para conferir o catálogo. Use outro `PORT_TESTE` se a porta estiver ocupada.

## O que foi adicionado

- **Catálogo:** busca por nome, filtro por categoria e situação, indicação de rascunho ou versão publicada, abertura pelo documento ou pela ficha do cliente. O seletor conserva o acesso à Prestação de Contas. Os atalhos de Financeiro, Agenda e Atualizações podem abrir a edição correspondente com suas fontes vinculadas.
- **Autoria:** criar do zero, editar texto, inserir campos no cursor, configurar perguntas e assinaturas, ver uma prévia com dados fictícios e guardar rascunhos. Perguntas incluem texto curto/longo, data, valor, inteiro e escolha entre opções. Modelos genéricos e oficiais sem blocos exclusivos podem ser duplicados. Os oficiais com blocos de cálculo e ramos próprios são editados na sua própria família.
- **Permissões e versões:** quem tem acesso a Clientes vê o catálogo publicado. Administração pode habilitar autoria em Membros e continua responsável pela publicação, arquivamento, reativação e restauração. A edição publicada é imutável. Restaurar cria novo rascunho. Dois editores não sobrescrevem a mesma revisão silenciosamente.
- **Emissão:** preencher dados do cliente, CPF/CNPJ, qualificação, processo, advogado/OAB e perguntas. Nos modelos oficiais que exigem outros papéis, selecionar cada pessoa separadamente ou preencher nesta via. Fontes protegidas exigem acesso e coerência com o cliente e processo. Documentos novos guardam o ID da versão e o HTML final. Reimprimir copia a instância original. “Gerar outro” consulta a versão vigente.
- **Identidade e saída:** folha A4 em preto, marca FL, título do documento alinhado à esquerda na prévia, impressão e Word, listas, tabelas e assinaturas por papel. Usa Palatino Linotype quando instalada, com Times New Roman como alternativa. Impressão pelo navegador e download Word em `.doc` com a marca incorporada. A barra de cor e realce fica oculta nessas folhas.
- **Migração aditiva:** adiciona tabelas de modelos e versões e referências opcionais aos documentos. RLS e operações de banco limitam transições, vigência, origem, reimpressão e leitura de documentos versionados com dados financeiros ou de agenda particular. A migração contém apenas a infraestrutura. Os textos só são semeados no banco descartável da prévia.

## Matriz local dos modelos enviados

As redações abaixo são **versões locais para conferência do escritório**. Algumas cláusulas foram colocadas em campos explícitos quando o Word continha exemplos, condições mutuamente exclusivas ou termos que precisam de aceite. O [plano detalhado](preparacao-modelos-de-documentos.md#ficha-de-cada-arquivo) continua sendo a referência para comparar com cada original.

| Modelo | O que entrou na prévia |
|---|---|
| Carta de Preposição | Empresa PJ, representante e preposto em papéis separados, CNJ e confirmação do vínculo. |
| Contrato de Honorários | Estrutura em 11 seções, modalidades de pagamento, bloco das parcelas do Financeiro, êxito e repasse, seleção de garantia e condições complementares. As condições de despesas, extinção, foro e de garantias específicas pedem conferência. |
| Anuência de Usucapião | Confrontante e possuidor, referência ao memorial, anos de posse e assinatura do confrontante. |
| Comparecimento | Qualificação, advogado, data do atendimento e destinatário opcional. O atalho só aparece com presença registrada. |
| Desistência | Qualificação, autos e quatro declarações com cláusula sobre procuradores a conferir. |
| Endereço | Declarante distinto da pessoa declarada, residência com o declarante ou em outro endereço e período. |
| Hipossuficiência | Qualificação, declaração e assinatura. |
| Renúncia de Crédito Excedente | Alternativa JEC/JEF com texto e teto correspondentes, sem cálculo de montante. |
| FAA | Tabela de dados do assistido, filiação, relato, assinatura e dados bancários opcionais. |
| Intimação de Testemunha | Assistido, signatário, testemunha, audiência, modalidade, local/link, orientação remota quando aplicável e ramo informado. |
| Notificação | Notificante, notificado e corpo editável. O exemplo de conteúdo e o QR de origem deram lugar a assunto/descrição preenchidos e contato institucional em texto. |
| Outorga Conjugal | Duas pessoas, regime e quatro ramos com perguntas específicas, sem imprimir a lista de alternativas. |
| Procuração | Outorgante, advogados selecionados e poderes em blocos. Poderes complementares ficam explicitamente editáveis para conferência. |
| Renúncia de Mandato | Advogados que renunciam, cliente, autos e uma forma de comunicação por emissão. |
| Revogação de Mandato | Revogante, advogado revogado, escopo e condições de comunicação confirmadas. |
| Substabelecimento | Advogado signatário, autos, cliente, substabelecido e escolha com/sem reserva. |
| Termo de Rescisão do Contrato de Trabalho | Empregador e empregado, datas, verbas, deduções, FGTS, parcelas, forma de assinatura e checagem da soma em centavos. O cálculo das verbas deve vir conferido. |
| Termo de Responsabilidade por Chave de Processo | Qualificação, número dos autos e assinatura. A chave efetiva não é solicitada. |
| Recibo | Mantido no Financeiro e ligado à baixa. A identificação do emitente inclui OAB quando registrada, sem suprimir as variantes de parcial, antecipação, repasse e pagamento direto. |
| PAIA | Matriz de pauta para conferência, protegida como rascunho interno. A publicação permanece indisponível até o desenho da permissão de leitura da pauta. |

As nove peças de peticionamento seguem documentadas no plano e fora do catálogo inicial, conforme a orientação da transcrição. A Prestação de Contas e o Relatório de Atividades permanecem nos fluxos existentes. Importação de DOCX no editor, exportação DOCX nativa, assinatura eletrônica e editor de regras condicionais arbitrárias não fazem parte desta etapa. A conferência de fidelidade do Word no Microsoft Word, dos originais renderizados e das cláusulas completas é necessária antes de usar as matrizes em casos reais.

## Revisões e correções

Foram usados **cinco agentes Terra 6.1 em esforço médio**, um **Terra 6.1 em esforço baixo** para design e um **Terra 6.1 em esforço médio** para a revisão final. A ferramenta desta sessão oferece Terra 6.1 no lugar do Terra 5.1 pedido. Os cinco testes foram divididos em banco, editor, emissão, matrizes e integração. Os agentes enviaram relatos ao responsável pela implementação. Achados de leitura estática foram conferidos no código e, onde disponível, reproduzidos por testes de navegador ou de banco.

| Problema confirmado | Correção |
|---|---|
| Primeira gravação devolvia um rascunho durante edição concorrente e a segunda tentativa podia retornar o mesmo ID sem salvar a alteração. | Após a criação, a tela usa a revisão recebida para atualizar. Compara uma fotografia serializada do texto enviado com o texto atual antes de considerar a gravação concluída. |
| Arquivamento com alterações locais podia descartar o que estava no editor. | A ação pede salvar ou descartar antes de arquivar, como na restauração. Duplicação com mudanças avisa que as alterações vão para a cópia. |
| Na emissão vinculada, mudar complemento depois de editar a folha exigia descartar a edição manual. | A tela passou a oferecer manter a folha revisada, com confirmação. Campos de valores do contrato vinculado continuam bloqueados e a emissão valida o contexto. |
| Trocar cliente apagava complementos sem aviso quando a folha ainda não tinha sido editada. | A troca pede confirmação quando já há complementos preenchidos, limpa o contexto anterior e permite cancelar preservando o texto. |
| Cadastro de representante parcial e CNJ incompleto podiam esconder o complemento de que a emissão precisava. | O formulário oferece os campos de apoio quando a origem não basta. A seleção do CNJ verifica a validade antes de ocultar entrada manual. |
| A existência do vínculo financeiro podia ocultar o critério de atraso mesmo sem critério disponível. | O campo aparece quando o bloco de atraso precisa do dado e a fonte não fornece o critério. O ramo sem valor fixo ou de acordo não pede atraso de contratante. |
| A orientação de participação remota podia contradizer a modalidade da Agenda. | Uma só resolução de modalidade é usada na exibição, no aviso e na regra que mostra o campo. |
| Rescisão aceitava a ausência do tipo de assinatura e não orientava sobre diferença entre as parcelas e o líquido. | Exige escolha de assinatura, pede testemunhas no ramo manuscrito e confere os valores em centavos. |
| A redação de Substabelecimento repetia “poderes” junto da escolha de reserva. | Alterada a frase, mantendo os dois ramos. |
| Atalhos legados podiam voltar a gerar modelo oficial arquivado. | Catálogo e atalho passam a reconhecer a retirada do modelo. O banco bloqueia nova inserção legada e preserva a cópia comprovada de uma instância antiga. |
| A revisão final detectou que a API ainda aceitava campos oficiais desconhecidos ou de outra família. | O banco confere a lista exata de cada família ao salvar e ao publicar. A carga inicial usa a mesma validação, e os testes cobrem tanto as recusas como o campo válido. |
| Exportação Word podia disparar tentativa de abrir uma URL local do pacote MHTML no DOM. | As referências internas são inseridas apenas no texto serializado do arquivo. O pacote conserva o PNG incorporado. |
| Editor no celular exigia percorrer toda a coluna para voltar ao cursor, e a prévia podia parecer uma prova de paginação. | Ações “Ir para o texto”/“Voltar aos campos”, dica de inserção no cursor, estados claros para busca vazia e prévia fictícia de conteúdo com aviso de que a paginação aparece na impressão. |

## Verificação local

- `npm run sistema:test` — **257** testes, incluindo 5 novos de modelos editáveis.
- `npm run banco:test` — **842** verificações no PGlite, incluindo 24 de catálogo, permissões, cópia de versão, origens particulares, arquivamento e campos oficiais.
- `npm run check -- --local` — **19 páginas** verificadas com dados locais. O comando sem `--local` tenta carregar conteúdo remoto e encontrou erro de DNS. A variante local foi usada nesta entrega.
- Chromium com transporte local em memória para manter o navegador, a API e o PGlite na mesma prévia. Fluxo executado: criar → inserir nome, CPF e pergunta → prévia fictícia → salvar rascunho → publicar → escolher cliente → conferir CPF → gravar → baixar `.doc` com imagem → publicar v2 → abrir documento v1 e gerar outro na v2. As operações da API retornaram sucesso.
- Catálogo e editor renderizados em 1366 e 390 px. O ensaio móvel verificou foco e navegação nos novos atalhos. As capturas e o roteiro de navegador ficaram em `.local/`.
- O agente da revisão final repetiu os testes focados e o fluxo do navegador. Depois da última correção, confirmou as **24 verificações** de catálogo. A conferência de Word nativo e a leitura jurídica das matrizes ficam com o escritório antes da disponibilização em produção.

