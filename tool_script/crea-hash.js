#!/usr/bin/env node
'use strict';

const crypto = require('crypto');

const password = process.argv[2] || process.env.WEB_PW;

if (!password) {
    console.log('Uso: node tool_script/crea-hash.js <password>');
    console.log('Esempio: node tool_script/crea-hash.js admin');
    process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const hashStr = `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;

console.log('===========================================================');
console.log(' Generatore Hash Password Scrypt (Procedura Superset)');
console.log('===========================================================');
console.log('Password fornita :', password);
console.log('Hash calcolato   :', hashStr);
console.log('\nDa inserire in config/.env alla voce WEB_PASSWORD_HASH=');
