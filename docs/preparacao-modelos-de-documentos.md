# Preparação dos modelos de documentos da Fonseca Lisboa Advocacia

**13 de novembro de 2026 · Base do sistema: `main`, commit `e0880f3`.**

A entrega proposta tem duas partes: adaptar os modelos enviados pelo escritório e criar, em **Clientes → Documentos → Modelos**, um catálogo que advogados autorizados possam manter. O mesmo gerador atende à ficha do cliente e aos atalhos do Financeiro, da Agenda e dos atendimentos. Cada documento emitido conserva o texto final e a versão do modelo usada. Este arquivo especifica a implementação futura e as decisões de formatação. Os originais continuam na pasta de entrada.

- [Escopo e leitura dos originais](#escopo-e-leitura-dos-originais)
- [Como o sistema funciona hoje](#como-o-sistema-funciona-hoje)
- [Contrato de preenchimento](#contrato-de-preenchimento)
- [Padrão visual e conversão](#padrão-visual-e-conversão)
- [Ficha de cada arquivo](#ficha-de-cada-arquivo)
- [Ferramenta para os advogados](#ferramenta-para-os-advogados)
- [Dados, permissões e integração](#dados-permissões-e-integração)
- [Sequência de implementação e aceite](#sequência-de-implementação-e-aceite)
- [Manifesto dos originais](#manifesto-dos-originais)

## Escopo e leitura dos originais

A pasta `C:\Users\Ithalo\Desktop\Modelos novos` contém **29 DOCX e uma transcrição**, `audio dos advogados.txt`. O escritório prioriza **contratos, declarações e termos**. Na transcrição, os avisos em vermelho e os grifos cinza indicam pontos para editar. O texto entregue deve ficar preto. Juízo, vara, cliente e CPF foram usados como exemplos de dados variáveis. As peças de peticionamento dependem do andamento de cada processo e, segundo o escritório, provavelmente dispensam inclusão no site.

A proposta de catálogo divide os arquivos assim:

| Grupo | Qtde. | Destino |
|---|---:|---|
| Modelos já representados em **Gerar documento** | 7 | Revisar os textos com os DOCX, preservar os atalhos e oferecer a edição oficial após validação. |
| Recibo | 1 | Adaptar pelo fluxo de emissão do Financeiro, com a baixa como fonte de verdade. |
| Novos modelos operacionais | 11 | Preparar para o catálogo, em lotes de acordo com a complexidade e a confirmação dos textos. |
| PAIA | 1 | Propor como roteiro de audiência **de uso interno**, com tratamento próprio para anotações e impressão. Confirmar a entrada no catálogo. |
| Peças de peticionamento | 9 | Analisar campos e layout agora. Conservar fora do catálogo inicial, com uma ficha para eventual inclusão a pedido do escritório. |

A vistoria leu o pacote OOXML dos 29 arquivos: corpo e tabelas, fontes do tema, realces, controles de conteúdo e opções, campos `FORMTEXT` e `TIME`, listas, imagens, cabeçalhos e rodapés. A maior parte usa a fonte de tema **Palatino Linotype**, corpo em torno de 11 pt, títulos operacionais em geral de 16 pt e à direita, corpo justificado e data centralizada. FAA e PAIA têm trechos de 10 pt. Há variações, como o título justificado no termo trabalhista. Os metadados de páginas são inconsistentes com as quebras registradas em alguns DOCX. Eles não servem de meta de paginação. O renderizador local não encontrou o LibreOffice. A inspeção de layout nesta preparação é estrutural e a comparação visual dos originais e das saídas entra no aceite da implementação.

A redação dos instrumentos pertence ao escritório. As fichas apontam divergências e escolhas a confirmar, inclusive quando o Word traz textos de exemplo com aparência de valores definitivos. Trechos variáveis são parametrizados. Nenhum dado de exemplo vira valor padrão de um documento emitido.

## Como o sistema funciona hoje

| Fluxo atual | Evidência e implicação |
|---|---|
| **Catálogo** | [`modelos.js`](../sistema/js/documentos/modelos.js#L404) registra oito tipos fixos, com título, campos complementares e função que monta a folha. Os sete correspondentes ao novo lote são Procuração, Contrato de Honorários, Hipossuficiência, Declaração de Endereço, Comparecimento, FAA e Renúncia. Prestação de Contas é o oitavo e não tem novo DOCX nesta pasta. Recibo e Relatório de Atividades vêm de fluxos próprios. |
| **Geração** | [`novo.js`](../sistema/js/telas/documentos/novo.js#L78) carrega cliente, detalhes, processo, membros e fontes permitidas. Campos alimentam a folha. Após edição manual, o sistema indica divergência e deixa o usuário escolher entre reconstruir a folha ou manter o texto. O cliente é obrigatório para gravar. |
| **Entradas** | [Ficha do cliente](../sistema/js/telas/clientes/cliente.js#L308), [Financeiro](../sistema/js/telas/financeiro/contrato.js#L319), [Agenda](../sistema/js/telas/agenda.js) e [Atualizações](../sistema/js/telas/atualizacoes/lista.js#L37) levam parâmetros em rotas existentes. Mantê-los válidos é requisito de integração. |
| **Modelo versus documento** | [`acoes.js`](../sistema/js/documentos/acoes.js#L30) higieniza e grava HTML final em `documentos`. [A tela do documento](../sistema/js/telas/documentos/documento.js#L29) mostra essa cópia, oferece reimpressão/exportação, geração de outro e cancelamento motivado. As cópias de saída preservam a origem, quando o perfil pode gravar. A permissão de atualização hoje abrange cancelamento, e não o conteúdo. |
| **Folha e editor** | [`partes.js`](../sistema/js/documentos/partes.js) oferece marca FL, qualificação PF/PJ, endereço, advogados/OAB, local/data, assinaturas e rodapé. [`editor.js`](../sistema/js/documentos/editor.js) oferece formatação e desfazer/refazer. [`higienizar.js`](../sistema/js/nucleo/higienizar.js) limita marcação e atributos. [`formatacao.js`](../sistema/js/documentos/formatacao.js) concentra estilos. O seletor do modelo novo deve reaproveitar essas peças. |
| **Saídas** | A folha usa A4, fonte Times New Roman 12 pt e margens de impressão 18/18/25 mm (superior e laterais de 18 mm, inferior de 25 mm). **Baixar para o Word** hoje entrega HTML/MHTML com extensão `.doc`, sem contrato de fidelidade DOCX. O navegador permite salvar PDF pela impressão. [CSS da folha](../sistema/css/sistema.css#L1738) · [Exportação](../sistema/js/documentos/acoes.js#L140). |
| **Banco** | O `CHECK` de `documentos.modelo` só aceita os oito tipos do catálogo, `relatorio_atividades` e `recibo`. `recibo` exige `recebimento_id`. A política de Clientes rege os documentos comuns e a do Financeiro rege recibos. A revisão de 12/11 permite cliente principal ou parte representada ativa no vínculo de processo. [Tipos e políticas](../supabase/migrations/20261008120600_anexos_recibos.sql#L273) · [Validação atual](../supabase/migrations/20261112120000_pedidos_1211.sql#L706). |

## Contrato de preenchimento

**A** indica fonte estruturada disponível após escolher o registro e ter acesso a ele. **M** indica campo informado só para esta emissão. **E** indica escolha explícita, que pode selecionar campos, papéis ou trechos. **V** indica decisão de conteúdo que o escritório precisa tomar antes da versão oficial. Campos automáticos podem aparecer como sugestão corrigível quando permitido, com indicação de origem. Mudanças para esta via não escrevem no cadastro do cliente. Valores que vêm de uma baixa ou contrato vinculado são somente leitura no formulário.

| Campo ou grupo | Fonte e comportamento |
|---|---|
| `cliente.nome`, `cliente.cpf`, `cliente.cnpj`, `cliente.documento`, `cliente.telefone`, `cliente.email` | `clientes`. Mostrar CPF ou CNPJ com máscara e rótulo coerente com o tipo/valor cadastrado. Um campo exclusivamente de CPF fica pendente para PJ. Reusar `documento()`, `documentoValido()` e `telefone()`. Nunca preencher zeros e nunca usar telefone de recado como telefone principal. |
| `cliente.nacionalidade`, `cliente.estado_civil`, `cliente.profissao`, `cliente.rg`, `cliente.nascimento`, `cliente.filiacao`, `cliente.endereco` | `clientes_detalhes`. O bloco **Qualificação** reúne os campos pedidos por cada modelo. Usar flexão registrada e fallback neutro. Para filiação, mãe/pai separados, com texto antigo inteiro como fallback. Endereço com logradouro, número, complemento opcional, bairro, cidade, UF e CEP. Em declarações que só pedem nome e documento, não puxar a qualificação inteira por conveniência. |
| `representante.nome`, `representante.documento`, `representante.qualificacao`, `representante.relacao` | Campos próprios dos detalhes. Nacionalidade, profissão, estado civil e endereço do representante são **M** se o modelo os pede separadamente e não há pessoa cadastrada e explicitamente selecionada. Não copiar endereço da empresa para o representante. |
| `parte.<papel>.*` | Papel semântico por documento, por exemplo confrontante, declarante, cônjuge, testemunha, preposto, empregador ou empregado. Selecionar cliente cadastrado para o papel ou preencher de forma avulsa. Parte representada só é sugerida quando ligada ao processo e confirmada. Não inferir polo oposto, parentesco, vínculo de emprego ou a pessoa que assina. Dados avulsos entram no documento emitido, sem criar cliente implicitamente. |
| `processo.numero`, `processo.referencia`, `processo.orgao`, `processo.tribunal`, `processo.area`, `processo.posicao_cliente`, `processo.responsavel` | `processos` e `processos_partes`. Formatar CNJ, distinguir referência interna de número oficial. `orgao` permite sugerir vara/órgão por texto quando cadastrado. Nome de juiz, nº de vara como campo estruturado, comarca separada, endereço do fórum, movimento/evento e números de autos alheios são **M** quando ausentes. A posição vem da pessoa selecionada, não de quem for o titular padrão. |
| `advogado.nome`, `advogado.oab`, `advogados.selecionados`, `escritorio.*` | Membros ativos com OAB e identidade em `escritorio.js`. Distinguir signatário, responsável, renunciante, substabelecente e advogado externo. Um terceiro externo é **M** ou seleção explícita quando cadastrado. Mostrar OAB com seccional uma vez e nunca fixar os nomes do DOCX. |
| `agenda.inicio`, `agenda.modalidade`, `agenda.local_ou_link`, `agenda.responsavel`, `agenda.titulo` | Compromisso visível e compatível com cliente/processo. Data/hora pelo fuso de São Paulo. `local_ou_link` é texto, então confirmar separadamente endereço de fórum ou URL. Espécie de audiência pode vir como sugestão do título, com confirmação. Data de agendamento, chegada/realização e emissão têm significados distintos. Bloquear fonte particular mascarada, compromisso cancelado ou remarcado e vínculo divergente. |
| `atendimento.relato`, `atendimento.data` | `atualizacoes` selecionada e conferida. Permitir revisar antes de copiar relato para a FAA. Na emissão manual, pedir relato próprio. `clientes.observacoes` é dado de trabalho e só deve ir à FAA mediante escolha explícita. Banco, agência, conta e PIX ficam fora da paleta genérica inicial. Para a FAA oficial, banco/conta/agência são optativos e visíveis apenas se necessários ao formulário. |
| `contrato.*`, `recebimento.*` | Contrato/parcelas/recebimento pelas views atuais, com permissão do Financeiro. Montar dinheiro em centavos, usar extenso derivado do mesmo número, separar valores fixos e êxito, repasses, pagamentos diretos, encargos, antecipação e situações canceladas/renegociadas. Contrato em texto livre sem vínculo exige dados **M**. Um recibo oficial exige a baixa efetiva. |
| `emissao.data`, `emissao.local` | Data civil inicial de hoje no fuso do escritório, editável para o documento, e local inicial da identidade FL. A data cacheada em campo Word `TIME` nunca vira constante. Data de pagamento, reunião, assinatura ou audiência tem campo próprio. |

As fontes atuais estão em [`clientes.js`](../sistema/js/dominio/clientes.js), [`estado.js`](../sistema/js/nucleo/estado.js), [`escritorio.js`](../sistema/js/escritorio.js), [`novo.js`](../sistema/js/telas/documentos/novo.js#L36) e [`formato.js`](../sistema/js/nucleo/formato.js). Em uma primeira versão, o documento continua pertencendo a um **cliente principal de referência**. Os outros papéis ficam no contexto da emissão e no texto final. Exibir a ficha de documentos também para os demais clientes exigiria uma relação própria e regras de visibilidade examinadas em separado.

### Regras comuns de interação

1. A pessoa seleciona modelo e cliente, confirma os papéis, vincula origem quando fizer sentido e vê os valores com labels claros. Exemplo de rótulos distintos: **CPF do cliente**, **CPF do confrontante**, **CPF do preposto**.
2. Campo ausente ou incompatível vira pendência nominal na tela com ação para completar o cadastro ou preencher nesta emissão. Separar obrigatório para emitir, opcional que desaparece com a frase inteira e campo intencionalmente em branco para preenchimento manuscrito nos modelos aprovados. Nos novos modelos, pendência obrigatória bloqueia a emissão final; o documento pode permanecer na prévia. O catálogo legado mantém seu comportamento enquanto cada edição é migrada.
3. Mostrar a saída em preto e os alertas de dados numa área de conferência e, na prévia de edição, nos campos pendentes. Nenhum chip, instrução, marca cinza nem texto de exemplo pode escapar para Word/PDF. Nas versões novas, preencher os campos pelo formulário é preferível a apagar um marcador manualmente para contornar validação.
4. Depois de editar a folha, trocar o cliente, o processo ou o modelo pede confirmação e limpa fontes, overrides e papéis dependentes. Mudanças meramente textuais nos complementos preservam a folha editada até a decisão de atualizar ou manter, como hoje. Mudança em valor vinculado exige nova conferência com a fonte e não pode manter silenciosamente o valor financeiro antigo na folha.
5. Os valores só são resolvidos para a prévia ou emissão. Não são incorporados por **Duplicar modelo**, **Restaurar versão** ou **Inserir campo**. A prévia do editor de modelos usa exemplos sintéticos. A prévia do gerador trabalha apenas com registros autorizados. Ao concluir, guardar o texto resolvido e as referências pertinentes, sem serializar registros inteiros nem duplicar dados bancários no JSON.

## Padrão visual e conversão

### Folha e estilos

| Elemento | Decisão proposta e verificação |
|---|---|
| Base A4 | Reusar folha FL e margens atuais para tela/impressão, com perfil específico para os novos modelos. Reconstruir cabeçalho e rodapé por fluxo normal de página. Não herdar o topo negativo do Word (por exemplo, `-1843` twips), formas flutuantes, imagens repetidas, cache de paginação ou tabulações para alinhamento. |
| Marca | Usar o logo institucional do sistema no topo e contato institucional no rodapé. Confirmar se o escritório prefere incluir também o endereço do site presente no Word. QR, quando aprovado, é ativo local institucional com texto de contato alternativo. Elementos meramente decorativos do DOCX não entram como formas flutuantes. |
| Tipografia | Proposta para as novas versões: Palatino Linotype 11 pt e título de até 16 pt, com Times New Roman como fallback, corpo com entrelinha de 1,35 a 1,45. Fichas usam 10–11 pt nas tabelas. Testar fonte nos computadores e na exportação. Usar fonte instalada inicialmente, sem publicar TTF sem confirmar a licença. Aplicar as novas regras por perfil de folha para preservar a tipografia legada. Gravar o perfil (ex.: `fl_a4_v1`) na emissão; a impressão e o Word precisam reconhecer o perfil histórico, independentemente da edição atual do modelo. |
| Cor | Texto final preto `#000`. Identificar cinza/vermelho antes da conversão e dar uma função a cada trecho: campo, alternativa, nota ou rótulo. Remover realces editoriais e os separadores “OU” das saídas. Preservar negrito, itálico, listas e títulos com sentido. Fundo neutro em cabeçalhos de tabela pode continuar se aprovado, pois é estrutura, como o rótulo “Ag.” da FAA. |
| Hierarquia | Título operacional à direita para a série que já segue esse estilo, salvo ficha/termo cuja leitura melhora com título centralizado conforme indicado abaixo. Documentos curtos têm data centralizada e assinatura por papel. Corpo curto justificado, campos em tabela alinhados à esquerda e dinheiro à direita. Cabeçalhos de petição seguem endereçamento, autos, assunto e subtítulos, caso o escritório peça a ativação futura. |
| Parágrafos e listas | Converter numeração Word de cláusulas em numeração semântica controlada, com referências internas estáveis. Quando um ramo sai, recontar os itens e resolver as referências pelo identificador de cláusula. Quebrar parágrafos gigantes nos limites em que o escritório aprove, sem resumir poderes ou obrigações. Separadores, barra lateral e balões de ajuda ficam na interface, não na folha. |
| Tabelas e paginação | Cabeçalho repetido em tabelas multipágina, bordas finas, colunas proporcionais, células que crescem, parágrafo longo com quebra natural. Manter título com o bloco seguinte, manter cada assinatura junta e impedir sobreposição do rodapé. Linhas menores podem ficar juntas, mas notas que ultrapassem uma página precisam quebrar. Sem páginas fixas por contagem dos metadados. |
| Assinatura e data | Eliminar tabelas vazias usadas só para linhas de assinatura. Usar componente com traço, papel e nome/OAB quando aplicável, dois blocos lado a lado apenas se couberem. A geração não assina eletronicamente. O fecho que menciona assinatura digital fica condicionado ao fluxo real adotado pelo escritório. |
| Exportação | Fazer testes cruzados de HTML na tela, A4 impresso/PDF e Word. Na primeira entrega, reaproveitar `.doc` se o escritório aprovar o resultado real em Word. Caso tabelas longas, rodapé, numeração ou edição no Word exijam fidelidade maior, planejar DOCX nativo como pacote próprio. Compartilhar a representação de campos/tabelas e estilos, sem regenerar documento histórico do modelo atual. |

### Como preparar cada matriz no futuro

1. Registrar nome original e hash SHA-256, revisar em Word/LibreOffice e identificar página, cláusula, conteúdo real e marca de edição. Capturar controles e opções do XML antes de apagar cor, inclusive quando um marcador ocupa vários trechos de formatação. Conferir tabelas mescladas, campos de data e listas automáticas. Para os nove arquivos de peças, aplicar isso na eventual inclusão, com os cuidados da ficha.
2. Separar corpo, papéis, campos, cláusulas condicionais e blocos de layout. Substituir exemplos, nomes-fantasia, máscaras de zeros, endereços de exemplo, datas de demonstração, movimentos, notas de editor e `Lorem ipsum`. Guardar a origem por versão e relacionar alterações editoriais a um trecho do original para facilitar revisão.
3. Montar protótipo por modelo com casos fictícios. Exibir os campos/suposições por modelo ao lado da folha. Fazer comparação de conteúdo em ordem de leitura, incluindo cláusulas opcionais e notas que saíram da folha. Comparar visualmente originais e saídas, com ao menos uma página longa de cada família, sem tratar a posição absoluta no Word como requisito quando a aparência original depende de caixas flutuantes.
4. Aprovada a matriz, incluí-la como versão controlada em fixture de catálogo ou por importação administrativa de dados estruturados, conforme o pacote. Os DOCX originais, suas imagens repetidas e seus exemplos ficam fora dos arquivos públicos do site. Registrar o aceite jurídico da redação e o aceite de formatação da edição publicada.

## Ficha de cada arquivo

Os números seguem a ordem alfabética com acentos normalizados. **A/M/E/V** seguem a legenda acima. Data e local de emissão são comuns, salvo quando a ficha indica fecho específico. As referências a parágrafos e trechos apontam para a fonte Word, que deve ser comparada novamente após a conversão.

### 01 Ação de Homologação de Divórcio Consensual

**Destino:** petição, fora do catálogo inicial. **A:** qualificação dos dois requerentes quando ambos forem escolhidos separadamente, advogado/OAB. O original prevê autos a distribuir. Só preencher CNJ se já existir e a situação justificar. Órgão e posição entram se cadastrados. **M/E:** juízo, foro/comarca e vara quando ausentes, assunto e avisos do preâmbulo, regime e data do casamento, nomes anteriores/atuais, certidão, filhos e nascimento, residência, guarda, convivência, valor e percentual dos alimentos, vencimento e desconto em folha, bens e titular de cada item, partilha, pedidos, valor da causa e documentos. A lista original de regimes é referência para o seletor, sujeita a revisão. Nome e datas de crianças só podem ser usados quando necessários e confirmados. **V:** gratuidade, sigilo, prioridade, urgência, mediação, atuação do MP e fundamentos entram só se aplicáveis. Conferir a referência conflitante à mesma resolução em anos diferentes e as notas de edição.

**Formatação:** peça longa. Hierarquia com endereçamento, distribuição, assunto, ementa quando redigida, fatos, fundamentos e pedidos. Usar lista ou tabela de bens/partilha e lista de pedidos. Preservar citações em bloco e eliminar hifens originados de quebra de linha. Trocar fecho com advogado fixo por signatário escolhido. Testar casal sem filhos/bens e com múltiplos filhos/bens.

### 02 Carta de Preposição

**Destino:** novo modelo operacional, prioridade alta. **A:** empresa PJ (nome/razão, CNPJ e endereço), nome e documento do representante se cadastrados, CNJ do processo escolhido. **E/M:** representante e vínculo com a empresa, qualificação separada do representante (nacionalidade, estado civil, profissão, CPF, endereço) e do preposto (nome, nacionalidade, estado civil, profissão, CPF). São pessoas distintas. Quando ambos forem cadastrados, selecionar cada um sem presumir função. **V:** quem assina, a redação sobre vínculo funcional/conhecimento dos fatos e a modalidade de carta contemplada.

**Formatação:** título “Carta de Preposição”, dois blocos de corpo (nomeação e declaração), data e linha do representante com o papel em que assina. O parágrafo inicial traz 14 controles cinza. Converter em três grupos de campos no formulário e um bloco legível na folha, sem copiar o CPF ou o endereço de um papel para outro. Conferir plural e OAB apenas se o texto aprovado pedir.

### 03 Contestação

**Destino:** petição, fora do catálogo inicial. **A:** parte representada e qualificação, posição, processo e órgão se cadastrados, advogado/OAB. **M/E:** juízo, vara, distribuição versus autos existentes, assunto, ementa, preliminar de ilegitimidade e alternativas, fatos e tese, conciliação, citação/litisconsórcio, pedidos e testemunhas. O original usa cabeçalho de “autos a serem distribuídas” embora seja contestação. **V:** resolver endereçamento e referências usadas na abertura, e revisar preliminares e fundamentos para o caso.

**Formatação:** organizar preliminares, fatos, fundamentos, pedidos e testemunhas em blocos distintos. Subtítulo de tese como nível secundário, listas para pedidos e rol, citações recuadas. Retirar imagem/elemento flutuante de demonstração, campos `xxxx` e texto de exemplo. Nunca preencher polo ou tese só pelo nome do arquivo.

### 04 Contrato de Honorários

**Destino:** nova edição oficial de `contrato_honorarios`, com geração pela ficha e pelo Financeiro. É o modelo de maior risco de regressão. **A:** qualificação, CPF/CNPJ, endereço, telefone/e-mail, procuradores selecionados e OAB, CNJ/referência/área, local e data. Pelo Financeiro, usar contrato, modalidade, entrada, valor, parcelas reais e vencimentos, percentual de êxito, natureza de acordo e critério de atraso. **M:** objeto específico, garantia selecionada e dados do bem/fiador conforme o ramo. Quando não há contrato vinculado, pedir modalidade e condições de pagamento e validar total em centavos, entrada, quantidade, vencimentos e êxito. Não confundir data de formalização com a data de emissão.

**Mapa das cláusulas do DOCX:**

| Bloco original | Conversão proposta e decisão de conteúdo |
|---|---|
| Objeto e vigência | Objeto editável com sugestão do processo, confirmação de escopo e referência à vigência. Preservar os limites de atuação escolhidos. |
| Honorários | Adaptar valor fixo à vista/parcelado, só êxito, misto e acordo com repasse ao bloco calculado. Usar as datas/valores reais das parcelas, inclusive desiguais e encadeadas. Tratar a primeira prestação e os trechos criminal, trabalhista e previdenciário como ramos. O percentual de 30% aparece como exemplo e também em cláusulas escritas em preto. Separar percentuais que representam o êxito de eventual obrigação autônoma e confirmar a redação. Parcelas de êxito apuradas não entram como parcelas fixas. Acordo em que a parte adversa paga não deve sair com redação de cobrança integral do cliente. |
| Garantias | Um seletor obrigatório ou confirmação explícita de “Sem garantia”. Fiança: dados do fiador, papel de assinatura e condições aprovadas. Penhor: descrição do bem e data/forma de entrega, obrigações de registro/cancelamento. Hipoteca: descrição, matrícula/identificação, campos de valor de avaliação/escritura quando exigidos pelo texto e condições próprias. Anticrese: descrição e demais campos se a redação aprovada exigir. Manter uma variante só, sem legendas editoriais do original. |
| Obrigações e atraso | Conferir divergência do IGP-M/FGV do DOCX com o índice configurável no sistema, a multa, juros, carência, vencimento antecipado e menção adicional a 30%. A versão oficial deve conciliar 3 e 5 sem duas fórmulas no mesmo documento. Conferir 5 salários mínimos no ramo de desistência/perda de objeto, sucumbência, instâncias/recursos, retenção de documentos físicos e encaminhamento de comunicações. Um texto do contrato não altera regras de cobrança no banco. |
| Despesas, confidencialidade e prevenção de golpes | Preservar as seções após revisão do escritório. Custos, canais de confirmação, prazo de guarda, compartilhamento e referência à taxa de chave são conteúdo de política contratual, não variáveis geradas a partir de valores de exemplo. A taxa de R$ 150,00 do original precisa de confirmação expressa. |
| Extinção e processo cível | Confirmar hipóteses de extinção, foro, mediação e comunicações. Bloco cível só entra na condição aprovada, sem presumir pelo cadastro quando a área estiver vazia. Verificar remissões a 2, 3.1, 5.3, 7 e 10 e cláusula final de assinatura/testemunhas. |

**Formatação:** usar um cabeçalho simples com título à direita, qualificação de contratante(s) e contratados em parágrafos separados e cláusulas com título negrito, numeração estável e subitens alinhados. Usar quadro de parcelas com colunas parcela, vencimento e valor e cabeçalho repetido quando necessário. Substituir a tabela de assinatura original pelo par contratante/contratado e acrescentar outros blocos só quando o ramo aprovado pedir. O tamanho do original (cerca de 2.630 palavras) exige ensaio multipágina. **Aceite específico:** gerar exemplos de à vista, fixo parcelado, só êxito, misto, acordo, cinco opções de garantia e áreas com cláusulas distintas. Conferir número de cláusula e todas as referências nos ramos.

### 05 Declaração de Anuência de Usucapião

**Destino:** novo modelo, depende de papéis. **A/E:** cliente usual é a pessoa cuja posse é reconhecida. Selecionar explicitamente declarante/confrontante e possuidor e preencher nome, nacionalidade, estado civil, profissão, CPF e endereço de cada qual quando cadastrado. Reusar o mesmo nome/CPF do possuidor no item de reconhecimento de posse. **M:** descrição do memorial, referência ao imóvel se útil ao texto e número de anos de posse, hoje em branco. **V:** se haverá aceitação de mais de um confrontante e se o memorial é texto ou referência a anexo.

**Formatação:** título de catálogo específico, título na folha “Declaração” ou título específico se aprovado. Três itens numerados para vizinhança, limites e posse, com memorial longo em bloco que pode quebrar de página. Assina o confrontante, independentemente de quem foi selecionado como cliente de referência.

### 06 Declaração de Comparecimento

**Destino:** atualizar `declaracao_comparecimento` e o atalho da Agenda. **A:** nome, nacionalidade, estado civil, profissão e CPF da pessoa, advogado e OAB, data do comparecimento ligada ao compromisso. **M/E:** advogado declarante (sugerir responsável e confirmar; nunca escolher o primeiro da lista silenciosamente), data quando avulsa, destinatário/empresa opcional do fluxo existente e intervalo apenas se solicitado. Data da emissão é separada. **V:** confirmar redação de abono e regra de evidência do comparecimento do escritório. No modo Agenda, propor realizada ou presença confirmada, com diferença visível entre compareceu e estava agendado.

**Formatação:** declaração curta, dois parágrafos, sem inserir endereço residencial só porque a qualificação atual o inclui. Fecho e assinatura com nome/OAB do advogado. Testar declaração emitida depois da data de atendimento e compromisso remarcado/faltou.

### 07 Declaração de Desistência

**Destino:** novo modelo, prioridade alta após revisão jurídica. **A:** qualificação PF, CPF/endereço e CNJ confirmado. **M:** número oficial se ainda não cadastrado, condições adicionais somente se o escritório aprovar. **E/V:** confirmar escopo (cliente, processo e desistência) e a redação das quatro declarações, sobretudo renúncia de ação contra procuradores e a obrigação de honorários.

**Formatação:** quatro itens em lista com a mesma hierarquia, título claro no catálogo e linha “Declarante” em lugar de “Declaração” se aprovado. O documento não muda situação do processo nem cancela dívida. Testar dois clientes no mesmo processo e assinatura da pessoa escolhida.

### 08 Declaração de Endereço

**Destino:** atualizar `declaracao_endereco`. **A/E:** escolher declarante e pessoa declarada. Para o primeiro, nome, nacionalidade, estado civil, profissão, CPF, endereço, e-mail e telefone/WhatsApp quando apropriado. Para o segundo, nome e CPF. **M/E:** “reside comigo” ou “reside no endereço informado”, endereço próprio da segunda modalidade e data/período desde quando. Os rótulos sob sublinhados na origem também são campos, apesar de estarem em preto. **V:** decidir se autodeclaração merece variante própria. Eliminar o fallback atual que pode colocar o próprio cliente nos dois papéis sem escolha explícita.

**Formatação:** parágrafo de qualificação seguido da declaração, sem linhas sublinhadas de exemplo no documento preenchido. Mostrar somente o endereço da alternativa escolhida e assinatura do declarante. Testar terceiro avulso, cliente representado e endereço longo.

### 09 Declaração de Hipossuficiência

**Destino:** atualizar `hipossuficiencia`. **A:** qualificação, CPF e endereço. **M:** dados ausentes e, se necessário, assinatura por representante identificado. **V:** texto oficial e possibilidade de uso por PJ/representação. O DOCX exemplifica PF. Se houver versão PJ, revisar a redação como ramo distinto; trocar o rótulo por CNPJ não resolve sozinho.

**Formatação:** título “Declaração” na folha se o escritório quiser manter o original, com o assunto explícito no catálogo. Um parágrafo fluido, ênfase moderada e assinatura do declarante ou representante selecionado. Sem hyperlinks copiados do Word quando têm apenas efeito visual; manter a indicação textual das referências aprovadas.

### 10 Declaração de Renúncia de Crédito Excedente para Ingresso de Ação no Juizado

**Destino:** novo modelo. **A:** qualificação PF, CPF, endereço. **E:** controles do Word oferecem “Lei do JEC” e “Lei do JEF” e o texto de teto apresenta “quarenta/sessenta”. Criar um seletor único de hipótese com pares de redação aprovados, nunca dois controles que possam divergir. **M/V:** escolher hipótese, confirmar texto aplicável, limites/referências e se a declaração deve trazer processo, valor ou somente renúncia genérica. O Word não pede automaticamente um valor em reais. Não calcular limite monetário nem tomar decisão de renúncia.

**Formatação:** remover a barra e os dois tetos simultâneos. Título de catálogo por assunto, corpo de declaração e assinatura. Testar as duas opções e impedir emitir com opção em branco.

### 11 Embargos de Declaração

**Destino:** petição, fora do catálogo inicial. **A:** parte e qualificação, posição, autos, órgão, advogado/OAB. Dados de intimação/prazo só como sugestão ao escolher um registro conferido. **M/E:** movimento/decisão atacada, datas de decisão, intimação, início, limite e protocolo, rito, fundamento do cabimento, fatos, objeto do recurso, pedidos. **V:** o Word mistura alternativas “5 dias / 2 dias”, artigo “XX” e uma linha do tempo com “interposição do agravo”. Validar com o escritório antes de reutilizar qualquer cronologia ou tese.

**Formatação:** trocar caixas e desenhos da linha do tempo (o XML inclui representações duplicadas) por tabela de evento, movimento e data, sem duplicações. Manter admissibilidade, tempestividade, fatos, fundamentos e pedidos, com fecho do advogado escolhido. Não derivar tempestividade do desenho.

### 12 FAA

**Destino:** revisar `ficha_atendimento` e preservar atalhos de Atualizações. **A:** nome, documento, nacionalidade, nascimento, filiação, endereço, estado civil, profissão, e-mail, telefone, banco/agência/conta quando escolhidos, possível processo e relato de atualização vinculada. **M/E:** observações selecionadas para a folha, relato e orientação confirmados; opção de ficha em branco para anotação se o escritório a quiser. O Word usa 17 campos de formulário legado `FORMTEXT`. PIX hoje aparece na FAA do sistema, mas não consta do Word; propor fora da edição nova por padrão e validar com o escritório. **V:** texto de ciência/autenticidade e se dados bancários devem sair no papel.

**Formatação:** título centrado, quadro de identificação em pares rótulo/valor, filiação e endereço em largura total, campos financeiros e observações em seção opcional. A segunda tabela hoje é usada na assinatura; substituir pelo bloco “Assistido”. Texto de atendimento deve crescer ou quebrar, com espaço pautado só na variante de preenchimento à mão. Testar relato longo e cadastro legado com filiação em texto único.

### 13 Intimação de Testemunha

**Destino:** novo documento operacional. Não é uma intimação recebida do DJEN. **A:** assistido (qualificação e endereço), advogado/OAB, CNJ e órgão, data/hora, modalidade e local/link da audiência a partir de compromisso visível e conferido. **E/M:** testemunha com qualificação e endereço próprios, espécie de audiência, presencial/semipresencial/virtual, fórum (vara e endereço completos) ou instruções de acesso, ramo civil/criminal e dados ausentes. **V:** redação de comparecimento no escritório em modalidade compatível, antecedência e advertência, tratamento do signatário (“Declarante” é genérico no DOCX) e de forma/local de entrega.

**Formatação:** destacar em **negrito preto** data/hora/modalidade e endereço em bloco legível. Separar identificação de testemunha, dados da audiência e advertências. Remover o retângulo flutuante do Word. Condicional de participação remota entra só no ramo selecionado. Nenhum envio à testemunha pelo gerador. Testar troca/remarcação de audiência, link versus endereço e dois papéis diferentes.

### 14 Notificação

**Destino:** novo modelo com corpo livre obrigatório. **A:** qualificação do notificante e advogado/OAB, e notificado somente se uma pessoa cadastrada for explicitamente selecionada para esse papel. **M:** nome, nacionalidade, estado civil, profissão, CPF/CNPJ e endereço de notificado avulso, assunto, fatos, providências solicitadas e, se aplicável, prazo e forma de contato, sem cálculo automático. O miolo é `Lorem ipsum`, não cláusulas. **V:** terminologia e fundamento do texto de abertura, QR original, destino oficial, assinatura e canais.

**Formatação:** introdução com os papéis identificados, corpo editável em parágrafos e listas, fechamento em bloco e assinatura do notificante. O DOCX tem imagem de 130 × 130 usada junto da instrução do QR e forma flutuante. Se o QR for mantido, validar o destino, contraste, leitura no PDF/impresso e fallback de e-mail/telefone. Caso o QR seja retirado, retirar também a instrução correspondente. Documento final pode ocupar várias páginas conforme o corpo.

### 15 Outorga Conjugal

**Destino:** novo modelo com escolha de ramo. **A/E:** outorgante e cônjuge com nome, nacionalidade, profissão e CPF, endereços escolhidos. O fim do parágrafo da fonte usa “ambos domiciliados”; só preencher endereço compartilhado se confirmado. **M/E:** regime de bens e inciso I/II/III/IV como controles separados, data editável, campos por ramo. I: alienação/ônus real, matrícula, endereço e coordenadas quando necessárias. II: posição autor/réu e descrição do bem/direito. III: fiança/aval, título/obrigação associada. IV: descrição da doação e do bem. A lista de regimes do Word traz comunhão parcial, universal e participação final nos aquestos; validar se o seletor precisa de mais opções. **V:** redações da autorização e hipóteses admitidas.

**Formatação:** quebrar o parágrafo longo em qualificação e autorização, remover os três “OU” vermelhos, renderizar só o inciso e a variante escolhida. Assina o outorgante. Testar os quatro ramos e a troca de opção, que deve limpar campos e validações do bloco anterior.

### 16 PAIA

**Destino:** proposta de roteiro **interno** de audiência, fase posterior e sujeita à confirmação. **A:** CNJ, tipo/data/hora/modalidade de compromisso de audiência visível, advogado responsável/OAB, qualificações dos representados escolhidos e sua posição. Idade só se útil, calculada na data do ato. **M/E:** parte adversa, testemunhas e informantes agrupados por polo, documento e qualificação só no estritamente necessário, movimentos/DSO, pendências, questões de fato/direito, ônus, fatos dispensados de prova, contraditas, perguntas por pessoa, depoimento/interrogatório e anotações. Não importar automaticamente observações do processo nem misturar papéis. **V:** quem vê, persiste e exporta a pauta internamente, se inclui CNPJ/CPF completo e se precisa de versão para anotação em papel.

**Formatação:** a fonte usa uma tabela de 85 linhas, com 84 mesclas horizontais e 8 marcações de mescla vertical. Dividir em quadro resumido de audiência, tabelas menores de envolvidos, seções de saneamento/instrução e listas repetíveis de perguntas. Evitar blocos mesclados atravessando páginas. Título “Pauta para Audiências de Instrução e Afins”, indicação **Uso interno** no cabeçalho e páginas fluidas. Se a permissão atual de Clientes for ampla demais para notas de estratégia, só habilitar persistência após desenhar e testar a regra específica de leitura, busca e histórico. Testar múltiplas testemunhas, parágrafo longo, processo com várias partes e agenda privada.

### 17 Petição Inicial

**Destino:** petição, fora do catálogo inicial. **A:** qualificação de autor(es) selecionados, advogado/OAB e dados do processo quando houver. Antes da distribuição, CNJ vazio por design. **M/E:** endereçamento, assunto/ementa, réu e cônjuge quando pertinentes, proposta, avisos do preâmbulo, fatos, fundamentos, pedidos, valor da causa, testemunhas e anexos. O Word contém e-mails, telefones e fundamento de exemplo. **V:** a causa e seus pedidos são definidos pelo advogado para cada caso.

**Formatação:** título/assunto e subseções para proposta de acordo, fatos, fundamentos, pedidos e testemunhas. Usar títulos reais e listas, não imagem ou legenda de demonstração. Validação futura deve detectar dados fictícios e lista de testemunhas vazia sem gerar uma relação placeholder.

### 18 Petição Intermediária de Aceite Dativo Prazo e Prerrogativas

**Destino:** petição, fora do catálogo inicial. O original tem o nome `Petição Intermediária - Aceite dativo. Prazo. Prerrogativas..docx`. **A:** CNJ, parte assistida se já vinculada, órgão e advogado/OAB escolhido. **M/E:** juízo, vara, nomeação e movimento quando pertinentes, prazo complementar pedido (“xx” é exemplo), vigência e pedidos específicos de prerrogativas/intimação. **V:** a referência jurisprudencial e os pedidos do Word precisam ser conferidos para a situação concreta. Geração não atribui nem conta prazo.

**Formatação:** assunto pode quebrar em duas linhas. Separar aceite, pedido e citação extensa com 10 pt ou corpo apropriado, recuo e referência no fim. Retirar forma decorativa e nome/OAB fixos. Preservar quebras naturais no trecho citado.

### 19 Petição Intermediária de Especificação de Provas

**Destino:** petição, fora do catálogo inicial. **A:** CNJ, órgão, cliente e posição, advogado/OAB. **M/E:** intimação/ato/evento, fatos A/B/C e quais precisam de prova, lista de meios escolhidos (empréstimo, depoimento, testemunha, exibição, perícia, inspeção ou outros) e CNJ do processo de origem da prova emprestada. **V:** cada pedido deve apontar o fato que procura provar. A instrução de edição em caixa alta é nota interna.

**Formatação:** introdução, fatos e lista numerada dos meios de prova escolhidos. Se houver matriz fato × prova, ela fica disponível no preenchimento. A redação da peça exibe somente meios confirmados. Excluir instruções em caixa alta da impressão.

### 20 Petição Intermediária de Habilitação

**Destino:** petição, fora do catálogo inicial. O título de assunto no original é “Vista aos autos”. **A:** CNJ, órgão, cliente e posição, advogado/OAB. **M/E:** confirmar procedimento (vista, habilitação ou ambos), prazo de vista, órgão/vara e presença da procuração a anexar. **V:** alinhar nome apresentado, pedido e texto com o escritório. Gerar o documento não anexa uma procuração nem habilita alguém.

**Formatação:** peça curta com endereçamento, autos, assunto, parágrafo do pedido e identificação do advogado. Eliminar espaços sobrando da estrutura comum.

### 21 Petição Intermediária de Quesitos à Perícia Médica

**Destino:** petição, fora do catálogo inicial. **A:** autos, órgão, cliente, posição e advogado/OAB. **M/E:** periciando e demais partes, ato/movimento da intimação, procedimento real (o Word exemplifica interdição), alternativas de impedimento/suspeição/assistente técnico/quesitos, perito/assistente se pertinente e questões próprias. **V:** autor confirma roteiro e tratamento dos dados de saúde. A lista de dez quesitos não é recomendação aplicável automaticamente a todo caso.

**Formatação:** assunto de acordo com as escolhas, parágrafos por pedido e lista numerada de quesitos com quebra de linha natural. Nenhuma barra com múltiplos pedidos indecididos. Teste futuro com 1 e 20 quesitos e ausência de informação de saúde na prévia fictícia.

### 22 Petição Intermediária

**Destino:** petição, fora do catálogo inicial. **A:** autos, órgão, cliente, posição, advogado/OAB. **M/E:** tipo de manifestação, modalidade comum ou assistente de acusação, evento/objeto da intimação, assunto, narrativa e pedidos. **V:** confirmar os avisos do preâmbulo caso a caso e revisar texto. As alternativas “OU” são instruções do modelo, e o evento “X” não é padrão.

**Formatação:** folha enxuta reutilizando o cabeçalho processual e fecho. Alternativas mutuamente exclusivas com texto de manifestação livre e obrigatório. Filtrar marcadores e parágrafos ilustrativos antes da saída.

### 23 Procuração

**Destino:** atualizar `procuracao`. **A:** qualificação completa, documento, endereço, lista de advogados selecionados e suas OABs, endereço profissional e contato institucional. **E/M:** pessoas outorgantes, representante quando houver, advogados em cada emissão e limites de poderes quando aprovados; eventual objeto/processo é complemento, pois o original é geral. **V:** conferir a redação extensa do Word com a versão atual mais curta. Revalidar poderes específicos, como falência, representação em assembleias e atos de representação criminal, que não devem sumir nem ser adicionados por mera escolha de formatação.

**Formatação:** separar outorgante(s), outorgados e poderes em blocos. Dividir o grande parágrafo em unidades aprovadas. Manter assinatura por outorgante/representante e identificação dos advogados no corpo. Testar PF com representante, PJ, advogados com OAB e ausência de advogado ativo.

### 24 Recibo

**Destino:** adaptar o documento oficial no Financeiro, no fluxo de recebimento, conservando `modelo='recibo'` e `recebimento_id`. **A:** pagador/cliente e CPF/CNPJ pertinentes, data e valor da baixa, valor por extenso, emitente identificado, referência contratual quando houver e dados de composição. **E/M:** signatário advogado e OAB se exigidos pela redação, selecionados de membros autorizados. Se o pagador legal precisa ser identificado e não existe no lançamento, desenhar campo explícito e distinguir cliente beneficiário, parte contrária e pagador. **V:** se a redação curta em primeira pessoa é só para um pagamento de honorários simples, manter as variantes específicas já existentes. O modelo não escolhe nem altera o lançamento.

**Formatação:** cabeçalho simples, valor principal destacado e data da baixa separada da emissão; assinatura identificada. Conservar quadro de principal, encargos, repasse, valor direto e antecipações quando aplicável, sem presumir quitação geral. Testar parcial, avulso, antecipação, acordo com repasse, direto ao cliente, baixa estornada e reimpressão após outra baixa. Se houver pedido de recibo avulso oficial, avaliar primeiro a entrada avulsa já suportada pelo Financeiro.

### 25 Renúncia de Mandato

**Destino:** atualizar `renuncia`. **A:** advogados renunciantes ativos com OAB, cliente/documento e processo. **E/M:** com comunicação/prazo indicado ou parte que segue representada, informação de ciência, outro procurador se pertinente e circunstâncias da comunicação. Não usar um ramo como decisão jurídica silenciosa. **V:** texto de cada alternativa, assinatura física/digital e o aviso de identidade já usado na tela. Nenhuma notificação automática.

**Formatação:** remover “OU” vermelho, mostrar um parágrafo condicional em preto, assinatura por advogado selecionado mesmo quando a origem só tem data, se aprovado. Deixar conselho de conferência na tela. Testar dois advogados e ambos os ramos.

### 26 Revogação de Mandato

**Destino:** novo modelo. **A:** cliente revogante, CPF, e dados do processo se a situação exigir. **M/E:** advogado revogado e OAB/seccional, com opção externa, escopo geral ou autos específicos se aprovado, e situação do novo procurador/comunicação. **V:** o último parágrafo do original menciona o procurador revogado habilitado e dispensa de notificação. A redação precisa de confirmação e não deve virar regra automática. A emissão é da parte, distinta da renúncia feita pelos advogados.

**Formatação:** abertura com revogante e revogado distintos, declarações em lista ou parágrafos curtos, bloco de assinatura “Revogante”. Testar seleção de advogado externo, autos ausentes na variante geral e saída sem texto azul/sublinhado herdado de hiperlink.

### 27 Substabelecimento

**Destino:** novo modelo. **A:** cliente e CPF, CNJ, advogado substabelecente e OAB a partir da seleção. **E/M:** com/sem reserva, substabelecido e OAB (interno ou avulso), tipo de fecho e eventual escopo. **V:** atualizar o fecho do Word, que fixa um advogado apesar de o campo da abertura ser variável. “Datado e assinado digitalmente” deve corresponder à forma real de assinatura.

**Formatação:** título, parágrafo único com variante de reserva e assinatura do substabelecente usando o mesmo registro da abertura. Se houver fecho manual, data civil mais assinatura. Testar troca de advogado, ambos os ramos e OAB de outra seccional.

### 28 Termo de Rescisão de Contrato de Trabalho

**Destino:** novo modelo em lote avançado. **A/E:** empregador e empregado em papéis distintos, qualificação, CPF/CNPJ compatível, endereço, contatos, signatários escolhidos. **M:** admissão, função, salário, mês/data do acordo, início/fim/forma de cumprimento do aviso, último dia trabalhado, data e confirmação de pagamento do aviso, jornada/redução se aplicável, verbas e frações, FGTS, deduções, totais, parcelas e datas, representantes e testemunhas (nome/CPF). **V:** redação do acordo e método de cálculo/revisão pelo escritório. As cifras do exemplo são valores de demonstração mesmo em células pretas. O total de R$ 1.836,79 no quadro e três parcelas de R$ 612,26 deixam diferença de R$ 0,01. Validar valores fornecidos em centavos, destacar diferenças e não corrigir silenciosamente nem calcular verbas ou porcentagem legal a partir do salário.

**Formatação:** título centralizado, cinco seções com numeração e referência à seção de verbas, tabela de verbas/FGTS/deduções com coluna de valores alinhada à direita, resumo líquido editável apenas pelas entradas que o compõem, tabela de parcelas, assinatura de empregador/empregado e testemunhas conforme variante aprovada. Evitar quebra dentro de cada par de assinaturas, sem reproduzir as células vazias do original. Cobrir contrato real com centavo residual informado, texto longo e PJ representada.

### 29 Termo de Responsabilidade por Chave de Processo

**Destino:** novo modelo, prioridade alta. **A:** nome, nacionalidade, estado civil, profissão, CPF, endereço e CNJ validado. **M/E:** identificação do defensor se exigida e origem do pedido, sem campo de segredo. **V:** denominação na folha (o Word diz “Declaração”), texto de responsabilidade e vínculo com o contrato. O modelo pede o número dos autos, não a chave de acesso. A taxa presente no contrato de honorários é decisão de redação/cobrança separada.

**Formatação:** documento curto com identificação, declaração de responsabilidade, data e assinatura do solicitante. Não persistir, imprimir, ler do cadastro ou registrar em log a chave efetiva. Testar processo incompatível e número oficial ausente.

### Chaves e entrada na primeira entrega

As chaves abaixo são propostas para identificação interna e busca do catálogo. A chave de catálogo é estável mesmo quando o nome visível muda. A coluna `documentos.modelo` usa o tipo de armazenamento descrito na seção de dados, não cada uma das novas chaves.

| Origem | Chave ou vínculo | Entrada principal proposta |
|---|---|---|
| 02 Carta de Preposição | `carta_preposicao` | Documentos ou processo, com PJ e preposto selecionados. |
| 04 Contrato de Honorários | `contrato_honorarios` existente | Documentos, ficha ou contrato no Financeiro. |
| 05 Anuência de Usucapião | `declaracao_anuencia_usucapiao` | Documentos ou ficha, com dois papéis explícitos. |
| 06 Comparecimento | `declaracao_comparecimento` existente | Documentos ou compromisso da Agenda. |
| 07 Desistência | `declaracao_desistencia` | Documentos ou processo. |
| 08 Endereço | `declaracao_endereco` existente | Documentos ou ficha, com declarante e pessoa declarada explícitos. |
| 09 Hipossuficiência | `hipossuficiencia` existente | Documentos ou ficha. |
| 10 Renúncia de Crédito Excedente | `declaracao_renuncia_credito_excedente` | Documentos ou ficha, com hipótese selecionada. |
| 12 FAA | `ficha_atendimento` existente | Documentos, ficha ou atualização. |
| 13 Intimação de Testemunha | `intimacao_testemunha` | Documentos ou audiência selecionada na Agenda, após validar o vínculo. |
| 14 Notificação | `notificacao` | Documentos ou ficha, com texto de notificação obrigatório. |
| 15 Outorga Conjugal | `outorga_conjugal` | Documentos ou ficha, com autorização selecionada. |
| 16 PAIA | `pauta_audiencia`, se aprovada | Audiência/processo, com indicador de uso interno. |
| 23 Procuração | `procuracao` existente | Documentos ou ficha. |
| 24 Recibo | `recibo` existente | Recebimento no Financeiro, fora dos modelos livres. |
| 25 Renúncia de Mandato | `renuncia` existente | Documentos ou ficha, com alternativa de comunicação confirmada. |
| 26 Revogação de Mandato | `revogacao_mandato` | Documentos ou ficha. |
| 27 Substabelecimento | `substabelecimento` | Documentos ou processo. |
| 28 Termo de Rescisão | `termo_rescisao_trabalho` | Documentos, com empregado e empregador conferidos. |
| 29 Termo de Chave | `termo_responsabilidade_chave_processo` | Documentos ou processo, com CNJ sem a chave de acesso. |

A ficha do cliente e **Gerar documento** são as entradas gerais para a primeira versão. Atalhos novos no processo ou na Agenda são opcionais quando a mesma geração é acessível por seleção de contexto. Manter **Documentos do processo** (controle de solicitados e entregues) separado de **Documentos gerados** (instâncias da matriz). Evitar adicionar ação em todos os módulos antes de validar onde ela reduz o trabalho do escritório.


## Ferramenta para os advogados

### Telas e fluxo proposto

| Onde | Ações e comportamento |
|---|---|
| **Documentos → Modelos** | Catálogo por Declarações, Contratos, Mandatos, Termos e Atendimento. Buscar por título, filtrar categoria e distinguir oficiais dos criados pelo escritório. Mostrar situação, versão publicada, autor da última edição e ação **Usar modelo**. Para editores, **Novo modelo**, **Editar rascunho**, **Duplicar** e **Histórico de versões**. Arquivados aparecem em filtro próprio para quem administra. |
| **Editor de modelo** | Nome no catálogo, título na página, categoria e descrição breve na lista. Editor de texto reaproveitado, botões **Inserir campo** e **Adicionar pergunta**, configuração de assinaturas por papel e formato de folha. Atalho **Prévia** com exemplos fictícios alternáveis entre PF/PJ, campo ausente, nomes longos e fontes opcionais. **Salvar rascunho** preserva alterações sem expor a versão aos emissores. Aviso ao sair com edição não salva. |
| **Inserir campo** | Paleta com linguagem do escritório, agrupada em Cliente, Processo, Advogado, Escritório, Emissão e Complementos. Dados de Agenda e Financeiro aparecem nos tipos compatíveis e respeitam a permissão da fonte. Um clique insere no cursor um chip como **CPF do cliente**. O chip guarda uma chave, pode ser removido e nunca vira CPF real no modelo. Repetir o chip reaproveita o mesmo valor da emissão. |
| **Adicionar pergunta** | Autor define rótulo, tipo (texto curto/longo, data, valor, inteiro, escolha simples ou sim/não), obrigatoriedade e opções, com chave interna estável. Ex.: “Vizinhança há quantos anos?”. Mostrar quantidade de usos e avisar antes de excluir uma pergunta referenciada. Opções podem mudar entre versões, nunca dentro de versão publicada. Para terceiros, oferecer papéis definidos a partir de uma lista ou nome neutro, com campos delimitados por papel. |
| **Publicação** | Mostrar pendências de desenho do modelo, diferenças relevantes frente à versão anterior, prévia e ação explícita **Publicar versão**. Na interface, a publicação disponibiliza o modelo para os usuários internos autorizados. Ela é separada da publicação do site público. Modelos iniciais vindos dos DOCX ganham versão oficial após conferência da redação e das saídas. |
| **Gerar documento** | Permitir escolha do modelo, carga pelo atalho, cliente e demais fontes. Converter os campos e perguntas do modelo em formulário. Exibir indicação “Veio do cadastro”, “Veio da Agenda” ou “Preenchido nesta emissão”. Mostrar lista de pendências, folha editável e as ações usuais de saída. “Salvar sem imprimir” grava o documento final, assim como hoje. Um rascunho da **emissão**, se demandado, é um estado separado e fica para outra etapa. |
| **Histórico e arquivamento** | Ver versões, responsável, data e motivo quando houver. **Restaurar como rascunho** copia a versão escolhida e mantém a atual disponível até a publicação seguinte. **Arquivar** retira o modelo da emissão futura, preservando histórico e leitura dos documentos antigos. Para reativar, reaproveitar a última versão aprovada após confirmação. **Duplicar** nunca copia cliente real ou documentos emitidos. |

Exemplo de uso: o advogado duplica uma declaração, muda seu texto, insere **Nome do cliente** e **CPF do cliente**, cria a pergunta **Motivo**, confere a folha com dados fictícios e salva. Após a publicação interna, seleciona essa declaração na ficha de outro cliente. Nome e CPF vêm do cadastro. O motivo é digitado para aquele documento.

### Editor e representação do conteúdo

**Decisão proposta:** reutilizar `contenteditable` e a barra atual na interface, com conteúdo persistido em uma representação estruturada e versionada. O corpo é um conjunto limitado de parágrafos, fragmentos de texto com formatação permitida, tokens, listas, tabelas simples e blocos oficiais. A folha institucional, os estilos, as fontes dos dados e a renderização são controlados pelo app. Não depender da sintaxe digitada pelo advogado nem permitir JavaScript, condições textuais arbitrárias ou SQL. Assim, a validação consegue descobrir todos os campos usados antes de renderizar e confirmar o que foi publicado.

Exemplo ilustrativo de corpo e perguntas, sem dados de cliente:

```json
{
  "formato": 1,
  "corpo": [
    {
      "tipo": "paragrafo",
      "itens": [
        { "tipo": "texto", "valor": "Eu, " },
        { "tipo": "campo", "chave": "cliente.nome" },
        { "tipo": "texto", "valor": ", CPF " },
        { "tipo": "campo", "chave": "cliente.cpf" },
        { "tipo": "texto", "valor": ", declaro que " },
        { "tipo": "campo", "chave": "manual.motivo" },
        { "tipo": "texto", "valor": "." }
      ]
    }
  ],
  "perguntas": [
    { "chave": "manual.motivo", "rotulo": "Motivo", "tipo": "texto_longo", "obrigatorio": true }
  ],
  "assinaturas": [{ "papel": "Declarante", "nome": "cliente.nome" }]
}
```

- No DOM do editor o chip é não editável por dentro e removível por teclado. Salvar e restaurar seleção ao abrir a paleta. Tratar undo/redo, colar, arrastar, seleção de vários blocos, composição de acentos e remoção do chip no começo/fim de parágrafo. Prototipar primeiro com nome, CPF e uma pergunta antes de ampliar a formatação. A barra atual terá de preservar chips ao partir/mesclar trechos e limpar estilo.
- Nos perfis com saída obrigatoriamente preta, ocultar controles de cor/realce no editor do modelo e na edição da emissão. Normalizar também as classes vindas de colagem e de conteúdo importado antes de gerar a folha definitiva. O realce de pendência na prévia fica restrito à edição. Não mudar cores nem interpretação de documentos antigos ao reimprimir.
- Serializar apenas nós/classes conhecidas e converter nós para o HTML da folha usando utilitários que escapam texto. Na colagem de Word, higienizar e normalizar cor/realce; links, imagem externa, fotos, scripts e estilos de importação não viram conteúdo da matriz. Marcas de chip vindas de fora só entram por colagem interna validada ou viram texto. O higienizador atual descarta `data-*`; manter um caminho específico do editor para ler chips e usar o higienizador habitual na folha final **já resolvida**. Não relaxar a lista branca geral.
- O catálogo de campos é uma lista mantida pelo sistema com chave, rótulo, tipo, contexto, permissão, versão de semântica, formatador, política de ausência e usos autorizados. Conservar chaves antigas ou fornecer migração explícita de formato. Ocultar sugestões incompatíveis com o tipo selecionado, com explicação caso o contexto seja necessário. `cliente.cpf` e `cliente.documento` não são sinônimos.
- MVP de autoria oferece **texto, campos, perguntas e assinaturas**. Os DOCX oficiais que precisam de regras usam blocos aprovados do sistema, como **Condições de pagamento**, **Tabela de parcelas** ou **Cláusula de comunicação da renúncia**, e ramos tipados por seleção. Esses blocos podem aparecer como chips/fichas com título, prévia e configuração limitada. A redação ao redor e os trechos parametrizáveis podem ser revisados. Na duplicação, validar quais blocos são permitidos no destino e manter os essenciais bloqueados na família oficial. Não oferecer cópia de recibo financeiro como modelo genérico com aparência de baixa.
- A segunda etapa pode adicionar **Mostrar este trecho quando a resposta for…** para escolha simples e sim/não, com validação de opções, teste de todas as variantes e detecção de campos órfãos. Listas repetíveis, como testemunhas e verbas, são um recurso tipado; começar com listas oficiais e expor um editor genérico só após validar a experiência. Upload de DOCX no navegador entra em outra avaliação. Colar texto formatado cobre a primeira versão sem obrigar o escritório a entender tags.
- Limites iniciais para protótipo: corpo serializado até 200 KiB, profundidade até 12, até 100 ocorrências de campos, até 30 perguntas e até 20 itens em cada seção repetível, com possibilidade de ajuste após medir as matrizes reais. Manter o limite atual de 400.000 caracteres para HTML de emissão. Validar tamanho e cardinalidade também no servidor. Excluir tamanho zero e testar renderização previsível.
- Importação inicial é feita pelo responsável pela entrega por meio de dados estruturados versionados com registro de fonte, sem conversão automática de Word no uso cotidiano. Se a futura importação pelo editor for aprovada, apresentar mapa de campos e avisos (seções, tabelas, listas, controles, datas), salvar como rascunho, ignorar objetos externos/macros, definir limites de compactação e tratar falhas sem publicar nada. O nome do arquivo não serve como identificação da versão.

## Dados, permissões e integração

### Modelo de dados proposto

Manter separadas a família do modelo, a redação reutilizável e o documento gerado. Usar UUIDs para modelos/versões e chaves de tipo fixas quando já têm significado operacional.

| Estrutura | Campos e garantias |
|---|---|
| `modelos_documento` | `id`, origem `oficial\|escritorio`, tipo de emissão (comum, contrato, comparecimento, FAA e outros perfis previstos), `chave_legada` única e opcional para atalhos já existentes, versão publicada atual, situação de arquivamento, autor/data, carimbos. Nome, categoria e texto publicados são lidos da versão ativa para evitar que editar rascunho mude a lista antes da publicação. |
| `modelos_documento_versoes` | `id`, `modelo_id`, número sequencial por modelo, estado rascunho/publicado, `revisao` para concorrência, `formato`, metadados (título, nome, descrição, categoria), corpo, perguntas e configurações tipadas, autoria, publicação, origem (nome/hash do Word ou versão de origem, sem arquivo binário) e nota de revisão. Índice único `(modelo_id, numero)` e índice parcial para um rascunho por modelo. O banco garante que a versão apontada pertença ao mesmo modelo e esteja publicada. Versões publicadas ficam imutáveis. |
| `documentos` | Adicionar referência nula `modelo_versao_id` e usar o vínculo para rastrear o texto de matriz. `conteudo` continua sendo a folha final já resolvida, com `titulo` como era no dia; `dados` leva inputs pertinentes, origem, papéis mínimos se necessários e ação, nunca o contexto inteiro. Índice na FK de versão. Documentos anteriores podem ficar sem versão. Não reconstruir ou atribuir retroativamente uma versão presumida. |
| Histórico | Eventos de criação, publicação, arquivamento, reativação e restauração do modelo, referenciando IDs, nomes, autor, motivo e mudanças relevantes. Para diffs de conteúdo, ler versões com a própria permissão de modelos. Evitar gravar novamente o corpo inteiro ou dados de cliente no log. Reavaliar `privado.pode_ver_auditoria` e os filtros da tela de Histórico antes de expor a nova família de eventos. |

Para modelos novos, adicionar **uma única** categoria de armazenamento, por exemplo `personalizado`, ao `CHECK` de `documentos.modelo` em **nova migração**, com versão obrigatória e coerente com o tipo. Os oficiais que substituem chaves legadas continuam gravando a chave histórica e passam a informar a versão. Nunca usar o título ou UUID como um novo valor arbitrário do enum a cada publicação. Validar que a versão está aprovada e associada à família correta e que as exigências de contexto da família são respeitadas. Manter a restrição de `recebimento_id` só para recibo, os papéis de Cliente/Financeiro e os vínculos já testados. A rotina nova do recibo, se introduzir versão, deve comparar com a própria edição oficial e conservar os IDs do recebimento/contrato. `relatorio_atividades` e `prestacao_contas` ficam nos caminhos já existentes.

**Publicação transacional:** criar/editar rascunho por função com revisão esperada. Publicar usando a revisão esperada, lock curto do modelo, validação estrutural e atualização atômica da versão e do ponteiro ativo. Repetir a chamada com o mesmo identificador de operação deve retornar a edição publicada, sem criar outra. Diante de concorrência, mostrar que alguém alterou o rascunho, permitir comparar/recarregar e copiar o texto local. Restauração gera rascunho com origem e não muda o ponteiro. Se já houver rascunho, oferecer abrir o existente ou confirmar substituição controlada com registro autoral. Arquivamento exige motivo e também bloqueia emissão nova no servidor.

**Emissão de um documento por versão:** fixar a versão selecionada ao abrir a prévia e comparar com a versão publicada no momento de gravar. Se saiu nova versão ou foi arquivado, mostrar o que aconteceu e pedir revisão da folha com o modelo vigente; manter localmente o texto editado para comparação enquanto a aba estiver aberta. Reimprimir/baixar histórico preserva a versão original, mesmo se arquivada, por operação autenticada específica vinculada ao ID do documento. O caminho histórico deve copiar do registro existente no servidor, preservando texto, cliente, origem e versão, e não criar uma nova via arbitrária de versão antiga pelo cliente. Se exportação falhar depois da gravação, abrir o documento salvo e permitir baixar novamente. Usar chave de idempotência ao gravar por nova emissão/reimpressão para evitar duplicatas acidentais após perda de resposta. A reimpressão intencional segue podendo criar nova saída. Para emissão e cópia por versão, passar pela RPC que checa permissão, origem e vigência dentro da mesma transação. Não conceder `INSERT` direto das novas colunas de versão pelo caminho legado. Durante a transição, ele conserva somente os tipos que já podia emitir, sem possibilidade de simular um registro versionado.

### Permissões e segurança propostas

| Perfil | Permissões sobre modelos, sujeitas à confirmação do escritório |
|---|---|
| Pessoa ativa com acesso a Clientes | Ler somente edições publicadas que pode usar, gerar documento e consultar histórico dos documentos conforme regras existentes. |
| Advogado ativo com acesso a Clientes e autorização explícita de editar modelos | Criar, duplicar, editar rascunho, testar com exemplos, ver versões do catálogo interno. Reaproveitar a interface de Membros para conceder/revogar a capacidade. OAB registrada e papel podem orientar elegibilidade, mas o banco decide pela capacidade vigente. |
| Administrador (no MVP, responsável por publicar) | Gerenciar autoria, publicar versão oficial ou de escritório, restaurar rascunho e arquivar/reativar. Se o escritório preferir autonomia de publicação para mais advogados, criar capacidade separada de publicação, sem conceder administração geral. |
| Financeiro sem Clientes | Conservar leitura/emissão de recibo conforme Consulta/Lançamentos. Receber apenas a versão oficial aplicável ao recibo, se necessário, sem obter acesso ao catálogo comum nem aos dados de Clientes. |
| Anônimo, membro desativado ou sem a capacidade da ação | Sem leitura de rascunhos, mutação ou acesso a fontes protegidas. Permissão de auditoria segue granular. |

- Usar funções de capacidade de membro ativo e RLS com `TO authenticated`, `USING` e `WITH CHECK` conforme operação, privilégios explícitos por tabela/coluna e sem `DELETE` para perfis do app. Privilegiar `SECURITY INVOKER` onde as permissões de tabela bastarem. Para transições sujeitas a controle mais forte, manter lógica privilegiada no esquema interno com `search_path` fixo, schemas qualificados, sessão/capacidade verificadas e execução restrita. Expor somente a interface necessária da RPC e impedir updates diretos em versão publicada/ponteiro. Auditar privilégios tanto da API como do dono da rotina. [RLS e funções no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api).
- O Supabase deixou de expor novas tabelas automaticamente na Data API. A migração futura deve revogar exposição ao público e conceder explicitamente apenas as leituras/funções necessárias aos papéis usados no projeto. Conferir versão da CLI antes de preparar a migração e consultar `--help` para comandos e alvo. [Mudança da exposição automática](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) · [CLI v3](https://supabase.com/changelog/supabase-cli-v3).
- Validar estrutura dos dados das matrizes na fronteira de escrita com esquema explícito (tipos, chaves, repetição e tamanho). Nenhum HTML bruto do editor de modelos passa por `innerHTML` sem tratamento. Conteúdo final já usa lista branca no navegador e deve continuar tratado ao renderizar, imprimir e exportar. Se a API aceitar HTML final como hoje, tratá-lo como texto de origem não confiável em todo consumidor, sem execução em tarefas, páginas públicas ou exportadores. Por padrão não oferecer imagens arbitrárias, hyperlinks ativos ou campos de dados bancários/segredos nos modelos criados.
- Tipos que exigem dados restritos devem ter consulta em contexto com permissão do chamador. IDs em URL e dados fornecidos pelo navegador não conferem acesso. Verificar autorização de cada origem e coerência após troca de cliente/processo e na gravação, inclusive compromisso oculto e contrato ou baixa de outro cliente. Se dados de Agenda/Financeiro não puderem ser lidos, mostrar o motivo e impedir emissão dependente dessa fonte. Testar leitura do documento já emitido: se houver informação financeira/estratégica que deva continuar restrita, aplicar perfil de leitura no documento e no histórico, inclusive por ID e na ficha, em vez de esconder só na tela. Recibo conserva RLS financeira e não permite acesso por política de documento genérico.
- Não gravar CPF, endereço, relato ou conteúdo de atendimento em telemetria, URL, nome do arquivo, histórico de modelo ou exemplos. O documento final guarda o que foi emitido no banco protegido. Rascunho de modelo não deve carregar dados de cliente. Para material de triagem/importação, manter originais privados e fixtures fictícias. Não enviar documento, notificação, intimação ou petição para serviços externos pelo fluxo de geração.

### Pontos de alteração no repositório

1. **Rotas e menu:** adicionar `/documentos/modelos`, `/documentos/modelos/novo` e `/documentos/modelos/:id` em [`app.js`](../sistema/js/app.js), com nível por ação. O roteador escolhe a primeira correspondência. Registrar `/documentos/modelos` antes de `/documentos/:id` e `/documentos/modelos/novo` antes de `/documentos/modelos/:id`. Atualizar capacidade do estado de sessão, membros e histórico se a autorização for implementada.
2. **Catálogo e gerador:** leitor de edições ativas, catálogo de campos e renderizador estruturado em `sistema/js/documentos/`. [`modelos.js`](../sistema/js/documentos/modelos.js) vira fallback/registro de chaves e provedores especializados à medida que as edições oficiais migram. [`novo.js`](../sistema/js/telas/documentos/novo.js) normaliza o contexto e aceita o tipo legado ou o ID do modelo publicado (parâmetro distinto), sem usar duas fontes de resolução no mesmo fluxo. Puxar somente dados pertinentes a cada geração, com permissão, e reutilizar seleção de cliente/processo e auxiliares de dados. Ajustar `COM_ADVOGADOS` para capacidade declarada pelo perfil do modelo em vez de ampliar a lista fixa para sempre.
3. **Lista, ficha e detalhe:** em [`lista.js`](../sistema/js/telas/documentos/lista.js), [`documento.js`](../sistema/js/telas/documentos/documento.js), na ficha de cliente e em [`acoes.js`](../sistema/js/documentos/acoes.js), incluir a referência de versão na leitura/saída. Mostrar `titulo` gravado para o histórico e distinguir tipos com a versão ou modelo de origem. **Gerar outro** resolve versão publicada atual do mesmo modelo e mantém cliente/contexto compatível conferido. Se o modelo estiver arquivado, oferecer escolher um ativo. **Imprimir de novo** e **Baixar para o Word** usam a cópia registrada. Preservar filtros e histórico para documentos anteriores.
4. **Fontes e tipos especiais:** manter [gerador de recibo](../sistema/js/documentos/recibo.js), contrato no Financeiro, Agenda e FAA. Integrar formatos de folha ou blocos sem trocar o vínculo nem a semântica financeira. Oferta a partir do processo/cliente pode pré-selecionar o contexto, respeitando `processoDoCliente`. Atalho da Agenda conserva o cliente e o compromisso. Para PAIA e Intimação de Testemunha, o vínculo de Agenda precisa confirmar CNJ e compatibilidade. O compromisso hoje tem referência de processo em texto, não pressupor uma FK nova já disponível.
5. **Persistência e teste local:** nova migração sobre os arquivos atuais, sem alterar as anteriores. Validar migração no PGlite com fixtures existentes e usuários fictícios, a simulação antiga se continuar sendo usada e a API local real. Auditar RLS, índices e consultas com o filtro necessário. Usar a ferramenta de migração e sequência do [HANDOFF](../HANDOFF.md#publicar-sempre-nesta-ordem-e-só-com-o-pode-publicar) quando chegar à publicação.

## Sequência de implementação e aceite

### Pacotes de trabalho

| Ordem | Pacote | Resultado verificável |
|---|---|---|
| 0 | Revisão do conteúdo e prova de formatação | Confirmar decisões do escritório, sugerir lotes e assinar o mapa campo → origem por arquivo. Renderizar fontes com Word/LibreOffice disponível. Prototipar, com dados fictícios, uma declaração, um contrato longo e uma ficha. Fechar tipografia, título e saída Word antes de converter os demais. |
| 1 | Fundação e piloto | Adicionar esquema versionado, permissão, renderizador, editor mínimo, saída e prévia. Usar uma declaração curta com CPF em cadastro, por exemplo a Hipossuficiência após revisão, e um modelo novo simples, por exemplo o Termo de Chave. Demonstrar novo modelo → prévia → publicar → emitir → editar versão → reimprimir anterior. |
| 2 | Instrumentos e declarações de maior uso | Entregar as revisões de procuração, comparecimento, endereço, FAA e renúncia e as novas declarações de desistência/renúncia de crédito/anuência, carta, revogação e substabelecimento. Incluir múltiplos papéis e opções tipadas antes de cada documento que precise deles. Continuidade do catálogo via chaves legadas. |
| 3 | Contrato e recibo | Aprovar matriz completa de cláusulas/variantes e manter geradores financeiros. Validar entrada, parcelas, êxito, acordos e estornos. Só trocar ponteiro para edição oficial após testes das regras e da saída. |
| 4 | Modelos com contexto e tabelas | Notificação, intimação de testemunha, outorga, rescisão e, se aprovado, PAIA interno. Validar QR se mantido, papéis, layouts multipágina, variantes e permissão ampliada por fonte. |
| 5 | Evoluções opcionais | Regras simples criadas no editor, listas genéricas, DOCX nativo ou importação assistida se a primeira entrega justificar. Incluir peças de peticionamento apenas se o escritório voltar a pedi-las e revisar o material para esse uso. |

**Estimativa relativa:** reaproveitar o editor e o preenchimento deixa o MVP de autoria em complexidade moderada. O maior esforço do lote é a compatibilização jurídica e financeira do contrato, seguida de múltiplos papéis, tabelas e testes de paginação. O esforço de reconstituir todas as peças e oferecer importação fiel do Word é independente. O piloto do pacote 1 dá uma base para estimar as conversões restantes pela quantidade de formulários, ramos e saídas por modelo.

### Decisões do escritório a registrar

| Decisão | Base e proposta de trabalho |
|---|---|
| Catálogo inicial | Confirmar os modelos operacionais e se a PAIA fica só em uso interno ou em fase posterior. A orientação da transcrição sustenta deixar as nove peças fora de início. |
| Autor e publicação | Confirmar quem pode criar rascunho e quem pode tornar visível ao escritório. Recomenda-se começar com advogados indicados editando e administrador publicando. |
| Contrato | Obter uma redação oficial por ramo e aprovar índice, juros, multa/carência, porcentagens, obrigações de 5 salários mínimos, taxa de chave, condições de acordo/garantia, tema cível, foro e referências. A decisão de texto e a eventual alteração das regras do Financeiro são entregas distintas. |
| Declarações e mandatos | Confirmar comparecimento, natureza e escopo de desistência, hipóteses JEC/JEF, ramos de renúncia e revogação, poderes da procuração, regime/inciso da outorga e poderes do preposto. |
| Dados de terceiros e anexos | Confirmar quais instrumentos pedem CPF/endereço de terceiros, memorial, testemunhas e representantes. Para a PAIA, confirmar necessidade e acesso a notas internas. Para a FAA, decidir dados bancários e observações imprimíveis. |
| Word, PDF e assinatura | Confirmar se editar a saída em `.doc` atende ou se é necessário DOCX nativo. Aprovar perfil visual, rodapé, QR, endereço, razão social e como tratar fecho em assinatura digital versus manuscrita. |
| Rescisão | Combinar quem fornece e confere valores e como representar parcelas com ajuste de centavo, verbas e deduções autorizadas. O gerador inicial registra os valores conferidos pelo responsável. |

### Testes e comprovação por cenário

| Grupo | Casos de aceite |
|---|---|
| Fidelidade por arquivo publicado | Conferir nome do original, hash, título, sequência de cláusulas e campos das fichas. Usar dados fictícios para preencher cada campo requerido e abrir tela, PDF/impresso e Word. Nenhum `digite...`, `Lorem ipsum`, exemplo fixo, item cinza/vermelho, data de 10/11/2026 vinda do Word, máscara de zeros ou nome fixado como signatário deve escapar. Testar nos modelos longos com texto suficiente para gerar mais de uma página. |
| Formatos de dados | PF/PJ, CPF/CNPJ com e sem máscara, CPF inválido ou ausente, nome longo com caracteres especiais e HTML, cliente representante, filiação antiga e nova, zeros válidos onde aplicáveis, centavos, extenso, data em fuso e fonte incompleta. Preencher duas vezes o mesmo campo e conferir que o valor/override é consistente. |
| Integração de fontes | Abrir cada atalho existente; cliente principal e parte representada; troca de cliente com limpeza de contexto; contrato vinculado sem permissão Financeiro; comparecimento original e remarcado; FAA de atualização correta; agenda particular exibida só como ocupada para quem não tem direito; população de nomes/OAB com inativo excluído. |
| Autoria | Criar a partir do zero, duplicar, inserir chip no meio de frase, selecionar pelo teclado, colar texto do Word, desfazer/refazer, editar pergunta, eliminar campo em uso, salvar e reabrir rascunho, tentar publicar uma definição inválida, visualizar versão ativa como usuário sem permissão de autoria. Testar redes lentas e duas abas salvando/publicando. |
| Versionamento | Emitir a v1, publicar v2, conferir a diferença de redação na nova emissão, reimprimir v1, arquivar, restaurar como rascunho e reativar. Conferir tentativa via API de alterar versão publicada e de forjar referência de versão incompatível. Testar publicação repetida e versão substituída enquanto a folha fica aberta. |
| Financeiro | Casos detalhados nas fichas 04 e 24. Testar os controles em centavos e a coerência entre parcela, tabela, cláusula, extenso e fontes. Confirmar manutenção das ações de recibo de Consulta/Lançamentos sem acesso a Clientes. Nenhum novo tipo ou modelo livre pode inserir recebimento, criar quitação ou simular baixa oficial. |
| Segurança | Sem sessão, membro desativado, pessoa comum, editor, publicador, Financeiro e Auditoria. Consultar via API o efeito de RLS e dos privilégios. Tentar vínculo trocado, leitura de rascunho por ID, inserção de HTML/script, token desconhecido, atributos fora da lista, imagem externa, payload longo e tipos inconsistentes. Verificar a leitura pela ficha, lista, busca se houver e histórico de cada origem. |
| Saídas e navegação | Conferir página A4, fonte, texto preto, títulos órfãos, tabela larga e multipágina, dois signatários, quebra no rodapé, moeda longa e caracteres com acento. Testar saída a partir de primeira emissão e reimpressão. Layout e acessibilidade em computador e celular, labels e foco do seletor. Garantir que o usuário saiba quando a folha está desatualizada e como corrigir. |

Na implementação, executar `npm run sistema:test`, `npm run banco:test` e `npm run check`. Usar `npm run testar:local` com o banco local e pessoas fictícias para percorrer o fluxo do navegador à persistência. Acrescentar testes específicos para resolução de tokens e compatibilidade das fontes, estados do modelo, concorrência, histórico, políticas e migração a partir de dados antigos. A regressão de recibos/parcelas e do documento com cliente secundário tem cobertura de base em [testes de documentos](../sistema/testes/documentos-tempo.test.mjs), [honorários e repasse](../sistema/testes/honorarios-repasse.test.mjs), [documentos e atualizações SQL](../supabase/testes/documentos-atualizacoes.sql) e [pedidos de 12/11](../supabase/testes/pedidos-1211.sql).

### Estratégia de disponibilização

Fazer migração aditiva antes da interface. A versão antiga deve conseguir ler documentos existentes, gerar pelos atalhos antigos e continuar emitindo os tipos que conhece sem coluna de versão. Manter fallback enquanto o banco novo e o frontend convivem e marcar a nova família como indisponível se a migração estiver ausente. Evitar que IDs de modelos novos caiam silenciosamente na procuração padrão. No ensaio de retorno, esconder temporariamente geração/autoria novas mantendo leitura dos documentos já emitidos, migração aplicada e versão anterior dos modelos disponível. Antes de oficializar a nova redação, definir a compatibilidade com abas antigas, inclusive um aviso de atualização ou bloqueio de emissão pelo caminho antigo quando obrigatório para determinado modelo. Testar esse bloqueio em separado, para não afetar recibos ou as rotas sem versão.

Colocar o catálogo inicial atrás da permissão dos usuários de teste. Conseguir aceite visual e funcional de um advogado com exemplos fictícios. O escritório verifica o conteúdo de cada versão que vai usar. A implantação em produção segue o procedimento combinado no [HANDOFF](../HANDOFF.md), com ordem banco → frontend e validação dos atalhos/versões. A conveniência de publicar um **modelo interno** no uso diário não deve acionar deploy do site.

## Manifesto dos originais

Nomes apresentados em Unicode NFC para leitura. O arquivo 10 usa acentos decompostos no nome em disco. Ao localizar os originais para conversão, usar o caminho enumerado pelo sistema de arquivos e confirmar o hash. O hash identifica o arquivo analisado nesta preparação e não serve como aprovação do seu conteúdo.

| Nº | Arquivo | SHA-256 |
|---|---|---|
| 01 | Ação de Homologação de Divórcio Consensual.docx | `7f280b724dd2dd9fd0779109d871be78f6c44ec8b81900476c82d6dae4135e2a` |
| 02 | Carta de Preposição.docx | `017c68e154a7d5a54cbdb49c7081d41113555e4146bd8e8b951964dd04657ba0` |
| 03 | Contestação.docx | `2d9b136be8e2edecbc0cc976f78bf4b59dd9d34619e5997fb664c7cf3e8fd316` |
| 04 | Contrato de Honorários.docx | `12bb98dec47434fc4c8844c238cfe010e0b6662dd2a2119d05ab9d74195fbb2a` |
| 05 | Declaração de Anuência de Usucapião.docx | `fe33c334809a32e90b087a5be8fca137fa4c3e8d7151145af11ecd3473d26150` |
| 06 | Declaração de Comparecimento.docx | `4099bdbf327b37c23c4f3cff31c9284bab8497c5582212d570f224e2a95849f5` |
| 07 | Declaração de Desistência.docx | `c5c0e05ef6e46aa0fb3bf9cbea502989435ddf585c8bb02828ce78866ba1eccf` |
| 08 | Declaração de Endereço.docx | `a9d5e4fe0306dc33a0d345f1d04070e4dd645361f22a77392d32e213275e2a49` |
| 09 | Declaração de Hipossuficiência.docx | `9cc163b95b9994c6c64712c79ffa5afcdd230c0efad5939b243ba25b7c211a7d` |
| 10 | Declaração de Renúncia de Crédito Excedente para Ingresso de Ação no Juizado.docx | `02f58829a43f005028b6034bc1dbfdd2a99ea75383f736279817e2f03189c78e` |
| 11 | Embargos de Declaração.docx | `80f52fed8372f57e067c5f468b157006e2db712c35cbeb323b6b7240ea5b6e57` |
| 12 | FAA.docx | `941a8d45d3e919c75e1f2467de4fc56d056b1923914db678192bc78e250f9417` |
| 13 | Intimação de Testemunha.docx | `68cd0cc4994db2da795e2ee9abe34c1a31a453a8332c01d1319eb4379babdd40` |
| 14 | Notificação.docx | `0c20a79209978a864d3081e41eac1a2691ba739176a5ebbc6a89f65ba3b1841b` |
| 15 | Outorga Conjugal.docx | `bbfb0d2ae9b988b54649a0c82664f980edf719b9f6883e056165bdb1e6aaa038` |
| 16 | PAIA.docx | `8a3d3e6e6ebfa0dfb24ebd664161d9f60988d6c72a210de3c1d940c712a53145` |
| 17 | Petição Inicial.docx | `baebd6fa152eaeb901ea99933d4f5e3eeeede6e4acd2a9f3535552fc76b9cf6c` |
| 18 | Petição Intermediária - Aceite dativo. Prazo. Prerrogativas..docx | `765f23db4e00704f3ea37cc814cdd2a984d851abf2771e1a52d30af6d6646c7a` |
| 19 | Petição Intermediária - Especificação de provas.docx | `686d169e429651970a7ed2de5ad76e3e2ba33cd754470decc251a963677803d0` |
| 20 | Petição Intermediária - Habilitação.docx | `151cbff2231da96fab025e804bbd27c9fd35e77a3b18fc092c6c95a9574b5e72` |
| 21 | Petição Intermediária - Quesitos à perícia médica.docx | `a19d506ad89a289fcdbe8d81f60c379ee6528408c490e24dc2e0803a7effded8` |
| 22 | Petição Intermediária.docx | `1d02a8b98f6188636bb611701cca981cb3db9ea271fccfe94b7dfea2409fd9ad` |
| 23 | Procuração.docx | `ce99716eaa554a28cbaf8a1787b125e9b1441d139400551e0975f8645ac9b0c2` |
| 24 | Recibo.docx | `0c01a9b620563589ea347fe32489674a2426421cd3d94fd7bba020cb35812077` |
| 25 | Renúncia de Mandato.docx | `49d7f27441bfbd5f9af32d48e18b6ec58aba6cabb936a0d9de5e1f6b0da8fb91` |
| 26 | Revogação de Mandato.docx | `d36656fb2baf7d61f7b82113b9eb7abcd37eaf325ef621519197019240108464` |
| 27 | Substabelecimento.docx | `5754ccf3807214002b02fe686424b646b72da0bb37042a8915806746110527b6` |
| 28 | Termo de Rescisão de Contrato de Trabalho.docx | `e84d474bd3ff398802fd614bd0dde92da9349902e1d6d0f6ad0b64e5f0ae404e` |
| 29 | Termo de Responsabilidade por Chave de Processo.docx | `b3fbc30698509ebca9a252d2684752e4a52517697d2394d71525e5a079a79187` |






