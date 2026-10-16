import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes, createHash } from 'node:crypto';

function initializeFirebaseAdmin() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada.');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  try {
    initializeFirebaseAdmin();

    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return sendJson(res, 401, { error: 'Sessão ausente. Faça login novamente.' });

    const decoded = await getAuth().verifyIdToken(match[1]);
    if (!decoded.email) return sendJson(res, 403, { error: 'Conta sem e-mail verificado.' });

    const db = getFirestore();
    const profileSnap = await db.collection('usuarios').doc(decoded.email.toLowerCase()).get();
    if (!profileSnap.exists) return sendJson(res, 403, { error: 'Perfil não autorizado.' });

    const profile = profileSnap.data();
    const isSuperAdmin = profile.role === 'super_admin';
    const companyId = String(profile.companyId || '');
    const rawPath = req.query?.path;
    const parts = (Array.isArray(rawPath) ? rawPath : typeof rawPath === 'string' ? rawPath.split('/') : [])
      .map((part) => String(part))
      .filter(Boolean);

    const path = '/' + parts.join('/');
    const apiBase = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!apiBase || !apiKey) {
      return sendJson(res, 503, { error: 'Evolution API não configurada no servidor.' });
    }

    // Somente rotas necessárias para conectar e consultar a instância são aceitas.
    let instanceName = '';
    const createRoute = path === '/instance/create' && req.method === 'POST';
    const connectMatch = path.match(/^\/instance\/(connect|connectionState)\/([a-zA-Z0-9_-]{1,100})$/);
    const webhookMatch = path.match(/^\/webhook\/set\/([a-zA-Z0-9_-]{1,100})$/);
    const webhookFindMatch = path.match(/^\/webhook\/find\/([a-zA-Z0-9_-]{1,100})$/);
    const sendTextMatch = path.match(/^\/message\/sendText\/([a-zA-Z0-9_-]{1,100})$/);

    if (createRoute) {
      instanceName = String(req.body?.instanceName || '');
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(instanceName)) {
        return sendJson(res, 400, { error: 'Nome de instância inválido.' });
      }
      if (!isSuperAdmin && (!companyId || instanceName !== companyId)) {
        return sendJson(res, 403, { error: 'Você só pode configurar o WhatsApp da sua empresa.' });
      }
    } else if (connectMatch) {
      instanceName = connectMatch[2];
      if (!isSuperAdmin && (!companyId || instanceName !== companyId)) {
        return sendJson(res, 403, { error: 'Você só pode acessar o WhatsApp da sua empresa.' });
      }
    } else if (webhookMatch && req.method === 'POST') {
      instanceName = webhookMatch[1];
      if (!isSuperAdmin && (!companyId || instanceName !== companyId)) {
        return sendJson(res, 403, { error: 'Você só pode configurar o WhatsApp da sua empresa.' });
      }
    } else if (webhookFindMatch && req.method === 'GET') {
      instanceName = webhookFindMatch[1];
      if (!isSuperAdmin && (!companyId || instanceName !== companyId)) {
        return sendJson(res, 403, { error: 'Você só pode consultar o webhook da sua empresa.' });
      }
    } else if (sendTextMatch && req.method === 'POST') {
      instanceName = sendTextMatch[1];
      if (!isSuperAdmin && (!companyId || instanceName !== companyId)) {
        return sendJson(res, 403, { error: 'Você só pode enviar mensagens pelo WhatsApp da sua empresa.' });
      }
      const numberInput = String(req.body?.number || '').replace(/\D/g, '');
      const number = numberInput.length === 10 || numberInput.length === 11 ? '55' + numberInput : numberInput;
      const messageText = String(req.body?.textMessage?.text || req.body?.text || '').trim();
      if (number.length < 10 || number.length > 15) {
        return sendJson(res, 400, { error: 'Informe um número de WhatsApp válido com DDD e código do país, se necessário.' });
      }
      if (!messageText || messageText.length > 4000) {
        return sendJson(res, 400, { error: 'A mensagem deve conter entre 1 e 4000 caracteres.' });
      }
    } else if (path === '/instance/fetchInstances' && req.method === 'GET' && isSuperAdmin) {
      // Somente o admin geral pode listar instâncias globais.
    } else {
      return sendJson(res, 404, { error: 'Rota Evolution não permitida por este proxy.' });
    }

    if (instanceName) {
      const empresaSnap = await db.collection('empresas').doc(instanceName).get();
      if (!empresaSnap.exists) {
        return sendJson(res, 404, { error: 'Empresa não encontrada. Cadastre a empresa antes de conectar o WhatsApp.' });
      }
    }

    let upstreamBody = req.body;
    if (createRoute) {
      upstreamBody = {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      };
    } else if (sendTextMatch) {
      upstreamBody = {
        number: (() => {
          const value = String(req.body?.number || '').replace(/\D/g, '');
          return value.length === 10 || value.length === 11 ? '55' + value : value;
        })(),
        textMessage: {
          text: String(req.body?.textMessage?.text || req.body?.text || '').trim(),
        },
      };
    }
    let webhookUrl = '';
    let webhookSecretHash = '';
    if (webhookMatch) {
      // Em deployments Vercel, usa o domínio desta implantação/preview.
      const deploymentHost = String(process.env.VERCEL_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      const configuredBase = String(process.env.WHATSAPP_WEBHOOK_BASE_URL || '').trim();
      const webhookBaseUrl = deploymentHost
        ? 'https://' + deploymentHost + '/api/webhook-whatsapp'
        : configuredBase.replace(/\/$/, '');
      if (!webhookBaseUrl || !/^https:\/\//i.test(webhookBaseUrl)) {
        return sendJson(res, 503, { error: 'Não foi possível determinar a URL HTTPS pública desta implantação para o webhook. Configure WHATSAPP_WEBHOOK_BASE_URL ou use uma implantação Vercel.' });
      }

      // Mantém o segredo ativo anterior se a Evolution rejeitar a configuração.
      const webhookSecret = randomBytes(32).toString('hex');
      webhookSecretHash = createHash('sha256').update(webhookSecret).digest('hex');
      webhookUrl = webhookBaseUrl + '?secret=' + encodeURIComponent(webhookSecret);
      upstreamBody = {
        enabled: true,
        url: webhookUrl,
        headers: {},
        base64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'],
      };
    }

    const url = apiBase + path;
    const headers = {
      apikey: apiKey,
      ...(req.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    };
    let upstream;
    let text;
    if (webhookMatch) {
      // Configuração flat documentada pela Evolution para webhook por instância.
      const webhookPayload = {
        enabled: true,
        url: webhookUrl,
        headers: {},
        base64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'],
      };
      upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(webhookPayload),
      });
      text = await upstream.text();

      if (upstream.ok) {
        await db().collection('whatsapp_webhook_secrets').doc(instanceName).set({
          secretHash: webhookSecretHash,
          instanceName,
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      upstream = await fetch(url, {
        method: req.method,
        headers,
        ...(req.method !== 'GET' ? { body: JSON.stringify(upstreamBody || {}) } : {}),
      });
      text = await upstream.text();
    }
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.send(text || '{}');
  } catch (error) {
    console.error('[api/evolution] Falha na integração:', error);
    return sendJson(res, 500, { error: 'Não foi possível comunicar com a Evolution API.' });
  }
};
