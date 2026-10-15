const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");

initializeApp();

const oneSignalRestApiKey = defineSecret("ONESIGNAL_REST_API_KEY");
const ONESIGNAL_APP_ID = "a05664b1-082c-49e7-8348-56f901293513";

exports.agendarLembreteAgendamento = onCall(
  {
    region: "us-central1",
    secrets: [oneSignalRestApiKey],
    enforceAppCheck: false
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Faça login para agendar notificações.");
    }

    const emailAutenticado = request.auth.token.email;
    const { emailDestino, nomeCliente, dataNotificacao, minutosAntes } = request.data || {};

    if (!emailAutenticado || emailDestino !== emailAutenticado) {
      throw new HttpsError("permission-denied", "Só é permitido agendar notificações para a própria conta.");
    }
    if (typeof nomeCliente !== "string" || !nomeCliente.trim() || nomeCliente.length > 200) {
      throw new HttpsError("invalid-argument", "Nome do cliente inválido.");
    }

    const instante = new Date(dataNotificacao);
    if (!dataNotificacao || Number.isNaN(instante.getTime()) || instante.getTime() <= Date.now()) {
      throw new HttpsError("invalid-argument", "A data da notificação precisa estar no futuro.");
    }
    if (!Number.isFinite(minutosAntes) || minutosAntes < 0 || minutosAntes > 10080) {
      throw new HttpsError("invalid-argument", "Antecedência da notificação inválida.");
    }

    const mensagem = `Você tem um atendimento com ${nomeCliente.trim()} em ${minutosAntes} minutos!`;
    const response = await fetch("https://api.onesignal.com/notifications?c=push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${oneSignalRestApiKey.value()}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: [emailDestino] },
        target_channel: "push",
        headings: { en: "Lembrete de Atendimento", pt: "Lembrete de Atendimento" },
        contents: { en: mensagem, pt: mensagem },
        send_after: instante.toISOString()
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OneSignal recusou o agendamento:", response.status, result);
      throw new HttpsError("internal", "O serviço de notificações não aceitou o agendamento.");
    }

    return { id: result.id || null, scheduled: true };
  }
);
