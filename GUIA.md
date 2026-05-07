# 🧠 MindVault Server — Guia de Instalação

## Passo 1 — Instalar dependências
```bash
npm install
```

## Passo 2 — Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Edite o ficheiro `.env` e preencha:
- `TELEGRAM_TOKEN` → Token do seu bot (do @BotFather)
- `ANTHROPIC_API_KEY` → Chave da API Claude
- `WEBHOOK_URL` → URL do seu servidor após deploy

## Passo 3 — Testar localmente
```bash
npm run dev
```
O servidor arranca em http://localhost:3000

## Passo 4 — Deploy no Railway (gratuito)

1. Crie conta em https://railway.app
2. Clique em **New Project → Deploy from GitHub**
3. Faça upload dos ficheiros ou ligue ao GitHub
4. Adicione as variáveis de ambiente no painel do Railway
5. Railway dá-lhe uma URL automática (ex: mindvault.railway.app)
6. Copie essa URL para o `.env` → `WEBHOOK_URL`

## Passo 5 — Registar Webhook no Telegram
Após o deploy, abra no browser:
```
https://SEU-SERVIDOR.railway.app/setup-webhook
```
Resposta esperada:
```json
{ "success": true, "webhookUrl": "https://..." }
```

## Passo 6 — Testar o bot
1. Abra o Telegram
2. Encontre o seu bot
3. Envie `/start`
4. Envie uma mensagem qualquer → IA cria lembrete automaticamente! ✅

---

## API REST disponível

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/reminders/:chatId` | Buscar lembretes |
| POST | `/api/reminders/:chatId` | Criar lembrete |
| PATCH | `/api/reminders/:chatId/:id` | Marcar como feito |
| DELETE | `/api/reminders/:chatId/:id` | Apagar lembrete |
| GET | `/api/users` | Ver todos os utilizadores |
| GET | `/setup-webhook` | Registar webhook |
| GET | `/` | Health check |

---

## Estrutura de um lembrete
```json
{
  "id": 1234567890,
  "text": "Reunião às 15h",
  "priority": "high",
  "category": "work",
  "date": "2025-05-07T10:00:00.000Z",
  "done": false,
  "source": "telegram"
}
```

---

## ⚠️ Importante para produção
- Substituir `users = {}` por uma base de dados real (PostgreSQL, MongoDB)
- Adicionar autenticação à API REST
- Guardar o `TELEGRAM_TOKEN` e `ANTHROPIC_API_KEY` sempre em variáveis de ambiente, nunca no código
