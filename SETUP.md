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

## 3) Envío a cotizar (sin token)

La web no llama al webhook de Cursor directo (CORS desde GitHub Pages). El camino por defecto:

1. Publicá en `main` el archivo `status/submit.json` (misma carpeta que los JSON de estado):

```json
{
  "url": "https://script.google.com/macros/s/<id>/exec",
  "content_type": "text/plain",
  "updated_at": "2026-11-06T00:00:00Z"
}
```

Sin secretos, sin PAT, sin key, sin el id real commiteado en otro lado. La página lo lee con un query `?t=` para no quedar pegada al cache de `raw.githubusercontent.com`. El POST manda el mismo JSON del caso, con `Content-Type: text/plain;charset=UTF-8` (no `application/json`: eso dispara un preflight y este endpoint no lo responde). Si falta `content_type`, igual se manda `text/plain`. Un HTTP 2xx cuenta como enviado.

2. Token de GitHub y webhook URL/key son **respaldo**, solo si `submit.json` no está o ese POST falla. Si los pegás, quedan en `localStorage` de ese navegador, nunca en el repo.

En el servidor del bot ya existen (solo para el respaldo por webhook):

- `ZHARO_WEBHOOK_URL`
- `ZHARO_WEBHOOK_KEY`

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
5. **Enviar a cotizar** sin token y sin webhook: si `submit.json` apunta a un endpoint con CORS, abre la cotización en vivo. Si el envío falla, se queda en Cargar con un error y no inventa ofertas.
6. El demo de la UI es solo `simulando.html?demo=1`
7. (Cuando haya Client ID) sacar modo prueba y entrar con Google

## Respaldo con GitHub token (opcional)

No hace falta para cotizar. Usalo solo si `submit.json` no está publicado o el POST público falla.

1. En GitHub → Settings → Developer settings → Fine-grained tokens → Generate.
2. Repo access: only `leocabrales/zharo-app`. Permission: **Contents: Read and write** (required for `repository_dispatch`). Optional: Actions Read and write.
3. Pegá el token en Configuración → **GitHub token** y guardá.
4. Cargá un cliente → Enviar a cotizar. Si el envío público no salió, eso dispara GitHub Actions → webhook → scripts Columbia/Galicia/CreditCar → JSON en `status/`.
