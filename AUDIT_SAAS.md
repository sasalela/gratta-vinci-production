# AUDIT SaaS - Gratta & Vinci

Data audit: 2026-06-21  
Ruolo: CTO & Security Auditor  
Scope: repository completo, API Node/TypeScript, frontend statico, Prisma/Supabase, Vercel, flussi multi-tenant, GDPR e scalabilita.

Nota: questo audit non implementa fix. Le soluzioni indicate sono proposte tecniche da pianificare.

## Executive Summary

La piattaforma ha una buona base funzionale multi-tenant, ma non e pronta per un uso SaaS production-grade con clienti reali senza interventi su sicurezza, GDPR, isolamento ruoli e scalabilita.

Le priorita immediate sono:

1. Sostituire autenticazione mock e token prevedibili con sessioni/JWT firmati.
2. Rimuovere fallback admin e hash password SHA-256 senza salt.
3. Chiudere XSS pubblici e passare a rendering sicuro.
4. Rendere atomici play, decremento premi e redeem voucher.
5. Implementare base GDPR: consenso persistito, retention, export/delete.
6. Aggiungere rate limiting su login, register, play, QR e voucher.
7. Separare RBAC store owner/staff/partner/admin.
8. Ridurre payload pubblici che espongono probabilita, stock e logica premio.

## Severita

- Critico: compromissione account, bypass admin, data breach, frode premi o non conformita GDPR sostanziale.
- Alto: escalation importante, abuso di risorse, perdita isolamento tenant, debolezza GDPR rilevante.
- Medio: rischio operativo/scalabilita, regressione probabile, leak parziale, debito architetturale importante.
- Basso: hardening, igiene operativa, manutenzione, UX/security debt non immediatamente exploitabile.

---

## Findings Critici

### C-01 - Bypass admin tramite token contenente `super-admin`

Severita: Critico  
Categoria: Sicurezza, endpoint pericolosi, multi-tenant

Rischio: qualunque richiesta con `Authorization: Bearer qualsiasi-super-admin-qualsiasi` passa `token.includes('super-admin')` e ottiene privilegi globali. Questo permette accesso a dati di tutti i tenant, modifica store, partner, campagne e utenti.

File:
- `api/index.ts`

Soluzione:
- Rimuovere ogni check substring.
- Introdurre JWT firmati o sessioni server-side con claim `role`.
- Validare `iss`, `aud`, `exp`, firma e revoca.
- Centralizzare auth in middleware e coprire con test di autorizzazione.

### C-02 - Token utente mock prevedibili e senza scadenza

Severita: Critico  
Categoria: Sicurezza, multi-tenant, possibili regressioni

Rischio: i token sono `mock-token-{userId}` e `mock-super-admin-token`. Non hanno firma, scadenza, rotazione o revoca. Se un `userId` viene scoperto, e spesso viene restituito dalla API, e possibile impersonare l'utente.

File:
- `api/index.ts`
- `store.js`
- `admin.js`
- `partner.js`
- `register.js`

Soluzione:
- Usare cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict` o JWT brevi con refresh token.
- Salvare sessioni/revoche lato server.
- Ruotare token e invalidare quelli esistenti.

### C-03 - Password hashate con SHA-256 senza salt

Severita: Critico  
Categoria: Sicurezza

Rischio: in caso di dump DB, password deboli sono crackabili rapidamente con rainbow table. Password uguali producono hash uguali tra tenant diversi.

File:
- `api/index.ts`
- `prisma/seed.ts`
- `prisma/schema.prisma`

Soluzione:
- Migrare ad `argon2id` o `bcrypt` con salt per utente.
- Aggiungere versione hash.
- Re-hash progressivo al login o reset password obbligatorio.

### C-04 - Credenziali admin fallback hardcoded

Severita: Critico  
Categoria: Sicurezza, configurazione

Rischio: se `ADMIN_PASSWORD` non e configurata, il codice usa `admin123`. Un deploy incompleto apre l'accesso super-admin.

File:
- `api/index.ts`
- `.env.example`

Soluzione:
- In produzione, fallire il login admin se env mancanti.
- Validare env obbligatorie all'avvio.
- Rimuovere fallback sensibili dal codice.

### C-05 - Stored XSS sul gioco pubblico

Severita: Critico  
Categoria: Sicurezza, GDPR, multi-tenant

Rischio: campi configurabili da tenant, come label form, logo URL, nome premio, descrizioni o messaggi, finiscono in `innerHTML`. Un negoziante compromesso o malevolo puo eseguire JavaScript sui browser dei giocatori, rubare dati personali o alterare voucher.

File:
- `app.js`
- `games.js`

Soluzione:
- Sostituire `innerHTML` con `textContent`/`createElement` per dati tenant.
- Introdurre `escapeHtml` condiviso.
- Validare `logoUrl` solo `https:`.
- Aggiungere CSP restrittiva in `vercel.json`.

### C-06 - Esito e voucher inviati al client prima del reveal

Severita: Critico  
Categoria: Frode, architettura, regressioni

Rischio: dopo `POST /api/public/play`, il client riceve gia `won`, `prize`, `voucherCode`. Il giocatore puo leggere l'esito da Network/DevTools prima di grattare, fermare la ruota o aprire le scatole.

File:
- `api/index.ts`
- `app.js`
- `games.js`

Soluzione:
- Passare a flusso in due fasi: `start participation` -> interazione -> `reveal`.
- Il server deve emettere voucher solo su endpoint reveal con token monouso.
- Non mandare `voucherCode` prima del completamento interazione.

### C-07 - Race condition su limite giocate e decremento premi

Severita: Critico  
Categoria: Bug, scalabilita, frode

Rischio: il controllo `count` precedente alla `create` non e atomico. Richieste parallele possono superare il limite, generare doppi voucher o consumare premi in modo incoerente.

File:
- `api/index.ts`
- `prisma/schema.prisma`

Soluzione:
- Aggiungere vincolo `@@unique([sessionKey, campaignId])`.
- Usare transazione Prisma per controllo partecipazione, pick premio, decremento inventario e creazione voucher.
- Gestire errore unique con risposta 429.

### C-08 - GDPR incompleto: nessun export, delete, retention o audit consenso

Severita: Critico  
Categoria: GDPR, architettura

Rischio: vengono raccolti email, IP, user agent, device key, dati custom, data nascita e consenso marketing, ma non esistono meccanismi per accesso, cancellazione, rettifica, retention o prova storica del consenso.

File:
- `api/index.ts`
- `prisma/schema.prisma`
- `index.html`
- `register.html`

Soluzione:
- Aggiungere campi `privacyConsentAt`, `privacyPolicyVersion`, `marketingConsentAt`.
- Creare endpoint DSR: export/delete/anonymize per email e tenant.
- Definire retention e cron di anonimizzazione.
- Collegare privacy policy e termini versionati.

---

## Findings Alti

### A-01 - Nessun RBAC effettivo tra `store_owner` e `staff`

Severita: Alto  
Categoria: Multi-tenant, sicurezza

Rischio: un utente staff con `storeId` puo accedere alle API store come il titolare: campagne, premi, statistiche, profilo, voucher. Questo viola il principio di minimo privilegio.

File:
- `api/index.ts`
- `prisma/schema.prisma`

Soluzione:
- Definire matrice permessi: staff solo validate/redeem voucher; owner CRUD campagne/premi/profilo.
- Applicare guard per route, non solo per `storeId`.
- Testare ogni ruolo.

### A-02 - CORS wildcard su tutte le API

Severita: Alto  
Categoria: Sicurezza

Rischio: `Access-Control-Allow-Origin: *` consente a qualsiasi origine di chiamare API con Bearer token rubato. Amplifica XSS e furto token.

File:
- `api/index.ts`

Soluzione:
- Configurare `ALLOWED_ORIGINS`.
- Consentire solo dominio production/staging.
- Introdurre CSRF se si passa a cookie.

### A-03 - Nessun rate limiting su endpoint sensibili

Severita: Alto  
Categoria: Sicurezza, scalabilita

Rischio: login, registrazione store, play, QR, validate voucher e redeem sono abusabili per brute force, spam trial, scraping codici o DoS applicativo.

File:
- `api/index.ts`

Soluzione:
- Rate limit per IP/email/route con Redis/Vercel KV/Upstash.
- Backoff progressivo su login.
- CAPTCHA su register e, se necessario, play pubblico.

### A-04 - Registrazione store pubblica senza verifica email/CAPTCHA

Severita: Alto  
Categoria: Sicurezza, scalabilita, GDPR

Rischio: creazione illimitata di tenant trial, slug squatting, consumo risorse DB e alert spam.

File:
- `api/index.ts`
- `register.html`
- `register.js`

Soluzione:
- Verifica email con magic link.
- CAPTCHA e rate limit.
- Eventuale approvazione admin/partner.
- Persistenza dei termini accettati con versione.

### A-05 - Partner puo impostare abbonamenti troppo permissivi

Severita: Alto  
Categoria: Multi-tenant, business logic

Rischio: i flussi partner possono creare/modificare store con `subscriptionExpiresAt` non coerente con policy di pagamento. `null` viene interpretato come piano senza scadenza.

File:
- `api/index.ts`

Soluzione:
- Rendere `subscriptionExpiresAt` modificabile solo da admin/billing.
- Partner puo creare negozi solo in trial predefinito.
- Audit log per ogni cambio piano.

### A-06 - Manipolazione stock premio tramite API store

Severita: Alto  
Categoria: Integrita dati, frode

Rischio: il PUT premio accetta `remainingQuantity` dal client. Un gestore puo reintrodurre stock gia consumato o impostare valori incoerenti rispetto a voucher emessi.

File:
- `api/index.ts`
- `store.js`

Soluzione:
- Rendere `remainingQuantity` server-managed.
- Separare azione "rifornisci stock" con audit log.
- Aggiungere constraint DB `remainingQuantity <= totalQuantity`.

### A-07 - Race condition su redeem voucher

Severita: Alto  
Categoria: Bug, integrita dati

Rischio: due richieste concorrenti possono riscattare lo stesso voucher se passano il controllo prima dell'update.

File:
- `api/index.ts`

Soluzione:
- Usare update condizionale `where id + redeemed=false`.
- Inserire create redemption e update voucher nella stessa transazione.
- Rifiutare se `updated.count === 0`.

### A-08 - Token in `sessionStorage`

Severita: Alto  
Categoria: Sicurezza frontend

Rischio: un XSS sul pannello o gioco puo leggere token da `sessionStorage` e prendere controllo dell'account.

File:
- `store.js`
- `admin.js`
- `partner.js`
- `register.js`
- `redeem.js`
- `content.js`

Soluzione:
- Cookie `HttpOnly` oppure storage in memoria con sessioni brevi.
- CSP, XSS remediation e rotazione token.

### A-09 - Informazioni premio sensibili esposte su endpoint pubblico

Severita: Alto  
Categoria: Sicurezza, business logic

Rischio: `GET /api/public/campaign` espone `winProbability` e disponibilita premio. Un utente puo conoscere la distribuzione dei premi e la logica commerciale del tenant.

File:
- `api/index.ts`
- `games.js`

Soluzione:
- Esporre solo nome/emoji necessari alla UI.
- Tenere probabilita/stock su endpoint autenticati store.
- Se la ruota deve mostrare premi, non includere pesi reali.

### A-10 - Endpoint legacy admin duplicati e incoerenti

Severita: Alto  
Categoria: Architettura, endpoint pericolosi

Rischio: esistono route legacy come `/api/stores`, `/api/users`, `/api/campaigns`, `/api/stats/*` accanto a `/api/admin/*`. Questo aumenta superficie d'attacco e puo creare divergenze auth/modello dati.

File:
- `api/index.ts`

Soluzione:
- Deprecare e rimuovere legacy routes.
- Unificare namespace `/api/admin/*`.
- Aggiungere test che impediscano endpoint admin fuori namespace.

---

## Findings Medi

### M-01 - `maxPlaysPerUser` esiste ma non viene applicato

Severita: Medio  
Categoria: Bug, regressioni future

Rischio: il DB contiene `maxPlaysPerUser`, ma il runtime blocca sempre a una giocata. Funzionalita future che configurano limiti diversi non funzioneranno.

File:
- `api/index.ts`
- `prisma/schema.prisma`

Soluzione:
- Usare `campaign.maxPlaysPerUser` nel controllo.
- Esporlo correttamente nel pannello.
- Aggiungere test per limiti per campagna/giorno.

### M-02 - Query dashboard campagne carica partecipazioni e voucher in memoria

Severita: Medio  
Categoria: Scalabilita, query inefficienti

Rischio: `GET /api/store/campaigns` include participations e vouchers per ogni campagna e calcola statistiche in JS. Con volumi reali puo causare timeout serverless.

File:
- `api/index.ts`

Soluzione:
- Usare aggregazioni DB (`groupBy`, `_count`, query raw).
- Paginare campagne e stats.
- Materializzare statistiche per campagna.

### M-03 - Indici DB mancanti per query operative

Severita: Medio  
Categoria: Scalabilita

Rischio: liste voucher, stats per campagna e filtri per scadenza/redeemed possono degradare su dataset grandi.

File:
- `prisma/schema.prisma`

Soluzione:
- Aggiungere indici: `Participation(campaignId, createdAt)`, `Voucher(storeId, createdAt)`, `Voucher(storeId, redeemed)`, `Voucher(expiresAt)`.

### M-04 - `customerData` accetta JSON arbitrario

Severita: Medio  
Categoria: Sicurezza, GDPR

Rischio: `z.record(z.any())` permette payload grandi, chiavi inattese e dati personali non previsti. Aumenta rischio DoS storage e non conformita minimizzazione GDPR.

File:
- `api/index.ts`
- `prisma/schema.prisma`

Soluzione:
- Schema strict con sole chiavi abilitate dalla campagna.
- Limiti lunghezza e dimensione payload.
- Validare email, telefono, date e boolean.

### M-05 - Consenso privacy solo booleano runtime

Severita: Medio  
Categoria: GDPR

Rischio: `privacyConsent` e richiesto ma non persistito con data, versione informativa o testo. Impossibile dimostrare consenso.

File:
- `api/index.ts`
- `index.html`

Soluzione:
- Persistire timestamp, IP hash, user agent, policy version.
- Linkare informativa nel checkbox.

### M-06 - Voucher code nel query string

Severita: Medio  
Categoria: Sicurezza, privacy

Rischio: `/redeem.html?code=...` finisce in cronologia, log, screenshot e potenziali Referer.

File:
- `app.js`
- `redeem.js`

Soluzione:
- Usare token opaco firmato o path non indicizzabile.
- Validare via POST autenticato.
- Ridurre lifetime del token di riscatto.

### M-07 - Codici voucher generati con `Math.random()`

Severita: Medio  
Categoria: Sicurezza

Rischio: `Math.random()` non e crittograficamente sicuro. Con rate limiting assente, aumenta rischio enumerazione.

File:
- `api/index.ts`

Soluzione:
- Usare `crypto.randomBytes` o `crypto.randomUUID`.
- Aumentare entropia e lunghezza.
- Rate limit su validate/redeem.

### M-08 - Errori interni esposti al client

Severita: Medio  
Categoria: Sicurezza, osservabilita

Rischio: il catch globale restituisce `error.message`, potenzialmente dettagli Prisma/DB o stack applicativi.

File:
- `api/index.ts`

Soluzione:
- Risposta generica `Internal server error`.
- Log strutturato server-side con correlation ID.
- Sentry/monitoring con redaction PII.

### M-09 - Assenza security headers/CSP

Severita: Medio  
Categoria: Sicurezza frontend

Rischio: XSS, clickjacking e content sniffing sono piu impattanti per assenza di CSP, HSTS, X-Frame-Options/frame-ancestors, Referrer-Policy.

File:
- `vercel.json`
- tutti gli HTML statici

Soluzione:
- Aggiungere headers in `vercel.json`.
- CSP con script-src controllato e nessun inline non necessario.
- `frame-ancestors 'none'` o allowlist.

### M-10 - CDN jsPDF senza Subresource Integrity

Severita: Medio  
Categoria: Supply chain

Rischio: se il CDN o pacchetto servito e compromesso, il generatore materiali puo eseguire JavaScript malevolo.

File:
- `content.html`

Soluzione:
- Self-host del bundle.
- Oppure SRI `integrity` e `crossorigin`.
- Pin e audit dipendenza.

### M-11 - Migrazioni non automatizzate nel deploy

Severita: Medio  
Categoria: Operativita, regressioni

Rischio: `prisma migrate deploy` e manuale. Un deploy che richiede schema nuovo puo andare online prima della migrazione e generare 500.

File:
- `package.json`
- `vercel.json`

Soluzione:
- CI/CD con step migratorio gated.
- Pipeline: typecheck, prisma validate, migrate deploy, deploy.
- Runbook rollback.

### M-12 - Modello premi duplicato: `Campaign.prizes` JSON e tabella `Prize`

Severita: Medio  
Categoria: Architettura, debito tecnico

Rischio: esistono due modelli premio; il gioco usa `Prize`, vecchie route admin usano JSON. Questo genera drift e regressioni.

File:
- `prisma/schema.prisma`
- `api/index.ts`

Soluzione:
- Migrare definitivamente a tabella `Prize`.
- Rimuovere `Campaign.prizes` e route legacy collegate.

### M-13 - API monolitica con routing manuale

Severita: Medio  
Categoria: Architettura, debito tecnico

Rischio: `api/index.ts` contiene auth, public play, store, partner, admin e legacy routes. Aumenta rischio regressioni, autorizzazioni dimenticate e review difficili.

File:
- `api/index.ts`

Soluzione:
- Separare in moduli: `auth`, `public`, `store`, `partner`, `admin`, `billing`.
- Middleware condivisi per auth, tenant scope, validation, error handling.

### M-14 - Ruoli e tipi come stringhe libere

Severita: Medio  
Categoria: Architettura, sicurezza

Rischio: `role`, `gameType`, `playLimitMode`, `outcome`, `alert.type` sono stringhe libere nel DB. Valori inconsistenti possono rompere RBAC e query.

File:
- `prisma/schema.prisma`

Soluzione:
- Usare enum Prisma o check constraint.
- Migrare valori esistenti.

### M-15 - Abbonamento e redeem voucher incoerenti

Severita: Medio  
Categoria: Business logic

Rischio: play/campaign sono bloccati se subscription scaduta, ma validazione/riscatto voucher possono avere policy diversa. Potrebbe essere voluto, ma non e esplicitato.

File:
- `api/index.ts`

Soluzione:
- Definire policy: voucher gia emessi restano validi o no.
- Implementare coerentemente con grace period e testo legale.

### M-16 - Seed demo non production-safe

Severita: Medio  
Categoria: Operativita, sicurezza

Rischio: seed crea utente demo `password123` e stampa credenziali. Se eseguito su produzione crea account debole.

File:
- `prisma/seed.ts`
- `package.json`

Soluzione:
- Bloccare seed in `NODE_ENV=production`.
- Password random da env.
- Non loggare credenziali.

### M-17 - Antifrode basata su email/IP/deviceKey client

Severita: Medio  
Categoria: Sicurezza, frode

Rischio: nuova email, reset localStorage, VPN o device diverso aggirano limiti. Per campagne a premi puo essere economicamente rilevante.

File:
- `app.js`
- `api/index.ts`

Soluzione:
- Email verification/OTP per campagne con premi di valore.
- Rate limit e anomaly detection.
- Cookie httpOnly/fingerprint server-side con consenso adeguato.

### M-18 - Probabilita vincita garantita valida stock totale, non residuo

Severita: Medio  
Categoria: Bug futuro

Rischio: la validazione campagna controlla `totalQuantity > 0`, ma in gioco reale conta `remainingQuantity > 0`. Campagne con stock esaurito possono risultare valide finche il play restituisce errore.

File:
- `api/index.ts`

Soluzione:
- Validare anche `remainingQuantity`.
- Aggiungere stato campagna "premi esauriti".
- Alert e disattivazione automatica opzionale.

---

## Findings Bassi

### B-01 - Health endpoint espone stato DB e versione

Severita: Basso  
Categoria: Information disclosure

Rischio: `/api/health` pubblico rivela database connesso e versione applicativa.

File:
- `api/index.ts`

Soluzione:
- Health pubblico minimal.
- DB health solo su endpoint interno/autenticato.

### B-02 - Endpoint QR pubblico senza limiti

Severita: Basso  
Categoria: Scalabilita, abuso

Rischio: `/api/public/qr` genera SVG per testo arbitrario senza rate limit o limite lunghezza, abusabile per CPU/bandwidth.

File:
- `api/index.ts`

Soluzione:
- Max length `text`.
- Rate limit.
- Opzionale firma HMAC per QR di campagne/voucher.

### B-03 - Liste hardcoded a 100 senza paginazione

Severita: Basso  
Categoria: Scalabilita, UX

Rischio: dashboard e admin troncano silenziosamente record oltre 100, rendendo invisibili dati reali.

File:
- `api/index.ts`

Soluzione:
- Paginazione cursor-based.
- Filtri per campagna, data, stato.

### B-04 - Config Vercel statica e manuale

Severita: Basso  
Categoria: Debito tecnico, regressioni

Rischio: ogni nuovo asset deve essere aggiunto manualmente a `builds` e `routes`. E facile dimenticare file, causando 404 o cache incoerente.

File:
- `vercel.json`

Soluzione:
- Migrare a struttura `public/` o build statica standard.
- Automatizzare versioning asset.

### B-05 - Cache busting manuale e incoerente

Severita: Basso  
Categoria: Regressioni future

Rischio: query string versionate manualmente (`?v=...`) possono restare disallineate tra pagine, causando bug "vedo versione vecchia".

File:
- `index.html`
- `store.html`

Soluzione:
- Versione build unica generata da CI.
- Hash asset o manifest.

### B-06 - File demo/artefatti locali nel workspace

Severita: Basso  
Categoria: Operativita

Rischio: `demo-qr/` e PDF locali possono confondere audit/deploy o essere committati accidentalmente.

File:
- `demo-qr/`
- `locandina-cose-belle-weekend.pdf`

Soluzione:
- Aggiungere pattern a `.gitignore` se sono solo artefatti locali.
- Spostare materiali demo in cartella documentata non deployata.

### B-07 - Nessuna CI/test automatizzati

Severita: Basso  
Categoria: Regressioni future, debito tecnico

Rischio: modifiche su auth/play/migrazioni sono deployate manualmente senza test automatici, aumentando regressioni come quelle gia emerse sui giochi.

File:
- `package.json`
- assenza `.github/workflows/`

Soluzione:
- Aggiungere typecheck, lint, test API integrazione, test Prisma migrate, smoke test public game.

### B-08 - README e documentazione operativa non allineati

Severita: Basso  
Categoria: Debito tecnico

Rischio: setup, variabili env, limiti sicurezza e runbook deploy non sono formalizzati. Nuovi operatori possono deployare con configurazioni insicure.

File:
- `README.md`
- `.env.example`

Soluzione:
- Aggiornare documentazione con env obbligatorie, deploy, migration, security checklist, GDPR checklist.

---

## Matrice dei Rischi per Area

### Sicurezza

Problemi principali:
- Auth mock e token prevedibili.
- Password hashing inadeguato.
- XSS stored sul gioco pubblico.
- CORS wildcard e token in `sessionStorage`.
- Mancanza rate limiting.

Priorita: massima. Questi punti vanno risolti prima di onboarding clienti reali.

### GDPR

Problemi principali:
- Consenso non persistito.
- Nessun export/delete/anonymize.
- Retention assente.
- Device key e IP senza informativa adeguata.
- Marketing consent non separato e non auditabile.

Priorita: alta. Serve una baseline GDPR prima di campagne pubbliche.

### Multi-tenant

Problemi principali:
- Admin bypass globale.
- RBAC staff/owner insufficiente.
- Partner billing troppo permissivo.
- Endpoint legacy duplicati.

Priorita: alta. L'isolamento tenant base via `storeId` e presente, ma l'auth compromette tutto.

### Scalabilita

Problemi principali:
- Query dashboard in memoria.
- Indici mancanti.
- Rate limit assente.
- API monolitica serverless.
- QR pubblico senza limiti.

Priorita: media. Diventa critica con traffico reale.

### Architettura

Problemi principali:
- `api/index.ts` monolitico.
- Modello premi duplicato.
- Config Vercel manuale.
- Nessun CI/CD.
- Error handling non centralizzato.

Priorita: media. Rallenta evoluzione e aumenta regressioni.

---

## Roadmap Consigliata

### Fase 0 - Stop-the-bleeding (prima di nuovi clienti)

1. JWT/sessioni reali + rimozione token mock.
2. Argon2/bcrypt per password.
3. Rimozione fallback admin.
4. Patch XSS principali in `app.js` e `games.js`.
5. Rate limiting login/register/play/voucher/QR.
6. CORS allowlist.

### Fase 1 - Integrita premi e multi-tenant

1. Transazione atomica play + premio + voucher.
2. Unique constraint su `sessionKey + campaignId`.
3. Redeem voucher atomico.
4. RBAC owner/staff/partner/admin.
5. Rimozione endpoint legacy admin.

### Fase 2 - GDPR baseline

1. Consent log versionato.
2. Privacy/terms linkati e versionati.
3. Export/delete/anonymize dati giocatore.
4. Retention job.
5. Mascheramento IP e minimizzazione `customerData`.

### Fase 3 - Scalabilita e operativita

1. Aggregazioni DB per statistiche.
2. Indici Prisma/Postgres.
3. CI/CD con migrate deploy.
4. Security headers.
5. Refactor API modulare.

---

## Endpoint da Considerare Pericolosi

- `POST /api/auth/login`: brute force, fallback admin, token mock.
- `POST /api/auth/register-store`: spam tenant, trial abuse.
- `POST /api/public/play`: frode premi, race condition, PII.
- `GET /api/public/campaign`: leak probabilita e stock.
- `GET /api/public/qr`: abuso CPU/bandwidth.
- `POST /api/store/vouchers/redeem`: race condition su riscatto.
- `PUT /api/store/campaigns/:id/prizes/:prizeId`: manipolazione stock.
- `/api/admin/*` e legacy `/api/stores`, `/api/users`, `/api/campaigns`: critici finche auth e mock.

---

## Query Inefficienti Prioritarie

1. `GET /api/store/campaigns`: include tutte le partecipazioni e voucher per campagna e calcola stats in memoria.
2. Liste admin/store con limite fisso 100 senza paginazione/cursor.
3. Voucher senza indici su `(storeId, createdAt)`, `(storeId, redeemed)`, `expiresAt`.
4. Participation senza indice diretto `(campaignId, createdAt)`.

---

## Conclusione CTO

Il prodotto ha raggiunto un buon livello di prototipo SaaS funzionale, ma oggi e ancora in stato "pre-production security". La priorita non e aggiungere nuovi giochi o Stripe: e rendere affidabili auth, isolamento tenant, GDPR e consistenza premi.

Raccomandazione: bloccare nuove feature core finche non sono completate almeno Fase 0 e Fase 1. Stripe e pagamenti reali non dovrebbero essere integrati prima di aver rimosso token mock, XSS e race condition sui premi.
