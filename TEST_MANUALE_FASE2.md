# Test manuale — Fase 2 Admin minima

Verifica pagina `/admin.html` e endpoint read-only `/api/admin/*`.

## Prerequisiti

- Fase 1 completata (DB Supabase, seed, gioco funzionante)
- `.env` con `ADMIN_EMAIL` e `ADMIN_PASSWORD` configurati
- Server avviato:

```bash
npm run dev
```

URL admin:

```
http://localhost:3000/admin.html
```

---

## Checklist

| # | Test | Azione | Esito atteso |
|---|------|--------|--------------|
| T1 | Pagina senza login | Apri `/admin.html` in finestra privata | Solo form login, dashboard nascosta |
| T2 | Login errato | Email/password sbagliate → Accedi | Messaggio errore, nessuna tabella |
| T3 | Login ok | Credenziali da `.env` | Dashboard visibile con 3 tabelle |
| T4 | Coerenza DB | Gioca su `/?store=bar-giorgio&campaign=birra-gratis`, poi Aggiorna in admin | Nuove righe in Partecipazioni e Voucher |
| T5 | API senza token | `curl http://localhost:3000/api/admin/vouchers` | `401 Unauthorized` |
| T6 | API token falso | `curl -H "Authorization: Bearer token-falso" http://localhost:3000/api/admin/vouchers` | `403 Forbidden` |
| T7 | Logout | Click **Esci** | Torna al login, token rimosso da sessionStorage |
| T8 | Persistenza | Riavvia `vercel dev`, riapri admin e accedi | Dati ancora presenti |

---

## Comandi curl utili

### Login admin

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "TUO_ADMIN_EMAIL",
    "password": "TUA_ADMIN_PASSWORD"
  }'
```

Risposta attesa: `token: "mock-super-admin-token"`.

### Lista voucher (autenticato)

```bash
curl -H "Authorization: Bearer mock-super-admin-token" \
  http://localhost:3000/api/admin/vouchers
```

### Lista campagne

```bash
curl -H "Authorization: Bearer mock-super-admin-token" \
  http://localhost:3000/api/admin/campaigns
```

### Lista partecipazioni

```bash
curl -H "Authorization: Bearer mock-super-admin-token" \
  http://localhost:3000/api/admin/participations
```

---

## Verifica contenuto tabelle

### Campagne

Colonne attese: nome, slug, negozio, attiva, date, max giocate, creata.

### Partecipazioni

Colonne attese: email, campagna, IP, session key, data.

### Voucher

Colonne attese: codice, email, premio, campagna, riscattato, scadenza, creato.

---

## Note sicurezza (Fase 2)

- `/admin.html` è un URL pubblico; i dati sono protetti solo via API + credenziali admin.
- Il token admin è ancora mock (`mock-super-admin-token`).
- Le tabelle mostrano email e IP: accesso riservato a personale autorizzato.
- Ogni tabella mostra al massimo **100** record recenti.

---

## Fuori scope (non testare qui)

- Modifica/eliminazione dati
- Dashboard grafica
- JWT / ruoli multiutente
- Riscatto voucher da admin
