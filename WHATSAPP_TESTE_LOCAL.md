# WhatsApp: ambiente de teste isolado

Esta branch é experimental e não deve ser integrada à `main` antes dos testes.

## Variáveis locais

Crie um arquivo `.env.local` na raiz (não o envie ao GitHub):

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

EVOLUTION_API_URL=https://evolution-api-free-test.onrender.com
EVOLUTION_API_KEY=CHAVE_EXCLUSIVA_DE_TESTE
```

A chave da Evolution **não** deve ter prefixo `VITE_`, pois isso a colocaria no JavaScript entregue ao navegador. O proxy do Vite usa a chave somente no servidor de desenvolvimento.

## Rodar localmente

```powershell
npm install
npm run dev
```

O proxy local encaminha `/api/evolution/*` para a Evolution API configurada. O componente Master usa o endpoint relativo e envia o token do Firebase.

## Variáveis do ambiente de produção (Vercel)

Configure no projeto Vercel, sem commitar valores:

- `EVOLUTION_API_URL`: URL base do serviço Evolution.
- `EVOLUTION_API_KEY`: chave da Evolution guardada no servidor.
- `FIREBASE_SERVICE_ACCOUNT` ou `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON da conta de serviço do Firebase Admin.
- `WHATSAPP_WEBHOOK_URL`: URL HTTPS pública do endpoint `/api/webhook-whatsapp`.

A rota `api/evolution/[...path].js` valida o token Firebase e o perfil Firestore antes de permitir as rotas limitadas de criação/conexão da instância. Em desenvolvimento local, o proxy Vite é destinado apenas ao teste local e não substitui as verificações do endpoint de produção.

## Isolamento obrigatório

- Use um projeto Firebase de teste ou uma empresa de teste com dados próprios.
- Use uma instância e um número de WhatsApp exclusivos para testes.
- O cadastro atual cria o perfil da empresa no Firestore, mas o responsável ainda precisa autenticar-se com o provedor Google habilitado no projeto.
- O serviço gratuito do Render pode dormir ou ficar indisponível; isso não deve ser interpretado como defeito da interface.
- Não teste com números/clientes reais antes de validar as regras de isolamento do webhook e do Firestore.
