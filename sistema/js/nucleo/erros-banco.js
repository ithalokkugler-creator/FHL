// Traduções não exibem SQL nem detalhes com dados pessoais da linha recusada.
const REGRAS = {
  tarefa_prazo_completo: ['Confira a data fatal, a publicação/intimação e a entrega. A data fatal não pode preceder a base e a entrega não pode ser posterior ao fatal.', 'fatal_dia'],
  tarefas_quantidade_check: ['A quantidade do prazo deve ser um número inteiro de 1 a 3650.', 'quantidade'],
  tarefas_titulo_check: ['O título precisa ter de 1 a 200 caracteres.', 'titulo'],
  tarefas_descricao_check: ['A descrição permite no máximo 20.000 caracteres.', 'descricao'],
  tarefas_prioridade_check: ['Escolha uma prioridade da lista.', 'prioridade'],
  tarefas_contagem_check: ['Escolha dias úteis, dias corridos ou horas.', 'contagem'],
  feriados_unico: ['Já existe um feriado nesta data para o tribunal escolhido. Edite o registro existente ou escolha outra data.', 'data'],
  feriados_tribunal_check: ['Use a sigla do tribunal com 2 a 10 letras maiúsculas ou números, como TJPR.', 'tribunal'],
  clientes_documento_unico: ['Este CPF / CNPJ já está cadastrado. Confira o cliente existente.', 'documento'],
  clientes_detalhes_cep_check: ['O CEP precisa ter 8 dígitos.', 'cep'],
  clientes_detalhes_uf_check: ['Informe a UF com duas letras, como PR.', 'uf'],
  processos_numero_check: ['Número CNJ inválido. Confira os 20 dígitos e o dígito verificador.', 'numero'],
  clientes_email_check: ['Informe um e-mail válido, como nome@exemplo.com.', 'email'],
  clientes_telefone_check: ['Informe o telefone com DDD e de 10 a 13 dígitos.', 'telefone'],
  clientes_nome_check: ['O nome precisa ter de 1 a 200 caracteres.', 'nome'],
  processos_cliente_numero: ['Este número de processo já está cadastrado para o cliente.', 'numero'],
  contrato_fixo_tem_valor: ['Informe o valor fixo do contrato.', 'total'],
  contrato_exito_tem_percentual: ['Informe o percentual de êxito.', 'exito_pct'],
  parcelas_cota_escritorio_pct_check: ['A cota do escritório vai de 0,01% a 100%.', 'cota'],
  repasses_cliente_ativo: ['Este recebimento já tem o repasse ao cliente registrado.', null],
  repasses_cliente_forma_id_fkey: ['Escolha uma forma de pagamento da lista.', 'forma_id'],
  repasses_cliente_conta_financeira_id_fkey: ['Escolha uma conta financeira da lista.', 'conta_financeira_id'],
  renegociacoes_valor_renegociado_check: ['O valor renegociado precisa ser maior que zero.', null],
  contratos_valor_exito_check: ['O valor do êxito apurado precisa ser maior que zero.', 'valor'],
  parcelas_valor_check: ['O valor de cada parcela precisa ser maior que zero.', null],
  parcelas_cota_encargos_pct_check: ['A cota do escritório em multa e juros vai de 0% a 100%.', 'cota_encargos'],
  recebimento_direto: ['Só recebimento de parcela de acordo pode ter a parte do cliente paga direto a ele.', null],
  recebimento_soma: ['O valor recebido não fecha com o saldo abatido e os encargos. Confira o valor.', 'valor'],
};

const CAMPOS = {
  titulo: ['Título', 'use de 1 a 200 caracteres'], nome: ['Nome', 'use de 1 a 200 caracteres'],
  descricao: ['Descrição', 'confira o limite de caracteres'], email: ['E-mail', 'informe um e-mail válido'],
  telefone: ['Telefone', 'informe DDD e de 10 a 13 dígitos'], documento: ['CPF / CNPJ', 'confira os dígitos e o tipo de pessoa'],
  cliente_id: ['Cliente', 'escolha um cadastro disponível'], processo_id: ['Processo / caso', 'selecione um processo do cliente'],
  responsavel_id: ['Responsável', 'escolha um membro ativo'], membro_id: ['Membro', 'escolha um membro ativo'],
  slug: ['Endereço da página', 'use letras minúsculas, números e hífens'],
  valor: ['Valor', 'informe um valor maior que zero'], quantidade: ['Quantidade', 'confira os limites indicados'],
  uf: ['UF', 'informe a sigla com duas letras'], cep: ['CEP', 'informe oito dígitos'],
};

export function descreverErroBanco(d, status) {
  const codigo = String(d?.code || '');
  const texto = d?.message || '';
  // Só lê o identificador da restrição, nunca o conteúdo da linha em details.
  const restricao = texto.match(/constraint "([a-z0-9_]+)"/i)?.[1];
  if (REGRAS[restricao]) {
    const [mensagem, campo] = REGRAS[restricao];
    return { mensagem, campo };
  }
  const coluna = codigo === '23502' ? texto.match(/column "([a-z0-9_]+)"/i)?.[1]
    : Object.keys(CAMPOS).sort((a, b) => b.length - a.length).find((c) => restricao?.endsWith(`_${c}_check`) || restricao?.endsWith(`_${c}_key`) || restricao?.endsWith(`_${c}_fkey`));
  if (coluna && CAMPOS[coluna]) {
    const [rotulo, regra] = CAMPOS[coluna];
    return { campo: coluna, mensagem: codigo === '23505' ? `${rotulo}: já existe um registro com esse dado.`
      : codigo === '23502' ? `Preencha ${rotulo}.` : `${rotulo}: ${regra}.` };
  }
  if (['P0001', '22023'].includes(codigo) || (codigo === '42501' && !/permission denied|row-level security/i.test(texto))) {
    if (texto) return { mensagem: texto };
  }
  if (status === 401) return { mensagem: 'Sua sessão expirou. Entre de novo para continuar.' };
  const mensagens = {
    23505: 'Já existe um registro com esses dados. Confira o cadastro existente antes de salvar novamente.',
    23503: 'Um registro vinculado não existe mais ou não está disponível. Selecione novamente o cliente, processo ou responsável.',
    23514: 'Um campo não atende às regras do cadastro. Confira o formato e os limites indicados nos campos.',
    23502: 'Falta preencher um campo obrigatório.',
    '22P02': 'Um valor está em formato inválido. Confira os números, datas e seleções do cadastro.',
    22007: 'Uma data ou hora está em formato inválido. Selecione novamente a data e o horário.',
    22008: 'A data ou hora informada não existe. Confira dia, mês, ano e horário.',
    22003: 'Um número passa do tamanho que o campo aceita. Confira os valores digitados.',
    42501: 'Seu acesso não permite esta ação. Peça ao administrador para conferir suas permissões.',
  };
  return { mensagem: mensagens[codigo] || (status >= 500
    ? 'O servidor não conseguiu salvar agora. Seus dados continuam no formulário; tente novamente em instantes.'
    : 'Não foi possível concluir a operação. Seus dados continuam no formulário; tente novamente.') };
}
