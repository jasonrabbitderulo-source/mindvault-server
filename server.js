// ============================================================
//  MindVault — Servidor Backend + Bot Telegram
//  Tecnologia: Node.js + Express
//  Autor: MindVault
// ============================================================

const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// ─── Configurações (via .env) ───────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;       // Token do seu bot
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;    // Chave da API Claude
const PORT           = process.env.PORT || 3000;
const WEBHOOK_URL    = process.env.WEBHOOK_URL;          // Ex: https://meusite.railway.app

const TELEGRAM_API   = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ─── Base de dados em memória (substituir por DB real) ──────
// Em produção: usar PostgreSQL, MongoDB ou Firebase
const users = {};       // { chatId: { name, reminders: [] } }
const sessions = {};    // { chatId: { step, data } }

// ============================================================
//  WEBHOOK — Telegram envia mensagens aqui
// ============================================================
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // Responder imediatamente ao Telegram

  const update = req.body;

  // Mensagem de texto normal
  if (update.message) {
    await handleMessage(update.message);
  }

  // Callback de botões inline
  if (update.callback_query) {
    await handleCallback(update.callback_query);
  }
});

// ============================================================
//  HANDLER DE MENSAGENS
// ============================================================
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text   = msg.text || "";
  const name   = msg.from.first_name || "Utilizador";

  // Inicializar utilizador se não existir
  if (!users[chatId]) {
    users[chatId] = { name, chatId, reminders: [], connectedAt: new Date() };
  }

  // Comandos
  if (text === "/start") {
    await sendWelcome(chatId, name);
    return;
  }

  if (text === "/lembretes" || text === "/reminders") {
    await sendRemindersList(chatId);
    return;
  }

  if (text === "/ajuda" || text === "/help") {
    await sendHelp(chatId);
    return;
  }

  if (text === "/limpar" || text === "/clear") {
    users[chatId].reminders = [];
    await sendMessage(chatId, "🗑️ Todos os lembretes foram apagados.");
    return;
  }

  // Qualquer outra mensagem → classificar com IA e criar lembrete
  await classifyAndSave(chatId, text, name);
}

// ============================================================
//  BOAS-VINDAS
// ============================================================
async function sendWelcome(chatId, name) {
  const msg = `🧠 *Bem-vindo ao MindVault, ${name}!*

Sou o teu segundo cérebro inteligente. Podes:

✦ Enviar qualquer mensagem → Crio um lembrete automaticamente
✦ /lembretes → Ver todos os teus lembretes
✦ /limpar → Apagar todos os lembretes
✦ /ajuda → Ver ajuda completa

_Começa a escrever uma tarefa ou nota!_ 👇`;

  await sendMessage(chatId, msg, { parse_mode: "Markdown" });
}

// ============================================================
//  AJUDA
// ============================================================
async function sendHelp(chatId) {
  const msg = `📖 *Comandos MindVault*

/start — Iniciar o bot
/lembretes — Ver todos os lembretes
/limpar — Apagar todos os lembretes
/ajuda — Esta mensagem

💡 *Dica:* Podes escrever qualquer coisa em linguagem natural:
• "Reunião amanhã às 15h com o João"
• "Comprar leite e pão"
• "Ligar ao médico urgente"

A IA classifica automaticamente por *prioridade* e *categoria*! 🤖`;

  await sendMessage(chatId, msg, { parse_mode: "Markdown" });
}

// ============================================================
//  LISTAR LEMBRETES
// ============================================================
async function sendRemindersList(chatId) {
  const user = users[chatId];
  if (!user || user.reminders.length === 0) {
    await sendMessage(chatId, "📭 Não tens lembretes. Envia uma mensagem para criar um!");
    return;
  }

  const priorityEmoji = { high: "🔴", medium: "🟡", low: "🟢" };
  const categoryEmoji = { work: "💼", personal: "👤", health: "💪", finance: "💰" };

  let msg = `📋 *Os teus lembretes (${user.reminders.length}):*\n\n`;
  user.reminders.forEach((r, i) => {
    const pe = priorityEmoji[r.priority] || "⚪";
    const ce = categoryEmoji[r.category] || "📌";
    msg += `${pe} ${ce} ${r.text}\n`;
    msg += `   _${r.priority?.toUpperCase()} · ${r.category} · ${new Date(r.date).toLocaleDateString()}_\n\n`;
  });

  await sendMessage(chatId, msg, { parse_mode: "Markdown" });
}

// ============================================================
//  CLASSIFICAR MENSAGEM COM IA E GUARDAR LEMBRETE
// ============================================================
async function classifyAndSave(chatId, text, name) {
  // Enviar indicador de digitação
  await axios.post(`${TELEGRAM_API}/sendChatAction`, { chat_id: chatId, action: "typing" });

  try {
    // Chamar Claude para classificar
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: `Classifica a mensagem do utilizador como lembrete. 
Responde APENAS com JSON válido, sem markdown:
{"priority":"high"|"medium"|"low","category":"work"|"personal"|"health"|"finance","summary":"resumo curto em português max 10 palavras"}
Critérios: high=urgente/importante, medium=normal, low=quando possível.`,
        messages: [{ role: "user", content: text }],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.content[0].text.replace(/```json|```/g, "").trim();
    const classified = JSON.parse(raw);

    // Guardar lembrete
    const reminder = {
      id: Date.now(),
      text,
      priority: classified.priority || "medium",
      category: classified.category || "personal",
      summary: classified.summary || text,
      date: new Date().toISOString(),
      done: false,
      source: "telegram",
    };

    users[chatId].reminders.unshift(reminder);

    // Confirmar ao utilizador
    const priorityEmoji = { high: "🔴", medium: "🟡", low: "🟢" };
    const categoryEmoji = { work: "💼", personal: "👤", health: "💪", finance: "💰" };

    const confirmMsg = `✅ *Lembrete guardado!*

${priorityEmoji[reminder.priority]} *${reminder.priority?.toUpperCase()}*  ${categoryEmoji[reminder.category]} *${reminder.category}*

📝 ${reminder.text}

_Podes ver todos os teus lembretes com /lembretes_`;

    await sendMessage(chatId, confirmMsg, { parse_mode: "Markdown" });

  } catch (err) {
    console.error("Erro ao classificar:", err.message);
    // Guardar mesmo sem classificação
    users[chatId].reminders.unshift({
      id: Date.now(),
      text,
      priority: "medium",
      category: "personal",
      date: new Date().toISOString(),
      done: false,
      source: "telegram",
    });
    await sendMessage(chatId, `✅ Lembrete guardado: "${text}"`);
  }
}

// ============================================================
//  HANDLE CALLBACKS (botões inline)
// ============================================================
async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const data   = query.data;

  await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: query.id });

  if (data === "list") await sendRemindersList(chatId);
  if (data === "clear") {
    if (users[chatId]) users[chatId].reminders = [];
    await sendMessage(chatId, "🗑️ Lembretes apagados.");
  }
}

// ============================================================
//  ENVIAR MENSAGEM (helper)
// ============================================================
async function sendMessage(chatId, text, options = {}) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
      ...options,
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.message);
  }
}

// ============================================================
//  API REST — Para o app MindVault aceder aos lembretes
// ============================================================

// GET /api/reminders/:chatId — Buscar lembretes de um utilizador
app.get("/api/reminders/:chatId", (req, res) => {
  const { chatId } = req.params;
  const user = users[chatId];
  if (!user) return res.json({ reminders: [], user: null });
  res.json({ reminders: user.reminders, user: { name: user.name, chatId } });
});

// POST /api/reminders/:chatId — Adicionar lembrete via app
app.post("/api/reminders/:chatId", (req, res) => {
  const { chatId } = req.params;
  const { text, priority, category } = req.body;
  if (!users[chatId]) users[chatId] = { name: "App User", chatId, reminders: [] };
  const reminder = { id: Date.now(), text, priority, category, date: new Date().toISOString(), done: false, source: "app" };
  users[chatId].reminders.unshift(reminder);
  res.json({ success: true, reminder });
});

// PATCH /api/reminders/:chatId/:id — Marcar como feito
app.patch("/api/reminders/:chatId/:id", (req, res) => {
  const { chatId, id } = req.params;
  if (!users[chatId]) return res.status(404).json({ error: "User not found" });
  users[chatId].reminders = users[chatId].reminders.map(r =>
    r.id === parseInt(id) ? { ...r, done: !r.done } : r
  );
  res.json({ success: true });
});

// DELETE /api/reminders/:chatId/:id — Apagar lembrete
app.delete("/api/reminders/:chatId/:id", (req, res) => {
  const { chatId, id } = req.params;
  if (!users[chatId]) return res.status(404).json({ error: "User not found" });
  users[chatId].reminders = users[chatId].reminders.filter(r => r.id !== parseInt(id));
  res.json({ success: true });
});

// GET /api/users — Ver todos os utilizadores (admin)
app.get("/api/users", (req, res) => {
  const summary = Object.values(users).map(u => ({
    chatId: u.chatId,
    name: u.name,
    totalReminders: u.reminders.length,
    connectedAt: u.connectedAt,
  }));
  res.json({ total: summary.length, users: summary });
});

// ============================================================
//  REGISTAR WEBHOOK NO TELEGRAM
// ============================================================
app.get("/setup-webhook", async (req, res) => {
  try {
    const url = `${WEBHOOK_URL}/webhook/${TELEGRAM_TOKEN}`;
    const result = await axios.post(`${TELEGRAM_API}/setWebhook`, { url });
    res.json({ success: true, result: result.data, webhookUrl: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "✅ MindVault Server running", users: Object.keys(users).length });
});

// ============================================================
//  INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log(`🧠 MindVault Server rodando na porta ${PORT}`);
  console.log(`📡 Webhook: ${WEBHOOK_URL}/webhook/${TELEGRAM_TOKEN}`);
  console.log(`🔗 Setup webhook: GET /setup-webhook`);
});
