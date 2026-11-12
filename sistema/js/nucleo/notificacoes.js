// Notificações de compromissos e tarefas (pedido de 12/11/2026).
// ===============================================================
//
// Com o sistema aberto em alguma aba (mesmo minimizado), a cada 30 segundos
// confere o que avisar (dominio/notificacoes.js): os lembretes dos meus
// compromissos, os prazos em horas e o resumo do dia das minhas tarefas. O
// aviso aparece no canto da tela, em todas as abas abertas, até ser
// dispensado — recarregar a página não o some — e, se a pessoa ligou em
// Minha conta, também como notificação do computador (uma vez só).
//
// Sem servidor: com o navegador fechado (ou depois da saída por inatividade)
// não chega nada — quem usa o Google Agenda continua recebendo o alerta dele.
//
// Neste navegador, por pessoa: o que já foi avisado (para não repetir) e os
// avisos ainda abertos (para voltar depois de recarregar, até dispensar ou
// perder o sentido — o compromisso começou, o dia acabou). Entre as abas: só
// uma confere por vez (navigator.locks); as outras redesenham pelo canal.

import { limparAvisosFixos, mostrarFixos } from './avisos.js';
import { estado, pode } from './estado.js';
import { hoje, instante, somarDias } from './formato.js';
import { notificarComputador } from './notificar.js';
import { db } from './supabase.js';
import { avisosDevidos, limparAvisadas } from '../dominio/notificacoes.js';

const CONFERIR_A_CADA = 30_000;
const RECARREGAR_A_CADA = 5 * 60_000;
const GRAVACOES_QUE_MUDAM = /^(compromissos|tarefas|rpc\/(criar_tarefa|reabrir_tarefa|finalizar_tarefa|remarcar_compromisso|lancar_audiencia_intimacao|criar_prazo_intimacao))$/;

const chaveAvisadas = (eu) => `fhl.notificacoes.avisadas.${eu}`;
const chaveAbertas = (eu) => `fhl.notificacoes.abertas.${eu}`;

function lerJson(chave, padrao) {
  try {
    return JSON.parse(localStorage.getItem(chave) || 'null') ?? padrao;
  } catch {
    return padrao;
  }
}

function gravarJson(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false; // armazenamento bloqueado: vale só nesta aba
  }
}

/** Liga as notificações para quem entrou. Devolve o desligar. */
export function ligarNotificacoes() {
  const eu = estado.membro?.id;
  if (!eu) return () => {};
  let vivo = true;
  let dados = { compromissos: [], tarefas: [] };
  let carregadoEm = 0;
  let carregando = null;
  let espera = null;
  // Sem localStorage, os registros ficam só nesta aba.
  let avisadasLocais = {};
  let abertasLocais = [];

  const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('fhl-notificacoes') : null;

  // Os abertos, sem os que perderam o sentido; o mais novo primeiro.
  const lerAbertas = () => {
    const lista = lerJson(chaveAbertas(eu), null) ?? abertasLocais;
    return (Array.isArray(lista) ? lista : []).filter((a) => a?.chave && (!a.ate || a.ate > Date.now()));
  };
  const gravarAbertas = (lista) => {
    abertasLocais = lista;
    gravarJson(chaveAbertas(eu), lista);
  };

  const desenhar = () => {
    if (!vivo) return;
    const lista = lerAbertas();
    mostrarFixos(lista, { aoDispensar: dispensar, aoDispensarTodos: dispensarTodos });
  };
  const avisarAbas = () => canal?.postMessage({ membro: eu, tipo: 'mudou' });
  function dispensar(chave) {
    gravarAbertas(lerAbertas().filter((a) => a.chave !== chave));
    desenhar();
    avisarAbas();
  }
  function dispensarTodos() {
    gravarAbertas([]);
    desenhar();
    avisarAbas();
  }
  if (canal) {
    canal.onmessage = (e) => {
      if (vivo && e.data?.membro === eu) desenhar();
    };
  }

  const carregar = () => {
    carregando ??= (async () => {
      const dia = hoje();
      const [compromissos, tarefas] = await Promise.all([
        pode.agenda()
          ? db.rpc('agenda_periodo', { p_de: instante(somarDias(dia, -1)), p_ate: instante(somarDias(dia, 9)) }).catch(() => null)
          : [],
        db.todos('v_tarefas', {
          select: 'id,titulo,tipo,cliente_nome,responsavel_id,entrega,fatal_em,contagem,situacao,cancelado_em',
          filtros: [['responsavel_id', 'eq', eu], ['situacao', 'in', ['pendente', 'em_andamento']], ['cancelado_em', 'is', null]],
        }).catch(() => null),
      ]);
      if (!vivo) return;
      // Falha de rede: fica com o que já tinha e tenta na próxima.
      dados = { compromissos: compromissos ?? dados.compromissos, tarefas: tarefas ?? dados.tarefas };
      if (compromissos && tarefas) carregadoEm = Date.now();
    })().finally(() => {
      carregando = null;
    });
    return carregando;
  };

  const conferirAgora = async () => {
    if (!vivo || estado.membro?.id !== eu) return;
    if (Date.now() - carregadoEm > RECARREGAR_A_CADA) await carregar();
    if (!vivo) return;
    const avisadas = { ...avisadasLocais, ...lerJson(chaveAvisadas(eu), {}) };
    const devidos = avisosDevidos({ agora: Date.now(), eu, ...dados, avisadas });
    const abertas = lerAbertas();
    if (!devidos.length) {
      // Algum perdeu o sentido (o compromisso começou): some da tela.
      if (abertas.length !== (lerJson(chaveAbertas(eu), null) ?? abertasLocais).length) {
        gravarAbertas(abertas);
        desenhar();
        avisarAbas();
      }
      return;
    }
    const agora = Date.now();
    for (const aviso of devidos) for (const chave of aviso.marcar) avisadas[chave] = agora;
    avisadasLocais = limparAvisadas(avisadas, agora);
    gravarJson(chaveAvisadas(eu), avisadasLocais);
    const novas = devidos.map(({ chave, titulo, texto, href, ate }) => ({ chave, titulo, texto, href, ate, quando: agora }));
    gravarAbertas([...novas, ...abertas.filter((a) => !novas.some((n) => n.chave === a.chave))]);
    desenhar();
    avisarAbas();
    for (const aviso of devidos) {
      notificarComputador({
        titulo: aviso.titulo,
        corpo: aviso.texto,
        tag: `fl-${aviso.chave}`,
        aoClicar: () => {
          if (aviso.href) location.hash = aviso.href.slice(1);
          dispensar(aviso.chave);
        },
      });
    }
  };

  // Uma aba por vez: as outras redesenham pelo canal.
  const conferir = () => (navigator.locks?.request
    ? navigator.locks.request(`fhl.notificacoes.${eu}`, { ifAvailable: true }, (trava) => (trava ? conferirAgora() : null))
    : conferirAgora()
  ).catch((erro) => console.error('Não foi possível conferir os avisos.', erro));

  // Marcou, remarcou ou mudou uma tarefa: os dados mudam (com uma pausa, para juntar gravações seguidas).
  const aoGravar = (e) => {
    if (!GRAVACOES_QUE_MUDAM.test(e.detail?.caminho ?? '')) return;
    clearTimeout(espera);
    espera = setTimeout(() => {
      carregadoEm = 0;
      conferir();
    }, 2000);
  };
  addEventListener('fhl:gravou', aoGravar);

  // Os que ficaram abertos voltam já (sem nova notificação do computador).
  desenhar();
  // Celular ↔ computador (girar o tablet, redimensionar): o limite de cartões muda.
  const tamanho = matchMedia('(max-width: 640px)');
  tamanho.addEventListener?.('change', desenhar);
  const timer = setInterval(conferir, CONFERIR_A_CADA);
  // Depois da primeira tela: não disputa com ela.
  const primeira = setTimeout(conferir, 5000);

  return () => {
    vivo = false;
    clearInterval(timer);
    clearTimeout(primeira);
    clearTimeout(espera);
    removeEventListener('fhl:gravou', aoGravar);
    tamanho.removeEventListener?.('change', desenhar);
    canal?.close();
    limparAvisosFixos();
  };
}
