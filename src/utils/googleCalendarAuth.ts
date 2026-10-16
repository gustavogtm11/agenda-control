import { auth } from '../config/firebase';

const TOKEN_KEY = 'googleToken';
const EXPIRY_KEY = 'googleTokenExpiresAt';
const AUTH_ENDPOINT = '/api/google-calendar-oauth';

function guardarToken(token: string, expiresAt: number) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(expiresAt));
}

export async function obterTokenGooglePersistente(forcarRenovacao = false): Promise<string | null> {
  const tokenSalvo = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  const expiracao = Number(localStorage.getItem(EXPIRY_KEY) || 0);
  if (!forcarRenovacao && tokenSalvo && expiracao > Date.now() + 60_000) return tokenSalvo;

  const usuario = auth.currentUser;
  if (!usuario) return tokenSalvo || null;

  try {
    const idToken = await usuario.getIdToken();
    const resposta = await fetch(`${AUTH_ENDPOINT}?action=token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.ok && dados.accessToken) {
      guardarToken(dados.accessToken, Number(dados.expiresAt) || Date.now() + 3500_000);
      return dados.accessToken;
    }
    if (resposta.status === 409) {
      window.dispatchEvent(new CustomEvent('google-calendar-authorization-required'));
      // Compatibilidade durante a migração: mantém o token antigo enquanto o usuário ainda não concluiu a conexão persistente.
      return tokenSalvo || null;
    }
    if (resposta.status === 401 && dados.needsAuthorization) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRY_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new CustomEvent('google-calendar-authorization-required'));
      return null;
    }
    console.error('Não foi possível renovar o token do Google Agenda:', dados.error || resposta.status);
    return tokenSalvo || null;
  } catch (error) {
    console.error('Falha ao solicitar token do Google Agenda:', error);
    return tokenSalvo || null;
  }
}

export async function iniciarConexaoGoogleCalendar(): Promise<void> {
  // Abre a janela diretamente no clique do usuário para evitar bloqueio de pop-up.
  const popup = window.open('about:blank', 'agendaControlGoogleOAuth', 'popup,width=520,height=700');
  if (!popup) throw new Error('O navegador bloqueou a janela. Permita pop-ups para o Agenda Control e tente novamente.');

  try {
    const usuario = auth.currentUser;
    if (!usuario) throw new Error('Sua sessão do Agenda Control expirou. Entre novamente no sistema.');
    const idToken = await usuario.getIdToken();
    const resposta = await fetch(`${AUTH_ENDPOINT}?action=start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !dados.url) throw new Error(dados.error || 'Não foi possível iniciar a conexão com o Google.');
    popup.location.href = dados.url;
  } catch (error) {
    popup.close();
    throw error;
  }
}

export function instalarListenerOAuthGoogle() {
  const receberMensagem = async (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'agenda-control-google-oauth') return;
    if (event.data.success) {
      await obterTokenGooglePersistente(true);
      window.dispatchEvent(new CustomEvent('google-calendar-token-updated'));
    } else {
      console.error('Conexão do Google Agenda não concluída:', event.data.message);
    }
  };
  window.addEventListener('message', receberMensagem);
  return () => window.removeEventListener('message', receberMensagem);
}
