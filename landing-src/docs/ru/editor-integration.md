---
title: Интеграция с редактором
description: Откройте текущую папку в редакторе — VS Code, Cursor, Zed, code-server или по кастомному URL — прямо из шапки.
eyebrow: Кастомизация
permalink: /ru/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

В каждом рабочем пространстве в шапке есть кнопка **EDITOR**. Клик по ней открывает папку активной сессии в выбранном вами редакторе. Выберите пресет, укажите URL или положитесь на системный обработчик — и готово.

## Откройте picker

Настройки (<kbd>⌘,</kbd>) → вкладка **Редактор**. Вы увидите список пресетов и, в зависимости от выбора, поле URL.

## Доступные пресеты

| Пресет | Что делает |
|---|---|
| **Code Server (Web)** | Открывает хостовый [code-server](https://github.com/coder/code-server) с `?folder=<path>`. Требует URL. |
| **VS Code** | Триггерит `vscode://file/<path>?windowId=_blank`. |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **Custom URL** | Шаблон URL под вашим контролем, с плейсхолдерами `{folder}` / `{folderEncoded}`. |
| **Disabled** | Прячет кнопку EDITOR полностью. |

Четыре десктоп-IDE пресета (VS Code, Cursor, Windsurf, Zed) полагаются на ОС, регистрирующую URI-обработчик. Если IDE установлена локально, ссылка отрабатывает как ожидаемо.

## Web vs локально

Между тем, как пресеты открывают папку, есть существенная разница:

- **code-server** работает внутри браузера. URL указывает на сервер, который вы хостите (свой, в сети, прикрытый Tailscale). Клик по EDITOR открывает новую вкладку с папкой.
- **Локальные IDE** (VS Code, Cursor, Windsurf, Zed) требуют, чтобы IDE была установлена на *машине, где работает браузер*. Ссылка отдаётся ОС, которая запускает зарегистрированный обработчик.

Если вы используете purplemux с телефона, работает только пресет code-server — телефон не может открыть `vscode://` URL в десктопное приложение.

## Настройка code-server

Типичная локальная установка, дублируется и в продукте:

```bash
# Установка на macOS
brew install code-server

# Запуск
code-server --port 8080

# Внешний доступ через Tailscale (опционально)
tailscale serve --bg --https=8443 http://localhost:8080
```

Затем в вкладке Редактор задайте URL, по которому доступен code-server: `http://localhost:8080` локально или `https://<machine>.<tailnet>.ts.net:8443`, если поставили его за Tailscale Serve. purplemux проверяет, что URL начинается с `http://` или `https://`, и автоматически добавляет `?folder=<абсолютный путь>`.

{% call callout('note', 'Выберите порт, отличный от 8022') %}
purplemux уже стоит на `8022`. Запускайте code-server на другом порту (в примере `8080`), чтобы они не конфликтовали.
{% endcall %}

## Custom URL шаблон

Пресет Custom позволяет указать на что угодно, что принимает папку в URL — Coder workspaces, Gitpod, Theia, внутренний инструмент. Шаблон **обязан** содержать хотя бы один из плейсхолдеров:

- `{folder}` — абсолютный путь, без кодирования.
- `{folderEncoded}` — URL-кодированный.

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux валидирует шаблон на сохранении и отказывает, если плейсхолдера нет.

## Отключение кнопки

Выберите **Disabled**. Кнопка исчезает из шапки рабочего пространства.

## Что дальше

- **[Боковая панель и опции Claude](/purplemux/ru/docs/sidebar-options/)** — порядок элементов боковой панели, флаги Claude.
- **[Custom CSS](/purplemux/ru/docs/custom-css/)** — дальнейшая визуальная настройка.
- **[Tailscale](/purplemux/ru/docs/tailscale/)** — безопасный внешний доступ и для code-server.
