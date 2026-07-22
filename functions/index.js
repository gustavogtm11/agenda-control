// functions/index.js
const admin = require("firebase-admin");
const serviceAccount = require("./chave-firebase.json");

// Inicializa o Firebase Admin com a sua chave gratuita
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function verificarNotificacoesAutomaticas() {
  const agora = new Date();
  
  // Ajusta fuso horário (UTC-3 Brasil)
  const tzoffset = agora.getTimezoneOffset() * 60000;
  const dataHoje = new Date(agora.getTime() - tzoffset).toISOString().split("T")[0];
  
  const hora = agora.getHours().toString().padStart(2, "0");
  const minuto = agora.getMinutes().toString().padStart(2, "0");
  const horaAtual = `${hora}:${minuto}`;

  console.log(`\n[ROBÔ FCM] 🕒 Executando checagem em ${dataHoje} às ${horaAtual}...`);

  try {
    const empresasSnap = await db.collection("empresas").get();

    for (const empresaDoc of empresasSnap.docs) {
      const companyId = empresaDoc.id;
      const config = empresaDoc.data();

      // Buscar tokens FCM da empresa
      const usuariosSnap = await db
        .collection("usuarios")
        .where("companyId", "==", companyId)
        .get();

      const tokens = [];
      usuariosSnap.forEach((uDoc) => {
        const uData = uDoc.data();
        if (uData.fcmToken) tokens.push(uData.fcmToken);
      });

      if (tokens.length === 0) continue;

      // 1. REGRA: AGENDAMENTOS PRÓXIMOS
      if (config.notificacaoAgendaAtiva && config.minutosAvisoPrevioAgenda) {
        const minutosAviso = Number(config.minutosAvisoPrevioAgenda);

        const agendamentosSnap = await db
          .collection("agendamentos")
          .where("companyId", "==", companyId)
          .where("status", "==", "pendente")
          .get();

        for (const agDoc of agendamentosSnap.docs) {
          const ag = agDoc.data();
          if (ag.dataHora && ag.dataHora.startsWith(dataHoje)) {
            const horaAgendamento = new Date(ag.dataHora);
            const diferencaMs = horaAgendamento.getTime() - agora.getTime();
            const diffMinutos = Math.round(diferencaMs / 60000);

            if (diffMinutos <= minutosAviso && diffMinutos >= 0) {
              const chaveNotif = `@notif_ag_${agDoc.id}`;
              if (!ag[chaveNotif]) {
                await enviarPushMulticast(
                  tokens,
                  `⏰ Próximo Atendimento: ${ag.clienteNome || "Cliente"}`,
                  `Serviço: ${ag.servicoNome || "Agendado"}`
                );
                await db.collection("agendamentos").doc(agDoc.id).update({ [chaveNotif]: true });
              }
            }
          }
        }
      }

      // 2. REGRA: FECHAMENTO DE CAIXA
      if (config.notificacaoCaixaAtiva && config.horarioFechamentoCaixa === horaAtual) {
        const chaveCaixa = `@notif_caixa_${dataHoje}`;
        if (!config[chaveCaixa]) {
          await enviarPushMulticast(
            tokens,
            "💰 Fechamento de Caixa",
            "Chegou a hora de conferir e fechar o caixa do dia!"
          );
          await db.collection("empresas").doc(companyId).update({ [chaveCaixa]: true });
        }
      }
    }
  } catch (error) {
    console.error("[ROBÔ FCM] Erro:", error);
  }
}

async function enviarPushMulticast(tokens, title, body) {
  if (!tokens || tokens.length === 0) return;
  const message = { notification: { title, body }, tokens };
  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ [NOTIFICAÇÃO ENVIADA] Sucessos: ${response.successCount}`);
  } catch (err) {
    console.error("❌ [ERRO AO ENVIAR PUSH]:", err);
  }
}

// Executa imediatamente ao iniciar e depois repete a cada 60 segundos
verificarNotificacoesAutomaticas();
setInterval(verificarNotificacoesAutomaticas, 60000);