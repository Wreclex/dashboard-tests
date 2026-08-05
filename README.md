# Dashboard

Монорепозиторий для инструментов отчётности и дашбордов телефонии: интеграции с Mango Office, МоиЗвонки, Telegram, автоматические отчёты и командные дашборды.

## Технологии

| Слой | Технологии |
|------|-----------|
| **Менеджер пакетов** | pnpm workspaces, Node.js 24 |
| **Язык** | TypeScript 5.9 |
| **API-сервер** | Express 5, Playwright (браузерная автоматизация), Pino (логирование) |
| **Фронтенд** | React 19, Vite 7, TailwindCSS 4, Radix UI, TanStack Query, Recharts, Wouter |
| **База данных** | PostgreSQL + Drizzle ORM |
| **Аутентификация** | Clerk (Express + React SDK) |
| **Валидация** | Zod, drizzle-zod |
| **API codegen** | Orval (из OpenAPI спецификации) |
| **Сборка API** | esbuild (CJS-бандл) |
| **Сборка фронтенда** | Vite |

## Структура проекта

```
.
├── artifacts/                  # Приложения
│   ├── api-server/             # Express API-сервер (порт 5000)
│   ├── report-tool/            # Инструмент отчётности (React + Vite)
│   ├── moizvonki-dashboard/    # Дашборд МоиЗвонки (React + Vite)
│   └── mockup-sandbox/         # Песочница макетов (React + Vite)
├── lib/                        # Общие библиотеки
│   ├── api-spec/               # OpenAPI спецификация + Orval config
│   ├── api-client-react/       # Сгенерированные React Query хуки
│   ├── api-zod/                # Сгенерированные Zod-схемы
│   └── db/                     # Drizzle ORM: схема + миграции
├── scripts/                    # Скрипты автоматизации
├── attached_assets/            # Вспомогательные ассеты
└── screenshots/                # Скриншоты UI
```

## Быстрый старт

### Предварительные требования

- **Node.js** 24+
- **pnpm** (установка: `corepack enable pnpm`)
- **PostgreSQL** 16+
- **Chromium** (для Playwright — интеграции Mango/Moizvonki)

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/Wreclex/dashboard-tests.git
cd dashboard-tests

# Установить зависимости
pnpm install
```

### Переменные окружения

Скопируйте `.env.example` в `.env` и заполните значения:

```bash
cp .env.example .env
```

См. раздел [Переменные окружения](#переменные-окружения) ниже.

### Запуск базы данных

```bash
# Применить миграции (dev-режим)
pnpm --filter @workspace/db run push
```

### Запуск API-сервера

```bash
pnpm --filter @workspace/api-server run dev
# API доступен на http://localhost:5000
```

### Запуск фронтенда

```bash
# Инструмент отчётности
pnpm --filter @workspace/report-tool run dev

# Дашборд МоиЗвонки
pnpm --filter @workspace/moizvonki-dashboard run dev
```

## Команды

| Команда | Описание |
|---------|----------|
| `pnpm install` | Установить все зависимости |
| `pnpm run typecheck` | Проверка типов во всех пакетах |
| `pnpm run build` | Typecheck + сборка всех пакетов |
| `pnpm --filter @workspace/api-server run dev` | Запуск API-сервера (порт 5000) |
| `pnpm --filter @workspace/api-server run test` | Запуск тестов API |
| `pnpm --filter @workspace/report-tool run dev` | Запуск фронтенда report-tool |
| `pnpm --filter @workspace/api-spec run codegen` | Регенерация API-хуков и Zod-схем |
| `pnpm --filter @workspace/db run push` | Применить схему БД (только dev) |
| `pnpm --filter @workspace/db run generate` | Сгенерировать миграции |

## Переменные окружения

### Обязательные

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DATABASE_URL` | Строка подключения к PostgreSQL | `postgresql://user:pass@localhost:5432/dashboard` |
| `BOT_TOKEN_ENCRYPTION_KEY` | 32-байтный hex-ключ (64 символа) для AES-256-GCM шифрования токенов | `a1b2c3...` (64 hex символа) |
| `CLERK_SECRET_KEY` | Clerk secret key | `sk_test_...` |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key | `pk_test_...` |

### Опциональные

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `PORT` | Порт API-сервера | `5000` |
| `NODE_ENV` | Режим окружения | `development` |
| `CLERK_DOMAIN` | Clerk домен | — |
| `CLERK_JWT_KEY` | Clerk JWT ключ верификации | — |
| `CLERK_MACHINE_SECRET_KEY` | Clerk machine secret | — |
| `MANGO_CHROMIUM_PATH` | Путь к Chromium для Playwright | `which chromium` |
| `PGSSLMODE` | Режим SSL для PostgreSQL | — |
| `LOG_LEVEL` | Уровень логирования (Pino) | `info` |
| `BASE_PATH` | Базовый путь для API | — |

> **Безопасность:** Никогда не коммитьте `.env` файл. Все секреты хранятся только в переменных окружения или GitHub Secrets.

## Интеграции

- **Mango Office** — телефония, KPI-отчёты (браузерная автоматизация через Playwright)
- **МоиЗвонки** — телефония, CSV-импорт, дашборды
- **Telegram** — бот для автоматических отчётов
- **Clerk** — аутентификация и управление пользователями

## Деплой

### Подготовка

1. Убедитесь, что все переменные окружения заданы на хостинге.
2. Выполните миграции: `pnpm --filter @workspace/db run migrate`.
3. Соберите проект: `pnpm run build`.

### Деплой на Replit

Проект изначально разработан для Replit. Конфигурация деплоя — в `.replit` (не включён в репозиторий).

### Деплой на другой хостинг

- **API-сервер**: соберите через `pnpm --filter @workspace/api-server run build`, запустите `node dist/index.mjs`.
- **Фронтенд**: соберите через `pnpm --filter @workspace/report-tool run build`, раздайте статику из `dist/`.

## Тесты

```bash
pnpm --filter @workspace/api-server run test
```

Тесты используют `node:test` (встроенный тест-раннер Node.js).

## Лицензия

MIT