# Importação integral dos modelos DOCX na prévia local

Os 29 arquivos da pasta de origem foram carregados no catálogo local, incluindo as nove petições, a FAA, a PAIA e o Recibo. A prévia usa um banco PGlite descartável. Os DOCX originais continuam na pasta que o escritório forneceu.

## O que foi importado

| Grupo | Modelos |
|---|---|
| Petições | Ação de Homologação de Divórcio Consensual, Contestação, Embargos de Declaração, Petição Inicial, Aceite Dativo, Especificação de Provas, Habilitação, Quesitos à Perícia Médica e Petição Intermediária. |
| Declarações | Anuência de Usucapião, Comparecimento, Desistência, Endereço, Hipossuficiência e Renúncia de Crédito Excedente. |
| Mandatos | Carta de Preposição, Outorga Conjugal, Procuração, Renúncia, Revogação e Substabelecimento. |
| Contratos, termos e outros | Contrato de Honorários, Intimação de Testemunha, Notificação, Termo de Rescisão de Contrato de Trabalho, Termo de Responsabilidade por Chave de Processo e Recibo. |
| Atendimento | Ficha de Atendimento ao Assistido (FAA) e Pauta para Audiências de Instrução e Afins (PAIA). |

- A redação fixa, a ordem dos parágrafos, as citações, as numerações e as alternativas do Word foram preservadas. Os campos substituem os exemplos, as instruções de preenchimento e as escolhas. O editor conserva amostras de redação, como Lorem ipsum, no local em que o Word as apresenta. Na emissão, o campo correspondente recebe a redação do caso.
- O formulário usa dados do cliente, de terceiros cadastrados, do processo, da Agenda e do Financeiro conforme o vínculo e o papel. Informações que dependem do caso continuam no formulário de emissão.
- Os títulos foram alinhados à esquerda. As tabelas e linhas de assinatura foram adaptadas à folha do sistema. As notas de rodapé ficam no fim do documento com sua chamada numérica, e o quadro flutuante de Embargos passou a usar blocos de texto. A paginação depende da saída em A4. O QR Code da Notificação veio do arquivo original.
- A PAIA está disponível para uso no catálogo local. O Recibo do DOCX é um modelo avulso do catálogo. O recibo de uma baixa continua a ser gerado a partir do recebimento financeiro, com o tratamento existente de parcelas, repasses e estornos.
- O contrato reproduz a redação do Word para os pagamentos do modelo. Quando a origem é um acordo com repasse, a seção de pagamento usa os valores e a separação entre cliente e escritório do Financeiro. O formulário usa as datas e os valores da origem para parcelas vinculadas com valores ou vencimentos diferentes.

## Revisão e correções

| Achado confirmado | Correção aplicada |
|---|---|
| Os CPFs da parte ré e de seu cônjuge na Petição Inicial puxavam o CPF do autor. | Cada papel passou a ter seus próprios campos, com preenchimento a partir da pessoa selecionada quando houver cadastro. |
| As testemunhas da Petição Inicial e da Contestação puxavam o nome do cliente. | Cada testemunha passou a ter perguntas próprias para nome e qualificação, exibidas na emissão quando ela for incluída. |
| Dez caixas de texto do gráfico de prazo estavam ausentes nos Embargos de Declaração. | A conversão passou a ler os textos dentro das caixas, preservando os rótulos e parametrizando as datas e os movimentos de exemplo. |
| A comparação inicial abrangia o corpo, mas ainda deixava as notas jurídicas do arquivo Word fora da matriz. | As 18 notas referenciadas foram incorporadas, com as notas da Intimação de Testemunha acompanhando a opção civil ou criminal. |

A revisão independente foi feita por um agente Terra 6.1 em esforço médio. Após as correções, a conferência independente do XML comparou 661 parágrafos de corpo, incluindo tabelas e caixas, e 18 notas referenciadas. A comparação entre a extração e os blocos do catálogo verificou 742 blocos na ordem do original, aplicando as substituições de campos.

O teste de navegador conferiu 29 cartões, a edição e o salvamento de um rascunho, a emissão gravada com a alternativa selecionada, o CPF preenchido pelo cadastro, o título à esquerda, as notas e o QR Code. A suíte do sistema aprovou 259 testes. O banco aprovou 842 verificações. A checagem local aprovou as 19 páginas.

## Arquivos locais

- `scripts/local/importar-modelos-docx.py` converte os DOCX em blocos do editor e valida a reconstrução dos parágrafos a partir das substituições.
- `scripts/local/modelos-docx.json` contém as matrizes geradas e é lido pela carga inicial do banco local.
- Com Python e lxml disponíveis, o comando `python scripts/local/importar-modelos-docx.py "C:/Users/Ithalo/Desktop/Modelos novos" --auditoria .local/docx-conferencia.json` regenera as matrizes e o mapa de substituições.

## Revisão de 14/11/2026 (auditoria com agentes)

Três verificadores compararam texto e campos de cada DOCX com a matriz; quatro testadores exercitaram emissão, editor, versões e banco. Relatórios e scripts em `.local/auditoria-docs-1411/`. Estado depois das correções:

- **Recuo de primeira linha:** todo parágrafo de texto corrido, inclusive cláusulas numeradas ("1º -", "5.1.", "Parágrafo único"). Ficam sem recuo títulos, cabeçalho e assinatura das petições, local/data, citações (recuo do parágrafo inteiro), tabelas e notas. 261 parágrafos.
- **Concordância:** `cliente.inscrito`, `cliente.domiciliado` e `cliente.orientado` seguem "Concordância nos documentos" do cadastro (neutra = "inscrito(a)"). Campos aceitos também em `privado.validar_campos_modelo_documento`.
- **Importador:** parágrafos vazios ocultos no Word (`w:vanish`) não entram; "Petição modelo" virou "Assunto da petição"; datas do aviso prévio do Termo de Rescisão separadas; desconto em folha, JEC/JEF e título dos Quesitos seguem a escolha; cláusula 11 do Contrato vale para todas as áreas; instruções da Especificação de provas e parágrafos de exemplo das petições são opcionais (somem vazios); rótulos dizem onde fica cada trecho; correções só ortográficas em `CORRECOES`.
- **Emissão:** numeração e notas de rodapé renumeradas quando ramos condicionais saem; aviso (não bloqueia) quando os totais do Termo de Rescisão não fecham; contrato cancelado no Financeiro é recusado (tela e RPC); folha reescrita à mão sem nenhum `[marcador]` pode ser salva (ex.: cliente PJ em modelo redigido para pessoa física); confirmação ao sair com dados ou edições.
- **Editor:** busca sem diferenciar maiúsculas; ficha inserida dentro do parágrafo; copiar/colar mantém fichas; perguntas lidas por blocos `oficial.*` não podem ser removidas; Voltar do navegador confirma saída; blocos com redação que não vinha dos DOCX saíram da lista (JS e SQL).
- **Para os advogados decidirem:** FGTS "metade (50%)" e "art. 1 da Lei 8.036/90" no Termo de Rescisão; resolução CNJ 345/2020 × 345/2010 × 354/2020 e "fundamento no 731" na Homologação; trecho "tem-se o subsistirá" no Contrato; trechos em cinza fixos da Homologação (residência, guarda, visitas, um só filho); texto do acordo com repasse; "advogado" fixo quando a advogada assina.
- **Produção:** a migração 48 (`20261114183000_modelos_documento_carga`) carrega os 29 modelos como versão 1 publicada; a prévia local só semeia o que faltar.
