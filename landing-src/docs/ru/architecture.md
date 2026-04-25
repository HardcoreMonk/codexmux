---
title: Архитектура
description: Как браузер, сервер Node.js, tmux и CLI Claude складываются вместе.
eyebrow: Справочник
permalink: /ru/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux — это три слоя, сшитых вместе: фронтенд в браузере, сервер Node.js на `:8022` и tmux + Claude CLI на хосте. Между ними — либо бинарный WebSocket, либо небольшой HTTP POST.

## Три слоя

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

У каждого WebSocket одна задача; они не мультиплексируют. Аутентификация — это NextAuth JWT cookie, проверяемая при WS-апгрейде.

## Браузер

Фронтенд — Next.js (Pages Router). Части, которые общаются с сервером:

| Компонент | Библиотека | Назначение |
|---|---|---|
| Панель терминала | `xterm.js` | Рендерит байты с `/api/terminal`. Эмитит keystroke, события resize и смены заголовка (`onTitleChange`). |
| Таймлайн сессии | React + `useTimeline` | Рендерит ходы Claude из `/api/timeline`. Без вычисления `cliState` на клиенте — оно полностью на сервере. |
| Индикаторы статуса | Zustand `useTabStore` | Бейджи вкладок, точки в боковой панели, счётчики уведомлений, управляемые сообщениями `/api/status`. |
| Multi-device sync | `useSyncClient` | Наблюдает за правками рабочих пространств / раскладок с других устройств через `/api/sync`. |

Заголовки вкладок и переднеплановой процесс берутся из события `onTitleChange` xterm.js — tmux настроен (`src/config/tmux.conf`) эмитить `#{pane_current_command}|#{pane_current_path}` каждые две секунды, а `lib/tab-title.ts` это парсит.

## Сервер Node.js

`server.ts` — это кастомный HTTP-сервер, в который вписан Next.js плюс четыре экземпляра `ws` `WebSocketServer` на том же порту.

### WebSocket-эндпоинты

| Путь | Хендлер | Направление | Использование |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | двунаправленный, бинарный | I/O терминала через `node-pty`, привязанный к tmux-сессии |
| `/api/timeline` | `timeline-server.ts` | сервер → клиент | Стримит записи сессии Claude, распарсенные из JSONL |
| `/api/status` | `status-server.ts` | двунаправленный, JSON | `status:sync` / `status:update` / `status:hook-event` от сервера, `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` от клиента |
| `/api/sync` | `sync-server.ts` | двунаправленный, JSON | Состояние рабочего пространства между устройствами |

Плюс `/api/install` для первого запуска инсталлера (без аутентификации).

### Бинарный протокол терминала

`/api/terminal` использует крошечный бинарный протокол, описанный в `src/lib/terminal-protocol.ts`:

| Код | Имя | Направление | Полезная нагрузка |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | клиент → сервер | Байты клавиш |
| `0x01` | `MSG_STDOUT` | сервер → клиент | Вывод терминала |
| `0x02` | `MSG_RESIZE` | клиент → сервер | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | оба | Интервал 30 с, таймаут 90 с |
| `0x04` | `MSG_KILL_SESSION` | клиент → сервер | Завершить нижележащую tmux-сессию |
| `0x05` | `MSG_WEB_STDIN` | клиент → сервер | Текст из веб-строки ввода (доставляется после выхода из copy-mode) |

Backpressure: `pty.pause` при `bufferedAmount > 1 МБ` у WS, возобновление ниже `256 КБ`. Не более 32 одновременных подключений на сервер, самые старые сбрасываются сверх лимита.

### Status manager

`src/lib/status-manager.ts` — единственный источник истины для `cliState`. События хуков идут через `/api/status/hook` (POST с токеном), секвенсятся (`eventSeq` на вкладку) и сводятся в `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` через `deriveStateFromEvent`. JSONL-watcher обновляет только метаданные, кроме одного синтетического события `interrupt`.

Полную машину состояний см. в [Статусе сессии (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md).

## Слой tmux

purplemux запускает изолированный tmux на отдельном сокете — `-L purple` — со своим конфигом в `src/config/tmux.conf`. Ваш `~/.tmux.conf` никогда не читается.

Сессии именуются `pt-{workspaceId}-{paneId}-{tabId}`. Одна панель терминала в браузере соответствует одной tmux-сессии, привязанной через `node-pty`.

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← вкладка браузера 1
├── pt-ws-MMKl07-pa-1-tb-2   ← вкладка браузера 2
└── pt-ws-MMKl07-pa-2-tb-1   ← разделённая панель, вкладка 1
```

`prefix` отключён, статус-бар выключен (хром рисует xterm.js), `set-titles` включён, а `mouse on` отправляет колесо в copy-mode. tmux — причина, по которой сессии переживают закрытие браузера, обрыв Wi-Fi или перезапуск сервера.

Полную настройку tmux, обёртку над командами и детали определения процесса см. в [tmux и определении процессов (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md).

## Интеграция с Claude CLI

purplemux не форкает и не оборачивает Claude — бинарь `claude` тот, что у вас установлен. Добавляются две вещи:

1. **Hook settings** — на старте `ensureHookSettings()` пишет `~/.purplemux/hooks.json`, `status-hook.sh` и `statusline.sh`. Каждая вкладка Claude запускается с `--settings ~/.purplemux/hooks.json`, поэтому `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact` все POST'ятся обратно на сервер.
2. **Чтение JSONL** — `~/.claude/projects/**/*.jsonl` парсится `timeline-server.ts` для живого вида разговора и наблюдается `session-detection.ts`, чтобы определять запущенный процесс Claude через PID-файлы в `~/.claude/sessions/`.

Скрипты хуков читают `~/.purplemux/port` и `~/.purplemux/cli-token` и POST'ят с `x-pmux-token`. Они тихо проваливаются, если сервер выключен, поэтому закрытие purplemux при работающем Claude ничего не ломает.

## Последовательность запуска

`server.ts:start()` идёт по этим шагам по порядку:

1. `acquireLock(port)` — защита единственного экземпляра через `~/.purplemux/pmux.lock`
2. `initConfigStore()` + `initShellPath()` (резолв `PATH` логин-шелла пользователя)
3. `initAuthCredentials()` — загрузка scrypt-хеша пароля и HMAC-секрета в env
4. `scanSessions()` + `applyConfig()` — очистка мёртвых tmux-сессий, применение `tmux.conf`
5. `initWorkspaceStore()` — загрузка `workspaces.json` и `layout.json` каждого рабочего пространства
6. `autoResumeOnStartup()` — перезапуск шеллов в сохранённых каталогах, попытка resume Claude
7. `getStatusManager().init()` — старт поллинга метаданных
8. `app.prepare()` (Next.js dev) или `require('.next/standalone/server.js')` (prod)
9. `listenWithFallback()` на `bindPlan.host:port` (`0.0.0.0` или `127.0.0.1` в зависимости от политики доступа)
10. `ensureHookSettings(result.port)` — запись или обновление скриптов хуков с реальным портом
11. `getCliToken()` — чтение или генерация `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — обновление `claude-prompt.md` каждого рабочего пространства

Окно между резолвом порта и шагом 10 — причина, по которой скрипты хуков регенерируются при каждом старте: им нужен актуальный порт.

## Кастомный сервер vs граф модулей Next.js

{% call callout('warning', 'Два графа модулей в одном процессе') %}
Внешний кастомный сервер (`server.ts`) и Next.js (страницы + API-роуты) делят один процесс Node, но **не** свои графы модулей. Всё под `src/lib/*`, импортируемое с обеих сторон, инстанцируется дважды. Синглтоны, которые нужно делить (StatusManager, наборы WebSocket-клиентов, CLI-токен, lock'и записи в файл), вешаются на ключи `globalThis.__pt*`. Полное обоснование — в `CLAUDE.md §18`.
{% endcall %}

## Где почитать дальше

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — конфиг tmux, обёртка команд, обход дерева процессов, бинарный протокол терминала.
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — машина состояний Claude CLI, поток хуков, синтетическое событие interrupt, JSONL-watcher.
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — каждый файл, который пишет purplemux.

## Что дальше

- **[Каталог данных](/purplemux/ru/docs/data-directory/)** — каждый файл, которого касается архитектура выше.
- **[CLI reference](/purplemux/ru/docs/cli-reference/)** — общение с сервером вне браузера.
- **[Поиск проблем](/purplemux/ru/docs/troubleshooting/)** — диагностика, когда что-то здесь капризничает.
