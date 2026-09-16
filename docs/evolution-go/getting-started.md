> ## Documentation Index
> Fetch the complete documentation index at: https://docs.evolutionfoundation.com.br/llms.txt
> Use this file to discover all available pages before exploring further.

# Configuração Inicial

> Como ativar sua licença, fazer login e criar sua primeira instância no Evolution Go

Após a [instalação](/evolution-go/installation), siga este guia para ativar sua licença, acessar o painel de gerenciamento e criar sua primeira instância WhatsApp no Evolution Go.

***

## Passo 1: Ativar a licença Evolution

Antes de usar o Evolution Go, é necessário ativar sua licença. Ao acessar o sistema pela primeira vez, você será redirecionado para a tela de ativação.

<img src="https://mintcdn.com/evoai-683d737d/dazEX4iJEgjDMOO6/evolution-go/images/01-login.png?fit=max&auto=format&n=dazEX4iJEgjDMOO6&q=85&s=46a6a87a90548a43a9c5d9fc00c144b4" alt="Tela de ativação da licença Evolution Go" width="3586" height="1974" data-path="evolution-go/images/01-login.png" />

### Como ativar

1. Acesse a URL do seu Evolution Go no navegador (ex: `http://localhost:8080` ou o domínio do seu servidor)
2. Na tela de ativação, você verá o formulário **"Ative sua licença Evolution"**
3. Preencha os campos:
   * **Nome Completo** — Seu nome completo para registro
   * **Email** — Seu email para receber o Magic Link de ativação
4. Clique em **"Enviar Magic Link"**
5. Verifique sua caixa de entrada e clique no link recebido para ativar

<Tip>
  Você também pode ativar usando uma conta social: **Continuar com Google** ou **Continuar com GitHub**. Isso agiliza o processo e vincula sua licença automaticamente.
</Tip>

<Note>
  A licença é vinculada ao seu email. Guarde esse email, pois será necessário para futuras ativações ou migrações de servidor.
</Note>

***

## Passo 2: Login no painel

Após ativar a licença, você será direcionado para a tela de login do Evolution Go.

<img src="https://mintcdn.com/evoai-683d737d/dazEX4iJEgjDMOO6/evolution-go/images/02-ativar-licenca.png?fit=max&auto=format&n=dazEX4iJEgjDMOO6&q=85&s=d083bcf9d3b9705c0c62c9509d413fb8" alt="Tela de login do Evolution Go" width="3326" height="1844" data-path="evolution-go/images/02-ativar-licenca.png" />

### Como fazer login

1. No campo **"URL da API Evolution GO"**, insira a URL da sua instância:
   * Para instalação local: `http://localhost:8080`
   * Para servidor remoto: `https://seu-dominio.com` (ou o IP do servidor com a porta)
2. No campo **"API Key (GLOBAL\_API\_KEY)"**, insira a chave de API que você configurou no arquivo `.env` durante a instalação

<Warning>
  A API Key é o valor da variável `GLOBAL_API_KEY` configurada no arquivo `.env` do Evolution Go. Se você não alterou, ela é a chave padrão definida no `.env.example` — **nunca use a chave padrão em produção**.
</Warning>

### Onde encontrar a API Key

A API Key está no arquivo `.env` na raiz do seu projeto Evolution Go:

```env theme={null}
# Chave de API global
GLOBAL_API_KEY=sua-chave-segura-aqui
```

Se estiver usando Docker Compose, ela está no `docker-compose.yml`:

```yaml theme={null}
environment:
  GLOBAL_API_KEY: sua-chave-segura-aqui
```

Após preencher os campos, clique em **"Entrar"** para acessar o painel.

***

## Passo 3: Dashboard

Após o login, você será direcionado para o **Dashboard** do Evolution Go.

<img src="https://mintcdn.com/evoai-683d737d/dazEX4iJEgjDMOO6/evolution-go/images/03-dashboard.png?fit=max&auto=format&n=dazEX4iJEgjDMOO6&q=85&s=f86727579010c6cbb0d55d5c17cd8fe9" alt="Dashboard principal do Evolution Go" width="3600" height="1972" data-path="evolution-go/images/03-dashboard.png" />

O painel possui uma barra lateral com duas seções principais:

* **Dashboard** — Visão geral do sistema (métricas e status serão implementados aqui)
* **Instâncias** — Gerenciamento das suas instâncias WhatsApp

No canto superior direito você encontra:

* **Alternador de tema** (claro/escuro)
* **Botão "Sair"** para fazer logout

***

## Passo 4: Criar sua primeira instância

Navegue até a seção **Instâncias** na barra lateral para gerenciar suas conexões WhatsApp.

<img src="https://mintcdn.com/evoai-683d737d/dazEX4iJEgjDMOO6/evolution-go/images/04-instancias-vazia.png?fit=max&auto=format&n=dazEX4iJEgjDMOO6&q=85&s=0e5550bb7d78d4116afe00a92e3bfcb6" alt="Tela de instâncias sem nenhuma instância criada" width="3600" height="1966" data-path="evolution-go/images/04-instancias-vazia.png" />

Na tela de instâncias você verá:

* Um campo de **busca** para filtrar instâncias
* O botão **"+ Nova Instância"** no canto superior direito
* Uma mensagem indicando que nenhuma instância foi encontrada

### Criando a instância

Clique em **"+ Nova Instância"** para abrir o formulário de criação:

<img src="https://mintcdn.com/evoai-683d737d/dazEX4iJEgjDMOO6/evolution-go/images/05-nova-instancia.png?fit=max&auto=format&n=dazEX4iJEgjDMOO6&q=85&s=83cb5759b07c5da59f231f3387d6e5ee" alt="Modal de criação de nova instância WhatsApp" width="1042" height="928" data-path="evolution-go/images/05-nova-instancia.png" />

Preencha os campos:

| Campo                                | Obrigatório | Descrição                                                                                                        |
| ------------------------------------ | :---------: | ---------------------------------------------------------------------------------------------------------------- |
| **Nome da Instância**                |      ✅      | Nome identificador da sua instância. Use apenas letras, números, hífen (`-`) e underscore (`_`)                  |
| **Token (Opcional)**                 |      ❌      | Token personalizado (UUID) para autenticação da instância. Se não informado, será gerado um UUID automaticamente |
| **Configuração de Proxy (Opcional)** |      ❌      | Configurações de proxy para a conexão WhatsApp, caso necessário                                                  |

Clique em **"+ Criar Instância"** para finalizar.

***

## Passo 5: Conectar ao WhatsApp

Após criar a instância, ela aparecerá na lista com o status **"Desconectado"** (em vermelho).

<img src="https://mintcdn.com/evoai-683d737d/dazEX4iJEgjDMOO6/evolution-go/images/06-instancia-criada.png?fit=max&auto=format&n=dazEX4iJEgjDMOO6&q=85&s=d7f80ab01908cdfadcd4073def3c843f" alt="Instância criada com status Desconectado" width="1398" height="938" data-path="evolution-go/images/06-instancia-criada.png" />

Cada instância exibe:

* **Nome** e identificador da instância
* **Status** atual (`close` = desconectado)
* Botões de ação:
  * **Conectar** (ícone de power, verde) — Inicia a conexão com o WhatsApp
  * **Configurações** (ícone de engrenagem) — Abre as configurações da instância
  * **Excluir** (ícone de lixeira, vermelho) — Remove a instância

### Configurar conexão

Clique no botão **"Conectar"** ou no ícone de **engrenagem** para abrir o modal de configuração da conexão:

<img src="https://mintcdn.com/evoai-683d737d/dazEX4iJEgjDMOO6/evolution-go/images/07-configurar-conexao.png?fit=max&auto=format&n=dazEX4iJEgjDMOO6&q=85&s=803d1c2e5574fef8c690f82aec814521" alt="Modal de configuração de conexão e webhook" width="1436" height="1602" data-path="evolution-go/images/07-configurar-conexao.png" />

Neste modal você pode configurar:

#### Webhook URL (opcional)

Insira a URL que receberá os eventos da instância. Exemplo:

```
https://webhook.site/4d438e6a-7203-4102-8dbc-987addc73b53
```

<Tip>
  Use o <a href="https://webhook.site" target="_blank">webhook.site</a> para testes rápidos. Em produção, aponte para o endpoint do seu servidor que processará os eventos.
</Tip>

#### Eventos para Webhook

Selecione quais eventos serão enviados para a URL do webhook:

* **ALL** — Seleciona todos os eventos (recomendado para começar)
* Ou escolha eventos individuais:

| Evento          | Descrição                                           |
| --------------- | --------------------------------------------------- |
| `MESSAGE`       | Mensagens enviadas e recebidas                      |
| `PRESENCE`      | Status de presença (online/offline)                 |
| `CHAT_PRESENCE` | Presença em chats específicos (digitando, gravando) |
| `CONNECTION`    | Mudanças no status da conexão                       |
| `READ_RECEIPT`  | Confirmações de leitura                             |
| `HISTORY_SYNC`  | Sincronização do histórico de mensagens             |
| `CALL`          | Chamadas recebidas                                  |
| `QRCODE`        | Geração de QR Code para pareamento                  |
| `LABEL`         | Eventos de etiquetas                                |
| `CONTACT`       | Eventos de contatos                                 |

#### Telefone para Pairing Code (opcional)

Se preferir conectar via **código de pareamento** ao invés de QR Code, insira o número de telefone no formato:

```
5511999999999
```

(código do país + DDD + número, sem espaços ou caracteres especiais)

#### Configurações Avançadas

Expanda para ver opções adicionais de configuração da instância.

### Finalizar conexão

Após configurar, clique em **"Conectar"** para iniciar a conexão. Dependendo do método escolhido:

* **QR Code**: Um QR Code será exibido na tela. Abra o WhatsApp no seu celular, vá em **Configurações > Dispositivos conectados > Conectar dispositivo** e escaneie o código.
* **Pairing Code**: Um código de 8 dígitos será gerado. No WhatsApp do celular, vá em **Configurações > Dispositivos conectados > Conectar dispositivo > Conectar com número de telefone** e insira o código.

<Note>
  Após a conexão bem-sucedida, o status da instância mudará de **"Desconectado"** para **"Conectado"** (em verde) e os eventos começarão a ser enviados para o webhook configurado.
</Note>

***

## Próximos passos

<CardGroup cols={1}>
  <Card title="Hospedagem HostGator" icon="server" href="/infraestrutura/hostgator-evolution-go">
    Precisa de um servidor? Confira os planos VPS otimizados para Evolution Go
  </Card>
</CardGroup>
