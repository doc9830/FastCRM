#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'
BOLD='\033[1m'; CYAN='\033[0;36m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*"; exit 1; }
info() { echo -e "${BLUE}ℹ${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }
ask()  { echo -en "${BOLD}$*${NC} "; }
divider() { echo -e "${MAGENTA}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

generate_password() {
  local pass
  set +o pipefail
  pass=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 12)
  set -o pipefail
  echo "$pass"
}

generate_jwt() {
  local secret
  set +o pipefail
  secret=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64)
  set -o pipefail
  echo "$secret"
}

read_env_value() {
  local key="$1"
  local env_file="$2"

  [[ -f "$env_file" ]] || return 1

  awk -F= -v key="$key" '$1 == key { sub($1"=", ""); print; exit }' "$env_file"
}

prompt_admin_password() {
  local current_password="${1:-}"
  local entered=""
  while true; do
    if [[ -n "$current_password" ]]; then
      ask "Пароль администратора (мин. 8 символов, Enter = оставить текущий):"
    else
      ask "Пароль администратора (мин. 8 символов):"
    fi

    read -rs entered; echo ""

    if [[ -z "$entered" && -n "$current_password" ]]; then
      ADMIN_PASSWORD="$current_password"
      return 0
    fi

    [[ -z "$entered" ]] && { warn "Пароль обязателен."; continue; }
    [[ ${#entered} -lt 6 ]] && { warn "Минимум 8 символов."; continue; }
    ADMIN_PASSWORD="$entered"
    return 0
  done
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"
EXISTING_DB_PASSWORD="$(read_env_value "DB_PASSWORD" "$ENV_FILE" || true)"
EXISTING_JWT_SECRET="$(read_env_value "JWT_SECRET" "$ENV_FILE" || true)"
EXISTING_ADMIN_PASSWORD="$(read_env_value "ADMIN_PASSWORD" "$ENV_FILE" || true)"

clear
divider
echo -e "${BOLD}        ⚡ FastCRM — Установка${NC}"
divider
echo ""
echo -e "${CYAN}Сейчас будет произведена установка CRM.${NC}"
echo "От вас потребуется ввести несколько параметров."
echo ""
read -rp "Нажмите Enter для продолжения..."

# ─────────────────────────────────────────
# Проверка Docker
# ─────────────────────────────────────────
step "Проверка окружения"

command -v docker &>/dev/null || err "Docker не установлен."
docker compose version &>/dev/null || err "Docker Compose v2 не найден."

ok "Docker готов к работе"

# ─────────────────────────────────────────
# Настройки
# ─────────────────────────────────────────
step "Настройка проекта"

ask "Порт приложения [3000]:"
read -r PORT_INPUT
PORT="${PORT_INPUT:-3000}"

ask "Имя базы данных [fastcrm]:"
read -r DB_NAME_INPUT
DB_NAME="${DB_NAME_INPUT:-fastcrm}"

ask "Пользователь базы данных [fastcrm]:"
read -r DB_USER_INPUT
DB_USER="${DB_USER_INPUT:-fastcrm}"

ask "Пароль PostgreSQL (Enter = авто):"
read -rs DB_PASS_INPUT; echo ""

if [[ -z "${DB_PASS_INPUT:-}" ]]; then
  if [[ -n "$EXISTING_DB_PASSWORD" ]]; then
    DB_PASSWORD="$EXISTING_DB_PASSWORD"
    info "Используется текущий пароль PostgreSQL из .env"
  else
    DB_PASSWORD="$(generate_password)"
    info "Пароль PostgreSQL сгенерирован"
  fi
else
  DB_PASSWORD="$DB_PASS_INPUT"
fi

prompt_admin_password "$EXISTING_ADMIN_PASSWORD"

if [[ -n "$EXISTING_JWT_SECRET" ]]; then
  JWT_SECRET="$EXISTING_JWT_SECRET"
  info "Используется текущий JWT секрет из .env"
else
  JWT_SECRET="$(generate_jwt)"
  ok "JWT секрет создан"
fi

# ─────────────────────────────────────────
# Создание .env
# ─────────────────────────────────────────
step "Создание конфигурации"

cat > "$SCRIPT_DIR/.env" <<ENVEOF
PORT=$PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
ADMIN_PASSWORD=$ADMIN_PASSWORD
ENVEOF

chmod 600 "$SCRIPT_DIR/.env"
ok ".env создан и защищён"

# ─────────────────────────────────────────
# Запуск
# ─────────────────────────────────────────
step "Сборка и запуск контейнеров"

docker compose --env-file .env up -d --build > /dev/null

echo -ne "${BLUE}⏳ Запуск приложения"
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${PORT}/api/health" &>/dev/null; then
    echo -e "\r${GREEN}✓ Приложение успешно запущено!           ${NC}"
    break
  fi
  echo -ne "."
  sleep 1
done
echo ""

# ─────────────────────────────────────────
# Итоговый экран
# ─────────────────────────────────────────
clear
divider
echo -e "${GREEN}${BOLD}🚀 FastCRM успешно установлена!${NC}"
divider
echo ""
echo -e "${BOLD}🌐 Доступ к приложению${NC}"
echo -e "   URL:         ${CYAN}http://localhost:${PORT}${NC}"
echo -e "   Логин:       admin"
echo -e "   Пароль:      ${ADMIN_PASSWORD}"
echo ""
echo -e "${BOLD}🐘 PostgreSQL${NC}"
echo -e "   База:        ${DB_NAME}"
echo -e "   Пользователь:${DB_USER}"
echo -e "   Пароль:      ${DB_PASSWORD}"
echo ""
echo -e "${BOLD}🛠 Управление Docker${NC}"
echo -e "   Логи:        docker compose logs -f"
echo -e "   Остановить:  docker compose stop"
echo -e "   Удалить всё: docker compose down -v"
echo ""
divider
