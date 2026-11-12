'use strict';

/**
 * Backend Gestione Resoconto Miniere - Server Express Locale
 * Avvio server HTTP e servizio file statici per esecuzione locale
 */

const path = require('path');
const express = require('express');
const app = require('./app');
const config = require('./config/env/all');

const PORT = config.port;

// Servizio file statici per ambiente Node.js locale
app.use(express.static(path.join(__dirname)));

// Avvio del server se eseguito direttamente (npm start / node server.js)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('====================================================');
        console.log(' Gestione Resoconto Miniere - Server Express');
        console.log(' Autenticazione Superset: scrypt + Sessione HttpOnly');
        console.log(` Server in ascolto su: http://localhost:${PORT}`);
        console.log('====================================================');
    });
}

module.exports = app;
