import { createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebase() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada.');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}
const db = () => getFirestore();
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}
function encryptionKey() {
  const key = Buffer.from(required('GOOGLE_TOKEN_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY deve ser uma chave Base64 de 32 bytes.');
  return key;
}
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}
function decrypt(value) {
  const [ivText, tagText, dataText] = String(value || '').split('.');
  if (!ivText || !tagText || !dataText) throw new Error('Credencial Google armazenada inválida.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}
function signState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', required('GOOGLE_OAUTH_STATE_SECRET')).update(encoded).digest('base64url');
  return encoded + '.' + signature;
}
function verifyState(state) {
  const [encoded, signature] = String(state || '').split('.');
  if (!encoded || !signature) throw new Error('Estado OAuth inválido.');
  const expected = createHmac('sha256', required('GOOGLE_OAUTH_STATE_SECRET')).update(encoded).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Assinatura OAuth inválida.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.uid || !payload.exp || payload.exp < Date.now()) throw new Error('A solicitação OAuth expirou. Tente novamente.');
  return payload;
}
async function getUser(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Autenticação necessária.');
    error.status = 401;
    throw error;
  }
  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch {
    const error = new Error('Sessão do sistema inválida. Entre novamente no Agenda Control.');
    error.status = 401;
    throw error;
  }
}
function oauthRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `https://${req.headers.host}/api/google-calendar-oauth?action=callback`;
}
function htmlCallback(success, message, appOrigin) {
  const origin = JSON.stringify(appOrigin);
  const payload = JSON.stringify({ type: 'agenda-control-google-oauth', success, message });
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Google Agenda</title><body style="font:16px system-ui;padding:32px;text-align:center"><h2>${success ? 'Google Agenda conectado' : 'Não foi possível conectar'}</h2><p>${message}</p><script>try{if(window.opener){window.opener.postMessage(${payload},${origin});}}catch(e){}setTimeout(()=>window.close(),900)</script></body></html>`;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    initFirebase();
    const action = String(req.query?.action || 'token');
    const clientId = required('GOOGLE_CLIENT_ID');
    const clientSecret = required('GOOGLE_CLIENT_SECRET');
    const redirectUri = oauthRedirectUri(req);

    if (action === 'start') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
      const user = await getUser(req);
      const nonce = randomBytes(24).toString('base64url');
      const state = signState({ uid: user.uid, email: user.email || '', nonce, exp: Date.now() + 10 * 60 * 1000 });
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.events',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      });
      return res.status(200).json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
    }

    if (action === 'callback') {
      if (req.method !== 'GET') return res.status(405).send('Método não permitido.');
      try {
        if (req.query?.error) throw new Error('O Google cancelou a autorização.');
        const state = verifyState(req.query?.state);
        const code = String(req.query?.code || '');
        if (!code) throw new Error('O Google não retornou o código de autorização.');
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code, client_id: clientId, client_secret: clientSecret,
            redirect_uri: redirectUri, grant_type: 'authorization_code',
          }),
        });
        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok || !tokens.refresh_token) {
          throw new Error('O Google não forneceu uma autorização persistente. Revogue a permissão antiga do Agenda Control na sua Conta Google e tente conectar novamente.');
        }
        const user = await getAuth().getUser(state.uid);
        if (state.email && user.email && state.email !== user.email) throw new Error('A conta do sistema mudou durante a autorização.');
        await db().collection('google_calendar_oauth').doc(state.uid).set({
          uid: state.uid,
          email: user.email || '',
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          scope: tokens.scope || 'https://www.googleapis.com/auth/calendar.events',
          updatedAt: new Date().toISOString(),
        });
        res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(htmlCallback(true, 'Autorização salva com segurança. Você já pode fechar esta janela.', process.env.APP_ORIGIN || new URL(redirectUri).origin));
      } catch (error) {
        console.error('[google-calendar-oauth callback]', error);
        res.statusCode = 400; res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(htmlCallback(false, error.message || 'Erro ao conectar.', process.env.APP_ORIGIN || new URL(redirectUri).origin));
      }
    }

    if (action === 'token') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
      const user = await getUser(req);
      const ref = db().collection('google_calendar_oauth').doc(user.uid);
      const snapshot = await ref.get();
      const encrypted = snapshot.exists ? snapshot.data()?.refreshTokenEncrypted : null;
      if (!encrypted) return res.status(409).json({ error: 'O Google Agenda ainda precisa ser conectado uma vez.', needsAuthorization: true });
      const refreshToken = decrypt(encrypted);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          refresh_token: refreshToken, grant_type: 'refresh_token',
        }),
      });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.access_token) {
        if (tokens.error === 'invalid_grant') await ref.delete();
        return res.status(401).json({ error: 'A autorização do Google expirou ou foi revogada. Conecte o Google Agenda novamente uma única vez.', needsAuthorization: true });
      }
      return res.status(200).json({
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      });
    }
    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (error) {
    const status = Number(error.status) || 500;
    console.error('[google-calendar-oauth]', error);
    return res.status(status).json({ error: error.message || 'Falha na autenticação do Google Agenda.' });
  }
}
