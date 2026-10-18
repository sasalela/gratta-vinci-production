# Gratta & Vinci

Web app multi-tenant per campagne promozionali (gratta e vinci, ruota, tre scatole) con QR code, per un singolo negozio o per rivenditori. Le pagine sono statiche. L’API è un solo handler Vercel (`api/index.ts`) e i dati stanno su Postgres tramite Prisma.

## Variabili d’ambiente

Servono solo i **nomi** qui sotto. I valori restano nel pannello Vercel o in un `.env` locale, mai nel repository.

Obbligatorie:

- `DATABASE_URL` — connessione Postgres usata dall’applicazione (pooler, se il provider lo prevede)
- `DIRECT_URL` — connessione Postgres diretta, usata da Prisma per le migrazioni
- `JWT_SECRET` — firma dei token di accesso (almeno 16 caratteri). In alternativa viene letto `AUTH_SECRET`
- `ADMIN_EMAIL` — email del super-admin
- `ADMIN_PASSWORD` — password del super-admin

Facoltative:

- `APP_BASE_URL` — origine pubblica usata nei link di conferma email. Se manca, si usa l’host della richiesta
- `TRIAL_DAYS` — durata del periodo di prova alla registrazione (default 14)
- `EMAIL_VERIFICATION_TTL_HOURS` — scadenza del link di conferma (default 24, massimo 168)
- `MAIL_FROM` — mittente, obbligatorio insieme a `RESEND_API_KEY`
- `RESEND_API_KEY` — se presente insieme a `MAIL_FROM`, le email partono da Resend
- `MAIL_WEBHOOK_URL` — se presente (e Resend non è configurato), le email sono inviate in POST JSON a questo indirizzo

Senza `RESEND_API_KEY` + `MAIL_FROM` e senza `MAIL_WEBHOOK_URL`, il mailer scrive il messaggio nel log del server. Va bene in sviluppo. In produzione configura un provider prima di far registrare negozi veri: il link di conferma finirebbe solo nei log.

La forma dei segnaposto, senza segreti reali, è in `.env.example`.

## Collegare Postgres e applicare le migrazioni su Vercel

Questi passaggi li esegue il proprietario del progetto. Non committare URL, password o chiavi.

1. Crea un database Postgres (Neon, Supabase, Postgres di Vercel o un altro provider).
2. Nel progetto Vercel apri **Settings → Environment Variables**.
3. Imposta `DATABASE_URL` con la stringa di connessione usata a runtime (quella pooled, se esiste).
4. Imposta `DIRECT_URL` con la stringa di connessione diretta. Prisma la usa per `migrate deploy`.
5. Imposta `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
6. Da una macchina fidata, con quelle variabili nell’ambiente e **senza** scriverle nel repo, applica le migrazioni già presenti in `prisma/migrations`:

   ```bash
   npx prisma migrate deploy
   ```

7. Ridistribuisci il progetto Vercel così il runtime legge le variabili.
8. Apri `GET /api/health`.

   - `200` con `database: "connected"` significa che il database risponde.
   - `503` con `database: "unavailable"` e `code: "DB_UNAVAILABLE"` significa che l’URL manca o il database non è raggiungibile. La risposta non contiene l’errore interno: quello resta nei log del server.

Finché `DATABASE_URL` non è impostata, l’app risponde comunque. Le operazioni che hanno bisogno dei dati restituiscono un messaggio generico e il codice `DB_UNAVAILABLE`, senza stack trace né dettagli di Prisma.

## Conferma email

La registrazione di un negozio crea l’account e invia un link con un token che scade. L’accesso è consentito solo dopo `POST /api/auth/verify-email`. Gli utenti già presenti vengono segnati come confermati dalla migrazione `20261018170000_email_verification`, così non restano bloccati. Gli utenti creati da admin o da un gestore sono confermati subito.

Login, registrazione, conferma e reinvio del link sono limitati per indirizzo IP (e, per il login, anche per email). Il limite è in memoria del processo: su più istanze serverless non è condiviso.

## Sviluppo

```bash
npm install
npx prisma generate
npm test
```

`npm test` non apre connessioni a un database remoto. Non eseguire `prisma migrate` contro la produzione da questa procedura automatica.

## Sicurezza operativa

- Gli esiti di gioco, i codici voucher e le quantità residue dei premi sono decisi solo dal server.
- Lo staff può solo controllare e riscattare i codici. Non modifica campagne, premi, impostazioni o utenti.
- Le risposte di errore non includono messaggi interni, stack o nomi di variabili d’ambiente.
