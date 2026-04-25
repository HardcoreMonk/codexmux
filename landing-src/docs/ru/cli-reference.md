---
title: CLI reference
description: Каждая подкоманда и флаг бинарей purplemux и pmux.
eyebrow: Справочник
permalink: /ru/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux` поставляется с двумя способами использования бинаря: как стартер сервера (`purplemux` / `purplemux start`) и как обёртка над HTTP API (`purplemux <subcommand>`), которая разговаривает с работающим сервером. Короткий алиас `pmux` идентичен.

## Две роли, один бинарь

| Форма | Что делает |
|---|---|
| `purplemux` | Запускает сервер. То же, что `purplemux start`. |
| `purplemux <subcommand>` | Разговаривает с CLI HTTP API работающего сервера. |
| `pmux ...` | Алиас для `purplemux ...`. |

Диспетчер в `bin/purplemux.js` отделяет первый аргумент: известные подкоманды идут в `bin/cli.js`, всё остальное (или ничего) запускает сервер.

## Запуск сервера

```bash
purplemux              # по умолчанию
purplemux start        # то же, явно
PORT=9000 purplemux    # кастомный порт
HOST=all purplemux     # привязка везде
```

Полный набор env — в [Порты и переменные окружения](/purplemux/ru/docs/ports-env-vars/).

Сервер печатает свои привязанные URL, режим и статус аутентификации:

```
  ⚡ purplemux  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

Если `8022` уже занят, сервер пишет предупреждение и привязывается к случайному свободному порту.

## Подкоманды

Все подкоманды требуют работающего сервера. Они читают порт из `~/.purplemux/port` и токен авторизации из `~/.purplemux/cli-token`, оба пишутся автоматически на старте сервера.

| Команда | Назначение |
|---|---|
| `purplemux workspaces` | Список рабочих пространств |
| `purplemux tab list [-w WS]` | Список вкладок (опционально в рамках рабочего пространства) |
| `purplemux tab create -w WS [-n NAME] [-t TYPE]` | Создать новую вкладку |
| `purplemux tab send -w WS TAB_ID CONTENT...` | Отправить ввод во вкладку |
| `purplemux tab status -w WS TAB_ID` | Посмотреть статус вкладки |
| `purplemux tab result -w WS TAB_ID` | Снять текущее содержимое панели вкладки |
| `purplemux tab close -w WS TAB_ID` | Закрыть вкладку |
| `purplemux tab browser ...` | Управлять вкладкой `web-browser` (только в Electron) |
| `purplemux api-guide` | Распечатать полный HTTP API |
| `purplemux help` | Показать использование |

Вывод — JSON, если не указано иное. `--workspace` и `-w` взаимозаменяемы.

### Типы панелей `tab create`

Флаг `-t` / `--type` выбирает тип панели. Допустимые значения:

| Значение | Панель |
|---|---|
| `terminal` | Обычный шелл |
| `claude-code` | Шелл с уже запущенным `claude` |
| `web-browser` | Встроенный браузер (только в Electron) |
| `diff` | Панель Git diff |

Без `-t` получаете обычный терминал.

### Подкоманды `tab browser`

Работают только когда тип панели вкладки — `web-browser`, и только в macOS Electron-приложении: иначе мост возвращает 503.

| Подкоманда | Что возвращает |
|---|---|
| `purplemux tab browser url -w WS TAB_ID` | Текущий URL + заголовок страницы |
| `purplemux tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. С `-o` сохраняет на диск; без — возвращает base64. `--full` снимает всю страницу. |
| `purplemux tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | Недавние записи консоли (кольцевой буфер, 500 записей) |
| `purplemux tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | Недавние сетевые записи; `--request ID` достаёт одно тело |
| `purplemux tab browser eval -w WS TAB_ID EXPR` | Вычислить JS-выражение и сериализовать результат |

## Примеры

```bash
# Найти своё рабочее пространство
purplemux workspaces

# Создать вкладку Claude в рабочем пространстве ws-MMKl07
purplemux tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# Отправить в неё промпт (TAB_ID берётся из `tab list`)
purplemux tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# Смотреть состояние
purplemux tab status -w ws-MMKl07 tb-abc

# Снимок панели
purplemux tab result -w ws-MMKl07 tb-abc

# Скриншот вкладки веб-браузера полной страницей
purplemux tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## Аутентификация

Каждая подкоманда отправляет `x-pmux-token: $(cat ~/.purplemux/cli-token)` и проверяется на сервере через `timingSafeEqual`. Файл `~/.purplemux/cli-token` создаётся при первом старте сервера через `randomBytes(32)` и сохраняется с режимом `0600`.

Если нужно вызвать CLI из другого шелла или скрипта, который не видит `~/.purplemux/`, задайте env-переменные:

| Переменная | По умолчанию | Эффект |
|---|---|---|
| `PMUX_PORT` | содержимое `~/.purplemux/port` | Порт, к которому обращается CLI |
| `PMUX_TOKEN` | содержимое `~/.purplemux/cli-token` | Bearer-токен, отправляемый как `x-pmux-token` |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux workspaces
```

{% call callout('warning') %}
CLI-токен даёт полный доступ к серверу. Обращайтесь с ним как с паролем. Не вставляйте в чат, не коммитьте, не выставляйте как build env-переменную. Ротируйте, удалив `~/.purplemux/cli-token` и перезапустив сервер.
{% endcall %}

## update-notifier

`purplemux` проверяет npm на новую версию при каждом запуске (через `update-notifier`) и печатает баннер, если есть. Отключается через `NO_UPDATE_NOTIFIER=1` или любым из [стандартных opt-out'ов update-notifier](https://github.com/yeoman/update-notifier#user-settings).

## Полный HTTP API

`purplemux api-guide` печатает полный HTTP API для каждого эндпоинта `/api/cli/*`, включая тела запросов и формы ответов — пригодится, когда хочется управлять purplemux напрямую через `curl` или другой рантайм.

## Что дальше

- **[Порты и переменные окружения](/purplemux/ru/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` в более широком контексте env.
- **[Архитектура](/purplemux/ru/docs/architecture/)** — что именно слушает CLI.
- **[Поиск проблем](/purplemux/ru/docs/troubleshooting/)** — когда CLI говорит «is the server running?».
