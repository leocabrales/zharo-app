# ZHARO App (borrador web)

Plataforma web gratis para comerciales de **ZHARO / APROBADO DIRECTO**.
Reemplaza (de a poco) el flujo por Telegram: login → cargar cliente → ver mis casos.

**URL (GitHub Pages):** https://leocabrales.github.io/zharo-app/

## Qué incluye (MVP)

- Login con Google (Identity Services) + allowlist en `allowed_users.json`
- Modo prueba (solo Leo) con banner visible
- Formulario **Cargar cliente** (agencia, DNI, nombre, año→marca→modelo→versión, neto/máximo, plazo)
- Catálogo de autos reutilizado desde [zharo-form/autos](https://leocabrales.github.io/zharo-form/autos/)
- Envío al mismo webhook del bot (URL/clave en localStorage) + “Copiar payload”
- Mis casos (localStorage, stub)

## Costo

- Hosting: **$0** (GitHub Pages)
- Login Google: **$0** (OAuth client gratis)
- Firebase: no se usa en este borrador
- Cotizaciones: mismo uso del bot que hoy (no suma hosting)

## Config rápida

1. Abrí la web → **Configuración**
2. Pegá el **Google Client ID** (ver `SETUP.md`)
3. Pegá **Webhook URL** + **key** (las mismas del poller: `ZHARO_WEBHOOK_*`)
4. Opcional: tu `chat_id` de Telegram para recibir respuestas
5. Mientras tanto: **modo prueba**

## Seguridad

- No hay secretos en el repo
- No se cargan / confirman solicitudes bancarias desde esta web
- Allowlist de mails; dominio @zharo se agrega después en `allowed_users.json` → `domains`

## Repo hermano

Formulario Telegram WebApp: https://github.com/leocabrales/zharo-form

## Cotización en vivo
Después de **Enviar a cotizar**, la app abre `simulando.html?id=<case_id>` con cards de Columbia / Galicia / CreditCar.
- Demo: `simulando.html?demo=1` o envío sin webhook → reveals escalonados locales.
- Real: configurar **URL base de estado** en Configuración; el bot escribe `{base}/{case_id}.json` (ver `/workspace/zharo/WEB_REPLY_MODE.md` en el bot).
- Los casos web usan `reply_mode: "web"` — el resultado se ve en la web, no por Telegram.
