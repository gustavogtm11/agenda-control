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
WHATSAPP_WEBHOOK_URL=https://URL-PREVIEW-VERCEL/api/webhook-whatsapp?secret=SEGREDO_ALEATORIO
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
- `WHATSAPP_WEBHOOK_URL`: URL HTTPS pública do endpoint `/api/webhook-whatsapp?secret=SEU_SEGREDO`.
- `WHATSAPP_WEBHOOK_SECRET`: o mesmo segredo aleatório usado no parâmetro `secret` da URL. O webhook recusa chamadas sem esse segredo.

Para teste local, configure também `WHATSAPP_WEBHOOK_URL` no `.env.local` com a URL HTTPS de uma implantação Preview desta branch na Vercel. Essa URL deve terminar em `/api/webhook-whatsapp?secret=...`; configure o mesmo valor de segredo em `WHATSAPP_WEBHOOK_SECRET` no ambiente Preview. Não use o domínio de produção para esse teste.

A rota `api/evolution/[...path].js` valida o token Firebase e o perfil Firestore antes de permitir as rotas limitadas de criação/conexão da instância. Em desenvolvimento local, o proxy Vite é destinado apenas ao teste local e não substitui as verificações do endpoint de produção.

## Atenção antes de testar

O proxy local usa a chave configurada no `.env.local` e não passa pelo endpoint autenticado da Vercel. Por isso, rode a aplicação somente no seu computador e use uma chave descartável/exclusiva para a instância de teste. Nunca coloque a chave em variáveis `VITE_*` nem a envie ao GitHub.

O `.env.local` deve apontar o frontend para um projeto Firebase de teste se você quiser isolamento real. Executar a aplicação local não impede gravações no Firebase de produção quando as variáveis `VITE_FIREBASE_*` apontam para o projeto de produção.

## Fluxo automatizado incluído

Com a automação ativada e o webhook sincronizado, o atendimento usa este menu numérico:

1. Agendar horário: escolhe serviço, data e horário; o sistema consulta o expediente, almoço, bloqueios e agendamentos existentes antes de reservar.
2. Cancelar agendamento: lista os próximos agendamentos vinculados ao telefone que iniciou a conversa e cancela somente após validar empresa e telefone.
3. Consultar horários: mostra os próximos agendamentos vinculados ao telefone.
4. Falar com atendente: pausa as respostas automáticas daquela conversa; o cliente pode digitar `MENU` para retomar o robô.

Os textos são editáveis no módulo WhatsApp. As variáveis aceitas são `{primeiroNome}`, `{data}`, `{hora}`, `{horario}`, `{servico}`, `{profissional}` e `{valor}`. O agendamento manual do módulo Agenda continua independente do robô.

## Teste recomendado

1. Faça login com uma empresa de teste já cadastrada no Firestore.
2. Conecte uma instância WhatsApp exclusiva de teste.
3. Ative o robô e salve os textos.
4. Configure `WHATSAPP_WEBHOOK_URL` com a URL HTTPS da implantação Preview desta branch e o mesmo segredo em `WHATSAPP_WEBHOOK_SECRET`.
5. Sincronize o webhook. O endpoint da Evolution usado é `POST /webhook/set/{instance}`.
6. Envie uma mensagem do número de teste e percorra as opções 1, 2, 3 e 4. Confirme também que uma segunda mensagem duplicada não cria uma segunda reserva.

Não considere a funcionalidade validada até testar o fluxo real com o WhatsApp, o Firestore e a agenda de teste. O ambiente de edição não executou o build nem um teste ponta a ponta.

## Isolamento obrigatório

- Use um projeto Firebase de teste ou uma empresa de teste com dados próprios.
- Use uma instância e um número de WhatsApp exclusivos para testes.
- O cadastro atual cria o perfil da empresa no Firestore, mas o responsável ainda precisa autenticar-se com o provedor Google habilitado no projeto.
- O serviço gratuito do Render pode dormir ou ficar indisponível; isso não deve ser interpretado como defeito da interface.
- Não teste com números/clientes reais antes de validar as regras de isolamento do webhook e do Firestore.
