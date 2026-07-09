// api/webhook-whatsapp.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Inicialização do Firebase Admin (Necessário no Serverless)
if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = getFirestore();

// --- FUNÇÕES DE BANCO DE DADOS (Corrigindo o erro de referência) ---

async function getConfiguracoesWhatsApp(companyId) {
    const docRef = db.collection('configuracoes_whatsapp').doc(companyId);
    const doc = await docRef.get();
    return doc.exists ? doc.data() : null;
}

async function getEstadoCliente(telefone) {
    const docRef = db.collection('estados_whatsapp').doc(telefone);
    const doc = await docRef.get();
    return doc.exists ? doc.data() : null;
}

async function atualizarEstadoCliente(telefone, dados) {
    await db.collection('estados_whatsapp').doc(telefone).set(dados, { merge: true });
}

async function resetarEstadoCliente(telefone) {
    await db.collection('estados_whatsapp').doc(telefone).delete();
}

// Nota: Estas funções abaixo dependem da sua implementação específica de API
async function enviarMensagemEvolution(telefone, texto) {
    // Implemente aqui o fetch para a API da Evolution para enviar mensagem
}

async function getServicosDoFirebase() {
    const snapshot = await db.collection('servicos').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function salvarAgendamentoNoFirestore(dados) {
    await db.collection('agendamentos').add(dados);
}

// --- LÓGICA PRINCIPAL ---

function gerarMenuProximosDias() {
  const dias = [];
  const nomesDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const hoje = new Date();
  for (let i = 0; i < 7; i++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);
    const diaFormatado = String(data.getDate()).padStart(2, '0') + '/' + String(data.getMonth() + 1).padStart(2, '0');
    const dataBanco = data.toISOString().split('T')[0];
    let label = nomesDias[data.getDay()];
    if (i === 0) label = "Hoje";
    if (i === 1) label = "Amanhã";
    dias.push({ label: `${label} (${diaFormatado})`, dataBanco });
  }
  return dias;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Webhook rodando.');

  // Obtém o companyId/Instance do corpo da requisição (padrão da Evolution API)
  const companyId = req.body.instance; 
  const mensagem = req.body.data?.message?.conversation || "";
  const telefone = req.body.data?.key?.remoteJid || "";
  const nomeCliente = req.body.data?.pushName || "Cliente";
  
  if (!companyId) return res.status(400).send("Instância não identificada");

  // 1. Busca configurações da empresa
  const config = await getConfiguracoesWhatsApp(companyId);
  if (!config || !config.ativo) return res.status(200).send("Desativado ou não encontrado");

  // 2. Busca o estado atual do cliente no banco
  let estadoAtual = await getEstadoCliente(telefone);
  
  const dataHoje = new Date().toISOString().split('T')[0];
  if (!estadoAtual || estadoAtual.dataUltimaInteracao !== dataHoje) {
    estadoAtual = { passo: 'INICIO' }; 
  }

  if (estadoAtual.passo === 'ESPERANDO_ATENDENTE') {
    return res.status(200).send("Aguardando humano");
  }

  // --- MÁQUINA DE ESTADOS DO BOT ---
  switch (estadoAtual.passo) {
    case 'INICIO':
      if (mensagem === '1') {
        const servicos = await getServicosDoFirebase();
        let lista = "Ótimo! Qual serviço você deseja realizar?\n\n";
        servicos.forEach((s, i) => lista += `${i+1} - ${s.nome} (R$${s.preco})\n`);
        await enviarMensagemEvolution(telefone, lista);
        await atualizarEstadoCliente(telefone, { passo: 'ESCOLHENDO_SERVICO', servicosDisponiveis: servicos, dataUltimaInteracao: dataHoje });
      } else if (mensagem === '2') {
        await enviarMensagemEvolution(telefone, "Certo! Vou te transferir.");
        await atualizarEstadoCliente(telefone, { passo: 'ESPERANDO_ATENDENTE', dataUltimaInteracao: dataHoje });
      } else {
        const saudacao = `Olá ${nomeCliente}! Sou o assistente virtual.\n\nComo posso ajudar?\n1 - Agendar horário 📅\n2 - Falar com atendente 👤`;
        await enviarMensagemEvolution(telefone, saudacao);
        await atualizarEstadoCliente(telefone, { passo: 'INICIO', dataUltimaInteracao: dataHoje });
      }
      break;

    case 'ESCOLHENDO_SERVICO':
      const indiceServico = parseInt(mensagem) - 1;
      const servicoEscolhido = estadoAtual.servicosDisponiveis ? estadoAtual.servicosDisponiveis[indiceServico] : null;
      if (!servicoEscolhido) {
         await enviarMensagemEvolution(telefone, "Opção inválida.");
         break;
      }
      const proximosDias = gerarMenuProximosDias();
      let msgDias = "Para qual dia você deseja agendar?\n\n";
      proximosDias.forEach((d, i) => msgDias += `${i+1} - ${d.label}\n`);
      await enviarMensagemEvolution(telefone, msgDias);
      await atualizarEstadoCliente(telefone, { passo: 'ESCOLHENDO_DIA', servicoId: servicoEscolhido.id, diasDisponiveis: proximosDias });
      break;

    case 'ESCOLHENDO_DIA':
        // Lógica de agendamento mantida como você enviou
        // ... (resto da sua lógica intacta)
        break;
        
    case 'ESCOLHENDO_HORARIO':
        // ... (resto da sua lógica intacta)
        break;
  }
  
  res.status(200).send("OK");
}