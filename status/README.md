Live case status JSON for the web UI; do not edit case files by hand.

`submit.json` is the public submit descriptor (`url`, `content_type`, `updated_at`). No secrets. The page POSTs the case JSON to `url` as `text/plain;charset=UTF-8`. Do not point it at a URL that expects `application/json` from the browser. Extra fields are ignored. Do not put DNI or nombre in any file under `status/`.

## Publish after each channel

Write `status/<case_id>.json` again after **each** bank finishes, not only at the end. Leave the other channels on `esperando`. Keep the top-level `status` as `cotizando` until Columbia, Galicia and CreditCar are all settled, then set `status` to `listo`. The open quote page stops polling once it sees `listo` or three settled channels. A partial file with `status: "listo"` hides later banks.

Also update `status/casos_feed.json` when a channel changes if Mis casos should move without a reload. That page re-reads the feed about every 2.5s.

## How the open quote page reads a case

Do not poll GitHub raw, GitHub Pages, or jsDelivr for `status/<case_id>.json`.

Measured 2026-11-06 from this repo:

| URL | Cache-Control | `?t=` |
| --- | --- | --- |
| `https://raw.githubusercontent.com/leocabrales/zharo-app/main/status/<file>` | `max-age=300` | ignored (Fastly HIT, same object) |
| `https://leocabrales.github.io/zharo-app/status/<file>` | `max-age=600` | ignored |
| `https://cdn.jsdelivr.net/gh/leocabrales/zharo-app@main/status/<file>` | `max-age=604800, s-maxage=43200` | ignored |

`https://purge.jsdelivr.net/gh/leocabrales/zharo-app@main/status/<file>` returned `throttled: false` for both edges and the next fetches still served the previous body for more than five minutes. A tab that asks one of those URLs every few seconds can stay on the first partial snapshot (one bank settled, the others still `esperando`) long after git already has `status: "listo"`. `?t=` does not change the object they serve. PDF links inside the JSON may still point at raw GitHub. Those downloads are not the live poll.

The quote page, and any other call that reads a case id through the live fetch, does this instead. No token.

1. `status/submit.json` supplies `url`. That is the same Apps Script web app used to submit a case. The page does not hardcode it. The Contents API is preferred for this one descriptor. A direct read of `submit.json` is only how the page learns the exec URL when that API does not answer. The exec URL changes rarely, so a cached descriptor is not a stale quote.

2. Live poll. Every request sends a fresh `t=`. This endpoint caches on the full URL; without a new `t=` it can keep returning the previous body. Raw, Pages, and jsDelivr are not this poll.

The first try is a CORS GET. The 302 to `script.googleusercontent.com` and the final body both send `Access-Control-Allow-Origin: *`, and the request has no custom headers so it does not preflight:

```
GET {submit.url}?action=status&id={case_id}&t={timestamp}
```

If that fetch fails, the page loads the same URL as a script with a unique `callback`. The callback name also changes the URL. Do not treat the script's `load` or `error` event as a failed read: that 302 can fire them before `callback({...})` runs, and dropping the callback leaves the quote on "Esperando oferta" once the GitHub API budget is spent.

```
GET {submit.url}?action=status&id={case_id}&callback={uniqueName}&t={timestamp}
```

Success body is the public status object itself, the same shape as `status/<case_id>.json`:

```json
{
  "case_id": "...",
  "updated_at": "...",
  "status": "cotizando",
  "channels": {
    "columbia": { "state": "esperando", "neto": null, "pdf_url": null, "message": null, "updated_at": null },
    "galicia": { "state": "sin_oferta", "neto": null, "pdf_url": null, "message": null, "updated_at": "..." },
    "creditcar": { "state": "esperando", "neto": null, "pdf_url": null, "message": null, "updated_at": null }
  }
}
```

The page paints each bank as soon as that bank is in the object. It does not wait until `status` is `listo`. A body that is not this object is not a quote. Do not invent one.

Missing case: `{ "ok": false, "missing": true }`.

3. If that GET fails, times out, or returns missing, the page may read the same file through the GitHub Contents API:

```
GET https://api.github.com/repos/leocabrales/zharo-app/contents/status/<case_id>.json?ref=main
Accept: application/vnd.github.raw+json
If-None-Match: <etag from the previous response>
```

No token. Unauthenticated, that API is about 60 requests per hour per IP. A tab that polled it every 2.5 seconds used to spend the budget and then fall through to raw, which is how a partial snapshot stuck for minutes. A 403 or 429 must not switch the live case read to raw, Pages, or jsDelivr. `304` means unchanged.

`submit.json` and `casos_feed.json` are not case-id polls. Mis casos re-reads the feed about every 2.5 seconds. That feed is not served by `action=status`.

A custom `statusBaseUrl` that is not this repo's raw / Pages / jsDelivr status folder is fetched as-is, so an override still wins.
