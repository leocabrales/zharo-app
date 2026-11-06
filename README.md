# ZHARO App (borrador web)

Plataforma web gratis para comerciales de **ZHARO / APROBADO DIRECTO**.
Reemplaza (de a poco) el flujo por Telegram: login → cargar cliente → ver mis casos.

**URL (GitHub Pages):** https://leocabrales.github.io/zharo-app/

## Qué incluye (MVP)

- Login con Google (Identity Services) + allowlist en `allowed_users.json`
- Modo prueba (solo Leo) con banner visible
- Formulario **Cargar cliente** (agencia, DNI, nombre, año→marca→modelo→versión, neto/máximo, plazo)
- Catálogo de autos reutilizado desde [zharo-form/autos](https://leocabrales.github.io/zharo-form/autos/)
- Envío a cotizar por la URL pública de `status/submit.json` (sin token). Token de GitHub y webhook quedan como respaldo en localStorage. “Copiar payload” sigue disponible.
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
- Demo: solo `simulando.html?demo=1`, a propósito, para probar estados de la UI. Si el envío remoto falla, el formulario avisa el error y no inventa ofertas.
- Real: la página lee `{statusBase}/submit.json` (`url` + `content_type`) y hace POST del mismo JSON del caso a esa URL como `text/plain` (sin preflight). Sin token en Config. Si ese archivo no está o el POST falla, recién ahí se usa el token de GitHub o el webhook. El bot publica `{case_id}.json` después de **cada** canal (los otros siguen en `esperando`). La pantalla pide ese estado al mismo Apps Script (`?action=status&id=` y un `t=` nuevo en cada lectura; JSONP solo si el GET no se puede leer), y muestra cada banco en cuanto responde. Con `?id=` también cotiza si este navegador no tiene el caso guardado: el estado público no trae DNI ni nombre. No polea `raw.githubusercontent.com`, Pages ni jsDelivr: ese CDN ignora `?t=` y puede retener el primer JSON parcial varios minutos. Si el endpoint falla, el respaldo es la API de GitHub, no el CDN. Ver `status/README.md`.
- Los casos web usan `reply_mode: "web"` — el resultado se ve en la web, no por Telegram.
