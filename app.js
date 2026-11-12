'use strict';

/**
 * Express App - Gestione Resoconto Miniere
 * Autenticazione e gestione sessione derivata dal modello superset (superset-db-sync)
 * Supporta sia il server Node.js locale (server.js) che Netlify Functions (serverless)
 * con persistenza cloud ibrida tramite Netlify Blobs e fallback locale
 */

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');
const config = require('./config/env/all');

const app = express();

const STRUCTURE_NAME = config.appName;
const WEB_USER = config.webUser;
const WEB_PASSWORD_HASH = config.webPasswordHash;
const SESSION_SECRET = config.sessionSecret;
const DURATA_SESSIONE_MS = config.durataSessioneMs;
const COOKIE_NAME = config.cookieName;

const LOCAL_STORAGE_FILE = path.join(__dirname, 'config', 'archivio_cloud_fallback.json');

// Abilita CORS con credenziali per supportare chiamate sia locali che su Netlify
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cache-control no-store per tutte le API, identico a superset
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// ============================================================
// GESTIONE PERSISTENZA CLOUD (NETLIFY BLOBS + FALLBACK LOCALE)
// ============================================================
function ottieniStoreBlobs() {
    try {
        return getStore({ name: 'minierando_dati', consistency: 'strong' });
    } catch {
        return null;
    }
}

async function leggiDatiStore() {
    const store = ottieniStoreBlobs();
    if (store) {
        try {
            const dati = await store.get('archivio_completo', { type: 'json' });
            if (dati && typeof dati === 'object') {
                return {
                    archivio: (dati.archivio && typeof dati.archivio === 'object') ? dati.archivio : {},
                    stipendi: (dati.stipendi && typeof dati.stipendi === 'object') ? dati.stipendi : {},
                    aggiornatoIl: dati.aggiornatoIl || null,
                    provider: 'netlify_blobs'
                };
            }
        } catch (e) {
            console.warn('Avviso lettura Netlify Blobs:', e.message);
        }
    }

    // Fallback locale su file JSON per ambienti locali o offline
    if (fs.existsSync(LOCAL_STORAGE_FILE)) {
        try {
            const raw = JSON.parse(fs.readFileSync(LOCAL_STORAGE_FILE, 'utf8'));
            return {
                archivio: (raw.archivio && typeof raw.archivio === 'object') ? raw.archivio : {},
                stipendi: (raw.stipendi && typeof raw.stipendi === 'object') ? raw.stipendi : {},
                aggiornatoIl: raw.aggiornatoIl || null,
                provider: 'local_file'
            };
        } catch {}
    }

    return { archivio: {}, stipendi: {}, aggiornatoIl: null, provider: 'vuoto' };
}

async function scriviDatiStore(payload) {
    const datiNormalizzati = {
        archivio: (payload && typeof payload.archivio === 'object') ? payload.archivio : {},
        stipendi: (payload && typeof payload.stipendi === 'object') ? payload.stipendi : {},
        aggiornatoIl: new Date().toISOString()
    };

    let salvatoSuBlobs = false;
    const store = ottieniStoreBlobs();
    if (store) {
        try {
            await store.setJSON('archivio_completo', datiNormalizzati);
            salvatoSuBlobs = true;
        } catch (e) {
            console.warn('Avviso scrittura Netlify Blobs:', e.message);
        }
    }

    // Salva sempre anche su file locale per ridondanza/offline
    try {
        fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(datiNormalizzati, null, 2), 'utf8');
    } catch {}

    return {
        ok: true,
        salvato: true,
        provider: salvatoSuBlobs ? 'netlify_blobs' : 'local_file',
        aggiornatoIl: datiNormalizzati.aggiornatoIl
    };
}

// ============================================================
// SESSIONE E LOGIN (MODELLO SUPERSET)
// ============================================================
function firmaToken(payload) {
    const dati = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = crypto.createHmac('sha256', SESSION_SECRET).update(dati).digest('base64url');
    return `${dati}.${mac}`;
}

function leggiToken(token) {
    const [dati, mac] = String(token || '').split('.');
    if (!dati || !mac) return null;
    const atteso = crypto.createHmac('sha256', SESSION_SECRET).update(dati).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(atteso);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(dati, 'base64url').toString('utf8'));
        return payload.exp > Date.now() ? payload : null;
    } catch {
        return null;
    }
}

// Formato: scrypt:<salt esadecimale>:<hash esadecimale>
function verificaPassword(password, hashSalvato) {
    const parti = String(hashSalvato).split(':');
    if (parti.length !== 3 || parti[0] !== 'scrypt') return false;
    try {
        const salt = Buffer.from(parti[1], 'hex');
        const atteso = Buffer.from(parti[2], 'hex');
        const calcolato = crypto.scryptSync(password, salt, atteso.length);
        return crypto.timingSafeEqual(calcolato, atteso);
    } catch {
        return false;
    }
}

function leggiCookie(req, nome) {
    const grezzo = (req && req.headers && req.headers.cookie) ? req.headers.cookie : '';
    for (const pezzo of grezzo.split(';')) {
        const i = pezzo.indexOf('=');
        if (i === -1) continue;
        if (pezzo.slice(0, i).trim() === nome) return decodeURIComponent(pezzo.slice(i + 1).trim());
    }
    return null;
}

function generaCookieSessione(token, req, maxAgeSecondi = DURATA_SESSIONE_MS / 1000) {
    const isHttps = Boolean(
        (req && (req.secure || (req.headers && req.headers['x-forwarded-proto'] === 'https'))) ||
        process.env.NETLIFY ||
        process.env.NODE_ENV === 'production'
    );
    const valore = token ? encodeURIComponent(token) : '';
    const secureFlag = isHttps ? '; Secure' : '';
    return `${COOKIE_NAME}=${valore}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSecondi}${secureFlag}`;
}

function estraiIpClient(req) {
    if (!req) return 'sconosciuto';
    if (req.headers && req.headers['x-nf-client-connection-ip']) {
        return req.headers['x-nf-client-connection-ip'];
    }
    if (req.headers && req.headers['client-ip']) {
        return req.headers['client-ip'];
    }
    if (req.headers && req.headers['x-forwarded-for']) {
        return req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    return req.ip || (req.connection && req.connection.remoteAddress) || 'sconosciuto';
}

// Freno ai tentativi di login ripetuti, per IP (uguale a superset)
const tentativi = new Map();
function troppiTentativi(ip) {
    const ora = Date.now();
    const voce = tentativi.get(ip);
    if (!voce || ora - voce.da > 5 * 60 * 1000) return false;
    return voce.conteggio >= 10;
}
function registraTentativo(ip, riuscito) {
    const ora = Date.now();
    if (riuscito) return tentativi.delete(ip);
    const voce = tentativi.get(ip);
    if (!voce || ora - voce.da > 5 * 60 * 1000) tentativi.set(ip, { da: ora, conteggio: 1 });
    else voce.conteggio += 1;
}

function richiediLogin(req, res, next) {
    const tokenCookie = leggiCookie(req, COOKIE_NAME) || leggiCookie(req, 'minierando_sessione');
    const payload = leggiToken(tokenCookie);
    if (payload) {
        req.utente = payload;
        return next();
    }
    return res.status(401).json({ errore: 'Sessione scaduta o assente: rifai il login.' });
}

// ============================================================
// DEFINIZIONE ROUTER API
// ============================================================
const apiRouter = express.Router();

apiRouter.get('/config', (req, res) => {
    const tokenCookie = leggiCookie(req, COOKIE_NAME) || leggiCookie(req, 'minierando_sessione');
    const payload = leggiToken(tokenCookie);
    res.json({
        struttura: STRUCTURE_NAME,
        autenticato: Boolean(payload),
        utente: payload ? payload.utente : null
    });
});

apiRouter.post('/login', (req, res) => {
    const ip = estraiIpClient(req);
    if (troppiTentativi(ip)) {
        return res.status(429).json({ errore: 'Troppi tentativi falliti: riprova tra qualche minuto.' });
    }
    if (!WEB_USER || !WEB_PASSWORD_HASH || !SESSION_SECRET) {
        return res.status(500).json({ errore: 'Accesso non configurato: mancano WEB_USER/WEB_PASSWORD_HASH in config/.env.' });
    }

    const { utente, password, username } = req.body || {};
    const inputUser = typeof utente === 'string' ? utente.trim() : (typeof username === 'string' ? username.trim() : '');
    const inputPassword = typeof password === 'string' ? password : '';

    const utenteOk = inputUser.toLowerCase() === WEB_USER.toLowerCase();
    const passwordOk = verificaPassword(inputPassword, WEB_PASSWORD_HASH);

    let valido = utenteOk && passwordOk;
    let nomeUtenteEffettivo = WEB_USER;

    // Controllo eventuale lista ausiliaria
    if (!valido && Array.isArray(config.utentiAggiuntivi)) {
        const trovato = config.utentiAggiuntivi.find(u => u.utente.toLowerCase() === inputUser.toLowerCase());
        if (trovato && verificaPassword(inputPassword, trovato.hash)) {
            valido = true;
            nomeUtenteEffettivo = trovato.utente;
        }
    }

    if (!valido) {
        registraTentativo(ip, false);
        return res.status(401).json({ errore: 'Utente o password non corretti.' });
    }

    registraTentativo(ip, true);
    const token = firmaToken({ utente: nomeUtenteEffettivo, exp: Date.now() + DURATA_SESSIONE_MS });
    res.setHeader('Set-Cookie', generaCookieSessione(token, req));
    return res.json({ ok: true, utente: nomeUtenteEffettivo });
});

apiRouter.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', generaCookieSessione('', req, 0));
    res.json({ ok: true });
});

// Endpoint di compatibilità per verifica sessione
apiRouter.get('/auth/status', (req, res) => {
    const tokenCookie = leggiCookie(req, COOKIE_NAME) || leggiCookie(req, 'minierando_sessione');
    const payload = leggiToken(tokenCookie);
    res.json({
        auth_enabled: true,
        type: 'scrypt_session_superset',
        autenticato: Boolean(payload),
        utente: payload ? payload.utente : null
    });
});

apiRouter.get('/auth/verify', richiediLogin, (req, res) => {
    res.json({
        valid: true,
        user: req.utente
    });
});

// Endpoint di persistenza archivio (Netlify Blobs)
apiRouter.get('/archivio', richiediLogin, async (req, res) => {
    try {
        const dati = await leggiDatiStore();
        res.json({ ok: true, ...dati });
    } catch (e) {
        res.status(500).json({ ok: false, errore: 'Impossibile leggere i dati: ' + e.message });
    }
});

apiRouter.post('/archivio', richiediLogin, async (req, res) => {
    try {
        const esito = await scriviDatiStore(req.body);
        res.json(esito);
    } catch (e) {
        res.status(500).json({ ok: false, errore: 'Impossibile salvare i dati: ' + e.message });
    }
});

// Reindirizzamento vista statistiche
apiRouter.get('/statistiche', (req, res) => {
    res.redirect('/?vista=statistiche');
});

// Monta il router sia sul percorso /api canonico, sia sulla riscrittura Netlify, sia su root
app.use('/api', apiRouter);
app.use('/.netlify/functions/api', apiRouter);
app.use('/', apiRouter);

module.exports = app;
