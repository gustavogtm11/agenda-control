# Google Calendar: autorização persistente

O endpoint `/api/google-calendar-oauth` mantém o token de renovação no servidor, criptografado com AES-256-GCM. O navegador recebe apenas tokens de acesso temporários. O login do Agenda Control e a autorização do calendário são independentes.

## Variáveis de ambiente da Vercel

Configure estas variáveis para **Production** e também Preview, se for testar em Preview:

- `GOOGLE_CLIENT_ID`: ID do cliente OAuth 2.0 do tipo **Aplicativo da Web**, criado no Google Cloud.
- `GOOGLE_CLIENT_SECRET`: segredo do mesmo cliente OAuth.
- `GOOGLE_REDIRECT_URI`: `https://agenda-control-seven.vercel.app/api/google-calendar-oauth?action=callback` (ou o domínio de produção atual, exatamente igual ao cadastrado no Google Cloud).
- `GOOGLE_OAUTH_STATE_SECRET`: segredo aleatório longo usado para assinar o estado OAuth.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: chave aleatória de **32 bytes em Base64** para criptografar os tokens.
- `APP_ORIGIN`: `https://agenda-control-seven.vercel.app`.
- `FIREBASE_SERVICE_ACCOUNT` ou `FIREBASE_SERVICE_ACCOUNT_JSON`: credencial JSON do Firebase Admin já usada pelas funções de backend.

Gere dois valores secretos diferentes localmente. Exemplo com OpenSSL:

```powershell
openssl rand -hex 32
openssl rand -base64 32
```

Use a saída hexadecimal para `GOOGLE_OAUTH_STATE_SECRET` e a saída Base64 para `GOOGLE_TOKEN_ENCRYPTION_KEY`. Guarde-os num gerenciador de senhas; não os coloque no código nem os envie por chat.

## Google Cloud

1. Ative a **Google Calendar API** no projeto Google Cloud do cliente OAuth.
2. Na tela de consentimento OAuth, configure o público e adicione os usuários de teste, se o app ainda estiver em modo de teste.
3. Em **Clientes OAuth 2.0**, crie ou use um cliente do tipo Aplicativo da Web.
4. Adicione o domínio de produção em **Origens JavaScript autorizadas**.
5. Adicione o valor exato de `GOOGLE_REDIRECT_URI` em **URIs de redirecionamento autorizados**.
6. Copie o ID e o segredo para as variáveis da Vercel. Não use o segredo em variáveis `VITE_*`, pois elas são expostas ao navegador.
7. Salve as variáveis e faça um novo deploy.

## Primeiro uso

Depois do deploy, entre normalmente no Agenda Control e clique em **Conectar Google Agenda** uma única vez. Conclua o consentimento na janela do Google. A API guarda o token de renovação criptografado por UID do Firebase e usa-o para renovar tokens de acesso sem pedir login novamente.

Se o Google revogar o acesso, ou se o consentimento não fornecer um token de renovação, será necessário autorizar novamente. Não apague nem compartilhe as chaves de produção.
