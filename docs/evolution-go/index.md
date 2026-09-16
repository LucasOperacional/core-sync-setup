> ## Documentation Index
> Fetch the complete documentation index at: https://docs.evolutionfoundation.com.br/llms.txt
> Use this file to discover all available pages before exploring further.

# Evolution Go

> API WhatsApp de alta performance escrita em Go

O **Evolution Go** é uma implementação de alta performance da API WhatsApp, escrita em Go. Construído com a biblioteca padrão do Go e práticas modernas de desenvolvimento, oferece uma solução robusta e eficiente para integração com WhatsApp utilizando a biblioteca <a href="https://github.com/tulir/whatsmeow" target="_blank">whatsmeow</a>.

## Principais recursos

* **Alta Performance** — Construído em Go para máxima performance e uso mínimo de recursos
* **API RESTful** — Endpoints REST bem documentados e fáceis de usar
* **Eventos em tempo real** — Suporte a WebSocket para recebimento de mensagens em tempo real
* **Armazenamento de mensagens** — Integração opcional com PostgreSQL para persistência
* **Suporte a mídia** — Envio e recebimento de imagens, vídeos, áudios e documentos
* **QR Code** — Geração de QR Code para pareamento de dispositivos
* **Docker** — Configuração Docker pronta para uso
* **Documentação Swagger** — Documentação interativa auto-gerada
* **Sistema de eventos** — Suporte a webhooks, AMQP (RabbitMQ), NATS e WebSocket

## Stack tecnológica

| Tecnologia                                                                 | Uso                                |
| -------------------------------------------------------------------------- | ---------------------------------- |
| Go 1.24+                                                                   | Linguagem principal                |
| `net/http` + ServeMux                                                      | Framework HTTP (biblioteca padrão) |
| <a href="https://github.com/tulir/whatsmeow" target="_blank">whatsmeow</a> | Biblioteca WhatsApp Web            |
| PostgreSQL                                                                 | Banco de dados (opcional)          |
| Swagger/OpenAPI                                                            | Documentação da API                |
| Docker                                                                     | Containerização                    |
| RabbitMQ/AMQP                                                              | Fila de mensagens                  |
| MinIO/S3                                                                   | Armazenamento de mídia             |

## Seções

<CardGroup cols={3}>
  <Card title="Instalação" icon="download" href="/evolution-go/installation">
    Guia passo a passo para instalar e configurar o Evolution Go
  </Card>

  <Card title="Primeiros Passos" icon="rocket" href="/evolution-go/getting-started">
    Ative sua licença, faça login e crie sua primeira instância WhatsApp
  </Card>

  <Card title="Webhooks" icon="webhook" href="/evolution-go/webhooks">
    Configure webhooks para receber eventos em tempo real do WhatsApp
  </Card>

  <Card title="Referência API" icon="square-terminal" href="/evolution-go/get-all-instances">
    Documentação técnica completa de todos os endpoints
  </Card>
</CardGroup>
