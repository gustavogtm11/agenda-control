import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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
    }
    if (webhookMatch) {
      if (!process.env.WHATSAPP_WEBHOOK_URL) {
        return sendJson(res, 503, { error: 'Configure WHATSAPP_WEBHOOK_URL no ambiente do servidor antes de sincronizar o webhook.' });
      }
      upstreamBody = {
        enabled: true,
        url: process.env.WHATSAPP_WEBHOOK_URL,
        webhook_by_events: false,
        webhook_base64: false,
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
      const webhookPayloads = [
        {
          enabled: true,
          url: process.env.WHATSAPP_WEBHOOK_URL,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'],
        },
        {
          enabled: true,
          url: process.env.WHATSAPP_WEBHOOK_URL,
          webhook_by_events: false,
          webhook_base64: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'],
        },
        {
          webhook: {
            enabled: true,
            url: process.env.WHATSAPP_WEBHOOK_URL,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'],
          },
        },
      ];
      for (const webhookPayload of webhookPayloads) {
        upstream = await fetch(url, { method: req.method, headers, body: JSON.stringify(webhookPayload) });
        text = await upstream.text();
        if (upstream.ok || ![400, 422].includes(upstream.status)) break;
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
