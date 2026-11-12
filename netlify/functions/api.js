'use strict';

/**
 * Netlify Function - Gestione Resoconto Miniere
 * Serverless handler per l'app Express con autenticazione Superset (scrypt + sessione HttpOnly)
 * e supporto Netlify Blobs
 */

const { connectLambda } = require('@netlify/blobs');
const serverless = require('serverless-http');
const app = require('../../app');

const serverlessHandler = serverless(app);

exports.handler = async (event, context) => {
    // Collega l'evento Lambda per consentire a @netlify/blobs di accedere allo store
    if (event && event.blobs) {
        try {
            connectLambda(event);
        } catch (e) {
            console.warn('Avviso connectLambda:', e.message);
        }
    }

    const response = await serverlessHandler(event, context);

    // Normalizzazione Set-Cookie per compatibilità completa con Netlify Functions (multiValueHeaders e headers)
    if (response.headers && (response.headers['set-cookie'] || response.headers['Set-Cookie'])) {
        const cookie = response.headers['Set-Cookie'] || response.headers['set-cookie'];
        response.headers['Set-Cookie'] = cookie;
        response.multiValueHeaders = response.multiValueHeaders || {};
        response.multiValueHeaders['Set-Cookie'] = Array.isArray(cookie) ? cookie : [cookie];
    }

    return response;
};
