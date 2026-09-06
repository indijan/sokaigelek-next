# Cloudflare átállás

## Repo előkészítve

- Az OpenNext adapter a `next build` kimenetét Cloudflare Worker formátumra alakítja.
- A `cloudflare-worker.ts` megtartja a Next fetch kezelőt, és a jelenlegi Vercel cronokat Cloudflare scheduled eventként futtatja.
- A `vercel.json` szándékosan megmaradt, amíg a DNS nincs átállítva.
- A Cloudflare Workerben ne állítsd be a Vercel Blob tokeneket. Token nélkül a feltöltési útvonalak a meglévő Supabase Storage fallbacket használják.

## Cloudflare oldali beállítás

1. Hozz létre egy `sokaigelek-next` nevű Workers projektet, vagy használd a `wrangler.jsonc` által megadott nevet.
2. A Workers Buildsben állítsd be a build parancsot: `npm run build:worker`.
3. A deploy parancs legyen: `npx wrangler deploy`.
4. A meglévő `.env.local` értékeit a Cloudflare Environment Variables / Secrets felületén állítsd be. A titkokat ne tedd a repóba.
5. A `CRON_SECRET` legyen ugyanaz a hosszú, véletlenszerű érték, amit a cron endpointok használnak.
6. A `wrangler.jsonc` már tartalmazza az apex és a `www` Worker route-ot; a sikeres deploy után a domain forgalma a Workerhez kerül.

A helyi Cloudflare változók mintája a `.dev.vars.example` fájlban van. A tényleges `.dev.vars` fájlt a `.gitignore` védi.

## Későbbi parancsok

```sh
npm run cf-typegen
npm run deploy:worker
```

Ezeket az előkészítés során nem futtattam le.
