#!/usr/bin/env bash
# =============================================================================
# Script de instalação do projeto (TanStack Start + Lovable Cloud) em VPS Ubuntu
# Testado em Ubuntu 22.04 / 24.04
#
# Uso:
#   chmod +x install-ubuntu-vps.sh
#   sudo ./install-ubuntu-vps.sh
#
# O que o script faz:
#   1. Atualiza o sistema e instala dependências (git, nginx, certbot, ufw)
#   2. Instala Node.js 22 LTS (via NodeSource)
#   3. Clona/atualiza o repositório do projeto
#   4. Cria o arquivo .env com as chaves do backend
#   5. Instala dependências e gera o build de produção
#   6. Cria serviço systemd para manter o app rodando (reinício automático)
#   7. Configura Nginx como proxy reverso + firewall
#   8. (Opcional) Configura HTTPS grátis com Let's Encrypt
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# CONFIGURAÇÕES — edite antes de rodar (ou exporte como variáveis de ambiente)
# -----------------------------------------------------------------------------
APP_NAME="${APP_NAME:-meu-app}"
APP_DIR="${APP_DIR:-/var/www/${APP_NAME}}"
APP_PORT="${APP_PORT:-3000}"
APP_USER="${APP_USER:-www-data}"
GIT_REPO="${GIT_REPO:-}"                  # ex: https://github.com/usuario/repo.git
GIT_BRANCH="${GIT_BRANCH:-main}"
DOMAIN="${DOMAIN:-}"                      # ex: app.meudominio.com (deixe vazio para pular HTTPS)
EMAIL_SSL="${EMAIL_SSL:-}"                # e-mail para o certificado SSL

# Chaves do backend (Lovable Cloud / Supabase) — OBRIGATÓRIAS
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}"
VITE_SUPABASE_PROJECT_ID="${VITE_SUPABASE_PROJECT_ID:-}"
VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"

# -----------------------------------------------------------------------------
# Funções auxiliares
# -----------------------------------------------------------------------------
log()  { echo -e "\033[1;32m[OK]\033[0m $*"; }
info() { echo -e "\033[1;34m[INFO]\033[0m $*"; }
erro() { echo -e "\033[1;31m[ERRO]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || erro "Execute como root: sudo ./install-ubuntu-vps.sh"
[ -n "$GIT_REPO" ] || erro "Defina GIT_REPO com a URL do repositório. Ex: GIT_REPO=https://github.com/usuario/repo.git sudo $0"
[ -n "$VITE_SUPABASE_URL" ] || erro "Defina VITE_SUPABASE_URL (encontre em .env do projeto)."

# -----------------------------------------------------------------------------
# 1. Sistema e dependências básicas
# -----------------------------------------------------------------------------
info "Atualizando o sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git nginx ufw build-essential ca-certificates gnupg
log "Sistema atualizado."

# -----------------------------------------------------------------------------
# 2. Node.js 22 LTS
# -----------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  info "Instalando Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
log "Node.js $(node -v) / npm $(npm -v)"

# -----------------------------------------------------------------------------
# 3. Código-fonte do projeto
# -----------------------------------------------------------------------------
info "Baixando o projeto em ${APP_DIR}..."
mkdir -p "$APP_DIR"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$GIT_BRANCH"
  git -C "$APP_DIR" pull origin "$GIT_BRANCH"
else
  git clone --branch "$GIT_BRANCH" "$GIT_REPO" "$APP_DIR"
fi
cd "$APP_DIR"
log "Código-fonte pronto."

# -----------------------------------------------------------------------------
# 4. Variáveis de ambiente (.env)
# -----------------------------------------------------------------------------
info "Gravando arquivo .env..."
cat > .env <<EOF
SUPABASE_URL=${VITE_SUPABASE_URL}
SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}
SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}
VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
EOF
chmod 600 .env
log ".env criado (permissão 600)."

# -----------------------------------------------------------------------------
# 5. Dependências e build de produção
# -----------------------------------------------------------------------------
info "Instalando dependências (pode levar alguns minutos)..."
npm ci --no-audit --no-fund || npm install --no-audit --no-fund

info "Gerando build de produção (alvo: servidor Node)..."
# O projeto usa Cloudflare como alvo padrão; para VPS usamos o preset node-server.
NITRO_PRESET=node-server npm run build

# Localiza a saída do servidor (Nitro gera .output/server/index.mjs)
if [ -f ".output/server/index.mjs" ]; then
  SERVER_ENTRY=".output/server/index.mjs"
elif [ -f "dist/server/index.mjs" ]; then
  SERVER_ENTRY="dist/server/index.mjs"
else
  SERVER_ENTRY="$(find .output dist -maxdepth 3 -name 'index.mjs' 2>/dev/null | head -1)"
fi
[ -n "$SERVER_ENTRY" ] || erro "Não encontrei a saída do servidor após o build (.output/server/index.mjs)."
log "Build concluído: ${SERVER_ENTRY}"

# -----------------------------------------------------------------------------
# 6. Serviço systemd (inicia no boot e reinicia se cair)
# -----------------------------------------------------------------------------
info "Criando serviço systemd '${APP_NAME}'..."
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

cat > "/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=${APP_NAME} - TanStack Start
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=HOST=127.0.0.1
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/${SERVER_ENTRY}
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"
sleep 3
systemctl is-active --quiet "$APP_NAME" || { journalctl -u "$APP_NAME" -n 50 --no-pager; erro "O serviço não subiu. Veja os logs acima."; }
log "Serviço ativo na porta ${APP_PORT}."

# -----------------------------------------------------------------------------
# 7. Nginx (proxy reverso) + firewall
# -----------------------------------------------------------------------------
info "Configurando Nginx..."
SERVER_NAME="${DOMAIN:-_}"
cat > "/etc/nginx/sites-available/${APP_NAME}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
log "Nginx configurado."

info "Configurando firewall (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
log "Firewall ativo (SSH + HTTP/HTTPS)."

# -----------------------------------------------------------------------------
# 8. HTTPS com Let's Encrypt (somente se DOMAIN foi informado)
# -----------------------------------------------------------------------------
if [ -n "$DOMAIN" ]; then
  [ -n "$EMAIL_SSL" ] || erro "Informe EMAIL_SSL para gerar o certificado HTTPS."
  info "Gerando certificado SSL para ${DOMAIN}..."
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL_SSL" --redirect
  systemctl enable certbot.timer
  log "HTTPS ativo em https://${DOMAIN}"
fi

# -----------------------------------------------------------------------------
# Fim
# -----------------------------------------------------------------------------
echo
echo "============================================================================="
log "Instalação concluída!"
echo
echo "  App rodando em:  http://$(curl -s ifconfig.me 2>/dev/null || echo '<IP_DO_SERVIDOR>')${DOMAIN:+ e https://${DOMAIN}}"
echo "  Logs do app:     journalctl -u ${APP_NAME} -f"
echo "  Reiniciar app:   systemctl restart ${APP_NAME}"
echo "  Status:          systemctl status ${APP_NAME}"
echo
echo "  Para atualizar o app no futuro, rode novamente este script."
echo "============================================================================="
