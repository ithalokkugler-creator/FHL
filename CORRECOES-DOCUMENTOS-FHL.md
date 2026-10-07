# Documentos — correções após teste manual de 06/10/2026

## Comportamento

- Complementos atualizam a prévia durante a digitação, sem redesenhar campos nem perder o cursor.
- Edições manuais são preservadas. Campos alterados depois delas geram aviso com duas escolhas: atualizar pelos campos (confirma a substituição) ou manter o texto editado (confirma a revisão manual). Salvar, Word e imprimir ficam protegidos até resolver a escolha.
- Salvar também avisa sobre campos destacados pendentes. Valores negativos/inválidos, entrada acima do total, parcelamento incompatível e êxito zero numa modalidade de êxito apontam o campo a corrigir.
- Honorários distinguem valor fixo, somente êxito e fixo com êxito; entrada integral funciona como pagamento à vista. Cláusulas específicas só aparecem na área jurídica correspondente; o percentual trabalhista acompanha o êxito informado.
- Documentos vindos do Financeiro usam modalidade, parcelas/datas/valores reais e critério efetivo de atraso. Complementos financeiros ficam somente para leitura, com indicação de onde alterar o contrato.
- Prestação de contas mostra saldo principal das parcelas válidas, sem confundir recebimento de encargos com amortização. Êxito a apurar não vira quitação. O recibo limita-se aos lançamentos informados e não declara quitação geral nem renúncia ao saldo.
- Documentos já guardados mantêm seu texto histórico; as mudanças valem para novas gerações. DJEN e feriados automáticos permanecem fora deste ajuste.

## Verificação

- `npm run sistema:test`: 112 testes passaram, incluindo modalidade, entrada, parcelas diferentes, critérios próprios, saldo com encargos, estornos e renegociação.
- `npm run check`: 17 páginas, links, âncoras, metadados e SEO verificados; build com conteúdo remoto disponível.
- Navegador do Codex, prévia fictícia: atualização antes de sair do campo, nota manual preservada, salvamento bloqueado até escolha, manter texto com confirmação e persistência, aviso ao salvar prestação incompleta, correção do complemento e prestação salva com saldo de R$ 1.500.

A adaptação dos modelos é funcional; a revisão final da redação jurídica continua a cargo do escritório. Não houve alteração de schema, permissões, regras do Financeiro ou documentos históricos.
