> ## Documentation Index
> Fetch the complete documentation index at: https://docs.evolutionfoundation.com.br/llms.txt
> Use this file to discover all available pages before exploring further.

# Webhooks

Os Webhooks permitem que o Evolution Go envie notificações em tempo real para sua aplicação quando eventos ocorrem no WhatsApp, como recebimento de mensagens, atualizações de conexão, chamadas e muito mais.

## Guia Rápido

Siga estes passos para configurar e receber webhooks do Evolution Go.

### Pré-requisitos

Antes de configurar webhooks, você precisa:

1. Ter o Evolution Go **instalado e rodando** — veja o [guia de instalação](/evolution-go/installation)
2. Ter uma **instância criada** — veja [Configuração Inicial](/evolution-go/getting-started)
3. Ter sua **API Key** (`GLOBAL_API_KEY` configurada no `.env`)
4. Ter uma **URL acessível** para receber os eventos

<Tip>
  Para testes rápidos, use o <a href="https://webhook.site" target="_blank">webhook.site</a> para gerar uma URL temporária e visualizar os eventos recebidos em tempo real. Para desenvolvimento local, use o <a href="https://ngrok.com" target="_blank">ngrok</a> para expor seu servidor local à internet.
</Tip>

### Passo 1: Conectar a instância com webhook

Configure o webhook ao conectar sua instância enviando uma requisição para o endpoint de conexão.

#### Método

```
POST {BASE_URL}/instance/connect
```

#### Header

| Key          | Value                                  | Descrição                                 |
| ------------ | -------------------------------------- | ----------------------------------------- |
| Content-Type | `application/json`                     | Tipo do conteúdo                          |
| apikey       | `SUA_GLOBAL_API_KEY`                   | Chave de API global configurada no `.env` |
| instanceId   | `249aad2e-68f9-464f-bc84-aca560c38f0e` | UUID da instância que deseja conectar     |

<Warning>
  A API Key é o valor da variável `GLOBAL_API_KEY` configurada no arquivo `.env` do Evolution Go. Nunca exponha essa chave publicamente. Veja mais detalhes em [Configuração Inicial](/evolution-go/getting-started#passo-2-login-no-painel).
</Warning>

#### Body

```json theme={null}
{
  "webhookUrl": "https://webhook.site/seu-id-unico",
  "subscribe": ["ALL"],
  "immediate": true
}
```

#### Exemplo com cURL

```bash theme={null}
curl -X POST 'http://localhost:8080/instance/connect' \
  -H 'Content-Type: application/json' \
  -H 'apikey: SUA_GLOBAL_API_KEY' \
  -H 'instanceId: 249aad2e-68f9-464f-bc84-aca560c38f0e' \
  -d '{
    "webhookUrl": "https://webhook.site/seu-id-unico",
    "subscribe": ["ALL"],
    "immediate": true
  }'
```

#### Exemplo com JavaScript

```javascript theme={null}
const response = await fetch('http://localhost:8080/instance/connect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'SUA_GLOBAL_API_KEY',
    'instanceId': '249aad2e-68f9-464f-bc84-aca560c38f0e'
  },
  body: JSON.stringify({
    webhookUrl: 'https://webhook.site/seu-id-unico',
    subscribe: ['ALL'],
    immediate: true
  })
});

const data = await response.json();
console.log(data);
```

#### Exemplo com Python

```python theme={null}
import requests

response = requests.post(
    'http://localhost:8080/instance/connect',
    headers={
        'Content-Type': 'application/json',
        'apikey': 'SUA_GLOBAL_API_KEY',
        'instanceId': '249aad2e-68f9-464f-bc84-aca560c38f0e'
    },
    json={
        'webhookUrl': 'https://webhook.site/seu-id-unico',
        'subscribe': ['ALL'],
        'immediate': True
    }
)

print(response.json())
```

### Passo 2: Parear com o WhatsApp

Após a conexão, você receberá um evento `QRCode` no seu webhook com a imagem do QR Code em base64:

1. Abra o **WhatsApp** no celular
2. Vá em **Configurações > Dispositivos conectados > Conectar dispositivo**
3. Escaneie o QR Code recebido no webhook (decodifique o campo `qrcode` base64 para exibir a imagem)

<Note>
  Se preferir usar **Pairing Code** ao invés de QR Code, envie o campo `phone` no body:

  ```json theme={null}
  {
    "webhookUrl": "https://webhook.site/seu-id-unico",
    "subscribe": ["ALL"],
    "phone": "5511999999999"
  }
  ```
</Note>

### Passo 3: Confirmar a conexão

Após o pareamento bem-sucedido, você receberá uma sequência de eventos: `PairSuccess` → `Connected` → `OfflineSyncCompleted`. Se recebeu esses 3 eventos, seu webhook está configurado corretamente.

### Passo 4: Receber mensagens

A partir de agora, toda mensagem recebida no WhatsApp será enviada como evento `Message` para sua URL.

```
Usuário envia mensagem → WhatsApp → Evolution Go → HTTP POST → Seu Webhook
```

#### Processando no seu servidor

<CodeGroup>
  ```javascript Node.js (Express) theme={null}
  const express = require('express');
  const app = express();
  app.use(express.json());

  app.post('/webhook', (req, res) => {
    const { event, data, instanceId } = req.body;

    switch (event) {
      case 'Message':
        const sender = data.Info.PushName || data.Info.Sender;
        const text = data.Message.conversation;
        console.log(`[${instanceId}] ${sender}: ${text}`);
        break;
      case 'Connected':
        console.log(`Instância ${instanceId} conectada!`);
        break;
      case 'QRCode':
        console.log(`QR Code recebido para ${instanceId}`);
        break;
      default:
        console.log(`Evento: ${event}`);
    }

    res.status(200).json({ received: true });
  });

  app.listen(3000, () => console.log('Webhook rodando na porta 3000'));
  ```

  ```python Python (Flask) theme={null}
  from flask import Flask, request, jsonify

  app = Flask(__name__)

  @app.route('/webhook', methods=['POST'])
  def webhook():
      payload = request.json
      event = payload.get('event')
      data = payload.get('data', {})
      instance_id = payload.get('instanceId')

      if event == 'Message':
          sender = data.get('Info', {}).get('PushName', data.get('Info', {}).get('Sender'))
          text = data.get('Message', {}).get('conversation', '')
          print(f'[{instance_id}] {sender}: {text}')
      elif event == 'Connected':
          print(f'Instância {instance_id} conectada!')
      elif event == 'QRCode':
          print(f'QR Code recebido para {instance_id}')
      else:
          print(f'Evento: {event}')

      return jsonify({'received': True}), 200

  if __name__ == '__main__':
      app.run(port=3000)
  ```
</CodeGroup>

<Warning>
  Seu endpoint **deve** responder com status HTTP `2xx` (200-299) em até 30 segundos. Caso contrário, o Evolution Go fará até **5 retentativas** com intervalo de **30 segundos** entre cada uma.
</Warning>

***

## Configuração Detalhada

A configuração de webhooks é feita no momento da conexão da instância, através do endpoint `POST /instance/connect`.

### Webhook por Instância

Ao conectar uma instância, você pode definir a URL do webhook e os eventos que deseja receber:

```json POST /instance/connect theme={null}
{
  "webhookUrl": "https://seu-dominio.com/webhook",
  "subscribe": [
    "MESSAGE",
    "SEND_MESSAGE",
    "CONNECTION",
    "QRCODE"
  ],
  "immediate": true,
  "phone": "5511999999999"
}
```

### Parâmetros

| Parâmetro       | Tipo      | Obrigatório | Descrição                                                                 |
| --------------- | --------- | ----------- | ------------------------------------------------------------------------- |
| webhookUrl      | string    | Não         | URL que receberá os eventos via HTTP POST                                 |
| subscribe       | string\[] | Não         | Lista de tipos de eventos para receber. Se vazio, recebe apenas `MESSAGE` |
| immediate       | boolean   | Não         | Conectar imediatamente sem aguardar QR Code                               |
| phone           | string    | Não         | Número de telefone para pareamento                                        |
| rabbitmqEnable  | string    | Não         | `"enabled"` para ativar envio via RabbitMQ                                |
| websocketEnable | string    | Não         | `"enabled"` para ativar envio via WebSocket                               |
| natsEnable      | string    | Não         | `"enabled"` para ativar envio via NATS                                    |

### Webhook Global

Você pode definir um webhook global via variável de ambiente. Ele receberá eventos de **todas** as instâncias, além dos webhooks individuais de cada instância.

```bash .env theme={null}
# URL do webhook global (recebe eventos de todas as instâncias)
WEBHOOK_URL=https://seu-dominio.com/webhook/global

# Incluir arquivos de mídia no payload do webhook (padrão: true)
WEBHOOK_FILES=true
```

<Note>
  Quando configurados, **ambos** os webhooks são acionados: o global (definido por `WEBHOOK_URL`) e o da instância (definido em `webhookUrl`). Isso permite ter um sistema centralizado de monitoramento junto com integrações específicas por instância.
</Note>

## Tipos de Eventos

Ao configurar o webhook, você pode se inscrever nos seguintes tipos de eventos:

| Tipo de Evento  | Descrição                               | Eventos Incluídos                                               |
| --------------- | --------------------------------------- | --------------------------------------------------------------- |
| `ALL`           | Recebe todos os eventos disponíveis     | Todos abaixo                                                    |
| `MESSAGE`       | Mensagens recebidas                     | `Message`                                                       |
| `SEND_MESSAGE`  | Mensagens enviadas                      | `SendMessage`                                                   |
| `READ_RECEIPT`  | Confirmações de leitura                 | `Receipt` (Read, ReadSelf, Delivered)                           |
| `PRESENCE`      | Status de presença online/offline       | `Presence`                                                      |
| `HISTORY_SYNC`  | Sincronização de histórico              | `HistorySync`                                                   |
| `CHAT_PRESENCE` | Presença em chats (digitando, gravando) | `ChatPresence`, `Archive`                                       |
| `CALL`          | Eventos de chamada                      | `CallOffer`, `CallRelayLatency`, `CallTerminate`                |
| `CONNECTION`    | Status de conexão                       | `Connected`, `PairSuccess`, `LoggedOut`, `OfflineSyncCompleted` |
| `LABEL`         | Gerenciamento de etiquetas              | `LabelEdit`, `LabelAssociationChat`, `LabelAssociationMessage`  |
| `CONTACT`       | Atualizações de contatos                | `Contact`, `PushName`                                           |
| `GROUP`         | Eventos de grupos                       | `GroupInfo`, `JoinedGroup`                                      |
| `NEWSLETTER`    | Eventos de canais/newsletters           | `NewsletterJoin`, `NewsletterLeave`                             |
| `QRCODE`        | Eventos de QR Code                      | `QRCode`, `QRTimeout`, `QRSuccess`                              |

<Tip>
  Use `"ALL"` na lista de `subscribe` para receber todos os eventos sem precisar listar cada um individualmente.
</Tip>

## Estrutura do Payload

Todos os webhooks são enviados como requisições `HTTP POST` com `Content-Type: application/json`. A estrutura base do payload é:

```json theme={null}
{
  "event": "NomeDoEvento",
  "data": { ... },
  "instanceId": "uuid-da-instancia",
  "instanceToken": "token_da_instancia"
}
```

| Campo         | Tipo   | Descrição                                      |
| ------------- | ------ | ---------------------------------------------- |
| event         | string | Nome do evento que ocorreu                     |
| data          | object | Dados específicos do evento (varia por evento) |
| instanceId    | string | UUID da instância                              |
| instanceToken | string | Token de autenticação da instância             |

***

## Payloads por Evento

### QRCode

Emitido quando um novo QR Code é gerado para pareamento.

```json theme={null}
{
  "event": "QRCode",
  "data": {
    "code": "2@DoOPPlssTlSoDDdtPFXDXNp24ImY0bxwSivPLNbNLtCgXOYGFnsCN1Y64QYQB/r5tAmNqt0zhaf3TyOydXGZYGnKqB3UNTPDx1M=,...",
    "qrcode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEA..."
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo       | Tipo   | Descrição                         |
| ----------- | ------ | --------------------------------- |
| data.code   | string | Código do QR Code para pareamento |
| data.qrcode | string | Imagem do QR Code em base64 (PNG) |

***

### PairSuccess

Emitido quando o pareamento do dispositivo é concluído com sucesso.

```json theme={null}
{
  "event": "PairSuccess",
  "data": {
    "BusinessName": "",
    "ID": "5511918798714:5@s.whatsapp.net",
    "Platform": "android",
    "jid": "5511918798714:5@s.whatsapp.net",
    "pushName": "",
    "status": "open"
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo             | Tipo   | Descrição                                    |
| ----------------- | ------ | -------------------------------------------- |
| data.BusinessName | string | Nome da empresa (para contas Business)       |
| data.ID           | string | JID completo do dispositivo pareado          |
| data.Platform     | string | Plataforma do dispositivo (`android`, `ios`) |
| data.jid          | string | JID do WhatsApp                              |
| data.pushName     | string | Nome de exibição do perfil                   |
| data.status       | string | Status da conexão (`open`)                   |

***

### Message

Emitido quando uma mensagem é recebida. O payload varia conforme o tipo de mensagem. Todos os eventos de mensagem compartilham a mesma estrutura base em `data`, com o objeto `Info` contendo metadados e `Message` contendo o conteúdo.

#### Campos comuns do objeto `Info`

| Campo             | Tipo    | Descrição                                               |
| ----------------- | ------- | ------------------------------------------------------- |
| Info.Chat         | string  | JID do chat (individual ou grupo)                       |
| Info.Sender       | string  | JID do remetente                                        |
| Info.SenderAlt    | string  | JID alternativo do remetente (LID)                      |
| Info.IsFromMe     | boolean | `true` se a mensagem foi enviada pela própria instância |
| Info.IsGroup      | boolean | `true` se a mensagem é de um grupo                      |
| Info.ID           | string  | ID único da mensagem                                    |
| Info.Type         | string  | Tipo da mensagem (`text`, `media`, etc.)                |
| Info.PushName     | string  | Nome de exibição do remetente                           |
| Info.Timestamp    | string  | Data/hora da mensagem (ISO 8601)                        |
| Info.MediaType    | string  | Tipo de mídia (`image`, `video`, `audio`, `document`)   |
| Info.VerifiedName | object  | Informações do nome verificado (contas Business)        |

#### Campos comuns adicionais

| Campo                 | Tipo    | Descrição                                  |
| --------------------- | ------- | ------------------------------------------ |
| IsEphemeral           | boolean | Mensagem temporária                        |
| IsViewOnce            | boolean | Mensagem que pode ser vista apenas uma vez |
| IsViewOnceV2          | boolean | Mensagem view once v2                      |
| IsViewOnceV2Extension | boolean | Extensão view once v2                      |
| IsDocumentWithCaption | boolean | Documento com legenda                      |
| IsLottieSticker       | boolean | Sticker animado Lottie                     |
| IsEdit                | boolean | Mensagem editada                           |

#### Text

```json theme={null}
{
  "event": "Message",
  "data": {
    "Info": {
      "Chat": "557499879409@s.whatsapp.net",
      "Sender": "557499879409:38@s.whatsapp.net",
      "SenderAlt": "123234343434@lid",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0C05FF2D3A0068B2A2D",
      "Type": "text",
      "PushName": "Davidson Gomes",
      "Timestamp": "2024-10-10T17:17:44-03:00",
      "MediaType": "",
      "VerifiedName": {
        "Certificate": {
          "details": "CJOzjf3Oh/LGQBIGc21iOndhIg5EYXZpZHNvbiBHb21lcw==",
          "signature": "KjXTl5LfeToLO6bFflbHyiBQe7a1zly4Wdhhf2XPU1Lq8tj9p03hvYUjbs+M0ChWBQhjy/NBq7+nYCKQlLP3Bw=="
        },
        "Details": {
          "serial": 4651594154187643283,
          "issuer": "smb:wa",
          "verifiedName": "Davidson Gomes"
        }
      }
    },
    "Message": {
      "conversation": "oi",
      "messageContextInfo": {
        "deviceListMetadata": {
          "senderKeyHash": "jS2BFebH+KJxzA==",
          "senderTimestamp": 1728407293
        },
        "deviceListMetadataVersion": 2
      }
    },
    "IsEphemeral": false,
    "IsViewOnce": false,
    "IsEdit": false
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

#### Image

Quando `WEBHOOK_FILES=true` (padrão), o campo `base64` contém a imagem codificada. Caso contrário, `mediaUrl` apontará para o armazenamento MinIO/S3.

```json theme={null}
{
  "event": "Message",
  "data": {
    "Info": {
      "Chat": "557499879409@s.whatsapp.net",
      "Sender": "557499879409:45@s.whatsapp.net",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0546D154AB4C90A11E1",
      "Type": "media",
      "PushName": "Davidson Gomes",
      "Timestamp": "2024-10-23T09:15:41-03:00",
      "MediaType": "image"
    },
    "Message": {
      "imageMessage": {
        "url": "https://mmg.whatsapp.net/v/...",
        "mimetype": "image/jpeg",
        "fileSha256": "...",
        "fileLength": 82247,
        "height": 1600,
        "width": 1200,
        "mediaKey": "...",
        "fileEncSha256": "...",
        "directPath": "/v/...",
        "mediaKeyTimestamp": 1729685741,
        "scansSidecar": "...",
        "scanLengths": [20898],
        "midQualityFileSha256": "..."
      },
      "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD/..."
    },
    "IsEphemeral": false,
    "IsViewOnce": false,
    "IsEdit": false
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

#### Video

```json theme={null}
{
  "event": "Message",
  "data": {
    "Info": {
      "Chat": "557499879409@s.whatsapp.net",
      "Sender": "557499879409:45@s.whatsapp.net",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0A1B2C3D4E5F6071234",
      "Type": "media",
      "PushName": "Davidson Gomes",
      "Timestamp": "2024-10-23T09:20:00-03:00",
      "MediaType": "video"
    },
    "Message": {
      "videoMessage": {
        "url": "https://mmg.whatsapp.net/v/...",
        "mimetype": "video/mp4",
        "fileSha256": "...",
        "fileLength": 1048576,
        "seconds": 15,
        "mediaKey": "...",
        "fileEncSha256": "...",
        "directPath": "/v/...",
        "mediaKeyTimestamp": 1729685741
      },
      "base64": "AAAAIGZ0eXBpc29tAAACAGlzb21pc28y..."
    },
    "IsEphemeral": false,
    "IsViewOnce": false,
    "IsEdit": false
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

#### Audio

```json theme={null}
{
  "event": "Message",
  "data": {
    "Info": {
      "Chat": "557499879409@s.whatsapp.net",
      "Sender": "557499879409:45@s.whatsapp.net",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0F1E2D3C4B5A6091234",
      "Type": "media",
      "PushName": "Davidson Gomes",
      "Timestamp": "2024-10-23T09:25:00-03:00",
      "MediaType": "audio"
    },
    "Message": {
      "audioMessage": {
        "url": "https://mmg.whatsapp.net/v/...",
        "mimetype": "audio/ogg; codecs=opus",
        "fileSha256": "...",
        "fileLength": 25600,
        "seconds": 5,
        "ptt": true,
        "mediaKey": "...",
        "fileEncSha256": "...",
        "directPath": "/v/...",
        "mediaKeyTimestamp": 1729685741,
        "waveform": "AAAAAAAAAAAAAAAA..."
      },
      "base64": "T2dnUwACAAAAAAAAAAA..."
    },
    "IsEphemeral": false,
    "IsViewOnce": false,
    "IsEdit": false
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

#### Document

```json theme={null}
{
  "event": "Message",
  "data": {
    "Info": {
      "Chat": "557499879409@s.whatsapp.net",
      "Sender": "557499879409:45@s.whatsapp.net",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0D1C2B3A4E5F6071234",
      "Type": "media",
      "PushName": "Davidson Gomes",
      "Timestamp": "2024-10-23T09:30:00-03:00",
      "MediaType": "document"
    },
    "Message": {
      "documentMessage": {
        "url": "https://mmg.whatsapp.net/v/...",
        "mimetype": "application/pdf",
        "title": "documento.pdf",
        "fileSha256": "...",
        "fileLength": 512000,
        "fileName": "documento.pdf",
        "mediaKey": "...",
        "fileEncSha256": "...",
        "directPath": "/v/...",
        "mediaKeyTimestamp": 1729685741
      },
      "base64": "JVBERi0xLjQKJeLj..."
    },
    "IsDocumentWithCaption": false,
    "IsEphemeral": false,
    "IsViewOnce": false,
    "IsEdit": false
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

<Note>
  Quando `WEBHOOK_FILES=true` (padrão), mensagens com mídia incluem o conteúdo do arquivo como `base64` dentro do objeto `Message`. Se o MinIO/S3 estiver configurado, o campo `mediaUrl` será adicionado em vez do `base64`.
</Note>

***

### Receipt

Emitido para confirmações de leitura e entrega. O campo `state` no nível raiz indica o tipo: `Read`, `ReadSelf` ou `Delivered`.

```json theme={null}
{
  "event": "Receipt",
  "state": "Read",
  "data": {
    "Chat": "557499879409@s.whatsapp.net",
    "Sender": "5511918798714:5@s.whatsapp.net",
    "IsFromMe": false,
    "IsGroup": false,
    "MessageIDs": ["3EB0C05FF2D3A0068B2A2D"],
    "Timestamp": "2024-10-10T17:18:00-03:00",
    "Type": "read"
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo           | Tipo      | Descrição                                            |
| --------------- | --------- | ---------------------------------------------------- |
| state           | string    | Tipo de confirmação: `Read`, `ReadSelf`, `Delivered` |
| data.Chat       | string    | JID do chat                                          |
| data.Sender     | string    | JID do remetente                                     |
| data.MessageIDs | string\[] | Lista de IDs das mensagens confirmadas               |
| data.Timestamp  | string    | Data/hora da confirmação (ISO 8601)                  |

***

### Connected

Emitido quando a instância se conecta ao WhatsApp com sucesso.

```json theme={null}
{
  "event": "Connected",
  "data": {
    "status": "open",
    "jid": "5511918798714:5@s.whatsapp.net",
    "pushName": "Davidson Gomes"
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

***

### LoggedOut

Emitido quando a instância é desconectada do WhatsApp.

```json theme={null}
{
  "event": "LoggedOut",
  "data": {
    "Reason": "logged_out"
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

***

### OfflineSyncCompleted

Emitido quando a sincronização offline de mensagens é concluída após a reconexão.

```json theme={null}
{
  "event": "OfflineSyncCompleted",
  "data": {
    "Count": 42
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo      | Tipo | Descrição                                 |
| ---------- | ---- | ----------------------------------------- |
| data.Count | int  | Número de mensagens sincronizadas offline |

***

### CallOffer

Emitido quando uma chamada é recebida.

```json theme={null}
{
  "event": "CallOffer",
  "data": {
    "From": "557499879409@s.whatsapp.net",
    "Timestamp": "2024-10-10T17:20:00-03:00",
    "CallCreator": "557499879409@s.whatsapp.net",
    "CallID": "A1B2C3D4E5F6",
    "RemotePlatform": "android",
    "RemoteVersion": "2.24.10.12"
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo               | Tipo   | Descrição                                 |
| ------------------- | ------ | ----------------------------------------- |
| data.From           | string | JID de quem está ligando                  |
| data.Timestamp      | string | Data/hora da chamada (ISO 8601)           |
| data.CallCreator    | string | JID do criador da chamada                 |
| data.CallID         | string | ID único da chamada                       |
| data.RemotePlatform | string | Plataforma do chamador (`android`, `ios`) |
| data.RemoteVersion  | string | Versão do WhatsApp do chamador            |

***

### CallRelayLatency

Emitido com informações de latência durante uma chamada em andamento.

```json theme={null}
{
  "event": "CallRelayLatency",
  "data": {
    "From": "557499879409@s.whatsapp.net",
    "Timestamp": "2024-10-10T17:20:05-03:00",
    "CallCreator": "557499879409@s.whatsapp.net",
    "CallID": "A1B2C3D4E5F6"
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

***

### CallTerminate

Emitido quando uma chamada é encerrada.

```json theme={null}
{
  "event": "CallTerminate",
  "data": {
    "From": "557499879409@s.whatsapp.net",
    "Timestamp": "2024-10-10T17:21:00-03:00",
    "CallCreator": "557499879409@s.whatsapp.net",
    "CallID": "A1B2C3D4E5F6",
    "Reason": "busy"
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo       | Tipo   | Descrição                                        |
| ----------- | ------ | ------------------------------------------------ |
| data.Reason | string | Motivo do encerramento (`busy`, `timeout`, etc.) |

***

### JoinedGroup

Emitido quando a instância entra em um grupo.

```json theme={null}
{
  "event": "JoinedGroup",
  "data": {
    "Reason": "invite",
    "JID": "120363012345678901@g.us",
    "GroupName": {
      "Name": "Equipe Evolution",
      "NameSetAt": "2024-10-01T10:00:00-03:00"
    },
    "GroupCreated": "2024-10-01T10:00:00-03:00",
    "Participants": [
      {
        "JID": "5511918798714@s.whatsapp.net",
        "IsAdmin": true,
        "IsSuperAdmin": true
      }
    ]
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo             | Tipo   | Descrição                          |
| ----------------- | ------ | ---------------------------------- |
| data.Reason       | string | Motivo da entrada (`invite`, etc.) |
| data.JID          | string | JID do grupo                       |
| data.GroupName    | object | Informações do nome do grupo       |
| data.Participants | array  | Lista de participantes com roles   |

***

### GroupInfo

Emitido quando informações de um grupo são atualizadas (nome, descrição, participantes, etc.).

```json theme={null}
{
  "event": "GroupInfo",
  "data": {
    "JID": "120363012345678901@g.us",
    "Sender": "557499879409@s.whatsapp.net",
    "Timestamp": "2024-10-10T17:25:00-03:00",
    "Name": {
      "Name": "Equipe Evolution - Novo Nome",
      "NameSetAt": "2024-10-10T17:25:00-03:00",
      "NameSetBy": "557499879409@s.whatsapp.net"
    },
    "Join": [],
    "Leave": [],
    "Promote": [],
    "Demote": []
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}
```

| Campo          | Tipo   | Descrição                              |
| -------------- | ------ | -------------------------------------- |
| data.JID       | string | JID do grupo                           |
| data.Sender    | string | JID de quem fez a alteração            |
| data.Timestamp | string | Data/hora da alteração (ISO 8601)      |
| data.Name      | object | Novo nome do grupo (se alterado)       |
| data.Topic     | object | Nova descrição do grupo (se alterada)  |
| data.Join      | array  | JIDs de usuários que entraram no grupo |
| data.Leave     | array  | JIDs de usuários que saíram do grupo   |
| data.Promote   | array  | JIDs de usuários promovidos a admin    |
| data.Demote    | array  | JIDs de usuários rebaixados de admin   |

***

### NewsletterJoin

Emitido quando a instância entra em um canal/newsletter.

```json theme={null}
{
  "event": "NewsletterJoin",
  "data": {
    "id": "120363123456789012@newsletter",
    "state": {
      "type": "ACTIVE"
    },
    "thread_metadata": {
      "creation_time": "1696118400",
      "invite": "ABC123DEF456",
      "name": {
        "text": "Evolution Go News",
        "id": "1234567890"
      },
      "description": {
        "text": "Canal oficial do Evolution Go"
      },
      "subscribers_count": 1500,
      "verification": "VERIFIED",
      "picture": {
        "url": "https://pps.whatsapp.net/v/..."
      }
    },
    "viewer_metadata": {
      "mute": "OFF",
      "role": "SUBSCRIBER"
    }
  },
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1062"
}

---

## Política de Retentativas

O Evolution Go possui um sistema automático de retentativas para garantir a entrega dos webhooks:

| Configuração               | Valor              |
| -------------------------- | ------------------ |
| Máximo de tentativas       | **5**              |
| Intervalo entre tentativas | **30 segundos**    |
| Método HTTP                | `POST`             |
| Content-Type               | `application/json` |
| Resposta esperada          | Status HTTP `2xx`  |

Se todas as 5 tentativas falharem, o evento é descartado e um log de erro é registrado.

<Warning>
Certifique-se de que seu endpoint de webhook responda com status HTTP `2xx` (200-299) para confirmar o recebimento. Qualquer resposta fora dessa faixa será tratada como falha e acionará uma nova tentativa.
</Warning>

## Canais de Entrega Alternativos

Além de webhooks HTTP, o Evolution Go suporta outros canais de entrega de eventos:

<CardGroup cols={2}>
  <Card title="RabbitMQ / AMQP" icon="rabbit">
    Envio via filas AMQP. Configure com `rabbitmqEnable: "enabled"` na conexão da instância e as variáveis `AMQP_URL`, `AMQP_GLOBAL_ENABLED` e `AMQP_GLOBAL_EVENTS`.
  </Card>
  <Card title="NATS" icon="bolt">
    Envio via NATS messaging. Configure com `natsEnable: "enabled"` na conexão e as variáveis `NATS_URL`, `NATS_GLOBAL_ENABLED` e `NATS_GLOBAL_EVENTS`.
  </Card>
  <Card title="WebSocket" icon="plug">
    Receba eventos em tempo real via WebSocket. Configure com `websocketEnable: "enabled"` na conexão da instância.
  </Card>
</CardGroup>

<Note>
Múltiplos canais podem ser ativados simultaneamente. Por exemplo, você pode receber eventos via webhook HTTP **e** RabbitMQ ao mesmo tempo.
</Note>

## Variáveis de Ambiente

Todas as variáveis de ambiente relacionadas a eventos e webhooks:

| Variável                | Descrição                                              | Padrão  |
| ----------------------- | ------------------------------------------------------ | ------- |
| `WEBHOOK_URL`           | URL do webhook global                                  | -       |
| `WEBHOOK_FILES`         | Incluir arquivos de mídia nos payloads                 | `true`  |
| `AMQP_URL`              | URL de conexão do RabbitMQ                             | -       |
| `AMQP_GLOBAL_ENABLED`   | Ativar filas globais RabbitMQ                          | `false` |
| `AMQP_GLOBAL_EVENTS`    | Eventos para filas globais (separados por vírgula)     | -       |
| `AMQP_SPECIFIC_EVENTS`  | Eventos para filas específicas (separados por vírgula) | -       |
| `NATS_URL`              | URL de conexão do NATS                                 | -       |
| `NATS_GLOBAL_ENABLED`   | Ativar NATS global                                     | `false` |
| `NATS_GLOBAL_EVENTS`    | Eventos para NATS global (separados por vírgula)       | -       |
| `EVENT_IGNORE_GROUP`    | Ignorar eventos de grupos                              | `false` |
| `EVENT_IGNORE_STATUS`   | Ignorar eventos de status/stories                      | `false` |
```
