# Tamgaly Climbing Guide

Offline-first электронный гайд по скалолазному району **Тамгалы-Тас** (Алматы, Казахстан).

## Возможности

- **Полный офлайн** — работает без интернета после загрузки данных
- **Офлайн-карта** с GPS-навигацией к секторам (MapLibre + PMTiles)
- **Интерактивные топо** — зумируемые фото скал с SVG-маршрутами (OpenSeadragon)
- **Логирование пролазов** — офлайн с синхронизацией при появлении сети
- **Таблица лидеров** — геймификация с очками за пролазы
- **AR-компас** — камера + GPS для ориентации на местности

## Стек технологий

| Слой | Технология |
|------|-----------|
| Frontend | React + TypeScript + Vite |
| PWA | Workbox (vite-plugin-pwa) |
| UI | Tailwind CSS |
| Карты | MapLibre GL JS + PMTiles |
| Тopo-вьювер | OpenSeadragon + SVG Overlay |
| Клиентская БД | Dexie.js (IndexedDB) |
| Стейт | Zustand |
| Backend | Node.js + Hono |
| БД | PostgreSQL (Supabase) |

## Запуск

```bash
npm install
npm run dev
```

## Структура проекта

```
src/
  components/
    map/          # Офлайн-карта, GPS, маркеры секторов
    topo/         # Топо-вьювер, SVG оверлеи маршрутов
    route/        # Карточки маршрутов, формы пролазов
    gamification/ # Лидерборд, достижения
    ui/           # Базовые UI-компоненты
  lib/
    db/           # Dexie.js схема и запросы
    sync/         # Синхронизация офлайн-данных
    offline/      # Управление офлайн-загрузкой
    map/          # PMTiles, GeoJSON утилиты
    scoring/      # Расчёт очков и достижений
    api/          # API-клиент
  pages/          # Страницы приложения
  service-worker/ # Workbox Service Worker
server/           # Backend API
scripts/          # Импорт данных (KML, CSV, OSM)
```

## Район Тамгалы-Тас

- ~200 маршрутов, спорт/трад/мультипитч до 8a
- Основные секторы: Гавань, Ривёрсайд
- Сезон: март — май, сентябрь — ноябрь
- 120 км от Алматы

## Лицензия

MIT
