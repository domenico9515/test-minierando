'use strict';

const path = require('path');
const fs = require('fs');

// Caricamento variabili d'ambiente da config/.env se presente (stile superset)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
    try {
        const raw = fs.readFileSync(envFile, 'utf8');
        for (const riga of raw.split(/\r?\n/)) {
            const linea = riga.trim();
            if (!linea || linea.startsWith('#')) continue;
            const eq = linea.indexOf('=');
            if (eq !== -1) {
                const chiave = linea.slice(0, eq).trim();
                let valore = linea.slice(eq + 1).trim();
                if ((valore.startsWith('"') && valore.endsWith('"')) || (valore.startsWith("'") && valore.endsWith("'"))) {
                    valore = valore.slice(1, -1);
                }
                if (!process.env[chiave]) {
                    process.env[chiave] = valore;
                }
            }
        }
    } catch (e) {
        console.warn('Avviso: impossibile leggere config/.env:', e.message);
    }
}

module.exports = {
    appName: process.env.STRUCTURE_NAME || process.env.APP_NAME || 'Gestione Resoconto Miniere',
    port: Number(process.env.WEB_PORT || process.env.PORT || 3114),
    webUser: process.env.WEB_USER || 'admin',
    // Hash scrypt predefinito per 'admin'
    webPasswordHash: process.env.WEB_PASSWORD_HASH || 'scrypt:7b69877c61d8694ed4cc816ff37c9348:bf3ecd6ed9b4ca42e8aff594875e52ef1a1028df4e1b0829fcc35f6604b64ff3bb6939f0b24514841aaeed7b9dbaa75502e811f55dd6b7e10efb17a26c0b8ffb',
    // Chiave segreta HMAC-SHA256 per la firma dei cookie di sessione
    sessionSecret: process.env.WEB_SESSION_SECRET || 'e45b1d31a57c4f4e9a8f4c2847c1b5a264a974bfa7c91d848149eb0f3316bf15',
    durataSessioneMs: 8 * 60 * 60 * 1000, // 8 ore (come in superset)
    inattivitaLimiteMs: 30 * 60 * 1000,   // 30 minuti di inattività client (come in superset)
    cookieName: 'sds_sessione',           // nome cookie coerente con superset

    // Eventuali utenti ausiliari con credenziali hash scrypt
    utentiAggiuntivi: [
        {
            utente: 'sindaco',
            // Hash scrypt per 'password123'
            hash: 'scrypt:79d701f5f0c6eb3dabaa9236c9359e3f:3181d2cf479aca30a420af94e68d59055d56cb9094fb8f711511b26fa7f075f2bafcc5de996352aa273528b5b07b11e67947815805635716daaa683402497ed7',
            ruolo: 'responsabile'
        },
        {
            utente: 'mrf',
            // Hash scrypt per 'mrf'
            hash: 'scrypt:da3c5136975fc3d0aa1d86b5f6ee2f2f:af3c0789808244a5ca8add3267e749179f21107814201e2a39d738b36007bbb7b3c61141a4362ceb9eed3d95c7be8d9d687417b4a572e1e109a0442c41c89351',
            ruolo: 'operatore'
        }
    ]
};
