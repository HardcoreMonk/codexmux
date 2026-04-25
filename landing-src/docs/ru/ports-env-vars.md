---
title: Порты и переменные окружения
description: Каждый порт, который открывает purplemux, и каждая переменная окружения, влияющая на его работу.
eyebrow: Справочник
permalink: /ru/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux задуман как установка в одну строку, но рантайм настраивается. Эта страница перечисляет каждый открываемый порт и каждую переменную окружения, которую читает сервер.

## Порты

| Порт | По умолчанию | Перенастройка | Заметки |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | Если `8022` уже занят, сервер пишет предупреждение и привязывается к случайному свободному порту. |
| Внутренний Next.js (production) | случайный | — | В `pnpm start` / `purplemux start` внешний сервер проксирует на standalone Next.js, привязанный к `127.0.0.1:<random>`. Не выставляется. |

`8022` — это `web` + `ssh`, склеенные. Выбор шуточный, не протокольный.

{% call callout('note', 'Привязанный интерфейс следует за политикой доступа') %}
purplemux привязывается к `0.0.0.0`, только если политика доступа фактически разрешает внешних клиентов. Установки только-localhost привязываются к `127.0.0.1`, поэтому другие машины в LAN даже TCP-соединение не откроют. См. `HOST` ниже.
{% endcall %}

## Переменные окружения сервера

Читаются `server.ts` и модулями, которые он подгружает на старте.

| Переменная | По умолчанию | Эффект |
|---|---|---|
| `PORT` | `8022` | Порт прослушивания HTTP/WS. Откатывается на случайный порт при `EADDRINUSE`. |
| `HOST` | не задана | Спецификация через запятую CIDR/ключевых слов, кому разрешено. Ключевые слова: `localhost`, `tailscale`, `lan`, `all` (или `*` / `0.0.0.0`). Примеры: `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. Когда задана через env, в приложении **Настройки → Сетевой доступ** заблокированы. |
| `NODE_ENV` | `production` (в `purplemux start`), `development` (в `pnpm dev`) | Выбирает между dev-конвейером (`tsx watch`, Next dev) и prod-конвейером (`tsup`-бандл, проксирующий в Next standalone). |
| `__PMUX_APP_DIR` | `process.cwd()` | Переопределяет каталог с `dist/server.js` и `.next/standalone/`. Устанавливается автоматически из `bin/purplemux.js`; обычно трогать не нужно. |
| `__PMUX_APP_DIR_UNPACKED` | не задана | Вариант `__PMUX_APP_DIR` для asar-unpacked пути внутри Electron-приложения macOS. |
| `__PMUX_ELECTRON` | не задана | Когда главный процесс Electron стартует сервер in-process, он выставляет это, чтобы `server.ts` пропустил автоматический вызов `start()` и отдал жизненный цикл Electron. |
| `PURPLEMUX_CLI` | `1` (выставляется `bin/purplemux.js`) | Маркер, по которому общие модули понимают, что процесс — это CLI/сервер, а не Electron. Используется в `pristine-env.ts`. |
| `__PMUX_PRISTINE_ENV` | не задана | JSON-снимок env родительского шелла, захваченный `bin/purplemux.js`, чтобы дочерние процессы (claude, tmux) наследовали `PATH` пользователя, а не очищенный. Внутреннее — выставляется автоматически. |
| `AUTH_PASSWORD` | не задана | Выставляется сервером из scrypt-хеша `config.json` перед запуском Next. NextAuth читает оттуда. Вручную не устанавливайте. |
| `NEXTAUTH_SECRET` | не задана | Та же история — берётся из `config.json` на старте. |

## Переменные окружения для логирования

Читаются `src/lib/logger.ts`.

| Переменная | По умолчанию | Эффект |
|---|---|---|
| `LOG_LEVEL` | `info` | Корневой уровень для всего, что не названо в `LOG_LEVELS`. |
| `LOG_LEVELS` | не задана | Переопределения по модулям парами `name=level`, разделёнными запятыми. |

Уровни по порядку: `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux

# debug только для Claude hook модуля
LOG_LEVELS=hooks=debug purplemux

# несколько модулей сразу
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

Самые полезные имена модулей:

| Модуль | Источник | Что вы увидите |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, части `status-manager.ts` | Приём / обработку хуков / переходы состояний |
| `status` | `status-manager.ts` | Поллинг, JSONL-watcher, broadcast |
| `tmux` | `lib/tmux.ts` | Каждую tmux-команду и её результат |
| `server`, `lock` и т. д. | соответствующие `lib/*.ts` | Жизненный цикл процесса |

Лог-файлы попадают в `~/.purplemux/logs/` независимо от уровня.

## Файлы (как env)

Несколько значений ведут себя как переменные окружения, но живут на диске, чтобы CLI и скрипты хуков могли их найти без env-обмена:

| Файл | Хранит | Используется |
|---|---|---|
| `~/.purplemux/port` | Текущий порт сервера (plain text) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | 32-байтовый hex CLI-токен | `bin/cli.js`, скрипты хуков (отправляется как `x-pmux-token`) |

CLI также принимает их через env, и env имеет приоритет:

| Переменная | По умолчанию | Эффект |
|---|---|---|
| `PMUX_PORT` | содержимое `~/.purplemux/port` | Порт, к которому обращается CLI. |
| `PMUX_TOKEN` | содержимое `~/.purplemux/cli-token` | Bearer-токен, отправляемый как `x-pmux-token`. |

См. [CLI reference](/purplemux/ru/docs/cli-reference/) для полного списка.

## Сложить вместе

Несколько частых комбинаций:

```bash
# По умолчанию: только localhost, порт 8022
purplemux

# Слушать везде (LAN + Tailscale + удалённый)
HOST=all purplemux

# Только localhost + Tailscale
HOST=localhost,tailscale purplemux

# Кастомный порт + подробное логирование хуков
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# Полный набор для отладки
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
Для постоянной установки задавайте это в блоке `Environment=` вашего launchd / systemd юнита. См. [Установка](/purplemux/ru/docs/installation/#avtozapusk-pri-zagruzke) для примера юнит-файла.
{% endcall %}

## Что дальше

- **[Установка](/purplemux/ru/docs/installation/)** — куда обычно идут эти переменные.
- **[Каталог данных](/purplemux/ru/docs/data-directory/)** — как `port` и `cli-token` взаимодействуют со скриптами хуков.
- **[CLI reference](/purplemux/ru/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` в контексте.
