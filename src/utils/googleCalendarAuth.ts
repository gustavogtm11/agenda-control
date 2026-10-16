// Reconecta a autorização do Google Calendar sem encerrar a sessão principal do Firebase.
// Requer VITE_GOOGLE_CLIENT_ID configurado no ambiente de build (Vercel).
let scriptPromise: Promise<void> | null = null;
let solicitacaoEmAndamento: Promise<string | null> | null = null;

function carregarGoogleIdentityServices(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>('script[data-google-identity-services]');
    const script = existente ?? document.createElement('script');

    const falha = () => {
      scriptPromise = null;
      reject(new Error('Não foi possível carregar o serviço de autenticação do Google.'));
    };

    if (!existente) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentityServices = 'true';
      script.onload = () => resolve();
      script.onerror = falha;
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', falha, { once: true });
    }
  });

  return scriptPromise;
}

export function reconectarGoogleCalendarSilenciosamente(): Promise<string | null> {
  if (solicitacaoEmAndamento) return solicitacaoEmAndamento;

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    console.warn('Reconexão automática do Google Agenda indisponível: configure VITE_GOOGLE_CLIENT_ID.');
    return Promise.resolve(null);
  }

  solicitacaoEmAndamento = (async () => {
    try {
      await carregarGoogleIdentityServices();
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) return null;

      return await new Promise<string | null>((resolve) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/calendar.events',
          callback: (resposta: any) => {
            if (resposta?.access_token) {
              localStorage.setItem('googleToken', resposta.access_token);
              resolve(resposta.access_token);
            } else {
              // O token antigo pode já ter expirado. Não desconecta o Firebase.
              console.info('O Google Agenda não autorizou uma renovação silenciosa nesta abertura.', resposta?.error || '');
              resolve(null);
            }
          },
          error_callback: (erro: any) => {
            console.info('A reconexão automática do Google Agenda não foi concluída.', erro?.type || '');
            resolve(null);
          },
        });

        // Sem prompt de consentimento: reutiliza a autorização já concedida quando possível.
        client.requestAccessToken({ prompt: '' });
      });
    } catch (erro) {
      console.warn('Não foi possível iniciar a reconexão automática do Google Agenda.', erro);
      return null;
    } finally {
      solicitacaoEmAndamento = null;
    }
  })();

  return solicitacaoEmAndamento;
}
