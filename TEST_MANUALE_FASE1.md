# Test manuale — Fase 1 minima

Setup richiesto prima dei test.

## 1. Configurazione Supabase

1. Crea un progetto su [Supabase](https://supabase.com)
2. Vai in **Project Settings → Database → Connection string**
3. Copia `.env.example` in `.env.local` (locale) o configura le variabili su Vercel (production)
4. Imposta:
   - `DATABASE_URL` — connection pooler (porta **6543**, `?pgbouncer=true`)
   - `DIRECT_URL` — connessione diretta (porta **5432**)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — opzionali per Fase 1 gioco pubblico

## 2. Setup locale

```bash
npm install
npm run db:migrate:dev
npm run db:seed
npm run dev
```

URL di test:

```
http://localhost:3000/?store=bar-giorgio&campaign=birra-gratis
```

---

## Checklist test

### A. Database e API

| # | Test | Comando / azione | Esito atteso |
|---|------|------------------|--------------|
| A1 | Health + DB | `curl http://localhost:3000/api/health` | `{ "status": "ok", "database": "connected" }` |
| A2 | Play valido | POST `/api/public/play` con body JSON valido | `200`, `voucherCode` presente |
| A3 | Persistenza | Dopo play, controlla Supabase → tabella `Voucher` | Nuova riga con email e codice |
| A4 | Max giocate | Ripeti A2 stesso IP/campagna | `429 Maximum plays reached` |
| A5 | Store errato | `storeSlug: "inesistente"` | `404 Store not found` |
| A6 | Privacy mancante | `privacyConsent: false` | `400 Privacy consent required` |
| A7 | Sopravvive restart | Riavvia `vercel dev`, ripeti GET health + query DB | Dati voucher ancora presenti |

**Esempio curl play:**

```bash
curl -X POST http://localhost:3000/api/public/play \
  -H "Content-Type: application/json" \
  -d '{
    "storeSlug": "bar-giorgio",
    "campaignSlug": "birra-gratis",
    "email": "test@esempio.it",
    "privacyConsent": true
  }'
```

### B. Frontend integrato

| # | Test | Azione | Esito atteso |
|---|------|--------|--------------|
| B1 | URL senza parametri | Apri `http://localhost:3000/` | Messaggio errore URL, nessun form gioco |
| B2 | URL valido | Apri URL con `?store=bar-giorgio&campaign=birra-gratis` | Form email + checkbox visibili |
| B3 | Email vuota | Click "Gioca" senza email | Errore lato UI |
| B4 | Privacy non accettata | Email ok, checkbox off | Errore consenso privacy |
| B5 | Flusso completo | Email ok + privacy + Gioca + raschia canvas | Premio server + codice voucher visibili |
| B6 | Network | DevTools → Network | Una sola `POST /api/public/play` per partita |
| B7 | Seconda partita stesso browser | Ricarica pagina e ripeti B5 | Errore "Maximum plays reached" |
| B8 | Raschia di nuovo | Dopo rivelazione, click "Raschia di nuovo" | Canvas resettato, stesso voucher (nessuna nuova API call) |

### C. Supabase (verifica dati)

In **Table Editor** Supabase:

| Tabella | Cosa verificare |
|---------|-----------------|
| `Store` | 1 riga: `bar-giorgio` |
| `Campaign` | 1 riga: `birra-gratis`, `prizes` JSON con 2 premi |
| `Participation` | 1 riga per ogni giocata test |
| `Voucher` | 1 riga collegata alla partecipazione, `redeemed = false` |

### D. Deploy Vercel (opzionale)

1. Aggiungi `DATABASE_URL`, `DIRECT_URL`, `ADMIN_*` nelle Environment Variables del progetto Vercel
2. Esegui `npm run db:migrate` contro il DB Supabase production
3. Esegui `npm run db:seed` (solo prima volta)
4. Deploy → testa URL production con query string

---

## Problemi comuni

| Sintomo | Causa probabile | Soluzione |
|---------|-----------------|-----------|
| `database: connected` mancante / 500 su health | `DATABASE_URL` errata o migrate non eseguita | Verifica env + `npm run db:migrate` |
| `Store not found` | Seed non eseguito | `npm run db:seed` |
| `Campaign not active` | Date campagna scadute | Aggiorna `endDate` in Supabase o re-seed |
| Pagina bianca su Vercel | `vercel.json` o env mancanti | Verifica build logs e variabili env |
| Prisma migrate fallisce | `DIRECT_URL` mancante | Usa porta 5432 per migrate, 6543 per runtime |

---

## Scope Fase 1 — fuori test

Non testare in questa fase (non implementato):

- Dashboard admin / negozio
- Login JWT avanzato
- Riscatto voucher
- QR code generator
- Antifrode oltre IP+campagna
