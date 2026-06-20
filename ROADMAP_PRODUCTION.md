# ROADMAP PRODUCTION — Gratta & Vinci

Documento di analisi e piano di evoluzione verso una piattaforma production-ready.  
Basato sull’intero repository clonato da [gratta-vinci-production](https://github.com/sasalela/gratta-vinci-production).

**Data analisi:** 20 giugno 2026  
**File sorgente nel repo:** 8 file applicativi (`api/index.ts`, 2 HTML, `app.js`, `style.css`, `package.json`, `vercel.json`, `README.md`)

---

## 1. Stato reale del progetto attuale

### Cosa c’è davvero

Il repository contiene **due componenti scollegati**:

| Componente | Stato | Note |
|------------|-------|------|
| **Frontend** (`index.html`, `app.js`, `style.css`, `game.html`) | Demo locale funzionante | Gioco canvas “gratta e vinci” con risultato random lato client. Nessuna chiamata HTTP all’API. |
| **Backend** (`api/index.ts`) | Prototipo API monolitico | CRUD in memoria, auth mock, endpoint gioco con voucher. Non consumato dal frontend attuale. |
| **Deploy** (`vercel.json`) | Configurazione incoerente | Route puntano a cartella `public/` e pagine inesistenti. File HTML reali sono nella root. |
| **Documentazione** (`README.md`) | Marketing / status deploy | Descrive funzionalità (multi-tenant, QR, anti-frode) non presenti nel codice frontend. |

### Disallineamento architetturale

```
┌─────────────────────────────────────────────────────────────┐
│  README + vercel.json (visione production)                  │
│  multi-tenant · QR · dashboard · /play/{store}/{campaign}   │
└──────────────────────────┬──────────────────────────────────┘
                           │  NON collegato
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌─────────────────────┐           ┌─────────────────────┐
│  Frontend attuale   │           │  api/index.ts       │
│  Math.random()      │    ✗      │  Array in RAM       │
│  nessuna persistenza│           │  nessun client      │
└─────────────────────┘           └─────────────────────┘
```

### Dati seed precaricati (solo API, in memoria)

- 1 negozio: “Bar da Giorgio” (`slug: bar-giorgio`)
- 1 campagna: “Birra Gratis” (`slug: birra-gratis`, probabilità 50/50)
- 0 utenti registrati (array `users` vuoto all’avvio)

### Bug noti nel codice esistente

- `game.html` riga 16: tag `<canvas>` malformato (`anvas` invece di `<canvas>`)
- `vercel.json` contiene markdown di istruzioni deploy dopo la chiusura JSON (file tecnicamente invalido come JSON puro)
- `app.js`: variabile `scratched` nel listener `mousemove` shadowa la variabile globale omonima

---

## 2. Funzionalità già presenti nel codice

### Frontend (`index.html` + `app.js` + `style.css`)

- Pagina responsive con canvas HTML5
- Meccanica raschiatura con mouse (`mousemove` + `buttons === 1`)
- Calcolo percentuale area raschiata via `getImageData`
- Soglia ~40% per rivelare risultato
- Messaggio premio/perdita random lato client
- Pulsante “Riprova” che resetta canvas e stato
- Styling gradient, card, hover button

### Frontend alternativo (`game.html`)

- Versione standalone inline (CSS + JS embedded)
- Raschiatura con `globalCompositeOperation: destination-out`
- Risultato fisso hardcoded (“Hai vinto una birra gratis!”) dopo N stroke
- **Non production-ready** (bug HTML, nessuna integrazione API)

### Backend API (`api/index.ts`)

- Serverless handler unico per Vercel
- CORS abilitato su tutte le origini
- Validazione input con **Zod** (login, store, user, campaign, play)
- Hash password SHA-256 (senza salt)
- Generazione ID, codici voucher, selezione premio weighted random
- Health check
- Login super-admin (env `ADMIN_EMAIL` / `ADMIN_PASSWORD` con fallback hardcoded)
- Login utenti negozio (array `users`)
- Gioco pubblico: `POST /api/public/play` con controllo date, IP, consenso privacy
- CRUD negozi (GET/POST/DELETE, solo super-admin)
- CRUD utenti (GET/POST, auth debole)
- CRUD campagne (GET/POST/DELETE)
- Statistiche aggregate per negozio (`/api/stats/:storeId`)
- Logging base `[METHOD] path`

### Infrastruttura

- `package.json`: script `dev` e `deploy` via Vercel CLI
- Dipendenze: `zod`, `@vercel/node`, `typescript`
- `.gitignore` per node_modules, env locali, build artifacts

---

## 3. Funzionalità solo dichiarate ma non implementate

Riferimenti trovati in README, commenti o `vercel.json` **senza implementazione corrispondente nel codice**:

| Funzionalità dichiarata | Dove appare | Stato reale |
|-------------------------|-------------|-------------|
| **Multi-tenant** (URL `/play/{store}/{campaign}`) | `vercel.json`, README | Route configurata verso `public/index.html` inesistente; frontend non legge slug URL |
| **QR code** | README titolo/descrizione | Nessun generatore QR, nessuna libreria, nessun endpoint |
| **Anti-frode IP** (robusto) | README, commenti API | Solo contatore per `IP + campaignId`; email ignorata per limiti; nessun fingerprint, rate limit globale, blocklist |
| **Dashboard admin** | `vercel.json` → `admin-dashboard.html` | File assente |
| **Dashboard negozio** | `vercel.json` → `store-dashboard.html` | File assente |
| **Generatore contenuti** | `vercel.json` → `content-generator.html` | File assente |
| **Database persistente** | Commento in `api/index.ts` | Esplicitamente “sostituisci con DB” — non fatto |
| **JWT / auth production** | Commento in `api/index.ts` | Token stringa mock, nessuna scadenza, nessuna firma |
| **Riscatto voucher** | Campo `redeemed` su voucher | Nessun endpoint PUT/PATCH per riscatto |
| **Integrazione frontend ↔ API** | Flusso logico atteso | Frontend usa `Math.random()` locale |
| **Cartella `public/`** | `vercel.json` builds/routes | Non esiste nel repo |
| **Test automatizzati** | Implicito in README (“test effettuati”) | Nessun file test, nessuno script test in `package.json` |
| **Gestione premi lato server nel gioco UI** | Flusso atteso | Premio deciso server-side ma mai mostrato nel canvas |

---

## 4. Endpoint API esistenti

Base URL in produzione: `https://gratta-vinci-production.vercel.app` (o dominio custom).  
Tutti gli endpoint rispondono JSON salvo OPTIONS.

### Pubblici (senza token)

| Metodo | Path | Descrizione | Body / params |
|--------|------|-------------|---------------|
| `GET` | `/api/health` | Health check | — |
| `POST` | `/api/auth/login` | Login admin o utente negozio | `{ email, password }` |
| `POST` | `/api/public/play` | Esegue giocata, crea sessione e voucher | `{ storeSlug, campaignSlug, email, privacyConsent }` |

### Protetti (header `Authorization: Bearer {token}`)

| Metodo | Path | Auth richiesta | Descrizione |
|--------|------|----------------|-------------|
| `GET` | `/api/stores` | Super-admin | Lista negozi |
| `POST` | `/api/stores` | Super-admin | Crea negozio |
| `DELETE` | `/api/stores/:id` | Super-admin | Elimina negozio |
| `GET` | `/api/users` | Qualsiasi token valido | Lista utenti (⚠ senza filtro ruolo) |
| `POST` | `/api/users` | Qualsiasi token valido | Crea utente negozio |
| `GET` | `/api/campaigns` | Qualsiasi token valido | Lista campagne; query `?storeId=` opzionale |
| `POST` | `/api/campaigns` | Qualsiasi token valido | Crea campagna |
| `DELETE` | `/api/campaigns/:id` | Qualsiasi token valido | Elimina campagna |
| `GET` | `/api/stats/:storeId` | Qualsiasi token valido | Statistiche giocate/voucher per negozio |

### Endpoint mancanti (necessari per production)

- `POST /api/vouchers/:code/redeem` — riscatto voucher
- `GET /api/public/campaign/:storeSlug/:campaignSlug` — metadati campagna pre-gioco
- `GET /api/vouchers` — lista voucher filtrata per negozio
- Refresh token / logout
- CRUD singolo store/campaign (GET by id, PUT update)
- Webhook o export report

### Codici errore usati

- `400` — validazione fallita, consenso privacy mancante, campagna fuori date
- `401` — credenziali/token invalidi
- `403` — ruolo insufficiente (solo su stores admin)
- `404` — store/campaign/route non trovati
- `429` — max giocate raggiunto (per IP+campagna)
- `500` — errore interno

---

## 5. Problemi critici

### 5.1 Database assente

- Tutte le entità (`stores`, `users`, `campaigns`, `sessions`, `vouchers`) sono array JavaScript nel processo Node.
- Nessun ORM, nessuna migrazione, nessun schema SQL/NoSQL versionato.
- Impossibile backup, audit trail, query complesse, report storici.

### 5.2 Dati in memoria

- Su Vercel serverless ogni istanza ha memoria isolata; cold start resetta o diverge lo stato.
- Redeploy cancella tutti i dati creati runtime.
- Concorrenza: race condition su `push` simultanei senza transazioni.
- Statistiche e voucher non affidabili in production.

### 5.3 Autenticazione

- Token mock: `mock-super-admin-token` e `mock-token-{userId}` — prevedibili, non firmati, senza scadenza.
- Super-admin password default `admin123` se env non impostata.
- Nessun refresh token, revoca, o MFA.
- `/api/users` GET accessibile a qualsiasi utente autenticato, non solo admin.
- POST campagne/users non verifica che lo `storeId` appartenga all’utente chiamante.

### 5.4 Sicurezza

- CORS `Access-Control-Allow-Origin: *` su tutte le risposte.
- Password hash SHA-256 senza salt → vulnerabile a rainbow table.
- Nessun rate limiting globale sugli endpoint pubblici (brute force login, spam play).
- Nessuna sanitizzazione output HTML (meno critico ora, critico con dashboard).
- Segreti admin in env con fallback hardcoded nel sorgente.
- Nessun HTTPS enforcement a livello app (dipende solo da Vercel).
- Validazione probabilità premi: somma non verificata (=100%).

### 5.5 Antifrode

- Unico controllo: `sessionKey = clientIp + campaignId` vs `maxPlaysPerUser`.
- IP da header `x-forwarded-for` / `x-real-ip` — spoofable, condiviso (uffici, WiFi pubblico).
- Email raccolta ma **non usata** per limitare giocate duplicate.
- Nessun cookie/session fingerprint, captcha, device ID, geolocalizzazione.
- Selezione premio lato server ma frontend può ignorarla → frode UX/percezione cliente.
- Nessun audit log tentativi falliti.

### 5.6 Multi-tenant

- Modello dati multi-tenant esiste (storeId su campaign/user/voucher).
- Isolamento runtime assente: un token valido può leggere/creare campagne per qualsiasi store.
- URL tenant `/play/{store}/{campaign}` non implementato nel frontend.
- Nessun subdomain/custom domain per tenant.
- Nessuna configurazione branding per negozio (logo, colori) nel codice.

### 5.7 Collegamento frontend / backend

- `index.html` e `app.js` non referenziano `/api/*`.
- Risultato gioco determinato client-side → bypass completo logica server, voucher, limiti.
- Nessun form email/privacy prima del gioco.
- Nessuna visualizzazione codice voucher post-gioco.
- `vercel.json` route `/` → `/public/index.html` ma file reale è `/index.html` in root → deploy potenzialmente rotto.

---

## 6. Piano in 4 fasi verso production

Obiettivo finale: piattaforma multi-tenant con gioco integrato, persistenza, auth sicura, dashboard operative, antifrode accettabile per campagne promozionali B2B.

---

### FASE 1 — Fondamenta: persistenza, deploy coerente, integrazione gioco minima

**Obiettivo:** Un giocatore può completare un flusso reale end-to-end (URL → email → gioco → voucher) con dati persistenti.

#### File da creare

| File | Scopo |
|------|-------|
| `prisma/schema.prisma` (o equivalente Drizzle/SQL) | Schema DB: Store, User, Campaign, Prize, Session, Voucher |
| `prisma/migrations/*` | Migrazioni versionate |
| `lib/db.ts` | Client database singleton |
| `lib/auth.ts` | Helper JWT (sign/verify) — solo struttura, no codice qui |
| `lib/validators.ts` | Estrazione schemi Zod da `api/index.ts` |
| `public/index.html` | Pagina gioco production (spostamento/riscrittura da root) |
| `public/play.html` o routing SPA | Pagina gioco con lettura slug URL |
| `public/js/play.js` | Logica gioco collegata a API |
| `public/css/style.css` | Stili (migrate da root) |
| `.env.example` | Documentazione variabili richieste |
| `docker-compose.yml` (opzionale dev) | Postgres locale |

#### File da modificare

| File | Modifica |
|------|----------|
| `api/index.ts` | Refactor: sostituire array con query DB; split handler per route |
| `vercel.json` | Correggere JSON, allineare routes a struttura `public/` |
| `package.json` | Aggiungere dipendenze DB, JWT, bcrypt; script migrate/seed |
| `README.md` | Aggiornare istruzioni setup (opzionale, non bloccante) |
| `.gitignore` | Eventuali path Prisma/build |

#### File da deprecare / rimuovere (fine fase)

| File | Motivo |
|------|--------|
| `game.html` | Duplicato broken; sostituito da `public/play` |
| `app.js` (root) | Sostituito da `public/js/play.js` integrato API |
| `index.html` (root) | Spostato in `public/` |

#### Rischio

| Livello | Descrizione |
|---------|-------------|
| **Medio-Alto** | Migrazione da in-memory a DB può rompere tutti gli endpoint; refactor monolite `api/index.ts` ad alto impatto. |
| **Medio** | Scelta DB (Vercel Postgres vs Supabase vs PlanetScale) vincola hosting. |
| **Basso** | Allineamento cartelle statiche su Vercel. |

#### Ordine esatto di lavoro

1. Scegliere provider DB (consigliato: **Vercel Postgres** o **Supabase** per semplicità con Vercel).
2. Definire schema DB e migrazioni iniziali + seed (store/campaign demo).
3. Correggere `vercel.json` (JSON valido, routes `public/**`).
4. Creare `lib/db.ts` e testare connessione con script seed.
5. Estrarre validators Zod in modulo condiviso.
6. Refactor `api/index.ts`: sostituire array con CRUD DB, mantenendo stessi path.
7. Implementare JWT reale per login (sostituire token mock).
8. Creare `public/play.html` + `public/js/play.js`:
   - Leggere `storeSlug` e `campaignSlug` da URL
   - Form email + checkbox privacy
   - Chiamata `POST /api/public/play` **prima** o **all’inizio** raschiatura
   - Mostrare premio server-side nel canvas (non random client)
   - Mostrare codice voucher e scadenza
9. Spostare asset statici in `public/`.
10. Deploy staging su Vercel con env DB e JWT secret.
11. Smoke test end-to-end su staging.

#### Come testare

| Test | Procedura | Esito atteso |
|------|-----------|--------------|
| DB connectivity | Eseguire migrate + seed in locale/staging | Tabelle create, dati demo presenti |
| Health | `GET /api/health` | `{ status: "ok" }` |
| Play flow | `POST /api/public/play` con slug validi | Voucher persistito, rileggibile dopo redeploy |
| Persistenza | Redeploy Vercel → ripetere GET stats | Conteggi incrementali mantenuti |
| Frontend E2E | Aprire `/play/bar-giorgio/birra-gratis`, completare gioco | Premio e codice voucher visibili |
| Limite giocate | Ripetere play stesso IP | Seconda richiesta → `429` |
| Deploy static | Verificare `/` e route play servono HTML corretto | Nessun 404 su asset |

---

### FASE 2 — Sicurezza, auth ruoli, antifrode base, riscatto voucher

**Obiettivo:** Sistema difendibile per uso reale con più negozi; ruoli rispettati; voucher riscattabili.

#### File da creare

| File | Scopo |
|------|-------|
| `lib/rbac.ts` | Matrice permessi per ruolo (super_admin, store_owner, staff) |
| `lib/rate-limit.ts` | Rate limit per IP su login e play |
| `lib/antifraud.ts` | Regole: email+campaign, IP, optional fingerprint header |
| `middleware/auth.ts` | Middleware verifica JWT + ruolo per route protette |
| `api/vouchers/redeem.ts` o route in handler | Endpoint riscatto voucher |
| `api/public/campaign.ts` | Metadati campagna pubblica (senza probabilità sensibili) |
| `tests/api/*.test.ts` | Test integrazione endpoint critici |

#### File da modificare

| File | Modifica |
|------|----------|
| `api/index.ts` | Applicare RBAC, rate limit, antifraud; nuovi endpoint |
| `lib/auth.ts` | bcrypt al posto SHA-256; token expiry; refresh opzionale |
| `prisma/schema.prisma` | Aggiungere `PlayAttempt`, `AuditLog`, indici su email/sessionKey |
| `public/js/play.js` | Inviare fingerprint opzionale; gestire errori 429/400 UX |
| `package.json` | bcrypt, rate-limit lib, test runner |
| `.env.example` | `JWT_SECRET`, `BCRYPT_ROUNDS`, rate limit config |

#### Rischio

| Livello | Descrizione |
|---------|-------------|
| **Alto** | Cambio hash password invalida utenti esistenti → serve migrazione o reset. |
| **Medio** | RBAC mal configurato può bloccare dashboard o esporre dati cross-tenant. |
| **Medio** | Antifrode troppo aggressiva → falsi positivi (IP condivisi). |

#### Ordine esatto di lavoro

1. Migrare hash password a bcrypt (+ script re-hash o reset admin).
2. Implementare middleware auth con verifica JWT e payload `{ userId, role, storeId }`.
3. Applicare RBAC su ogni route protetta (stores solo super-admin; campaigns filtrate per storeId utente).
4. Aggiungere rate limiting su `/api/auth/login` e `/api/public/play`.
5. Estendere antifrode: limite per `(email, campaignId)` oltre a `(ip, campaignId)`.
6. Creare tabella `AuditLog` per tentativi play/login falliti.
7. Implementare `POST /api/vouchers/:code/redeem` (staff/store_owner del negozio corretto).
8. Implementare `GET /api/public/campaign/:storeSlug/:campaignSlug` per titolo/descrizione/premi visibili.
9. Restringere CORS a domini noti (env `ALLOWED_ORIGINS`).
10. Validare che somma probabilità premi = 100% alla creazione campagna.
11. Scrivere test automatizzati per auth, RBAC, play, redeem.
12. Deploy staging + pen test manuale base.

#### Come testare

| Test | Procedura | Esito atteso |
|------|-----------|--------------|
| RBAC | Token store_owner tenta DELETE `/api/stores` | `403 Forbidden` |
| Isolation | Store A token tenta GET campaigns store B | Solo campagne proprie |
| Bcrypt | Login con password corretta post-migrazione | Token JWT valido |
| Rate limit | 20 login falliti rapidi | `429` o blocco temporaneo |
| Antifraud email | Stessa email, seconda play stessa campagna | `429` se max=1 |
| Redeem | Staff riscatta voucher valido | `redeemed: true` in DB |
| Redeem cross-store | Staff store A riscatta voucher store B | `403` |
| CORS | Request da origine non whitelisted | Bloccata dal browser |
| Audit | Play fallito per store invalido | Riga in AuditLog |

---

### FASE 3 — Dashboard admin e negozio, multi-tenant UX, QR code

**Obiettivo:** Operatori possono gestire negozi/campagne/voucher senza API manuali; clienti accedono via QR/URL.

#### File da creare

| File | Scopo |
|------|-------|
| `public/admin-dashboard.html` | UI super-admin: negozi, utenti, overview |
| `public/store-dashboard.html` | UI negozio: campagne, voucher, stats, riscatto |
| `public/content-generator.html` | Generatore link/QR per campagne |
| `public/js/admin.js` | CRUD negozi/utenti via API |
| `public/js/store.js` | CRUD campagne, lista voucher, redeem UI |
| `public/js/qr.js` | Wrapper libreria QR (es. qrcode.js via CDN o npm bundle) |
| `public/css/dashboard.css` | Stili condivisi dashboard |
| `api/qr.ts` o endpoint | Opzionale: QR server-side PNG |
| `lib/branding.ts` | Config logo/colori per store (schema DB) |

#### File da modificare

| File | Modifica |
|------|----------|
| `vercel.json` | Confermare routes dashboard e `/play/:store/:campaign` |
| `prisma/schema.prisma` | Campi branding store (logoUrl, primaryColor) |
| `api/index.ts` | Endpoint mancanti: GET store by id, PUT campaign, lista voucher filtrata |
| `public/js/play.js` | Applicare branding dinamico da API campagna/store |
| `README.md` | Documentare flussi operatore e URL QR |

#### Rischio

| Livello | Descrizione |
|---------|-------------|
| **Medio** | Dashboard HTML vanilla crescono in complessità → considerare framework in Fase 4. |
| **Medio** | XSS se dati utente renderizzati senza escape in dashboard. |
| **Basso** | Generazione QR lato client sufficiente per MVP. |

#### Ordine esatto di lavoro

1. Estendere schema DB con campi branding negozio.
2. Implementare API mancanti per dashboard (lista voucher, update campagna, GET store).
3. Costruire `admin-dashboard.html` + `admin.js`: login, lista/crea/elimina negozi, crea utenti.
4. Costruire `store-dashboard.html` + `store.js`: CRUD campagne, visualizza stats, tabella voucher, azione redeem.
5. Implementare `content-generator.html`: selezione campagna → URL play → QR scaricabile.
6. Collegare route Vercel alle nuove pagine (già previste, verificare funzionamento).
7. Applicare escape output e CSP header base sulle pagine dashboard.
8. Test multi-tenant: creare 2 negozi, verificare isolamento dati in UI.
9. Test QR: scansione mobile → landing play corretta.
10. Documentazione operativa per commercianti (PDF o sezione README).

#### Come testare

| Test | Procedura | Esito atteso |
|------|-----------|--------------|
| Admin flow | Login super-admin → crea negozio + utente | Visibili in DB e UI |
| Store flow | Login store_owner → crea campagna | Play URL funzionante |
| QR | Genera QR da content-generator → scan smartphone | Apre gioco corretto |
| Stats | Dopo 5 play → refresh dashboard negozio | `totalPlays: 5` |
| Redeem UI | Click riscatta su voucher pending | Stato aggiornato in tempo reale |
| Cross-tenant UI | Login store A, manipola URL API store B | Negato |
| Branding | Imposta colore/logo store | Play page riflette branding |

---

### FASE 4 — Production hardening, observability, scalabilità, compliance

**Obiettivo:** Sistema operabile 24/7, monitorato, conforme GDPR, pronto per traffico reale.

#### File da creare

| File | Scopo |
|------|-------|
| `.github/workflows/ci.yml` | Lint, test, typecheck su ogni PR |
| `.github/workflows/deploy.yml` | Deploy staging/prod controllato |
| `docs/RUNBOOK.md` | Procedure incident, rollback, rotazione secret |
| `docs/GDPR.md` | Base legale: consenso, retention, export/cancellazione dati |
| `docs/API.md` | Documentazione OpenAPI/Swagger endpoint |
| `scripts/backup.sh` | Backup DB schedulato (o doc provider) |
| `scripts/seed-production.ts` | Seed controllato solo non-prod |
| `lib/monitoring.ts` | Integrazione Sentry o Vercel Analytics |
| `lib/email.ts` | Invio voucher via email (SendGrid/Resend) — opzionale |
| `api/cron/expire-vouchers.ts` | Job scheduled per voucher scaduti |
| `api/gdpr/export.ts` | Export dati per email utente |
| `api/gdpr/delete.ts` | Richiesta cancellazione dati |

#### File da modificare

| File | Modifica |
|------|----------|
| `api/index.ts` | Split in moduli route per maintainability; error handling uniforme |
| `package.json` | Script CI, husky pre-commit opzionale |
| `vercel.json` | Cron jobs, headers sicurezza (HSTS, CSP, X-Frame-Options) |
| `prisma/schema.prisma` | Indici performance, soft delete, retention fields |
| Tutte le dashboard | Paginazione, loading stati, errori user-friendly |
| `README.md` | SLA, architettura finale, link docs |

#### Rischio

| Livello | Descrizione |
|---------|-------------|
| **Alto** | Compliance GDPR incompleta → rischio legale per dati email. |
| **Medio** | Split API monolite → regressioni se test insufficienti. |
| **Medio** | Email delivery → dipendenza servizio terzo, deliverability. |
| **Basso** | Monitoring overhead costi Vercel/third-party. |

#### Ordine esatto di lavoro

1. Introduire CI: TypeScript strict, lint, test suite obbligatoria pre-merge.
2. Split `api/index.ts` in moduli per dominio (auth, stores, campaigns, play, vouchers).
3. Aggiungere OpenAPI spec e validare contratti API.
4. Configurare monitoring errori (Sentry) e logging strutturato (JSON).
5. Implementare headers sicurezza e CSP su tutte le pagine statiche.
6. Definire policy retention (es. cancellare sessioni > 12 mesi) + cron cleanup.
7. Implementare endpoint GDPR export/delete + aggiornare testo consenso privacy in play UI.
8. Aggiungere invio email voucher (opzionale ma consigliato per production marketing).
9. Load test su `/api/public/play` (k6 o Artillery) — target: N req/s senza errori.
10. Disaster recovery: backup automatico DB, procedura rollback documentata.
11. Penetration test esterno o checklist OWASP ASVS.
12. Go-live checklist: env prod, rimozione fallback `admin123`, dominio custom, SSL.

#### Come testare

| Test | Procedura | Esito atteso |
|------|-----------|--------------|
| CI | Push PR con test fallente | Merge bloccato |
| Load | 100 play concurrent su staging | p95 < 2s, 0 errori 5xx |
| Monitoring | Simula errore 500 | Alert Sentry ricevuto |
| GDPR export | Request export per email test | JSON/PDF dati corretti |
| GDPR delete | Delete request | Dati anonimizzati/rimossi |
| Cron expire | Voucher scaduto | Marcato non valido |
| Security headers | securityheaders.com scan | Grade A o equivalente |
| Rollback | Deploy versione N-1 | Servizio ripristinato < 5 min |
| Prod secrets | Verifica env prod | Nessun default hardcoded |

---

## Riepilogo dipendenze tra fasi

```
FASE 1 (DB + play E2E)
    │
    ▼
FASE 2 (Security + RBAC + redeem)
    │
    ▼
FASE 3 (Dashboard + QR + multi-tenant UX)
    │
    ▼
FASE 4 (Hardening + GDPR + CI/CD + scale)
```

**Non saltare Fase 1:** senza persistenza e collegamento frontend/API, le fasi successive costruirebbero su basi instabili.

**Stima complessità (indicativa, 1 dev full-time):**

| Fase | Durata stimata |
|------|----------------|
| Fase 1 | 2–3 settimane |
| Fase 2 | 1–2 settimane |
| Fase 3 | 2–3 settimane |
| Fase 4 | 2–4 settimane |

---

## Checklist go-live minima (post Fase 4)

- [ ] Database managed con backup automatico
- [ ] Nessun dato business in memoria processo
- [ ] JWT con scadenza + secret rotatable
- [ ] Password bcrypt, nessun default admin in codice
- [ ] CORS ristretto al dominio production
- [ ] Play flow end-to-end testato su mobile (iOS + Android)
- [ ] Dashboard admin e negozio operative
- [ ] QR/link generator funzionante
- [ ] Antifraud email + IP + rate limit attivi
- [ ] Riscatto voucher tracciato
- [ ] GDPR: consenso, privacy policy linkata, export/delete
- [ ] Monitoring e alerting configurati
- [ ] CI/CD con test obbligatori

---

*Documento generato da analisi statica del repository. Nessun file esistente è stato modificato nella creazione di questa roadmap.*
