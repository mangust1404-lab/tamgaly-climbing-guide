# Tamgaly Climbing Guide

Offline-first электронный гайд по скалолазному району **Тамгалы-Тас** (берег реки Или, Казахстан).

## Возможности

- **Полный офлайн** — работает без интернета после первой загрузки
- **Карта секторов** — Leaflet с GPS-навигацией, маркеры секторов с цветовым градиентом по категориям трасс
- **Интерактивные топо** — зумируемые фото скал с линиями маршрутов (OpenSeadragon)
- **Логирование пролазов** — onsight/flash/redpoint/toprope/attempt, офлайн очередь с синхронизацией
- **Таблица лидеров** — рейтинг по топ-10 лучших маршрутов, дедупликация по имени трассы
- **Профиль** — личная статистика, история пролазов
- **Фильтр солнце/тень** — выбор сектора по времени дня (sunFrom/sunTo)
- **Админ-панель** — редактор секторов, маршрутов, топо-фото, загрузка на сервер
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
**Админка:** https://tamgalyclimb.alexanderlobanov.de/admin

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
    routes/         # API роуты: areas, sectors, routes, sync, download
    db/             # SQLite: connection, migrate, seed
    services/       # Бизнес-логика
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
| GET | /api/areas | Список районов |
| GET | /api/sectors | Список секторов |
| GET | /api/routes | Список маршрутов |
| POST | /api/sync/* | Синхронизация пролазов и предложений |

## Система очков

| Стиль | Множитель | Описание |
|-------|-----------|----------|
| Onsight | максимальный | Первый пролаз без информации о маршруте |
| Flash | средний | Первый пролаз после просмотра/с подсказками |
| Redpoint | базовый | Пролаз после попыток |
| Toprope | 0 | Верхняя страховка |
| Attempt | 0 | Попытка без прохождения |

За каждую трассу засчитывается **только один scored пролаз** (onsight/flash/redpoint). Toprope и attempt можно логировать неограниченно.

Рейтинг: сумма **10 лучших** результатов climber-а.

## Район Тамгалы-Тас

- ~156 маршрутов, спорт/трэд/мультипитч, 4 — 8a+
- 18 секторов
- Порода: туф (вулканическая)
- Сезон: март — май, сентябрь — ноябрь
- 120 км от Алматы, ~1.5–2 часа на машине

## Лицензия

MIT
