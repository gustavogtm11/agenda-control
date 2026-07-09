// api/webhook-whatsapp.js

// Função auxiliar para gerar os próximos 7 dias
function gerarMenuProximosDias() {
  const dias = [];
  const nomesDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const hoje = new Date();

  for (let i = 0; i < 7; i++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);
    
    const diaFormatado = String(data.getDate()).padStart(2, '0') + '/' + String(data.getMonth() + 1).padStart(2, '0');
    const dataBanco = data.toISOString().split('T')[0]; // Formato YYYY-MM-DD para buscar no Firebase
    
    let label = nomesDias[data.getDay()];
    if (i === 0) label = "Hoje";
    if (i === 1) label = "Amanhã";

    dias.push({ label: `${label} (${diaFormatado})`, dataBanco });
  }
  return dias;
}

export default async function handler(req, res) {
  // Verificação básica se é uma requisição POST
  if (req.method !== 'POST') return res.status(200).send('Webhook rodando.');

  const mensagem = req.body.data.message.conversation;
  const telefone = req.body.data.key.remoteJid;
  const nomeCliente = req.body.data.pushName;
  
  // 1. Busca configurações da empresa
  const config = await getConfiguracoesWhatsApp(companyId);
  if (!config.ativo) return res.status(200).send("Desativado");

  // 2. Busca o estado atual do cliente no banco
  let estadoAtual = await getEstadoCliente(telefone);
  
  // 3. REGRA DA PRIMEIRA MENSAGEM DO DIA:
  // Se o cliente não tem estado ou a última mensagem não foi hoje, reseta para o INICIO
  const dataHoje = new Date().toISOString().split('T')[0];
  if (!estadoAtual || estadoAtual.dataUltimaInteracao !== dataHoje) {
    estadoAtual = { passo: 'INICIO' }; 
  }

  // Se ele escolheu falar com humano antes, o bot ignora as mensagens dele.
  if (estadoAtual.passo === 'ESPERANDO_ATENDENTE') {
    return res.status(200).send("Aguardando humano");
  }

  // --- MÁQUINA DE ESTADOS DO BOT ---
  switch (estadoAtual.passo) {
      
    case 'INICIO':
      if (mensagem === '1') { // Agendar
        const servicos = await getServicosDoFirebase();
        let lista = "Ótimo! Qual serviço você deseja realizar?\n\n";
        servicos.forEach((s, i) => lista += `${i+1} - ${s.nome} (R$${s.preco})\n`);
        
        await enviarMensagemEvolution(telefone, lista);
        await atualizarEstadoCliente(telefone, { passo: 'ESCOLHENDO_SERVICO', servicosDisponiveis: servicos, dataUltimaInteracao: dataHoje });
      
      } else if (mensagem === '2') { // Falar com atendente
        await enviarMensagemEvolution(telefone, "Certo! Vou te transferir. Um de nossos atendentes falará com você em breve.");
        await atualizarEstadoCliente(telefone, { passo: 'ESPERANDO_ATENDENTE', dataUltimaInteracao: dataHoje });
      
      } else { // Qualquer outra mensagem (ex: "Oi", "Bom dia")
        const saudacao = `Olá ${nomeCliente}! Sou o assistente virtual do salão.\n\nComo posso ajudar?\n1 - Agendar horário 📅\n2 - Falar com atendente 👤`;
        await enviarMensagemEvolution(telefone, saudacao);
        await atualizarEstadoCliente(telefone, { passo: 'INICIO', dataUltimaInteracao: dataHoje });
      }
      break;

    case 'ESCOLHENDO_SERVICO':
      const indiceServico = parseInt(mensagem) - 1;
      const servicoEscolhido = estadoAtual.servicosDisponiveis[indiceServico];
      
      if (!servicoEscolhido) {
         await enviarMensagemEvolution(telefone, "Opção inválida. Por favor, digite apenas o número do serviço correspondente.");
         break;
      }

      // GERA MENU DE DIAS
      const proximosDias = gerarMenuProximosDias();
      let msgDias = "Para qual dia você deseja agendar?\n\n";
      proximosDias.forEach((d, i) => msgDias += `${i+1} - ${d.label}\n`);
      msgDias += `\n8 - Escolher outra data específica`;

      await enviarMensagemEvolution(telefone, msgDias);
      await atualizarEstadoCliente(telefone, { 
        passo: 'ESCOLHENDO_DIA', 
        servicoId: servicoEscolhido.id,
        diasDisponiveis: proximosDias 
      });
      break;

    case 'ESCOLHENDO_DIA':
      if (mensagem === '8') {
        // Escolheu digitar a data manualmente
        await enviarMensagemEvolution(telefone, "Por favor, digite a data desejada no formato DIA/MÊS. Exemplo: 25/10");
        await atualizarEstadoCliente(telefone, { passo: 'DIGITANDO_DATA_MANUAL' });
      } else {
        // Escolheu um dia da lista (1 a 7)
        const indiceDia = parseInt(mensagem) - 1;
        const diaEscolhido = estadoAtual.diasDisponiveis[indiceDia];
        
        if (!diaEscolhido) {
            await enviarMensagemEvolution(telefone, "Opção inválida. Digite um número de 1 a 8.");
            break;
        }
        
        await buscarEEnviarHorarios(diaEscolhido.dataBanco, telefone, estadoAtual, config);
      }
      break;

    case 'DIGITANDO_DATA_MANUAL':
      // Aqui você faz a validação se a pessoa digitou "25/10" certinho e converte para o formato do banco "YYYY-MM-DD"
      // Vou simular que a validação deu certo na variável dataFormatadaBanco:
      const dataFormatadaBanco = formatarDataDigitada(mensagem); 
      await buscarEEnviarHorarios(dataFormatadaBanco, telefone, estadoAtual, config);
      break;

    case 'ESCOLHENDO_HORARIO':
      const indiceHorario = parseInt(mensagem) - 1;
      const horarioEscolhido = estadoAtual.horariosDisponiveis[indiceHorario];
      
      if (!horarioEscolhido) {
          await enviarMensagemEvolution(telefone, "Horário inválido. Digite o número correspondente ao horário.");
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
        
      await enviarMensagemEvolution(telefone, `✅ Agendamento Confirmado!\n\nData: ${estadoAtual.dataEscolhida}\nHorário: ${horarioEscolhido}\n\nTe esperamos!`);
      await resetarEstadoCliente(telefone); // Zera o fluxo
      break;
  }
  
  res.status(200).send("OK");
}

// --- FUNÇÃO AUXILIAR PARA NÃO REPETIR CÓDIGO ---
async function buscarEEnviarHorarios(dataBanco, telefone, estadoAtual, config) {
  const horarios = await calcularHorariosDisponiveis(dataBanco); // Sua lógica do Firebase
  
  if (horarios.length === 0) {
      await enviarMensagemEvolution(telefone, "Poxa, não temos mais horários disponíveis para esse dia. Por favor, digite outro dia no formato DD/MM (Ex: 25/10):");
      await atualizarEstadoCliente(telefone, { passo: 'DIGITANDO_DATA_MANUAL', servicoId: estadoAtual.servicoId });
      return;
  }

  let listaHorarios = "Estes são os horários disponíveis. Digite o número desejado:\n\n";
  horarios.forEach((h, i) => listaHorarios += `${i+1} - ${h}\n`);
  
  await enviarMensagemEvolution(telefone, listaHorarios);
  await atualizarEstadoCliente(telefone, { 
      passo: 'ESCOLHENDO_HORARIO', 
      dataEscolhida: dataBanco, 
      horariosDisponiveis: horarios,
      servicoId: estadoAtual.servicoId
  });
}