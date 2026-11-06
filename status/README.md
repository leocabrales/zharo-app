Live case status JSON for the web UI; do not edit case files by hand.

`submit.json` is the public submit descriptor (`url`, `content_type`, `updated_at`). No secrets. The page POSTs the case JSON to `url` as `text/plain;charset=UTF-8`. Do not point it at a URL that expects `application/json` from the browser. Extra fields are ignored. Do not put DNI or nombre in any file under `status/`.

## Publish after each channel

Write `status/<case_id>.json` again after **each** bank finishes, not only at the end. Leave the other channels on `esperando`. Keep the top-level `status` as `cotizando` until Columbia, Galicia and CreditCar are all settled, then set `status` to `listo`. The open quote page stops polling once it sees `listo` or three settled channels. A partial file with `status: "listo"` hides later banks.

Also update `status/casos_feed.json` when a channel changes if Mis casos should move without a reload. That page re-reads the feed about every 2.5s.

## How the page reads the file

Do not expect `?t=` to bust the cache.

Measured 2026-11-06 from this repo:

| URL | Cache-Control | `?t=` |
| --- | --- | --- |
| `https://raw.githubusercontent.com/leocabrales/zharo-app/main/status/<file>` | `max-age=300` | ignored (Fastly HIT, same object) |
| `https://leocabrales.github.io/zharo-app/status/<file>` | `max-age=600` | ignored |
| `https://cdn.jsdelivr.net/gh/leocabrales/zharo-app@main/status/<file>` | `max-age=604800, s-maxage=43200` | ignored |

`https://purge.jsdelivr.net/gh/leocabrales/zharo-app@main/status/<file>` returned `throttled: false` for both edges and the next fetches still served the previous body for more than five minutes. The live page does **not** poll jsDelivr and does not need a purge.

The quote page and Mis casos read this repo's status files with:

```
GET https://api.github.com/repos/leocabrales/zharo-app/contents/status/<file>?ref=main
Accept: application/vnd.github.raw+json
If-None-Match: <etag from the previous response>
```

No token. A push of `<file>` showed up on that API within a couple of seconds. `304` means unchanged. A custom `statusBaseUrl` that is not this repo's raw / Pages / jsDelivr status folder is fetched directly, so an override still wins.
