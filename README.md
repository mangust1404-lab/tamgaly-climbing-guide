# Tamgaly Climbing Guide

Offline-first электронный гайд по скалолазному району **Тамгалы-Тас** (берег реки Или, Казахстан).

## Возможности

- **Полный офлайн** — работает без интернета после первой загрузки
- **Карта секторов** — Leaflet с GPS-навигацией, маркеры секторов с цветовым градиентом по категориям трасс
- **Интерактивные топо** — зумируемые фото скал с линиями маршрутов (OpenSeadragon)
- **Логирование пролазов** — onsight/flash/redpoint/toprope/attempt, офлайн очередь с синхронизацией
- **Таблица лидеров** — рейтинг по топ-10 лучших маршрутов, дедупликация по сектору + имени + категории (`ascentDedupKey`)
- **Профиль** — личная статистика, история пролазов
- **Фильтр солнце/тень** — выбор сектора по времени дня (sunFrom/sunTo)
- **Админ-панель** — редактор секторов, маршрутов, топо-фото, модерация, загрузка на сервер
- **Посты и новости** — лента постов с автопереводом RU → EN/KK (бесплатный endpoint Google Translate, без ключа; при ошибке остаётся оригинал)
- **Telegram** — уведомления админу о новых элементах модерации, публикация в канал, команда `/news` для рассылки новостей
- **i18n** — русский, английский, казахский
- **Auto-refresh** — topo-data.json обновляется при возврате в приложение (visibilitychange)

## Стек технологий

| Слой | Технология |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite 7 |
| PWA | Workbox (vite-plugin-pwa) |
| UI | Tailwind CSS 4 |
| Карты | Leaflet |
| Топо-вьювер | OpenSeadragon + SVG Overlay |
| Клиентская БД | Dexie.js (IndexedDB) |
| Backend | Node.js + Hono |
| Серверная БД | SQLite (better-sqlite3) |
| Деплой | Docker + nginx + Let's Encrypt |

## Запуск

```bash
npm install
npm run dev          # Frontend (Vite dev server, порт 5173)
npm run server:dev   # Backend (Hono, порт 3001)

# Build & проверка
VITE_BASE=/ npx vite build
./node_modules/.bin/tsc --noEmit
npm test
```

## Деплой

```bash
./deploy.sh              # Всё (frontend + server)
./deploy.sh frontend     # Только фронтенд
./deploy.sh server       # Только сервер
```

**VPS:** 89.167.90.248
**Продакшн:** https://tamgalyclimb.alexanderlobanov.de/
**Админка:** https://tamgalyclimb.alexanderlobanov.de/admin/topo (также /admin/sectors, /admin/photos, /admin/moderation)

### Секреты

Секреты сервера (`ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_CHANNEL_ID`) хранятся только на VPS в `/opt/tamgaly-api/.env` (шаблон — `.env.example`). `deploy.sh server` передаёт его в контейнер через `--env-file` и откажется перезапускать контейнер, если файла нет. В репозиторий секреты не коммитить.

### Важно

- `data/topo-data.json` — source of truth для секторов, маршрутов, топо. Редактируется через админку, сохраняется на сервер через `/api/save-topo-data`
- При сохранении topo-data.json на сервер секторы и маршруты автоматически upsert-ятся в SQLite (FK constraints)
- `seed-from-topo.ts` ищет topo-data.json в порядке: `/var/www/tamgaly/data/` (актуальный от админки) → `data/` (из Docker image) → `server/data/` (volume, может быть устаревшим)
- Seed всегда создаёт area `tamgaly-tas` если её нет, пропускает секторы/маршруты с невалидными FK (не ломается на ошибках)
- `deploy.sh` удаляет только `/var/www/tamgaly/assets/` — **никогда** не трогает `data/` и `topo-images/`
- Nginx конфиги в `deploy/` — актуальные копии с сервера. Всегда `client_max_body_size 20m` в `/api/`
- `sites-enabled` на сервере — **симлинки** на `sites-available`, не копии!

## Структура проекта

```
src/
  components/
    admin/          # Компоненты админ-панели
    map/            # Офлайн-карта, GPS, маркеры секторов
    topo/           # Топо-вьювер, SVG оверлеи маршрутов
    route/          # Карточки маршрутов, формы пролазов
    suggest/        # Предложения маршрутов от пользователей
    gamification/   # Лидерборд, достижения
    ui/             # Базовые UI-компоненты
  lib/
    db/             # Dexie.js схема, seed, загрузка topo-data.json
    sync/           # Синхронизация офлайн → сервер
    offline/        # Управление офлайн-загрузкой
    map/            # Geo утилиты (расстояние, форматирование)
    scoring/        # Расчёт очков и достижений
    api/            # API-клиент
    i18n.tsx        # Переводы (ru/en/kk)
  pages/            # Страницы приложения
    admin/          # Админ-страницы (TopоEditor, Moderation, Sectors, Photos)
  hooks/            # useGps, useSync, useOfflineStatus, useSwipeBack
server/
  src/
    index.ts        # Hono API сервер (порт 3001)
    routes/         # API роуты: areas, sectors, routes, sync, download, posts
    telegram.ts     # Telegram-бот: уведомления, канал, /news
    translate.ts    # Автоперевод RU → EN/KK
    db/             # SQLite: connection, migrate, seed
data/
  topo-data.json    # Маршруты, секторы, топо-фото (base64), оверлеи маршрутов
deploy/
  tamgaly-ssl-nginx.conf   # HTTPS (tamgalyclimb.alexanderlobanov.de)
  tamgaly-nginx.conf       # HTTP (IP + альтернативные домены)
  tamgaly-ip.conf          # HTTP default_server (прямой IP)
scripts/            # Утилиты импорта данных (CSV, KML, сжатие)
```

## Серверная архитектура

```
Клиент (PWA) ←→ nginx (443/80) ←→ Hono API (Docker, порт 3001) ←→ SQLite
                    ↓
              /var/www/tamgaly/     (статика: HTML, JS, CSS, topo-data.json)
              /opt/tamgaly-api/     (серверный код, Dockerfile)
              tamgaly-data volume   (climbing.db — персистентный SQLite)
```

### API эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /api/health | Health check |
| GET | /api/topo-data | Получить topo-data.json |
| POST | /api/save-topo-data | Сохранить топо из админки (до 20MB) |
| POST | /api/admin/login | Вход в админку |
| GET | /api/admin/check | Проверка админ-токена |
| GET | /api/areas | Список районов |
| GET | /api/sectors | Список секторов |
| GET | /api/routes | Список маршрутов |
| POST | /api/sync/* | Синхронизация пролазов и предложений |
| GET | /api/download/area/:areaId | Пакет данных района для офлайна |
| GET | /api/posts, /api/posts/:id | Посты / новости |
| POST, PATCH, DELETE | /api/posts, /api/posts/:id | Создание, правка, удаление постов (правка/удаление — автор или админ) |

## Система очков

| Стиль | Множитель | Описание |
|-------|-----------|----------|
| Onsight | максимальный | Первый пролаз без информации о маршруте |
| Flash | средний | Первый пролаз после просмотра/с подсказками |
| Redpoint | базовый | Пролаз после попыток |
| Toprope | 0 | Верхняя страховка |
| Attempt | 0 | Попытка без прохождения |

За каждую трассу засчитывается **только один scored пролаз** (onsight/flash/redpoint). Toprope и attempt можно логировать неограниченно.

Трасса определяется ключом `сектор | имя | категория` (`ascentDedupKey` в `src/lib/utils.ts`), а не id — id может меняться при реимпорте. Категория входит в ключ, потому что разные трассы могут называться одинаково (например, 6a и 6b+ «Гоголь-моголь»). Если трассы нет на клиенте (архивные не отдаются), ключом служит routeId.

Рейтинг: сумма **10 лучших** результатов climber-а.

## Район Тамгалы-Тас

- ~156 маршрутов, спорт/трэд/мультипитч, 4 — 8a+
- 18 секторов
- Порода: туф (вулканическая)
- Сезон: март — май, сентябрь — ноябрь
- 120 км от Алматы, ~1.5–2 часа на машине

## Лицензия

MIT
