'use strict';

/**
 * Backend Gestione Resoconto Miniere
 * Procedura di autenticazione e gestione sessione derivata dal progetto superset (superset-db-sync)
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const config = require('./config/env/all');

const app = express();

const PORT = config.port;
const STRUCTURE_NAME = config.appName;
const WEB_USER = config.webUser;
const WEB_PASSWORD_HASH = config.webPasswordHash;
const SESSION_SECRET = config.sessionSecret;
const DURATA_SESSIONE_MS = config.durataSessioneMs;
const COOKIE_NAME = config.cookieName;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cache-control no-store per tutte le API, identico a superset
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

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
    const grezzo = req.headers.cookie || '';
    for (const pezzo of grezzo.split(';')) {
        const i = pezzo.indexOf('=');
        if (i === -1) continue;
        if (pezzo.slice(0, i).trim() === nome) return decodeURIComponent(pezzo.slice(i + 1).trim());
    }
    return null;
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
// ENDPOINT DI AUTENTICAZIONE E STATO
// ============================================================
app.get('/api/config', (req, res) => {
    const tokenCookie = leggiCookie(req, COOKIE_NAME) || leggiCookie(req, 'minierando_sessione');
    const payload = leggiToken(tokenCookie);
    res.json({
        struttura: STRUCTURE_NAME,
        autenticato: Boolean(payload),
        utente: payload ? payload.utente : null
    });
});

app.post('/api/login', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'sconosciuto';
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
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURATA_SESSIONE_MS / 1000}`);
    return res.json({ ok: true, utente: nomeUtenteEffettivo });
});

app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ ok: true });
});

// Endpoint di compatibilità per verifica sessione
app.get('/api/auth/status', (req, res) => {
    const tokenCookie = leggiCookie(req, COOKIE_NAME) || leggiCookie(req, 'minierando_sessione');
    const payload = leggiToken(tokenCookie);
    res.json({
        auth_enabled: true,
        type: 'scrypt_session_superset',
        autenticato: Boolean(payload),
        utente: payload ? payload.utente : null
    });
});

app.get('/api/auth/verify', richiediLogin, (req, res) => {
    res.json({
        valid: true,
        user: req.utente
    });
});

app.get('/statistiche', (req, res) => {
    res.redirect('/?vista=statistiche');
});

// Servizio file statici
app.use(express.static(path.join(__dirname)));

// Avvio del server
app.listen(PORT, () => {
    console.log('====================================================');
    console.log(' Gestione Resoconto Miniere - Server Express');
    console.log(' Autenticazione Superset: scrypt + Sessione HttpOnly');
    console.log(` Server in ascolto su: http://localhost:${PORT}`);
    console.log('====================================================');
});
