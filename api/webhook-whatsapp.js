// api/webhook-whatsapp.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ============================================================================
// 1. INICIALIZAÇÃO DO FIREBASE ADMIN (Backend)
// ============================================================================
if (!getApps().length) {
    // Certifique-se de que a variável FIREBASE_SERVICE_ACCOUNT está na Vercel
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

// ============================================================================
// 2. FUNÇÕES DE BANCO DE DADOS (FIRESTORE)
// ============================================================================
async function getConfiguracoesWhatsApp(companyId) {
    const doc = await db.collection('configuracoes_whatsapp').doc(companyId).get();
    // Se não existir configuração, assumimos que está ativo por padrão
    return doc.exists ? doc.data() : { ativo: true };
}

async function getEstadoCliente(telefone) {
    const doc = await db.collection('estados_whatsapp').doc(telefone).get();
    return doc.exists ? doc.data() : null;
}

async function atualizarEstadoCliente(telefone, dados) {
    await db.collection('estados_whatsapp').doc(telefone).set(dados, { merge: true });
}

async function resetarEstadoCliente(telefone) {
    await db.collection('estados_whatsapp').doc(telefone).delete();
}

async function getServicosDoFirebase() {
    // Exemplo de busca de serviços na coleção 'servicos'. Ajuste conforme seu banco.
    const snapshot = await db.collection('servicos').where('ativo', '==', true).get();
    if (snapshot.empty) return [{ id: '1', nome: 'Corte', preco: '50,00' }]; // Fallback
    
    let servicos = [];
    snapshot.forEach(doc => servicos.push({ id: doc.id, ...doc.data() }));
    return servicos;
}

async function calcularHorariosDisponiveis(dataBanco) {
    // Aqui você deve colocar sua lógica de consultar horários já agendados e remover dos disponíveis.
    // Retornando mock para o bot funcionar:
    return ["09:00", "10:00", "14:00", "15:30", "17:00"];
}

async function salvarAgendamentoNoFirestore(dadosAgendamento) {
    await db.collection('agendamentos').add(dadosAgendamento);
}

// ============================================================================
// 3. FUNÇÕES DE INTEGRAÇÃO E UTILIDADES
// ============================================================================
async function enviarMensagemEvolution(telefone, texto, instanceName) {
    // A URL deve apontar para o Render onde sua Evolution API está hospedada
    const url = `http://localhost:8080/message/sendText/${instanceName}`;
    const apikey = "150215"; // Sua chave da aba Environment do Render

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apikey },
            body: JSON.stringify({ number: telefone.replace('@s.whatsapp.net', ''), text: texto })
        });
    } catch (error) {
        console.error("Erro ao enviar mensagem pela Evolution API:", error);
    }
}

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

function formatarDataDigitada(textoData) {
    // Converte "25/10" para "YYYY-10-25". Lógica simples (assumindo ano atual):
    const anoAtual = new Date().getFullYear();
    const [dia, mes] = textoData.split('/');
    if (dia && mes) {
        return `${anoAtual}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
    return null; // Trate o erro na máquina de estados se quiser melhorar
}

async function buscarEEnviarHorarios(dataBanco, telefone, estadoAtual, config, instanceName) {
    const horarios = await calcularHorariosDisponiveis(dataBanco); 
    
    if (horarios.length === 0) {
        await enviarMensagemEvolution(telefone, "Poxa, não temos mais horários disponíveis para esse dia. Por favor, digite outro dia no formato DD/MM (Ex: 25/10):", instanceName);
        await atualizarEstadoCliente(telefone, { passo: 'DIGITANDO_DATA_MANUAL', servicoId: estadoAtual.servicoId });
        return;
    }
  
    let listaHorarios = "Estes são os horários disponíveis. Digite o número desejado:\n\n";
    horarios.forEach((h, i) => listaHorarios += `${i+1} - ${h}\n`);
    
    await enviarMensagemEvolution(telefone, listaHorarios, instanceName);
    await atualizarEstadoCliente(telefone, { 
        passo: 'ESCOLHENDO_HORARIO', 
        dataEscolhida: dataBanco, 
        horariosDisponiveis: horarios,
        servicoId: estadoAtual.servicoId
    });
}

// ============================================================================
// 4. HANDLER PRINCIPAL (Onde o Webhook bate)
// ============================================================================
export default async function handler(req, res) {
    console.log("PAYLOAD RECEBIDO:", JSON.stringify(req.body, null, 2));
    // Ignora chamadas que não sejam POST (ex: acessos pelo navegador)
    if (req.method !== 'POST') return res.status(200).send('Webhook rodando.');
  
    // PROTEÇÃO ANTI-CRASH (Corrige o erro 500)
    // Extrai o texto da mensagem suportando formato curto e estendido
    const mensagem = req.body?.data?.message?.conversation || req.body?.data?.message?.extendedTextMessage?.text;
    
    // Se não for uma mensagem de texto (ex: status, digitando, áudio), ignora pacificamente
    if (!mensagem) {
        return res.status(200).send("Ignorando evento (não é mensagem de texto)");
    }
  
    const companyId = req.body.instance; // Nome da instância na Evolution (ex: studio_claudia_tavares)
    const telefone = req.body.data.key.remoteJid;
    const nomeCliente = req.body.data.pushName || "Cliente";

    // Impede processamento de mensagens de grupos
    if (telefone.includes('@g.us')) return res.status(200).send("Ignorando grupo");
    
    // 1. Busca configurações da empresa (Ativo/Inativo)
    const config = await getConfiguracoesWhatsApp(companyId);
    if (!config.ativo) return res.status(200).send("Desativado");
  
    // 2. Busca o estado atual do cliente no banco
    let estadoAtual = await getEstadoCliente(telefone);
    
    // 3. REGRA DA PRIMEIRA MENSAGEM DO DIA
    const dataHoje = new Date().toISOString().split('T')[0];
    if (!estadoAtual || estadoAtual.dataUltimaInteracao !== dataHoje) {
      estadoAtual = { passo: 'INICIO' }; 
    }
  
    // Se ele escolheu falar com humano, o bot silencia
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
          
          await enviarMensagemEvolution(telefone, lista, companyId);
          await atualizarEstadoCliente(telefone, { passo: 'ESCOLHENDO_SERVICO', servicosDisponiveis: servicos, dataUltimaInteracao: dataHoje });
        
        } else if (mensagem === '2') { 
          await enviarMensagemEvolution(telefone, "Certo! Vou te transferir. Um de nossos atendentes falará com você em breve.", companyId);
          await atualizarEstadoCliente(telefone, { passo: 'ESPERANDO_ATENDENTE', dataUltimaInteracao: dataHoje });
        
        } else { 
          const saudacao = `Olá ${nomeCliente}! Sou o assistente virtual do salão.\n\nComo posso ajudar?\n1 - Agendar horário 📅\n2 - Falar com atendente 👤`;
          await enviarMensagemEvolution(telefone, saudacao, companyId);
          await atualizarEstadoCliente(telefone, { passo: 'INICIO', dataUltimaInteracao: dataHoje });
        }
        break;
  
      case 'ESCOLHENDO_SERVICO':
        const indiceServico = parseInt(mensagem) - 1;
        const servicoEscolhido = estadoAtual.servicosDisponiveis ? estadoAtual.servicosDisponiveis[indiceServico] : null;
        
        if (!servicoEscolhido) {
           await enviarMensagemEvolution(telefone, "Opção inválida. Por favor, digite apenas o número do serviço correspondente.", companyId);
           break;
        }
  
        const proximosDias = gerarMenuProximosDias();
        let msgDias = "Para qual dia você deseja agendar?\n\n";
        proximosDias.forEach((d, i) => msgDias += `${i+1} - ${d.label}\n`);
        msgDias += `\n0 - Escolher outra data específica`;
  
        await enviarMensagemEvolution(telefone, msgDias, companyId);
        await atualizarEstadoCliente(telefone, { 
          passo: 'ESCOLHENDO_DIA', 
          servicoId: servicoEscolhido.id,
          diasDisponiveis: proximosDias 
        });
        break;
  
      case 'ESCOLHENDO_DIA':
        if (mensagem === '0') {
          await enviarMensagemEvolution(telefone, "Por favor, digite a data desejada no formato DIA/MÊS. Exemplo: 25/10", companyId);
          await atualizarEstadoCliente(telefone, { passo: 'DIGITANDO_DATA_MANUAL' });
        } else {
          const indiceDia = parseInt(mensagem) - 1;
          const diaEscolhido = estadoAtual.diasDisponiveis ? estadoAtual.diasDisponiveis[indiceDia] : null;
          
          if (!diaEscolhido) {
              await enviarMensagemEvolution(telefone, "Opção inválida. Digite um número de 1 a 8.", companyId);
              break;
          }
          
          await buscarEEnviarHorarios(diaEscolhido.dataBanco, telefone, estadoAtual, config, companyId);
        }
        break;
  
      case 'DIGITANDO_DATA_MANUAL':
        const dataFormatadaBanco = formatarDataDigitada(mensagem); 
        if(!dataFormatadaBanco) {
            await enviarMensagemEvolution(telefone, "Formato inválido. Tente novamente como DIA/MÊS (Ex: 25/10):", companyId);
            break;
        }
        await buscarEEnviarHorarios(dataFormatadaBanco, telefone, estadoAtual, config, companyId);
        break;
  
      case 'ESCOLHENDO_HORARIO':
        const indiceHorario = parseInt(mensagem) - 1;
        const horarioEscolhido = estadoAtual.horariosDisponiveis ? estadoAtual.horariosDisponiveis[indiceHorario] : null;
        
        if (!horarioEscolhido) {
            await enviarMensagemEvolution(telefone, "Horário inválido. Digite o número correspondente ao horário.", companyId);
            break;
        }
        
        // SALVAR AGENDAMENTO NO FIREBASE
        await salvarAgendamentoNoFirestore({
          clienteNome: nomeCliente,
          telefone: telefone,
          servicoId: estadoAtual.servicoId,
          dataHora: `${estadoAtual.dataEscolhida}T${horarioEscolhido}:00`,
          status: 'pendente'
        });
          
        await enviarMensagemEvolution(telefone, `✅ Agendamento Confirmado!\n\nData: ${estadoAtual.dataEscolhida.split('-').reverse().join('/')}\nHorário: ${horarioEscolhido}\n\nTe esperamos!`, companyId);
        await resetarEstadoCliente(telefone); // Zera o fluxo
        break;
    }
    
    // Resposta final do Webhook para a API Evolution
    res.status(200).send("OK");
}