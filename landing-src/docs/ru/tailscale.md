---
title: Доступ через Tailscale
description: Откройте purplemux со смартфона по HTTPS через Tailscale Serve — без проброса портов и без жонглирования сертификатами.
eyebrow: Мобильные и удалённый доступ
permalink: /ru/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

По умолчанию purplemux слушает только локально. Tailscale Serve — самый чистый способ открыть его другим вашим устройствам: WireGuard-шифрование, автоматические сертификаты Let's Encrypt и никаких изменений в фаерволе.

## Почему Tailscale

- **WireGuard** — каждое подключение шифруется устройство-устройство.
- **Автоматический HTTPS** — Tailscale выпускает настоящий сертификат для `*.<tailnet>.ts.net`.
- **Без проброса портов** — ваша машина никогда не открывает порт в публичный интернет.
- **HTTPS обязателен для iOS** — установка PWA и Web Push без него отказываются работать. См. [Настройка PWA](/purplemux/ru/docs/pwa-setup/) и [Web Push](/purplemux/ru/docs/web-push/).

## Предпосылки

- Аккаунт Tailscale, демон `tailscale` установлен и авторизован на машине, где работает purplemux.
- HTTPS включён на tailnet (Admin console → DNS → enable HTTPS Certificates, если ещё не).
- purplemux запущен на дефолтном порту `8022` (или там, куда выставлен `PORT`).

## Запуск

Одна строка:

```bash
tailscale serve --bg 8022
```

Tailscale оборачивает ваш локальный `http://localhost:8022` в HTTPS и публикует его внутри tailnet по адресу:

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` — имя хоста; `<tailnet>` — суффикс MagicDNS вашего tailnet. Откройте этот URL на любом другом устройстве, авторизованном в том же tailnet, и вы внутри.

Чтобы остановить:

```bash
tailscale serve --bg off 8022
```

## Что можно делать, когда заработало

- Открыть URL на смартфоне, нажать **Поделиться → На экран «Домой»** и пройти [Настройку PWA](/purplemux/ru/docs/pwa-setup/).
- Включить push изнутри standalone-PWA: [Web Push](/purplemux/ru/docs/web-push/).
- Открывать ту же панель с планшета, ноутбука или другого десктопа — состояние рабочих пространств синхронизируется в реальном времени.

{% call callout('tip', 'Funnel против Serve') %}
`tailscale serve` оставляет purplemux приватным внутри tailnet — это почти всегда то, что нужно. `tailscale funnel` выставит его в публичный интернет, что для личного мультиплексора избыточно (и рискованно).
{% endcall %}

## Запасной вариант — reverse-proxy

Если Tailscale не вариант, подойдёт любой reverse-proxy с настоящим TLS-сертификатом. Главное, что нужно сделать правильно, — это **апгрейды WebSocket**: purplemux использует их для I/O терминала, синхронизации статуса и живого таймлайна.

Nginx (набросок):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy проще — `reverse_proxy 127.0.0.1:8022` сам обрабатывает upgrade-заголовки.

Без проброса `Upgrade` / `Connection` панель отрендерится, но терминалы не подключатся, а статус застрянет. Если что-то «работает наполовину», подозревайте сначала эти заголовки.

## Поиск проблем

- **HTTPS ещё не выпущен** — первый сертификат может выпуститься минуту. Повторный `tailscale serve --bg 8022` после короткой паузы обычно ставит всё на место.
- **Браузер ругается на сертификат** — убедитесь, что заходите именно по `<machine>.<tailnet>.ts.net`, а не по LAN-IP.
- **Мобильный говорит «недоступно»** — проверьте, что телефон в том же tailnet и что Tailscale активен в настройках ОС.
- **Самоподписанные сертификаты** — Web Push не зарегистрируется. Используйте Tailscale Serve или настоящий ACME-сертификат через ваш reverse-proxy.

## Что дальше

- **[Настройка PWA](/purplemux/ru/docs/pwa-setup/)** — поставить на главный экран, теперь когда есть HTTPS.
- **[Web Push уведомления](/purplemux/ru/docs/web-push/)** — включить фоновые алерты.
- **[Безопасность и аутентификация](/purplemux/ru/docs/security-auth/)** — пароль, хеширование и что подразумевает выход в tailnet.
