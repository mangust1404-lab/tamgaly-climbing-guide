# Tamgaly Climbing Guide

Offline-first электронный гайд по скалолазному району **Тамгалы-Тас** (Алматы, Казахстан).

## Возможности

- **Полный офлайн** — работает без интернета после загрузки данных
- **Офлайн-карта** с GPS-навигацией к секторам (Leaflet + PMTiles)
- **Интерактивные топо** — зумируемые фото скал с SVG-маршрутами (OpenSeadragon)
- **Логирование пролазов** — офлайн с синхронизацией при появлении сети
- **Таблица лидеров** — геймификация с очками за пролазы
- **Фильтр солнце/тень** — выбор сектора по времени дня
- **Админ-панель** — редактор топо, разметка маршрутов, модерация предложений
- **i18n** — русский, английский, казахский

## Стек технологий

| Слой | Технология |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite 7 |
| PWA | Workbox (vite-plugin-pwa) |
| UI | Tailwind CSS 4 |
| Карты | Leaflet + PMTiles |
| Топо-вьювер | OpenSeadragon + SVG Overlay |
| Клиентская БД | Dexie.js (IndexedDB) |
| Backend | Node.js + Hono |
| Серверная БД | SQLite (better-sqlite3) |
| Деплой | Docker + nginx + Let's Encrypt |

## Запуск

```bash
npm install
npm run dev          # Frontend (Vite dev server)
npm run server:dev   # Backend (Hono на порту 3001)
```

## Деплой

```bash
./deploy.sh              # Всё (frontend + server)
./deploy.sh frontend     # Только фронтенд
./deploy.sh server       # Только сервер
```

**VPS:** 89.167.90.248
**Продакшн:** https://tamgalyclimb.alexanderlobanov.de/
**Админка:** http://89.167.90.248/admin/topo

### Важно

- `data/topo-data.json` (15MB) — исходные данные топо. **НЕ** часть Vite-сборки, копируется в `dist/data/` скриптом `npm run build` или `deploy.sh`.
- При ручном деплое ВСЕГДА копировать topo-data.json: `mkdir -p dist/data && cp data/topo-data.json dist/data/`
- Никогда не удалять `/var/www/tamgaly/data/` на сервере — только `/var/www/tamgaly/assets/`
- Nginx конфиги в `deploy/` — актуальные копии с сервера. Всегда `client_max_body_size 20m` в `/api/`.
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
    map/            # PMTiles, GeoJSON утилиты
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
  topo-data.json    # 15MB — маршруты, топо-фото (base64), SVG оверлеи
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

## Район Тамгалы-Тас

- ~200 маршрутов, спорт/трад/мультипитч, 4 — 8a+
- 16 секторов: Гавань (9) + Ривёрсайд (7)
- Порода: туф (вулканическая)
- Сезон: март — май, сентябрь — ноябрь
- 120 км от Алматы, ~1.5–2 часа на машине

## Лицензия

MIT
