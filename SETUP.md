# Setup una sola vez (gratis)

## 1) Google OAuth Client ID (Identity Services)

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/)
2. Creá un proyecto (ej. `zharo-app`) — plan gratuito
3. **APIs y servicios → Pantalla de consentimiento OAuth**
   - Tipo: Externo
   - Nombre app: ZHARO
   - Usuario de prueba: `leonel.cabrales91@gmail.com` (y los comerciales que uses)
4. **Credenciales → Crear credenciales → ID de cliente de OAuth**
   - Tipo: **Aplicación web**
   - Orígenes JavaScript autorizados:
     - `https://leocabrales.github.io`
     - `http://localhost` (si probás en local)
   - No hace falta URI de redirección para el botón GIS (popup)
5. Copiá el **Client ID** (`….apps.googleusercontent.com`)
6. En la web ZHARO → **Configuración** → pegá el Client ID → Guardar

## 2) Allowlist

Archivo `allowed_users.json` en este repo:

```json
{
  "emails": ["leonel.cabrales91@gmail.com"],
  "domains": []
}
```

Más adelante, si tienen mails `@zharo…`:

```json
"domains": ["zharo.com.ar"]
```

Commit + push para que Pages lo actualice.

## 3) Webhook del bot

En el servidor del bot ya existen:

- `ZHARO_WEBHOOK_URL`
- `ZHARO_WEBHOOK_KEY`

Pegálos en **Configuración** de la web (quedan en `localStorage` de ese navegador).

El payload que manda la web:

```json
{
  "source": "zharo-web",
  "bot": "AgenteZharoWeb",
  "chat_id": 123456789,   // si falta replyChatId, la app usa 1664242933 (Leo)
  "from_name": "Leo",
  "username": "leonel.cabrales91@gmail.com",
  "email": "leonel.cabrales91@gmail.com",
  "text": "AGENCIA: ...\nDNI: ...\n...",
  "date": 1730000000,
  "form": { "...campos...": "..." }
}
```

El `text` usa el mismo formato que el formulario de Telegram, para que la rutina de casos lo entienda.

> Nota: si el webhook/CORS del bot no acepta orígenes del browser, usá **Copiar payload** y pegalo en Telegram, o agregamos un Worker gratis después.

## 4) Modo prueba (sin Google)

- Configuración → activar **Modo prueba**, o abrir `?dev=1`
- Entra como `leonel.cabrales91@gmail.com`
- Banner naranja en todas las pantallas

## Checklist de prueba

1. Abrir https://leocabrales.github.io/zharo-app/
2. Entrar en modo prueba
3. Cargar cliente: año 2015 → VOLKSWAGEN → GOL → buscar “highline”
4. Marcar Máximo, plazo 36 → **Copiar payload** (tiene que copiar el texto AGENCIA/DNI/…)
5. **Enviar a cotizar** sin webhook → queda en Mis casos con estado ENVIADO
6. Pegar webhook en Config → reenviar un caso de prueba
7. (Cuando haya Client ID) sacar modo prueba y entrar con Google
