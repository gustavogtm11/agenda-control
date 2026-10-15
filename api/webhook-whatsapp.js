// api/webhook-whatsapp.js
// Atendimento WhatsApp multiempresa. O estado e todos os registros são isolados por companyId.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function inicializarFirebase() {
  if (getApps().length) return;
  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credencial) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada.');
  initializeApp({ credential: cert(JSON.parse(credencial)) });
}

const db = () => getFirestore();
const TIME_ZONE = 'America/Recife';
const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function partesRecife(date = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(partes.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}
function hojeEmRecife() {
  const p = partesRecife();
  return p.year + '-' + p.month + '-' + p.day;
}
function agoraRecifeIso() {
  const p = partesRecife();
  return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
}
function formatarDataBR(iso) {
  const [ano, mes, dia] = String(iso || '').split('-');
  return dia + '/' + mes + '/' + ano;
}
function normalizarTelefone(valor) {
  return String(valor || '').replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '').replace(/\D/g, '');
}
function extrairMensagem(payload) {
  const message = payload?.data?.message || {};
  return String(
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.title ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  ).trim();
}
function parseDataDigitada(texto) {
  const match = String(texto).trim().match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?$/);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3] || hojeEmRecife().slice(0, 4));
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  const iso = ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  if (iso < hojeEmRecife()) return null;
  return iso;
}
function diaSemanaKey(dataIso) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return diasSemana[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
}
function minutos(hora) {
  const [h, m] = String(hora || '').split(':').map(Number);
  return h * 60 + m;
}
function formatarHora(total) {
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}
function extrairHorariosEmpresa(empresa = {}) {
  const globais = empresa.configuracoesGlobais || {};
  const horarios = empresa.horariosFuncionamento || globais.horariosFuncionamento || {};
  const almoco = empresa.horarioAlmoco || empresa.configuracoes?.horarioAlmoco || globais.horarioAlmoco || { ativo: true, inicio: '12:00', fim: '13:00' };
  const diasBloqueados = empresa.diasBloqueados || globais.diasBloqueados || [];
  return { horarios, almoco, diasBloqueados };
}
function renderizarMensagem(texto, variaveis = {}) {
  const valores = {
    primeiroNome: variaveis.primeiroNome || 'cliente',
    data: variaveis.data || '',
    hora: variaveis.hora || variaveis.horario || '',
    horario: variaveis.horario || variave.hora || '',
    servico: variaveis.servico || '',
    profissional: variaveis.profissional || 'equipe',
    valor: variaveis.valor || '',
  };
  return String(texto || '').replace(/\{(primeiroNome|data|hora|horario|servico|profissional|valor)\}/g, (_, chave) => valores[chave] || '');
}
function textoConfig(config, campo, padrao) {
  return typeof config?.[campo] === 'string' && config[campo].trim() ? config[campo].trim() : padrao;
}
function limparMenuLegado(texto) {
  const linhas = String(texto || '').split('\n');
  const indice = linhas.findIndex((linha) => /^\s*1\s*[-.)]\s*(agendar|marcar|fazer agendamento)/i.test(linha));
  return indice > 0 ? linhas.slice(0, indice).join('\n').trim() : String(texto || '').trim();
}
async function enviarMensagem(telefone, texto, instancia) {
  const baseUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('Evolution API não configurada no servidor.');
  const response = await fetch(baseUrl + '/message/sendText/' + encodeURIComponent(instancia), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: telefone, text: texto }),
  });
  if (!response.ok) {
    const detalhe = await response.text().catch(() => '');
    throw new Error('Evolution recusou o envio (HTTP ' + response.status + '): ' + detalhe.slice(0, 300));
  }
}
async function carregarServicos(companyId) {
  const snapshot = await db().collection('servicos').where('companyId', '==', companyId).get();
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.ativo !== false)
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}
async function carregarAgendamentos(companyId) {
  const snapshot = await db().collection('agendamentos').where('companyId', '==', companyId).get();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}
async function carregarEmpresa(companyId) {
  const snapshot = await db().collection('empresas').doc(companyId).get();
  return snapshot.exists ? snapshot.data() : null;
}
function agendamentoAtivo(ag) {
  return ag.status !== 'cancelado' && ag.status !== 'concluido' && ag.status !== 'finalizado';
}
function sobrepoe(inicioA, duracaoA, inicioB, duracaoB) {
  return inicioA < inicioB + duracaoB && inicioA + duracaoA > inicioB;
}
async function calcularHorariosDisponiveis(companyId, dataIso, servico) {
  const empresa = await carregarEmpresa(companyId);
  if (!empresa || empresa.bloqueada === true || empresa.statusPgto === 'bloqueado') return [];
  const { horarios, almoco, diasBloqueados } = extrairHorariosEmpresa(empresa);
  if (diasBloqueados.includes(dataIso)) return [];
  const horarioDia = horarios[diaSemanaKey(dataIso)];
  if (!horarioDia || horarioDia.ativo !== true || !horarioDia.inicio || !horarioDia.fim) return [];

  const inicioExpediente = minutos(horarioDia.inicio);
  const fimExpediente = minutos(horarioDia.fim);
  const duracao = Math.max(1, Number(servico.duracaoMinutos) || 30);
  const hoje = hojeEmRecife();
  const agora = partesRecife();
  const minutosAgora = Number(agora.hour) * 60 + Number(agora.minute);
  const ocupados = (await carregarAgendamentos(companyId))
    .filter((ag) => String(ag.dataHora || '').startsWith(dataIso) && agendamentoAtivo(ag));

  const slots = [];
  for (let slot = Math.ceil(inicioExpediente / 30) * 30; slot + duracao <= fimExpediente; slot += 30) {
    if (dataIso === hoje && slot <= minutosAgora) continue;
    if (almoco?.ativo !== false && almoco?.inicio && almoco?.fim) {
      if (slot < minutos(almoco.fim) && slot + duracao > minutos(almoco.inicio)) continue;
    }
    const conflito = ocupados.some((ag) => {
      const horaAg = String(ag.dataHora || '').split('T')[1];
      if (!horaAg) return false;
      return sobrepoe(slot, duracao, minutos(horaAg), Math.max(1, Number(ag.duracaoMinutos) || 30));
    });
    if (!conflito) slots.push(formatarHora(slot));
  }
  return slots;
}
async function atualizarEstado(estadoRef, dados) {
  await estadoRef.set({ ...dados, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
}
async function responderInicio(telefone, companyId, nomeCliente, config, estadoRef) {
  const variaveis = { primeiroNome: String(nomeCliente || 'cliente').split(/\s+/)[0] };
  let boasVindas = textoConfig(config, 'msgBoasVindas', 'Olá {primeiroNome}! 👋 Sou o assistente virtual. Vou te ajudar por aqui.');
  const temMenuLegado = /(?:^|\n)\s*1\s*[-.)]\s*(agendar|marcar|fazer agendamento)/i.test(boasVindas);
  let menu = '';
  if (typeof config.msgMenuPrincipal === 'string') {
    menu = config.msgMenuPrincipal.trim();
    if (temMenuLegado) boasVindas = limparMenuLegado(boasVindas);
  } else if (!temMenuLegado) {
    menu = 'Como posso ajudar?\n1 - Agendar horário 📅\n2 - Cancelar agendamento ❌\n3 - Consultar meus horários 📋\n4 - Falar com atendente 👤';
  }
  const mensagem = menu ? renderizarMensagem(boasVindas, variaveis) + '\n\n' + renderizarMensagem(menu, variaveis) : renderizarMensagem(boasVindas, variaveis);
  await enviarMensagem(telefone, mensagem, companyId);
  await atualizarEstado(estadoRef, { passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
}
async function enviarMenuDias(telefone, companyId, servico, estadoRef, config) {
  const dias = [];
  const [ano, mes, dia] = hojeEmRecife().split('-').map(Number);
  for (let i = 0; i < 14; i++) {
    const data = new Date(Date.UTC(ano, mes - 1, dia + i));
    const iso = data.getUTCFullYear() + '-' + String(data.getUTCMonth() + 1).padStart(2, '0') + '-' + String(data.getUTCDate()).padStart(2, '0');
    const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(data);
    dias.push({ dataBanco: iso, label: label + ' (' + formatarDataBR(iso).slice(0, 5) + ')' });
  }
  let texto = renderizarMensagem(textoConfig(config, 'msgData', 'Para qual dia você deseja agendar?'), { servico: servico.nome }) + '\n\n';
  dias.forEach((item, i) => { texto += (i + 1) + ' - ' + item.label + '\n'; });
  texto += '\n0 - Digitar outra data (DD/MM/AAAA)';
  await enviarMensagem(telefone, texto, companyId);
  await atualizarEstado(estadoRef, {
    passo: 'ESCOLHENDO_DIA', servicoId: servico.id, servicoNome: servico.nome,
    preco: Number(servico.preco) || 0, duracaoMinutos: Number(servico.duracaoMinutos) || 30,
    diasDisponiveis: dias, dataUltimaInteracao: hojeEmRecife(),
  });
}
async function buscarHorariosEEnviar(telefone, companyId, dataIso, estado, estadoRef, config) {
  const servicos = await carregarServicos(companyId);
  const servico = servicos.find((item) => item.id === estado.servicoId);
  if (!servico) {
    await enviarMensagem(telefone, 'Não encontrei esse serviço no cadastro. Digite MENU para começar novamente.', companyId);
    await atualizarEstado(estadoRef, { passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
    return;
  }
  const horarios = await calcularHorariosDisponiveis(companyId, dataIso, servico);
  if (!horarios.length) {
    const texto = textoConfig(config, 'msgSemHorarios', 'Não encontrei horários disponíveis nessa data. Informe outra data no formato DD/MM/AAAA:');
    await enviarMensagem(telefone, renderizarMensagem(texto, { data: formatarDataBR(dataIso), servico: servico.nome }), companyId);
    await atualizarEstado(estadoRef, { ...estado, passo: 'DIGITANDO_DATA_MANUAL', dataUltimaInteracao: hojeEmRecife() });
    return;
  }
  let texto = renderizarMensagem(textoConfig(config, 'msgHorario', 'Estes são os horários disponíveis. Escolha um número:'), {
    data: formatarDataBR(dataIso), servico: servico.nome,
  }) + '\n\n';
  horarios.forEach((hora, i) => { texto += (i + 1) + ' - ' + hora + '\n'; });
  await enviarMensagem(telefone, texto, companyId);
  await atualizarEstado(estadoRef, {
    ...estado, passo: 'ESCOLHENDO_HORARIO', dataEscolhida: dataIso,
    horariosDisponiveis: horarios, servicoId: servico.id, servicoNome: servico.nome,
    preco: Number(servico.preco) || 0, duracaoMinutos: Number(servico.duracaoMinutos) || 30,
    dataUltimaInteracao: hojeEmRecife(),
  });
}
function gerarLockIds(companyId, dataIso, hora, duracao) {
  const inicio = minutos(hora);
  const fim = inicio + Math.max(1, Number(duracao) || 30);
  const ids = [];
  for (let slot = Math.floor(inicio / 30) * 30; slot < fim; slot += 30) {
    ids.push((companyId + '__' + dataIso + '__' + formatarHora(slot)).replace(/[^a-zA-Z0-9_-]/g, '_'));
  }
  return ids;
}
async function criarAgendamentoSeDisponivel(companyId, telefone, nomeCliente, estado) {
  const empresa = await carregarEmpresa(companyId);
  if (!empresa || empresa.bloqueada === true || empresa.statusPgto === 'bloqueado') {
    throw new Error('Esta empresa está temporariamente indisponível para novos agendamentos.');
  }
  const servicos = await carregarServicos(companyId);
  const servico = servicos.find((item) => item.id === estado.servicoId);
  if (!servico) throw new Error('O serviço selecionado não está mais disponível.');

  const duracao = Math.max(1, Number(servico.duracaoMinutos) || 30);
  const hora = estado.horarioEscolhido;
  const dataIso = estado.dataEscolhida;
  const horariosAtualizados = await calcularHorariosDisponiveis(companyId, dataIso, servico);
  if (!horariosAtualizados.includes(hora)) {
    throw new Error('Esse horário não está mais disponível. Escolha outra opção.');
  }
  const lockIds = gerarLockIds(companyId, dataIso, hora, duracao);
  const agendamentosRef = db().collection('agendamentos');
  const agendamentoRef = agendamentosRef.doc();
  const lockRefs = lockIds.map((id) => db().collection('whatsapp_slot_locks').doc(id));

  await db().runTransaction(async (transaction) => {
    const lockSnapshots = await Promise.all(lockRefs.map((ref) => transaction.get(ref)));
    if (lockSnapshots.some((snap) => snap.exists)) {
      throw new Error('Esse horário acabou de ser reservado. Vou consultar novamente as opções.');
    }
    const snapshot = await transaction.get(agendamentosRef.where('companyId', '==', companyId));
    const conflito = snapshot.docs.some((docSnap) => {
      const ag = docSnap.data();
      if (!agendamentoAtivo(ag) || !String(ag.dataHora || '').startsWith(dataIso)) return false;
      const horaAg = String(ag.dataHora || '').split('T')[1];
      return horaAg && sobrepoe(minutos(hora), duracao, minutos(horaAg), Math.max(1, Number(ag.duracaoMinutos) || 30));
    });
    if (conflito) throw new Error('Esse horário acabou de ficar indisponível. Vou consultar os horários novamente.');
    transaction.create(agendamentoRef, {
      clienteNome: nomeCliente || 'Cliente WhatsApp',
      telefone: telefone,
      clienteTelefone: telefone,
      servicoId: servico.id,
      servicoIds: [servico.id],
      servicoNome: servico.nome,
      funcionarioEmail: null,
      preco: Number(servico.preco) || 0,
      duracaoMinutos: duracao,
      dataHora: dataIso + 'T' + hora,
      companyId,
      status: 'pendente',
      googleEventId: null,
      googleSyncPending: false,
      origem: 'whatsapp',
      slotLockIds: lockIds,
      criadoEm: FieldValue.serverTimestamp(),
    });
    lockRefs.forEach((ref) => transaction.create(ref, {
      companyId, agendamentoId: agendamentoRef.id, dataHora: dataIso + 'T' + hora,
      criadoEm: FieldValue.serverTimestamp(),
    }));
  });
  return { servico, agendamentoRef };
}
function telefoneDoAgendamento(ag) {
  return normalizarTelefone(ag.telefone || ag.clienteTelefone || ag.whatsapp || ag.telefoneCliente || '');
}
async function listarAgendamentosDoCliente(companyId, telefone) {
  const todos = await carregarAgendamentos(companyId);
  return todos
    .filter((ag) => telefoneDoAgendamento(ag) === telefone && agendamentoAtivo(ag) && String(ag.dataHora || '') >= agoraRecifeIso())
    .sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora)));
}
async function cancelarAgendamentoWhatsApp(companyId, telefone, agendamentoId) {
  const ref = db().collection('agendamentos').doc(agendamentoId);
  await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('Esse agendamento não está mais disponível para cancelamento.');
    const ag = snapshot.data();
    if (ag.companyId !== companyId || telefoneDoAgendamento(ag) !== telefone || !agendamentoAtivo(ag)) {
      throw new Error('Não consegui validar esse agendamento para o seu número.');
    }
    const lockRefs = (Array.isArray(ag.slotLockIds) ? ag.slotLockIds : [])
      .map((id) => db().collection('whatsapp_slot_locks').doc(String(id)));
    const lockSnapshots = await Promise.all(lockRefs.map((lockRef) => transaction.get(lockRef)));
    transaction.delete(ref);
    lockRefs.forEach((lockRef, index) => { if (lockSnapshots[index].exists) transaction.delete(lockRef); });
  });
}
async function processarMensagem({ companyId, telefone, nomeCliente, mensagem, estadoRef, config }) {
  const estadoSnap = await estadoRef.get();
  let estado = estadoSnap.exists ? estadoSnap.data() : { passo: 'INICIO' };
  if (estado.dataUltimaInteracao && estado.dataUltimaInteracao !== hojeEmRecife()) estado = { passo: 'INICIO' };
  const entrada = String(mensagem || '').trim();
  const entradaNormalizada = entrada.toLocaleLowerCase('pt-BR');
  const variaveis = { primeiroNome: String(nomeCliente || 'cliente').split(/\s+/)[0] };

  if (['menu', 'reiniciar', 'voltar', 'inicio', 'início', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(entradaNormalizada)) {
    await responderInicio(telefone, companyId, nomeCliente, config, estadoRef);
    return;
  }
  if (estado.passo === 'ESPERANDO_ATENDENTE') return;

  switch (estado.passo) {
    case 'INICIO': {
      if (entrada === '1') {
        const servicos = await carregarServicos(companyId);
        if (!servicos.length) {
          await enviarMensagem(telefone, 'Ainda não há serviços cadastrados. Por favor, fale com um atendente.', companyId);
          await atualizarEstado(estadoRef, { passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
          return;
        }
        let texto = renderizarMensagem(textoConfig(config, 'msgServicos', 'Qual serviço você deseja realizar? Responda com o número:'), variaveis) + '\n\n';
        servicos.forEach((servico, i) => {
          texto += (i + 1) + ' - ' + servico.nome + ' (R$ ' + (Number(servico.preco) || 0).toFixed(2).replace('.', ',') + ')\n';
        });
        texto += '\n0 - Voltar ao menu';
        await enviarMensagem(telefone, texto, companyId);
        await atualizarEstado(estadoRef, {
          passo: 'ESCOLHENDO_SERVICO',
          servicosDisponiveis: servicos.map((s) => ({ id: s.id, nome: s.nome, preco: s.preco, duracaoMinutos: s.duracaoMinutos })),
          dataUltimaInteracao: hojeEmRecife(),
        });
      } else if (entrada === '2') {
        const agendamentos = await listarAgendamentosDoCliente(companyId, telefone);
        if (!agendamentos.length) {
          await enviarMensagem(telefone, textoConfig(config, 'msgSemAgendamentos', 'Não encontrei agendamentos futuros vinculados a este número. Digite 1 para agendar ou MENU para voltar.'), companyId);
          return;
        }
        let texto = 'Qual agendamento você deseja cancelar?\n\n';
        agendamentos.forEach((ag, i) => {
          texto += (i + 1) + ' - ' + (ag.servicoNome || 'Serviço') + ' • ' + formatarDataBR(String(ag.dataHora).split('T')[0]) + ' às ' + String(ag.dataHora).split('T')[1]?.slice(0, 5) + '\n';
        });
        texto += '\n0 - Voltar ao menu';
        await enviarMensagem(telefone, texto, companyId);
        await atualizarEstado(estadoRef, {
          passo: 'ESCOLHENDO_CANCELAMENTO',
          cancelamentosDisponiveis: agendamentos.map((ag) => ({ id: ag.id, dataHora: ag.dataHora, servicoNome: ag.servicoNome })),
          dataUltimaInteracao: hojeEmRecife(),
        });
      } else if (entrada === '3') {
        const agendamentos = await listarAgendamentosDoCliente(companyId, telefone);
        if (!agendamentos.length) {
          await enviarMensagem(telefone, textoConfig(config, 'msgSemAgendamentos', 'Não encontrei agendamentos futuros vinculados a este número. Digite 1 para agendar ou MENU para voltar.'), companyId);
          return;
        }
        let texto = renderizarMensagem(textoConfig(config, 'msgConsulta', 'Estes são seus próximos horários:'), variaveis) + '\n\n';
        agendamentos.forEach((ag, i) => {
          texto += (i + 1) + ' - ' + (ag.servicoNome || 'Serviço') + ' • ' + formatarDataBR(String(ag.dataHora).split('T')[0]) + ' às ' + String(ag.dataHora).split('T')[1]?.slice(0, 5) + '\n';
        });
        texto += '\nDigite MENU para voltar ao início.';
        await enviarMensagem(telefone, texto, companyId);
        await atualizarEstado(estadoRef, { passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
      } else if (entrada === '4') {
        await enviarMensagem(telefone, renderizarMensagem(textoConfig(config, 'msgAtendente', 'Certo! Registrei seu pedido para falar com um atendente. Nossa equipe continuará por aqui assim que possível. Digite MENU para voltar ao robô.'), variaveis), companyId);
        await atualizarEstado(estadoRef, { passo: 'ESPERANDO_ATENDENTE', dataUltimaInteracao: hojeEmRecife() });
      } else {
        await responderInicio(telefone, companyId, nomeCliente, config, estadoRef);
      }
      return;
    }
    case 'ESCOLHENDO_SERVICO': {
      if (entrada === '0') { await responderInicio(telefone, companyId, nomeCliente, config, estadoRef); return; }
      if (!/^\d+$/.test(entrada)) {
        await enviarMensagem(telefone, 'Responda apenas com o número do serviço listado ou digite MENU.', companyId);
        return;
      }
      const servico = estado.servicosDisponiveis?.[Number(entrada) - 1];
      if (!servico) {
        await enviarMensagem(telefone, 'Opção inválida. Escolha um número da lista ou digite 0 para voltar.', companyId);
        return;
      }
      await enviarMenuDias(telefone, companyId, servico, estadoRef, config);
      return;
    }
    case 'ESCOLHENDO_DIA': {
      if (entrada === '0') {
        await enviarMensagem(telefone, 'Digite a data desejada no formato DD/MM/AAAA. Exemplo: 25/10/2026', companyId);
        await atualizarEstado(estadoRef, { ...estado, passo: 'DIGITANDO_DATA_MANUAL', dataUltimaInteracao: hojeEmRecife() });
        return;
      }
      if (!/^\d+$/.test(entrada)) {
        await enviarMensagem(telefone, 'Escolha um número da lista ou digite 0 para informar outra data.', companyId);
        return;
      }
      const dia = estado.diasDisponiveis?.[Number(entrada) - 1];
      if (!dia) {
        await enviarMensagem(telefone, 'Opção inválida. Escolha um número da lista ou digite 0 para informar outra data.', companyId);
        return;
      }
      await buscarHorariosEEnviar(telefone, companyId, dia.dataBanco, estado, estadoRef, config);
      return;
    }
    case 'DIGITANDO_DATA_MANUAL': {
      const dataIso = parseDataDigitada(entrada);
      if (!dataIso) {
        await enviarMensagem(telefone, 'Data inválida ou passada. Informe uma data futura no formato DD/MM/AAAA.', companyId);
        return;
      }
      await buscarHorariosEEnviar(telefone, companyId, dataIso, estado, estadoRef, config);
      return;
    }
    case 'ESCOLHENDO_HORARIO': {
      if (entrada === '0') { await responderInicio(telefone, companyId, nomeCliente, config, estadoRef); return; }
      if (!/^\d+$/.test(entrada)) {
        await enviarMensagem(telefone, 'Responda com o número de um horário listado ou digite MENU.', companyId);
        return;
      }
      const horario = estado.horariosDisponiveis?.[Number(entrada) - 1];
      if (!horario) {
        await enviarMensagem(telefone, 'Opção inválida. Escolha um dos horários listados ou digite MENU.', companyId);
        return;
      }
      try {
        const { servico } = await criarAgendamentoSeDisponivel(companyId, telefone, nomeCliente, { ...estado, horarioEscolhido: horario });
        const mensagemFinal = renderizarMensagem(textoConfig(config, 'msgConfirmacao', 'Agendamento realizado! {servico} em {data}, às {hora}. Obrigado, {primeiroNome}!'), {
          primeiroNome: variaveis.primeiroNome,
          servico: servico.nome,
          data: formatarDataBR(estado.dataEscolhida),
          hora: horario,
          horario: horario,
          profissional: 'equipe',
          valor: 'R$ ' + (Number(servico.preco) || 0).toFixed(2).replace('.', ','),
        });
        await enviarMensagem(telefone, mensagemFinal, companyId);
        await estadoRef.delete();
      } catch (error) {
        await enviarMensagem(telefone, (error.message || 'Não consegui concluir o agendamento.') + '\n\nDigite MENU para recomeçar ou escolha outra data.', companyId);
        await atualizarEstado(estadoRef, { ...estado, passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
      }
      return;
    }
    case 'ESCOLHENDO_CANCELAMENTO': {
      if (entrada === '0') { await responderInicio(telefone, companyId, nomeCliente, config, estadoRef); return; }
      if (!/^\d+$/.test(entrada)) {
        await enviarMensagem(telefone, 'Responda com o número do agendamento que deseja cancelar ou digite 0 para voltar.', companyId);
        return;
      }
      const agendamento = estado.cancelamentosDisponiveis?.[Number(entrada) - 1];
      if (!agendamento) {
        await enviarMensagem(telefone, 'Opção inválida. Escolha um número da lista ou digite 0 para voltar.', companyId);
        return;
      }
      try {
        await cancelarAgendamentoWhatsApp(companyId, telefone, agendamento.id);
        await enviarMensagem(telefone, renderizarMensagem(textoConfig(config, 'msgCancelamento', 'Pronto, {primeiroNome}! Seu agendamento de {servico}, em {data} às {hora}, foi cancelado.'), {
          primeiroNome: variaveis.primeiroNome,
          servico: agendamento.servicoNome,
          data: formatarDataBR(String(agendamento.dataHora).split('T')[0]),
          hora: String(agendamento.dataHora).split('T')[1]?.slice(0, 5),
          horario: String(agendamento.dataHora).split('T')[1]?.slice(0, 5),
        }), companyId);
        await estadoRef.delete();
      } catch (error) {
        await enviarMensagem(telefone, (error.message || 'Não foi possível cancelar esse agendamento.') + '\nDigite MENU para voltar ao início.', companyId);
        await atualizarEstado(estadoRef, { passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
      }
      return;
    }
    default:
      await responderInicio(telefone, companyId, nomeCliente, config, estadoRef);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Webhook WhatsApp ativo.');
  try {
    const segredoConfigurado = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!segredoConfigurado || req.query?.secret !== segredoConfigurado) {
      return res.status(401).send('Webhook não autorizado.');
    }
    inicializarFirebase();
    const payload = req.body || {};
    const companyId = String(payload.instance || payload.instanceName || '');
    const data = payload.data || {};
    const key = data.key || {};
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(companyId)) return res.status(400).send('Instância inválida.');
    if (key.fromMe === true || String(key.remoteJid || '').includes('@g.us') || String(key.remoteJidAlt || '').includes('@g.us')) {
      return res.status(200).send('Evento próprio/grupo ignorado.');
    }
    const jid = String(key.remoteJid || '');
    const jidAlternativo = String(key.remoteJidAlt || '');
    const origemJid = jid.includes('@s.whatsapp.net') || jid.includes('@c.us') ? jid : jidAlternativo || jid;
    const telefone = normalizarTelefone(origemJid.split('@')[0]);
    if (!telefone) return res.status(200).send('Contato sem telefone suportado.');
    if (jid.endsWith('@broadcast') || jidAlternativo.endsWith('@broadcast')) return res.status(200).send('Broadcast ignorado.');

    const mensagem = extrairMensagem(payload);
    const messageId = String(key.id || '');
    if (!mensagem || !messageId) return res.status(200).send('Evento sem mensagem de texto ou ID.');
    const evento = String(payload.event || '').toLowerCase().replace(/_/g, '.');
    if (evento && !evento.includes('messages.upsert')) return res.status(200).send('Evento ignorado.');

    const empresa = await carregarEmpresa(companyId);
    if (!empresa || empresa.bloqueada === true || empresa.statusPgto === 'bloqueado') {
      return res.status(200).send('Empresa inexistente ou bloqueada.');
    }
    const configSnap = await db().collection('configuracoes_whatsapp').doc(companyId).get();
    const config = configSnap.exists ? configSnap.data() : { ativo: false };
    if (config.ativo !== true) return res.status(200).send('Atendimento automático desativado.');

    const nomeCliente = String(data.pushName || 'Cliente').slice(0, 120);
    const estadoId = (companyId + '__' + telefone).replace(/[^a-zA-Z0-9_-]/g, '_');
    const estadoRef = db().collection('estados_whatsapp').doc(estadoId);
    const eventoRef = db().collection('whatsapp_eventos_processados').doc((companyId + '__' + messageId).replace(/[^a-zA-Z0-9_-]/g, '_'));
    try {
      await eventoRef.create({ companyId, messageId, processadoEm: FieldValue.serverTimestamp() });
    } catch (error) {
      if (error.code === 6 || error.code === 'already-exists') return res.status(200).send('Evento duplicado ignorado.');
      throw error;
    }
    try {
      await processarMensagem({ companyId, telefone, nomeCliente, mensagem, estadoRef, config });
    } catch (error) {
      await eventoRef.delete().catch(() => {});
      throw error;
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('[webhook-whatsapp] Erro no processamento:', error);
    return res.status(500).send('Falha ao processar webhook.');
  }
}
