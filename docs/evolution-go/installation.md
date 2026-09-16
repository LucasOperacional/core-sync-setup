> ## Documentation Index
> Fetch the complete documentation index at: https://docs.evolutionfoundation.com.br/llms.txt
> Use this file to discover all available pages before exploring further.

# Instalação do Evolution Go

> Guia passo a passo para instalar e configurar o Evolution Go

Este guia irá ajudá-lo a instalar e configurar o **Evolution Go**, nossa API WhatsApp de alta performance escrita em Go.

## Pré-requisitos

Antes de iniciar, certifique-se de ter os seguintes requisitos atendidos:

* <a href="https://docs.docker.com/get-docker/" target="_blank">Docker</a> 20.10 ou superior
* <a href="https://docs.docker.com/compose/install/" target="_blank">Docker Compose</a> v2.x (opcional)
* Mínimo de **512MB de RAM** disponível

***

## Instalação com Docker

A forma mais rápida de começar a usar o Evolution Go.

### Passo 1: Clone o repositório

```bash theme={null}
git clone https://git.evoai.app/Evolution/evolution-go.git
cd evolution-go
```

### Passo 2: Configure as variáveis de ambiente

```bash theme={null}
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env theme={null}
# Porta do servidor
SERVER_PORT=8080

# Nome do cliente
CLIENT_NAME=evolution

# Chave de API global (altere para uma chave segura!)
GLOBAL_API_KEY=sua-chave-secura-aqui

# Banco de dados (PostgreSQL)
POSTGRES_AUTH_DB=postgresql://postgres:password@postgres:5432/evogo_auth?sslmode=disable
POSTGRES_USERS_DB=postgresql://postgres:password@postgres:5432/evogo_users?sslmode=disable
DATABASE_SAVE_MESSAGES=false

# Logs
WADEBUG=INFO
LOGTYPE=console
```

<Warning>
  Nunca utilize a chave de API padrão do `.env.example` em produção. Gere uma chave segura e única.
</Warning>

### Passo 3: Build e execução

```bash theme={null}
# Build da imagem Docker
make docker-build

# Executar o container
make docker-run
```

O serviço estará disponível em `http://localhost:8080`.

### Alternativa: Docker Compose

Você também pode usar um `docker-compose.yml` para subir o Evolution Go junto com o PostgreSQL:

```yaml theme={null}
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  evolution-go:
    image: evoapicloud/evolution-go:latest
    ports:
      - "8080:8080"
    environment:
      SERVER_PORT: 8080
      CLIENT_NAME: evolution
      GLOBAL_API_KEY: sua-chave-segura-aqui
      POSTGRES_AUTH_DB: postgresql://postgres:password@postgres:5432/evogo_auth?sslmode=disable
      POSTGRES_USERS_DB: postgresql://postgres:password@postgres:5432/evogo_users?sslmode=disable
      DATABASE_SAVE_MESSAGES: "false"
      WADEBUG: INFO
      LOGTYPE: console
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

Execute com:

```bash theme={null}
docker compose up -d
```

***

## Verificando a instalação

Após iniciar o serviço, verifique se está funcionando corretamente:

### Teste de saúde

```bash theme={null}
curl http://localhost:8080/
```

### Acesse a documentação Swagger

Abra no navegador:

```
http://localhost:8080/swagger/index.html
```

### Crie sua primeira instância WhatsApp

```bash theme={null}
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: sua-chave-segura-aqui" \
  -d '{
    "instanceName": "minha-instancia",
    "integration": "WHATSAPP-BAILEYS"
  }'
```

### Obtenha o QR Code para conectar

```bash theme={null}
curl http://localhost:8080/instance/minha-instancia/qrcode \
  -H "apikey: sua-chave-segura-aqui"
```

Escaneie o QR Code com o WhatsApp do seu celular para conectar a instância.

***

## Variáveis de ambiente

Tabela completa das variáveis de configuração disponíveis:

| Variável                 | Descrição                                                   | Padrão            |
| ------------------------ | ----------------------------------------------------------- | ----------------- |
| `SERVER_PORT`            | Porta do servidor HTTP                                      | `8080`            |
| `CLIENT_NAME`            | Identificador do cliente                                    | `evolution`       |
| `GLOBAL_API_KEY`         | Chave de autenticação da API                                | **Obrigatório**   |
| `POSTGRES_AUTH_DB`       | String de conexão do banco de autenticação                  | -                 |
| `POSTGRES_USERS_DB`      | String de conexão do banco de usuários                      | -                 |
| `DATABASE_SAVE_MESSAGES` | Habilitar persistência de mensagens                         | `false`           |
| `WADEBUG`                | Nível de log do WhatsApp (`DEBUG`, `INFO`, `WARN`, `ERROR`) | `INFO`            |
| `LOGTYPE`                | Tipo de saída de log (`console`, `json`)                    | `console`         |
| `CONNECT_ON_STARTUP`     | Reconectar instâncias ao iniciar                            | `true`            |
| `WEBHOOKFILES`           | Incluir arquivos nos webhooks                               | `true`            |
| `WEBHOOK_URL`            | URL para receber webhooks                                   | -                 |
| `AMQP_URL`               | URL de conexão do RabbitMQ                                  | -                 |
| `AMQP_GLOBAL_ENABLED`    | Habilitar RabbitMQ globalmente                              | `false`           |
| `MINIO_ENABLED`          | Habilitar armazenamento MinIO/S3                            | `false`           |
| `MINIO_ENDPOINT`         | Endpoint do MinIO                                           | -                 |
| `MINIO_ACCESS_KEY`       | Chave de acesso do MinIO                                    | -                 |
| `MINIO_SECRET_KEY`       | Chave secreta do MinIO                                      | -                 |
| `MINIO_BUCKET`           | Nome do bucket do MinIO                                     | `evolution-media` |
| `MINIO_USE_SSL`          | Usar SSL na conexão MinIO                                   | `false`           |

***

## Comandos úteis (Docker)

```bash theme={null}
# Build da imagem Docker
make docker-build

# Executar container Docker
make docker-run
```

***

## Próximos passos

Após a instalação, você pode:

* Consultar a [Referência API](/evolution-go/get-all-instances) para conhecer todos os endpoints disponíveis
* Configurar [webhooks](/evolution-go/getting-started) para receber notificações em tempo real
* Integrar com [RabbitMQ](/evolution-go/getting-started) para processamento assíncrono de mensagens
