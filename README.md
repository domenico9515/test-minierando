# Gestione Resoconto Miniere

Applicazione web per l'elaborazione, l'archiviazione e la formattazione dei resoconti giornalieri e cumulativi minerari. È pensata per un browser game manageriale (come *Renaissance Kingdoms / I Regni Rinascimentali*), al fine di facilitare i calcoli giornalieri e settimanali per la produzione delle miniere e la condivisione dei bilanci sul forum.

---

## Funzionalità Principali

- **Selezione del Giorno del Resoconto**: estrazione automatica di tutte le date disponibili nel testo incollato, con calcolo automatico dei consumi di manutenzione registrati nel giorno successivo rispetto alla produzione.
- **Calcolo Stipendi Miniere (Orario `÷ 20` e Totale in base all'Affluenza)**: inserimento dello stipendio per ciascuna miniera (o rapido per tutte), calcolo automatico dello stipendio per singola ora (`Stipendio / 20`) e dello stipendio totale della miniera in base all'affluenza estratta dal resoconto su **1 giorno, 7 giorni, 15 giorni e 30 giorni**.
- **Calcolo del Valore di `1 Pietra` e `1 Ferro` (1, 7, 15 e 30 giorni)**: determinazione del valore unitario di 1 Pietra e 1 Ferro tramite il sistema di formule basato su Stipendio Totale Miniere di Pietra/Ferro, Produzione Netta Miniere di Pietra/Ferro e Consumi incrociati di Ferro/Pietra, con applicazione automatica o manuale al resoconto.
- **Calcolo Giornaliero Individuale e Complessivo**: calcolo dei materiali estratti (Oro, Ferro, Pietra, Argilla) al netto della manutenzione e dei salari dei minatori, con controvalore economico in ducati.
- **Generazione Visuale in HTML**: anteprima immediata con formattazione cromatica (verde per il profitto, rosso per la perdita).
- **Esportazione in BBCode per il Forum**: generazione automatica del codice formattato con icone ufficiali delle risorse pronto da copiare e incollare sul forum del gioco.
- **Salvataggio Giornaliero in JSON (`💾 Salva Giorno`)**: archiviazione strutturata dei dati del giorno selezionato. Se lo stesso giorno viene salvato più di una volta, il sistema **chiede conferma di sovrascrittura** all'utente prima di aggiornare il dato.
- **Visualizzazione Giorni Salvati (`👁️ Mostra`)**: permette di selezionare qualsiasi giorno presente in archivio e mostrarne a schermo il resoconto completo (inclusa la possibilità di rigenerarne il BBCode).
- **Resoconto Finale Cumulativo (`📊 Resoconto Finale`)**: conteggia e somma automaticamente tutti i giorni salvati nell'archivio, mostrando una tabella riepilogativa giorno per giorno, il totale cumulativo per ciascuna miniera, il totale dei salari e il bilancio complessivo finale (sia in HTML che in BBCode).
- **Grafici e Statistiche delle Miniere (`📈 Grafici e Statistiche` / `↗️ Apri separatamente`)**: nuova sezione dedicata (apribile sia inline nella pagina che separatamente in una scheda/finestra dedicata tramite `?vista=statistiche`, `statistiche.html` o `/statistiche`) che elabora esclusivamente i dati salvati in archivio. Include filtri per periodo/intervallo date e per tipo di miniera, KPI riassuntivi, 8 grafici interattivi SVG (andamento economico giornaliero e cumulativo, oro vs salari, andamento risorse e ore di lavoro nel tempo, ripartizione a ciambella, lordo vs costi, classifica miniere, trend storico per singola miniera con legenda cliccabile, consumi manutenzione e operatività), tabella ordinabile per miniera, riepilogo record/prezzi ed esportazione CSV.
- **Autenticazione Sicura (Procedura Modello `superset`)**: protezione degli accessi basata sull'architettura di autenticazione del progetto Superset (`superset-db-sync`):
  - Hashing crittografico avanzato **scrypt** (salt a 16 byte + chiave a 64 byte, formato `scrypt:<salt_hex>:<hash_hex>`), senza password in chiaro nel codice o nei file di configurazione.
  - Sessioni protette tramite cookie **`HttpOnly`** con firma crittografica HMAC-SHA256 (`base64url`), validità 8 ore e policy `SameSite=Strict`.
  - **Freno anti brute-force per IP**: blocco temporaneo (HTTP 429) dopo 10 tentativi falliti in 5 minuti.
  - **Logout automatico per inattività (30 minuti)**: disconnessione client/server trasparente con notifica al reload se l'operatore non interagisce con la pagina per oltre 30 minuti.
  - **Pulsante mostra/nascondi password**: pulsante ad occhio interattivo con accessibilità ARIA.
  - Tool CLI di generazione hash: script `tool_script/crea-hash.js` (`npm run hash-pw <password>`).
- **Backup su File `.json` (`📥 Esporta` / `📤 Importa`)**: possibilità di scaricare l'intero archivio in un file `.json` sul proprio computer e ricaricarlo in qualsiasi momento.

---

## Guida all'Utilizzo

### Modalità Server Node.js (Consigliata per autenticazione completa Superset)
1. Installa le dipendenze (se non già fatto):
   ```bash
   npm install
   ```
2. Avvia il server Express con la procedura di autenticazione Superset:
   ```bash
   npm start
   ```
3. Apri il browser all'indirizzo `http://localhost:3114`.
4. Effettua l'accesso con le credenziali predefinite:
   - Utente: **`admin`** | Password: **`admin`**
   - Utente ausiliario: **`sindaco`** | Password: **`password123`**

### Generazione di nuovi Hash Password (Stile Superset)
Per cambiare password o aggiungere un nuovo hash in `config/.env`:
```bash
npm run hash-pw mia_nuova_password
# oppure:
node tool_script/crea-hash.js mia_nuova_password
```
Copia l'output ottenuto nel file `config/.env` alla voce `WEB_PASSWORD_HASH=...`.

### Modalità Standalone Browser
Puoi anche aprire direttamente il file `index.html` con doppio clic in qualsiasi browser: la schermata di login funzionerà in locale validando le credenziali predefinite.

### Deploy su Netlify (Soluzione 1 - Netlify Functions Serverless)
Il progetto è configurato per il deploy nativo su **Netlify** mantenendo l'autenticazione server-side sicura basata su `scrypt` e cookie di sessione `HttpOnly`:
1. **File di configurazione**:
   - `netlify.toml`: definisce la cartella dei file statici (`.`), la cartella delle funzioni (`netlify/functions`) e le regole di rewrite da `/api/*` a `/.netlify/functions/api/:splat` oltre al redirect per `/statistiche`.
   - `netlify/functions/api.js`: adatta l'app Express in una funzione serverless con `serverless-http` e normalizzazione degli header `Set-Cookie`.
2. **Procedura di deploy**:
   - Collega il repository GitHub su Netlify (es. `test-minierando`).
   - Impostazioni di build:
     - **Base directory**: vuota (root)
     - **Build command**: vuoto (nessun passaggio di build necessario)
     - **Publish directory**: `.`
     - **Functions directory**: `netlify/functions` (rilevata in automatico da `netlify.toml`).
   - (Opzionale) Nelle impostazioni di Netlify (**Site configuration > Environment variables**) puoi impostare:
     - `WEB_USER`: nome utente amministratore (default: `admin`)
     - `WEB_PASSWORD_HASH`: hash scrypt generato con `npm run hash-pw`
     - `WEB_SESSION_SECRET`: chiave HMAC segreta casuale
     - `STRUCTURE_NAME`: nome personalizzato della struttura/comune

### Utilizzo del Gestionale Miniere
2. **Incolla il resoconto** del gioco nell'apposita casella di testo: il menu a tendina **Giorno del resoconto** si popolerà automaticamente con le date rilevate nel testo.
3. Scegli la data desiderata e imposta i **Salari dei minatori** e il **valore unitario in ducati** delle risorse (Ferro, Pietra, Argilla).
4. Usa i pulsanti principali:
   - **Genera HTML Visivo**: mostra a schermo il bilancio del giorno selezionato.
   - **Genera Formattazione**: genera il codice BBCode da copiare per il forum.
   - **💾 Salva Giorno**: salva i dati elaborati del giorno selezionato nell'archivio JSON. Se il giorno esiste già, apparirà un messaggio di conferma per chiedere se sovrascriverlo.
5. Usa la sezione **🗄️ Archivio Giorni Salvati**:
   - Seleziona una data dal menu **Seleziona giorno salvato** e clicca su **👁️ Mostra** per rivedere il resoconto di quel giorno.
   - Clicca su **📊 Resoconto Finale** per conteggiare tutti i giorni salvati e visualizzare il bilancio finale complessivo.
   - Clicca su **📈 Grafici e Statistiche** per aprire nella pagina la dashboard interattiva con tutti i grafici e le statistiche calcolate dai giorni salvati, oppure su **↗️ Apri separatamente** per aprirla in una scheda/finestra dedicata.
   - Clicca su **🗑️ Elimina** per rimuovere il singolo giorno selezionato oppure **🧹 Svuota Tutto** per azzerare l'archivio.
   - Clicca su **📥 Esporta file JSON** o **📤 Importa file JSON** per salvare o caricare l'archivio su file esterno.

---

## Analisi Tecnica del Codice

Di seguito viene spiegato passo-passo il funzionamento tecnico del progetto (composto da `index.html`, `style.css` e `script.js`).

### 1. La Mappatura dei Nodi (`nodiMap` in `script.js`)
All'inizio del file JavaScript troviamo l'oggetto `nodiMap`. È un dizionario che permette allo script di capire di che tipo di miniera si tratta leggendo il "Numero del nodo" dal resoconto incollato. Se ad esempio viene letto `Nodo 1135`, lo script sa automaticamente che la miniera si trova *"tra Livorno e Volterra"*, estrae **oro** e vi associa l'emoji e l'URL dell'immagine corretta per il forum.

### 2. L'Interfaccia Utente (`index.html` e `style.css`)
La pagina è divisa in quattro aree principali:
*   **Sezione di Input**: casella `<textarea>` per il resoconto, selettore `<select id="dataSelezionata">` per la data da analizzare, campi numerici per salari e prezzi di mercato, e i tre bottoni d'azione (`Genera HTML Visivo`, `Genera Formattazione`, `💾 Salva Giorno`).
*   **Sezione Archivio (`archive-section`)**: mostra il contatore dei giorni salvati, il menu a tendina `<select id="giornoSalvatoSelect">` con l'elenco dei giorni in archivio (e relativo totale in ducati) e i pulsanti `👁️ Mostra`, `📊 Resoconto Finale`, `🗑️ Elimina`, `📥 Esporta file JSON`, `📤 Importa file JSON` e `🧹 Svuota Tutto`.
*   **Sezione Output Visivo (`#output-section`)**: mostra l'intestazione del report, l'eventuale tabella riepilogativa dei giorni (nel Resoconto Finale), i valori individuali per miniera e la situazione complessiva.
*   **Sezione Output BBCode (`#bbcode-section`)**: mostra la casella di testo con il codice BBCode formattato e il pulsante `📋 Copia Codice`.

### 3. Estrazione delle Date e Decodifica (`estraiDateDisponibili` e `parseReport`)
*   **`estraiDateDisponibili()`**: ad ogni modifica del testo incollato, analizza i blocchi di produzione con un'espressione regolare (`^\d{4}-\d{2}-\d{2}`) per raccogliere tutte le date presenti, ordinarle cronologicamente e popolare il menu a tendina selezionando di default la data più recente.
*   **`parseReport(testo, dataScelta)`**:
    *   Divide il testo in blocchi per ciascuna miniera (`Miniera [numero]:`).
    *   Estrae ID della miniera, numero del Nodo, stato di eventuale chiusura (`- CHIUSO`) e la produzione corrispondente alla `dataScelta`.
    *   **Calcolo dei consumi posticipati**: poiché nel gioco i consumi di manutenzione relativi alla produzione di un giorno compaiono nel report con la data del giorno successivo, la funzione calcola `dataScelta + 1 giorno` (`dataConsumi`) per associare correttamente i quintali di pietra e i chili di ferro consumati.

### 4. Il Cuore dei Calcoli (`elaboraDati`)
Raccoglie la data selezionata, i dati delle miniere da `parseReport` e i valori inseriti dall'utente:
*   Esegue la **sommatoria della produzione lorda** e delle **spese di manutenzione** ignorando le miniere chiuse o sconosciute.
*   **Calcola il Netto e il Controvalore**: sottrae i salari dall'oro prodotto e i materiali di manutenzione da ferro e pietra estratti; moltiplica quindi i netti per i rispettivi prezzi unitari in ducati ottenendo il `totaleDucati`.

### 5. Scelta del Formato JSON e Gestione Archivio (`salvaGiorno`, `esportaJSON`, `importaJSON`)
Per il salvataggio dei dati giornalieri è stato scelto il formato **JSON** rispetto a un file `.txt` per i seguenti vantaggi tecnici:
*   **Struttura tipizzata**: ogni giornata viene salvata come oggetto JSON completo contenente `data`, `salvatoIl`, `salari`, prezzi unitari (`vFerro`, `vPietra`, `vArgilla`), array `minere` e tutti i totali lordi, netti e in ducati.
*   **Verifica immediata delle sovrapposizioni**: indicizzando l'archivio tramite la chiave della data (es. `"2026-10-08": { ... }`), la funzione `salvaGiorno()` verifica istantaneamente se `archivio[d.data]` esiste già e, in caso affermativo, invoca `confirm()` chiedendo all'utente conferma prima di sovrascrivere il giorno.
*   **Persistenza ibrida (`localStorage` + File `.json`)**: l'archivio JSON viene salvato nel `localStorage` del browser per essere immediatamente disponibile tra una sessione e l'altra, e può essere esportato/importato come file `.json` fisico tramite `esportaJSON()` e `importaJSON()`.

### 6. Visualizzazione Storico e Resoconto Finale (`mostraGiornoSalvato` e `generaResocontoFinale`)
*   **`mostraGiornoSalvato()`**: legge dal JSON il giorno selezionato nel menu dell'archivio, ripristina a video i parametri di salari/prezzi di quel giorno e invoca `renderDatiHTML()` per mostrarne il dettaglio completo (con pulsante rapido per generare anche il BBCode di quel giorno tramite `generaBBCodeGiornoSalvato()`).
*   **`calcolaDatiFinali()` e `generaResocontoFinale()`**:
    *   Scorre tutti i giorni salvati nell'archivio JSON ordinati per data.
    *   Somma le produzioni e le manutenzioni **miniera per miniera** (`minereTotaliMap`) e calcola le somme complessive di produzione lorda, manutenzione, salari, produzione netta e controvalore totale in ducati.
    *   Costruisce una **tabella riepilogativa** con il dettaglio di ogni singolo giorno conteggiato, seguita dal resoconto cumulativo completo in HTML e dalla possibilità di generare il **BBCode del Resoconto Finale** (`generaBBCodeResocontoFinale()`).

### 7. Sistema di Autenticazione e Sessioni (Modello `superset`)
L'autenticazione è stata integrata ereditando la procedura di sicurezza del progetto `superset` (`superset-db-sync`):
*   **Hashing Password con `scrypt`**: le password non vengono mai salvate in chiaro né memorizzate nel codice sorgente. Il server confronta le credenziali calcolando la derivazione di chiave con `crypto.scryptSync(password, salt, 64)` e verificando in tempo costante (`crypto.timingSafeEqual`) contro il valore configurato in `config/.env` (`WEB_PASSWORD_HASH`).
*   **Token di Sessione Firmati HMAC-SHA256**: alla riuscita del login viene generato un token crittografico formato da `<dati_base64url>.<hmac_base64url>`, firmato con `WEB_SESSION_SECRET`.
*   **Cookie HttpOnly e SameSite=Strict**: il token viene trasmesso e memorizzato esclusivamente tramite cookie protetto `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` (durata sessione: 8 ore), prevenendo attacchi XSS e CSRF.
*   **Freno ai Tentativi Ripetuti (Rate Limiting per IP)**: il server monitora per ogni IP i tentativi errati consecutivi; superata la soglia di 10 tentativi falliti nell'arco di 5 minuti, blocca temporaneamente le richieste rispondendo con HTTP 429 (*Troppi tentativi falliti: riprova tra qualche minuto*).
*   **Logout Automatico per Inattività (30 Minuti)**: il client monitora gli effettivi eventi utente (`mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`). Se l'operatore non compie azioni per più di 30 minuti, scatta l'auto-logout chiamando `/api/logout` e ricaricando la pagina, mostrando l'avviso dedicato nella schermata di login.
*   **Endpoint di Backend**:
    *   `GET /api/config`: restituisce stato di autenticazione corrente e nome applicazione.
    *   `POST /api/login`: riceve `{ utente, password }`, convalida l'hash e invia il cookie `sds_sessione`.
    *   `POST /api/logout`: invalida il cookie di sessione impostando `Max-Age=0`.
    *   `app.use('/api', ...)`: disattiva la cache per tutte le chiamate API (`Cache-Control: no-store`).
*   **Interfaccia Utente (`index.html` e `style.css`)**:
    *   Schermata di login a pieno schermo dedicata (`#schermata-login`) con grafica coordinata Superset (gradiente circolare teal scuro, card centrale, logo e pillola informativa).
    *   Campo password con icona occhio interattiva per mostrare/nascondere la password in chiaro.
    *   Barra superiore applicativa (`.barra-superiore`) con indicatore di stato connessione attivo (pallino verde), nome utente autenticato e pulsante *Esci*.
*   **Credenziali predefinite**:
    *   `admin` / `admin` (configurato in `config/.env`)
    *   `sindaco` / `password123` (configurato come utente ausiliario)
