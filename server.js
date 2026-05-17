const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors({ origin: "*", methods: ["GET","POST","PATCH","DELETE"], allowedHeaders: ["Content-Type"] }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const users = {};

app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  if (update.message) await handleMessage(update.message);
  if (update.callback_query) await handleCallback(update.callback_query);
});

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const name = msg.from.first_name || "Utilizador";
  if (!users[chatId]) users[chatId] = { name, chatId, reminders: [], connectedAt: new Date() };

  if (text.startsWith("/start")) { await sendWelcome(chatId, name); return; }
  if (text.startsWith("/lembretes") || text.startsWith("/list")) { await sendRemindersList(chatId); return; }
  if (text.startsWith("/ajuda") || text.startsWith("/help")) { await sendHelp(chatId); return; }
  if (text.startsWith("/myid")) { await sendMessage(chatId, `🆔 O teu Chat ID é:\n\`${chatId}\`\n\nCopia e cola no app MindVault!`, { parse_mode: "Markdown" }); return; }
  if (text.startsWith("/limpar") || text.startsWith("/clear")) {
    users[chatId].reminders = [];
    await sendMessage(chatId, "🗑️ Todos os lembretes foram apagados.");
    return;
  }
  await classifyAndSave(chatId, text);
}

async function sendWelcome(chatId, name) {
  await sendMessage(chatId, `🧠 *Bem-vindo ao MindVault, ${name}!*\n\nSou o teu segundo cérebro com IA.\n\n✦ Escreve qualquer tarefa → crio lembrete automaticamente\n✦ /lembretes → Ver todos\n✦ /limpar → Apagar todos\n✦ /ajuda → Comandos\n\n_Começa a escrever!_ 👇`, { parse_mode: "Markdown" });
}

async function sendHelp(chatId) {
  await sendMessage(chatId, `📖 *Comandos MindVault*\n\n/start — Iniciar\n/lembretes — Ver lembretes\n/limpar — Apagar tudo\n/ajuda — Esta mensagem\n\n💡 *Exemplos:*\n• Reunião amanhã às 15h\n• Pagar conta urgente\n• Comprar medicamento\n\nA IA Gemini classifica tudo automaticamente! 🤖`, { parse_mode: "Markdown" });
}

async function sendRemindersList(chatId) {
  const user = users[chatId];
  if (!user || user.reminders.length === 0) {
    await sendMessage(chatId, "📭 Não tens lembretes. Envia uma mensagem para criar um!");
    return;
  }
  const pe = { high: "🔴", medium: "🟡", low: "🟢" };
  const ce = { work: "💼", personal: "👤", health: "💪", finance: "💰" };
  let msg = `📋 *Os teus lembretes (${user.reminders.length}):*\n\n`;
  user.reminders.forEach((r) => {
    msg += `${pe[r.priority]||"⚪"} ${ce[r.category]||"📌"} ${r.text}\n`;
    msg += `   _${r.priority?.toUpperCase()} · ${r.category}_\n\n`;
  });
  await sendMessage(chatId, msg, { parse_mode: "Markdown" });
}

async function classifyAndSave(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendChatAction`, { chat_id: chatId, action: "typing" });

  const t = text.toLowerCase();

  // Classificação por palavras-chave
  let priority = "medium";
  if (/urgente|importante|hoje|já|prazo|deadline|asap|crítico|emergência/.test(t)) priority = "high";
  else if (/quando puder|sem pressa|talvez|eventualmente/.test(t)) priority = "low";

  let category = "personal";
  if (/pagar|conta|banco|dinheiro|fatura|transferência|imposto|salário|pagamento|cartão|finanças/.test(t)) category = "finance";
  else if (/médico|saúde|hospital|farmácia|vitamina|exercício|consulta|remédio|clínica/.test(t)) category = "health";
  else if (/reunião|trabalho|projeto|cliente|meeting|relatório|apresentação|empresa|chefe/.test(t)) category = "work";

  // Melhorar com Gemini se disponível
  try {
    const response = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: `Classifica esta mensagem. Responde APENAS JSON sem markdown:\n{"priority":"high"|"medium"|"low","category":"work"|"personal"|"health"|"finance"}\nhigh=urgente/importante/hoje, medium=normal, low=sem urgência\nwork=trabalho/reunião, personal=pessoal/família, health=saúde/médico, finance=dinheiro/pagar/banco\nMensagem: "${text}"` }] }]
    });
    const raw = response.data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
    const c = JSON.parse(raw);
    if (c.priority) priority = c.priority;
    if (c.category) category = c.category;
  } catch (err) {
    console.error("Gemini erro:", err.message);
  }

  users[chatId].reminders.unshift({ id: Date.now(), text, priority, category, date: new Date().toISOString(), done: false, source: "telegram" });

  const pe = { high: "🔴", medium: "🟡", low: "🟢" };
  const ce = { work: "💼", personal: "👤", health: "💪", finance: "💰" };
  await sendMessage(chatId, `✅ *Lembrete guardado!*\n\n${pe[priority]} *${priority.toUpperCase()}*  ${ce[category]} *${category}*\n\n📝 ${text}\n\n_Ver todos: /lembretes_`, { parse_mode: "Markdown" });
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: query.id });
  if (query.data === "list") await sendRemindersList(chatId);
  if (query.data === "clear") { if (users[chatId]) users[chatId].reminders = []; await sendMessage(chatId, "🗑️ Apagados."); }
}

async function sendMessage(chatId, text, options = {}) {
  try { await axios.post(`${TELEGRAM_API}/sendMessage`, { chat_id: chatId, text, ...options }); }
  catch (err) { console.error("Erro:", err.message); }
}

app.get("/api/reminders/:chatId", (req, res) => {
  const user = users[req.params.chatId];
  if (!user) return res.json({ reminders: [], user: null });
  res.json({ reminders: user.reminders, user: { name: user.name, chatId: user.chatId } });
});

app.post("/api/reminders/:chatId", (req, res) => {
  const { chatId } = req.params;
  const { text, priority, category } = req.body;
  if (!users[chatId]) users[chatId] = { name: "App User", chatId, reminders: [] };
  const r = { id: Date.now(), text, priority, category, date: new Date().toISOString(), done: false, source: "app" };
  users[chatId].reminders.unshift(r);
  res.json({ success: true, reminder: r });
});

app.patch("/api/reminders/:chatId/:id", (req, res) => {
  const { chatId, id } = req.params;
  if (!users[chatId]) return res.status(404).json({ error: "Not found" });
  users[chatId].reminders = users[chatId].reminders.map(r => r.id === parseInt(id) ? { ...r, done: !r.done } : r);
  res.json({ success: true });
});

app.delete("/api/reminders/:chatId/:id", (req, res) => {
  const { chatId, id } = req.params;
  if (!users[chatId]) return res.status(404).json({ error: "Not found" });
  users[chatId].reminders = users[chatId].reminders.filter(r => r.id !== parseInt(id));
  res.json({ success: true });
});

app.get("/api/users", (req, res) => {
  res.json({ total: Object.keys(users).length, users: Object.values(users).map(u => ({ chatId: u.chatId, name: u.name, total: u.reminders.length })) });
});

app.get("/setup-webhook", async (req, res) => {
  try {
    const url = `${WEBHOOK_URL}/webhook/${TELEGRAM_TOKEN}`;
    const result = await axios.post(`${TELEGRAM_API}/setWebhook`, { url });
    res.json({ success: true, result: result.data, webhookUrl: url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/", (req, res) => {
  res.json({ status: "✅ MindVault Server running", users: Object.keys(users).length, ai: "Gemini + Keywords" });
});

app.listen(PORT, () => console.log(`🧠 MindVault na porta ${PORT}`));
