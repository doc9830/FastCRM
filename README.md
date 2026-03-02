# ⚡ FastCRM

**FastCRM** — это CRM для малого бизнеса: клиенты, заказы, склад, печать чеков и базовая аналитика в одном веб‑интерфейсе.

---

## Что умеет FastCRM

- **Клиенты:** карточки клиентов, контакты, поиск, комментарии.
- **Заказы:** статусы (`new`, `in_progress`, `ready`, `cancelled`), позиции, суммы, комментарии.
- **Склад:** остатки, резервы, ручные приход/списание, журнал движений.
- **Товары и услуги:** единый каталог.
- **Документы:** печать товарного чека, сохранение в PDF.
- **Пользователи и роли:** администратор и менеджер.
- **Дашборд:** ключевые метрики по заказам и продажам.
- **Уведомления:** Telegram-уведомления администраторам о заказах.

---

## Требования

- Docker
- Docker Compose (`docker compose`)

---

## Установка (рекомендуется): через `install.sh` + Docker + PostgreSQL

### 1) Подготовка

```bash
chmod +x install.sh
```

### 2) Запуск мастера

```bash
./install.sh
```
В некоторых случаях может потребоваться sudo!

### 3) Что сделает скрипт

- проверит Docker и Compose;
- запросит порт и параметры PostgreSQL;
- проверит совпадение данных если система уже использовалась ранее и предложит использовать ранее настроеный `.env`;
- создаст `.env`;
- поднимет контейнеры;
- проверит, что CRM отвечает на `/api/health`.

---

## Ручная установка (без `install.sh`), тоже через Docker + PostgreSQL

### 1) Создайте `.env`

```env
PORT=3000
DB_NAME=fastcrm
DB_USER=fastcrm
DB_PASSWORD=<strong-password>
JWT_SECRET=<long-random-secret>
ADMIN_PASSWORD=<your-admin-password>
TELEGRAM_BOT_TOKEN=<telegram-bot-token> # необязательно
```

### 2) Запустите CRM

```bash
docker compose --env-file .env up -d --build
```

### 3) Проверьте, что всё запустилось

```bash
curl http://localhost:3000/api/health
```

Открыть CRM: `http://localhost:3000`

---

## Ручная установка без Docker (Node.js + PostgreSQL)

> Нужна, если Docker использовать нельзя.

### 1) Что нужно установить заранее

- Node.js 18+
- PostgreSQL 14+

### 2) Установите зависимости и соберите frontend

```bash
npm install
cd frontend && npm install && npm run build && cd ..
```

### 3) Создайте `.env`

```env
PORT=3000
NODE_ENV=production
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fastcrm
DB_USER=fastcrm
DB_PASSWORD=<strong-password>
JWT_SECRET=<long-random-secret>
ADMIN_PASSWORD=<your-admin-password>
TELEGRAM_BOT_TOKEN=<telegram-bot-token> # необязательно
```

### 4) Запустите CRM

```bash
npm start
```

---

## Потребление памяти и места

Ниже — **актуальные замеры командой** (как замерять на вашем сервере после запуска через Docker + PostgreSQL):

```bash
# RAM по контейнерам

docker stats --no-stream

# Размер образов/контейнеров/томов

docker system df -v

```

### Замер в тестовом окружении:

```bash
CONTAINER ID   NAME               CPU %     MEM USAGE / LIMIT     MEM %     NET I/O         BLOCK I/O    PIDS
e10e54637375   fastcrm            8.29%     23.77MiB / 30.63GiB   0.08%     107kB / 184kB   0B / 0B      11
d669c04bf6b1   fastcrm_postgres   0.00%     21.5MiB / 30.63GiB    0.07%     67kB / 49.6kB   0B / 590kB   6


Images space usage:

REPOSITORY         TAG         IMAGE ID       CREATED          SIZE      SHARED SIZE   UNIQUE SIZE   CONTAINERS
fastcrm-main-app   latest      8f99b6763428   14 minutes ago   656MB     9.105MB       647.2MB       1
postgres           16-alpine   97ff59a4e30e   2 weeks ago      395MB     9.105MB       386.3MB       1

Containers space usage:

CONTAINER ID   IMAGE                COMMAND                  LOCAL VOLUMES   SIZE      CREATED          STATUS                      NAMES
e10e54637375   fastcrm-main-app     "docker-entrypoint.s…"   1               12.3kB    14 minutes ago   Up 14 minutes (unhealthy)   fastcrm
d669c04bf6b1   postgres:16-alpine   "docker-entrypoint.s…"   1               20.5kB    2 hours ago      Up 14 minutes (healthy)     fastcrm_postgres

Local Volumes space usage:

VOLUME NAME                  LINKS     SIZE
fastcrm-main_app_logs        1         0B
fastcrm-main_postgres_data   1         48.76MB

Build cache usage: 0B

CACHE ID   CACHE TYPE   SIZE      CREATED   LAST USED   USAGE     SHARED
```

---

## Команды управления FastCRM

### Docker / продакшен

- `docker compose --env-file .env up -d --build` — собрать/обновить образ и запустить CRM.
- `docker compose --env-file .env up -d` — запустить без пересборки.
- `docker compose stop` — остановить контейнеры.
- `docker compose start` — снова запустить остановленные контейнеры.
- `docker compose restart` — перезапуск.
- `docker compose logs -f` — смотреть логи в реальном времени.
- `docker compose ps` — статус контейнеров.
- `docker compose down` — остановить и удалить контейнеры/сеть.
- `docker compose down -v` — удалить ещё и тома (включая данные PostgreSQL).
- `docker compose pull` — скачать свежие образы.
- `docker compose exec app sh` — зайти внутрь контейнера приложения.
- `docker compose exec db psql -U $DB_USER -d $DB_NAME` — зайти в PostgreSQL.

### Node.js (если запуск без Docker)

- `npm start` — запуск в production-режиме.
- `npm run dev` — запуск backend в режиме разработки.
- `cd frontend && npm run dev` — запуск frontend dev-сервера.

---

## Данные для входа

- URL: `http://localhost:3000`
- Логин: `admin`
- Пароль администратора: значение `ADMIN_PASSWORD` из вашего `.env`

---

## Telegram-уведомления

1. Откройте раздел **«Настройки»** в CRM.
2. Укажите токен Telegram-бота.
3. Укажите Telegram ID администраторов.
4. Сохраните изменения.

Можно также задать `TELEGRAM_BOT_TOKEN` в `.env` как резервный вариант.
