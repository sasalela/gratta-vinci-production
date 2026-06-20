# Test manuale — Fase 3 Step 1

Obiettivo: verificare base multi-tenant, pannello negozio, premi a inventario, gioco con campi dinamici e voucher riscattabili.

## 1. Migrazione e seed

```bash
npm run db:migrate:dev
npm run db:seed
npm run dev
```

Utente negozio demo:

- email: `bar@giorgio.it`
- password: `password123`

## 2. Pannello negozio

Apri:

```text
http://localhost:3000/store.html
```

Checklist:

- [ ] Login con `bar@giorgio.it / password123`
- [ ] Vedi nome negozio e campagne
- [ ] Crea una nuova campagna con date valide
- [ ] Aggiungi un premio con quantità e percentuale vincita
- [ ] La campagna mostra premi e quantità residue
- [ ] La sezione alert è visibile

## 3. Gioco pubblico

Apri:

```text
http://localhost:3000/?store=bar-giorgio&campaign=birra-gratis
```

Checklist:

- [ ] La pagina carica nome campagna e colori del negozio
- [ ] Il form mostra i campi configurati dalla campagna
- [ ] Con dati mancanti, l’API blocca la giocata
- [ ] Con dati validi, parte il gratta e vinci
- [ ] Se vince, mostra premio + codice voucher
- [ ] Se perde, mostra messaggio perdita configurato
- [ ] La seconda giocata viene bloccata in base al limite campagna/giorno

## 4. Riscatto voucher

Nel pannello negozio:

- [ ] Incolla codice voucher in “Valida voucher”
- [ ] Click “Verifica” mostra stato valido/scaduto/riscattato
- [ ] Click “Riscatta” segna il voucher come usato
- [ ] Secondo riscatto dello stesso codice viene bloccato

## 5. Alert premi esauriti

Per test rapido:

1. Crea una campagna con un premio quantità `1` e percentuale `100`
2. Gioca una volta e vinci
3. Torna su `/store.html`
4. Verifica alert premi esauriti
5. Entra su `/admin.html`
6. Verifica alert nella tabella admin

## Note

- L’email reale al negoziante non è ancora collegata a un provider esterno. L’alert viene salvato nel database e mostrato nei pannelli admin/negozio.
- Il progetto resta predisposto per più giochi tramite `gameType`, ma in questo step è implementato solo `scratch_card`.
