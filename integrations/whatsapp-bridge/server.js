/**
 * Servidor-ponte do WhatsApp (whatsapp-web.js) — rode em uma máquina/VPS própria.
 *
 * Instalação:
 *   npm init -y && npm i whatsapp-web.js express qrcode
 *   BRIDGE_TOKEN=... WEBHOOK_URL=https://SEU-APP/api/public/whatsapp-webhook \
 *   WEBHOOK_SECRET=... node server.js
 *
 * Endpoints usados pelo app:
 *   GET  /status  -> { connected, state, qr, number }
 *   GET  /chats   -> [{ id, name, isGroup, lastMessage, timestamp }]
 *   POST /send    -> { chatId, message } => { id }
 */
const express = require("express");
const qrcode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const PORT = process.env.PORT || 3100;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || "";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

let ultimoQr = null;
let conectado = false;
let estado = "STARTING";

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", async (qr) => {
  ultimoQr = await qrcode.toDataURL(qr);
  conectado = false;
  estado = "QR";
});
client.on("ready", () => {
  ultimoQr = null;
  conectado = true;
  estado = "CONNECTED";
});
client.on("disconnected", () => {
  conectado = false;
  estado = "DISCONNECTED";
});

async function encaminhar(msg, fromMe) {
  if (!WEBHOOK_URL) return;
  const chat = await msg.getChat();
  let mediaUrl = null;
  let mediaType = null;
  if (msg.hasMedia) mediaType = msg.type;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-token": WEBHOOK_SECRET },
      body: JSON.stringify({
        chatId: chat.id._serialized,
        telefone: chat.id.user,
        nome: chat.name || chat.id.user,
        isGroup: chat.isGroup,
        messageId: msg.id._serialized,
        fromMe,
        body: msg.body || "",
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mediaType ? { mediaType } : {}),
        timestamp: msg.timestamp,
      }),
    });
  } catch (e) {
    console.error("webhook falhou", e.message);
  }
}

client.on("message", (msg) => encaminhar(msg, false));
client.on("message_create", (msg) => {
  if (msg.fromMe) encaminhar(msg, true);
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (!BRIDGE_TOKEN) return next();
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (auth !== BRIDGE_TOKEN) return res.status(401).json({ error: "não autorizado" });
  next();
});

app.get("/status", async (req, res) => {
  let number = null;
  try {
    number = conectado ? client.info?.wid?.user ?? null : null;
  } catch {}
  res.json({ connected: conectado, state: estado, qr: ultimoQr, number });
});

app.get("/chats", async (req, res) => {
  try {
    const chats = await client.getChats();
    res.json(
      chats.slice(0, 300).map((c) => ({
        id: c.id._serialized,
        name: c.name || c.id.user,
        isGroup: c.isGroup,
        lastMessage: c.lastMessage?.body || "",
        timestamp: c.timestamp || 0,
      })),
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { chatId, message } = req.body || {};
    if (!chatId || !message) return res.status(400).json({ error: "chatId e message obrigatórios" });
    const enviada = await client.sendMessage(chatId, message);
    res.json({ id: enviada.id?._serialized ?? null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

client.initialize();
app.listen(PORT, () => console.log(`ponte do WhatsApp em http://localhost:${PORT}`));
