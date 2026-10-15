// api/webhook-whatsapp.js
// Webhook multiempresa: cada estado, serviço e agendamento é isolado por companyId.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function inicializarFirebase() {
  if (getApps().length) return;
  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credencial) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada.');
  initializeApp({ credential: cert(JSON.parse(credencial)) });
}

const db = () => getFirestore();
const hojeEmRecife = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const formatarDataBR = (iso) => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

function extrairMensagem(payload) {
  const message = payload?.data?.message || {};
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ''
  ).trim();
}

function parseDataDigitada(texto) {
  const match = texto.trim().match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?$/);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3] || hojeEmRecife().slice(0, 4));
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  if (iso < hojeEmRecife()) return null;
  return iso;
}

function diaSemanaKey(dataIso) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
}

function minutos(hora) {
  const [h, m] = String(hora || '').split(':').map(Number);
  return h * 60 + m;
}

function formatarHora(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function extrairHorariosEmpresa(empresa = {}) {
  const globais = empresa.configuracoesGlobais || {};
  const horarios = empresa.horariosFuncionamento || globais.horariosFuncionamento || {};
  const almoco = empresa.horarioAlmoco || empresa.configuracoes?.horarioAlmoco || globais.horarioAlmoco || { ativo: true, inicio: '12:00', fim: '13:00' };
  const diasBloqueados = empresa.diasBloqueados || globais.diasBloqueados || [];
  return { horarios, almoco, diasBloqueados };
}

async function enviarMensagem(telefone, texto, instancia) {
  const baseUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('Evolution API não configurada no servidor.');

  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instancia)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: telefone, text: texto }),
  });
  if (!response.ok) {
    const detalhe = await response.text().catch(() => '');
    throw new Error(`Evolution recusou o envio (HTTP ${response.status}): ${detalhe.slice(0, 300)}`);
  }
}

async function carregarServicos(companyId) {
  const snapshot = await db().collection('servicos').where('companyId', '==', companyId).get();
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.ativo !== false)
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

async function carregarAgendamentos(companyId, dataIso) {
  const inicio = `${dataIso}T00:00`;
  const fim = `${dataIso}T23:59`;
  const snapshot = await db().collection('agendamentos')
    .where('companyId', '==', companyId)
    .where('dataHora', '>=', inicio)
    .where('dataHora', '<=', fim)
    .get();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function carregarEmpresa(companyId) {
  const snapshot = await db().collection('empresas').doc(companyId).get();
  return snapshot.exists ? snapshot.data() : null;
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
  const agora = new Date();
  const horaAgora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Recife', hour: '2-digit', hourCycle: 'h23' }).format(agora));
  const minutoAgora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Recife', minute: '2-digit' }).format(agora));
  const minutosAgora = horaAgora * 60 + minutoAgora;
  const ocupados = await carregarAgendamentos(companyId, dataIso);

  const slots = [];
  for (let slot = Math.ceil(inicioExpediente / 30) * 30; slot + duracao <= fimExpediente; slot += 30) {
    if (dataIso === hoje && slot <= minutosAgora) continue;
    if (almoco?.ativo !== false && almoco?.inicio && almoco?.fim) {
      const iniAlmoco = minutos(almoco.inicio);
      const fimAlmoco = minutos(almoco.fim);
      if (slot < fimAlmoco && slot + duracao > iniAlmoco) continue;
    }

    const conflito = ocupados.some((ag) => {
      if (ag.status !== 'pendente' && ag.status !== 'confirmado') return false;
      const horaAg = String(ag.dataHora || '').split('T')[1];
      if (!horaAg) return false;
      const inicioOcupado = minutos(horaAg);
      const duracaoOcupada = Math.max(1, Number(ag.duracaoMinutos) || 30);
      return slot < inicioOcupado + duracaoOcupada && slot + duracao > inicioOcupado;
    });
    if (!conflito) slots.push(formatarHora(slot));
  }
  return slots;
}

async function atualizarEstado(estadoRef, dados) {
  await estadoRef.set({ ...dados, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
}

async function responderInicio(telefone, companyId, nomeCliente, config, estadoRef) {
  const mensagem = config.msgBoasVindas ||
    `Olá ${nomeCliente}! 👋 Sou o assistente virtual.\n\nComo posso ajudar?\n1 - Agendar horário 📅\n2 - Falar com atendente 👤`;
  await enviarMensagem(telefone, mensagem, companyId);
  await atualizarEstado(estadoRef, { passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
}

async function enviarMenuDias(telefone, companyId, servico, estadoRef) {
  const dias = [];
  for (let i = 0; i < 14; i++) {
    const [ano, mes, dia] = hojeEmRecife().split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia + i));
    const iso = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-${String(data.getUTCDate()).padStart(2, '0')}`;
    const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(data);
    dias.push({ dataBanco: iso, label: `${label} (${formatarDataBR(iso).slice(0, 5)})` });
  }
  let texto = 'Para qual dia você deseja agendar?\n\n';
  dias.forEach((dia, i) => { texto += `${i + 1} - ${dia.label}\n`; });
  texto += '\n0 - Digitar outra data (DD/MM/AAAA)';
  await enviarMensagem(telefone, texto, companyId);
  await atualizarEstado(estadoRef, { passo: 'ESCOLHENDO_DIA', servicoId: servico.id, servicoNome: servico.nome, preco: Number(servico.preco) || 0, duracaoMinutos: Number(servico.duracaoMinutos) || 30, diasDisponiveis: dias });
}

async function buscarHorariosEEnviar(telefone, companyId, dataIso, estado, estadoRef) {
  const servicos = await carregarServicos(companyId);
  const servico = servicos.find((item) => item.id === estado.servicoId);
  if (!servico) {
    await enviarMensagem(telefone, 'Não encontrei esse serviço no cadastro da empresa. Digite 1 para começar novamente.', companyId);
    await atualizarEstado(estadoRef, { passo: 'INICIO' });
    return;
  }
  const horarios = await calcularHorariosDisponiveis(companyId, dataIso, servico);
  if (!horarios.length) {
    await enviarMensagem(telefone, 'Não encontrei horários disponíveis nessa data. Digite outra data no formato DD/MM/AAAA:', companyId);
    await atualizarEstado(estadoRef, { ...estado, passo: 'DIGITANDO_DATA_MANUAL', servicoId: servico.id });
    return;
  }
  let texto = `Horários disponíveis para ${formatarDataBR(dataIso)}:\n\n`;
  horarios.forEach((hora, i) => { texto += `${i + 1} - ${hora}\n`; });
  await enviarMensagem(telefone, texto, companyId);
  await atualizarEstado(estadoRef, { ...estado, passo: 'ESCOLHENDO_HORARIO', dataEscolhida: dataIso, horariosDisponiveis: horarios, servicoId: servico.id, servicoNome: servico.nome, preco: Number(servico.preco) || 0, duracaoMinutos: Number(servico.duracaoMinutos) || 30 });
}

async function criarAgendamentoSeDisponivel(companyId, telefone, nomeCliente, estado) {
  const empresa = await carregarEmpresa(companyId);
  if (!empresa || empresa.bloqueada === true || empresa.statusPgto === 'bloqueado') {
    throw new Error('Esta empresa está temporariamente indisponível para novos agendamentos.');
  }
  const servicos = await carregarServicos(companyId);
  const servico = servicos.find((item) => item.id === estado.servicoId);
  if (!servico) throw new Error('O serviço selecionado não está mais disponível.');

  const horarios = await calcularHorariosDisponiveis(companyId, estado.dataEscolhida, servico);
  if (!horarios.includes(estado.horarioEscolhido)) {
    throw new Error('Esse horário acabou de ficar indisponível. Vou consultar os horários novamente.');
  }

  const agendamentoRef = db().collection('agendamentos').doc();
  await agendamentoRef.set({
    clienteNome: nomeCliente || 'Cliente WhatsApp',
    telefone: telefone,
    servicoId: servico.id,
    servicoIds: [servico.id],
    servicoNome: servico.nome,
    funcionarioEmail: null,
    preco: Number(servico.preco) || 0,
    duracaoMinutos: Number(servico.duracaoMinutos) || 30,
    dataHora: `${estado.dataEscolhida}T${estado.horarioEscolhido}`,
    companyId,
    status: 'pendente',
    googleEventId: null,
    googleSyncPending: false,
    origem: 'whatsapp',
    criadoEm: FieldValue.serverTimestamp(),
  });
  return { servico, agendamentoRef };
}

async function processarMensagem({ companyId, telefone, nomeCliente, mensagem, estadoRef, config }) {
  let estadoSnap = await estadoRef.get();
  let estado = estadoSnap.exists ? estadoSnap.data() : { passo: 'INICIO' };
  if (estado.dataUltimaInteracao !== hojeEmRecife()) estado = { passo: 'INICIO' };

  if (estado.passo === 'ESPERANDO_ATENDENTE') return;

  if (mensagem.toLowerCase() === 'menu' || mensagem.toLowerCase() === 'reiniciar' || mensagem.toLowerCase() === 'oi') {
    await responderInicio(telefone, companyId, nomeCliente, config, estadoRef);
    return;
  }

  switch (estado.passo) {
    case 'INICIO': {
      if (mensagem === '1') {
        const servicos = await carregarServicos(companyId);
        if (!servicos.length) {
          await enviarMensagem(telefone, 'Ainda não há serviços cadastrados para esta empresa. Por favor, fale com um atendente.', companyId);
          return;
        }
        let lista = config.msgServicos || 'Qual serviço você deseja realizar? Responda com o número:';
        lista += '\n\n';
        servicos.forEach((servico, i) => { lista += `${i + 1} - ${servico.nome} (R$ ${(Number(servico.preco) || 0).toFixed(2).replace('.', ',')})\n`; });
        await enviarMensagem(telefone, lista, companyId);
        await atualizarEstado(estadoRef, { passo: 'ESCOLHENDO_SERVICO', servicosDisponiveis: servicos.map((s) => ({ id: s.id, nome: s.nome, preco: s.preco, duracaoMinutos: s.duracaoMinutos })), dataUltimaInteracao: hojeEmRecife() });
      } else if (mensagem === '2') {
        await enviarMensagem(telefone, 'Certo! Vou registrar que você deseja falar com um atendente. Digite MENU para voltar ao atendimento automático.', companyId);
        await atualizarEstado(estadoRef, { passo: 'ESPERANDO_ATENDENTE', dataUltimaInteracao: hojeEmRecife() });
      } else {
        await responderInicio(telefone, companyId, nomeCliente, config, estadoRef);
      }
      return;
    }
    case 'ESCOLHENDO_SERVICO': {
      const index = Number.parseInt(mensagem, 10) - 1;
      const servico = estado.servicosDisponiveis?.[index];
      if (!servico) {
        await enviarMensagem(telefone, 'Opção inválida. Responda com o número de um dos serviços listados ou digite MENU.', companyId);
        return;
      }
      await enviarMenuDias(telefone, companyId, servico, estadoRef);
      await atualizarEstado(estadoRef, { dataUltimaInteracao: hojeEmRecife() });
      return;
    }
    case 'ESCOLHENDO_DIA': {
      if (mensagem === '0') {
        await enviarMensagem(telefone, 'Digite a data desejada no formato DD/MM/AAAA. Exemplo: 25/10/2026', companyId);
        await atualizarEstado(estadoRef, { ...estado, passo: 'DIGITANDO_DATA_MANUAL', dataUltimaInteracao: hojeEmRecife() });
        return;
      }
      const dia = estado.diasDisponiveis?.[Number.parseInt(mensagem, 10) - 1];
      if (!dia) {
        await enviarMensagem(telefone, 'Opção inválida. Escolha um número da lista ou digite 0 para informar outra data.', companyId);
        return;
      }
      await buscarHorariosEEnviar(telefone, companyId, dia.dataBanco, estado, estadoRef);
      await atualizarEstado(estadoRef, { dataUltimaInteracao: hojeEmRecife() });
      return;
    }
    case 'DIGITANDO_DATA_MANUAL': {
      const dataIso = parseDataDigitada(mensagem);
      if (!dataIso) {
        await enviarMensagem(telefone, 'Data inválida ou passada. Informe uma data futura no formato DD/MM/AAAA.', companyId);
        return;
      }
      await buscarHorariosEEnviar(telefone, companyId, dataIso, estado, estadoRef);
      await atualizarEstado(estadoRef, { dataUltimaInteracao: hojeEmRecife() });
      return;
    }
    case 'ESCOLHENDO_HORARIO': {
      const horario = estado.horariosDisponiveis?.[Number.parseInt(mensagem, 10) - 1];
      if (!horario) {
        await enviarMensagem(telefone, 'Opção inválida. Digite o número de um dos horários listados ou MENU.', companyId);
        return;
      }
      try {
        const { servico } = await criarAgendamentoSeDisponivel(companyId, telefone, nomeCliente, { ...estado, horarioEscolhido: horario });
        await enviarMensagem(telefone, `✅ Agendamento solicitado com sucesso!\n\nServiço: ${servico.nome}\nData: ${formatarDataBR(estado.dataEscolhida)}\nHorário: ${horario}\nValor: R$ ${(Number(servico.preco) || 0).toFixed(2).replace('.', ',')}\n\nSe precisar de ajuda, digite 2 para falar com um atendente.`, companyId);
        await estadoRef.delete();
      } catch (error) {
        await enviarMensagem(telefone, `${error.message || 'Não consegui concluir o agendamento.'}\n\nDigite MENU para recomeçar ou escolha outra data.`, companyId);
        await atualizarEstado(estadoRef, { ...estado, passo: 'INICIO', dataUltimaInteracao: hojeEmRecife() });
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
    const companyId = String(payload.instance || '');
    const data = payload.data || {};
    const key = data.key || {};

    // A instância precisa corresponder ao ID da empresa criada no painel Master.
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(companyId)) return res.status(400).send('Instância inválida.');
    if (key.fromMe === true || key.remoteJidAlt && key.remoteJidAlt.includes('@g.us')) return res.status(200).send('Evento próprio/grupo ignorado.');

    const telefoneJid = String(key.remoteJid || '');
    if (!telefoneJid || telefoneJid.includes('@g.us') || telefoneJid.endsWith('@broadcast')) {
      return res.status(200).send('Contato não suportado.');
    }

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

    const telefone = telefoneJid.split('@')[0];
    const nomeCliente = String(data.pushName || 'Cliente').slice(0, 120);
    const estadoId = `${companyId}__${telefone.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const estadoRef = db().collection('estados_whatsapp').doc(estadoId);
    const eventoRef = db().collection('whatsapp_eventos_processados').doc(`${companyId}__${messageId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

    // Evita responder duas vezes quando a Evolution repete o mesmo webhook.
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
};
