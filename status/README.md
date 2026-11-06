Live case status JSON for the web UI; do not edit case files by hand.

`submit.json` is the public submit descriptor (`url`, `content_type`, `updated_at`). No secrets. The page cache-busts the fetch and POSTs the case JSON to `url` as `text/plain;charset=UTF-8`. Do not point it at a URL that expects `application/json` from the browser.
