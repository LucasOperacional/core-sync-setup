# Ponte do WhatsApp (whatsapp-web.js)

O app não pode rodar o `whatsapp-web.js` (ele precisa de um navegador real).
Este servidor roda na sua máquina/VPS e conversa com o app.

## 1. Instalar e iniciar

```bash
cd integrations/whatsapp-bridge
npm init -y && npm i whatsapp-web.js express qrcode
BRIDGE_TOKEN="uma-senha-forte" \
WEBHOOK_URL="https://SEU-APP/api/public/whatsapp-webhook" \
WEBHOOK_SECRET="outra-senha-forte" \
node server.js
```

## 2. Configurar no app

Guarde no app (segredos):
- `WWEBJS_BASE_URL` = endereço público desta ponte (ex.: `https://ponte.suaempresa.com`)
- `WWEBJS_TOKEN` = o mesmo valor de `BRIDGE_TOKEN`
- `WWEBJS_WEBHOOK_SECRET` = o mesmo valor de `WEBHOOK_SECRET`

## 3. Conectar o número

Abra Chat Interno → WhatsApp e leia o código com o celular.
