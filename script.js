// Mappatura Nodi -> Aggiunti i link alle immagini per il BBCode
const nodiMap = {
    '1135': { nome: 'tra Livorno e Volterra', tipo: 'oro', icona: '💰', img: 'https://lesroyaumes.cdn.oxv.fr/images/items/itemArgent.png' },
    '1137': { nome: 'tra Pisa e San Miniato', tipo: 'ferro', icona: '⛏️', img: 'https://lesroyaumes.cdn.oxv.fr/images/items/item76.png' },
    '1141': { nome: 'tra Firenze e Pistoia', tipo: 'pietra', icona: '🪨', img: 'https://lesroyaumes.cdn.oxv.fr/images/items/item59.png' },
    '1208': { nome: 'tra Volterra e Piombino', tipo: 'pietra', icona: '🪨', img: 'https://lesroyaumes.cdn.oxv.fr/images/items/item59.png' },
    '1214': { nome: 'tra Arezzo e Montepulciano', tipo: 'ferro', icona: '⛏️', img: 'https://lesroyaumes.cdn.oxv.fr/images/items/item76.png' },
    '1212': { nome: 'tra Arezzo e Montevarchi', tipo: 'oro', icona: '💰', img: 'https://lesroyaumes.cdn.oxv.fr/images/items/itemArgent.png' },
    '1210': { nome: 'tra Firenze e Montevarchi', tipo: 'argilla', icona: '🧱', img: 'https://lesroyaumes.cdn.oxv.fr/images/items/item150.png' }
};

const STORAGE_KEY = 'minierando_archivio_json';
const STIPENDI_STORAGE_KEY = 'minierando_stipendi_miniere';
const PERIODI_CALCOLO = [1, 7, 15, 30];

// ============================================================
// AUTENTICAZIONE E SESSIONE (MODELLO SUPERSET)
// ============================================================

const INATTIVITA_LIMITE_MS = 30 * 60 * 1000; // 30 minuti di inattività operatore
let ultimaAttivita = Date.now();

// Tracciamento interazione per rilevamento reale inattività (come in superset)
for (const evento of ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']) {
    window.addEventListener(evento, () => { ultimaAttivita = Date.now(); }, { passive: true });
}

// Controllo periodico inattività ogni 30 secondi
setInterval(async () => {
    const loginSchermata = document.getElementById('schermata-login');
    if (!loginSchermata || !loginSchermata.hidden) return; // Non autenticato

    if (Date.now() - ultimaAttivita < INATTIVITA_LIMITE_MS) return;

    try {
        await api('/api/logout', { method: 'POST' });
    } catch {}

    try {
        sessionStorage.setItem('minierando_logout_inattivita', '1');
    } catch {}

    location.reload();
}, 30 * 1000);

async function api(percorso, opzioni = {}) {
    const risposta = await fetch(percorso, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...opzioni,
        body: opzioni.corpo ? JSON.stringify(opzioni.corpo) : (opzioni.body ? opzioni.body : undefined)
    });
    const dati = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
        throw new Error(dati.errore || dati.error || `Errore ${risposta.status}`);
    }
    return dati;
}

function segnalaLogoutInattivita() {
    let segnalato = false;
    try {
        segnalato = sessionStorage.getItem('minierando_logout_inattivita') === '1' || sessionStorage.getItem('sds_logout_inattivita') === '1';
        sessionStorage.removeItem('minierando_logout_inattivita');
        sessionStorage.removeItem('sds_logout_inattivita');
    } catch {
        return;
    }
    if (!segnalato) return;
    const errore = document.getElementById('errore-login');
    if (errore) {
        errore.textContent = 'Sessione terminata per inattività (30 minuti senza utilizzo). Accedi di nuovo.';
        errore.hidden = false;
    }
}

let intervalloSyncPeriodico = null;

function avviaSincronizzazionePeriodica() {
    if (intervalloSyncPeriodico) return;
    window.addEventListener('focus', () => {
        if (window.location.protocol.startsWith('http') && !sincronizzazioneInCorso) {
            const app = document.getElementById('schermata-app');
            if (app && !app.hidden) {
                setTimeout(() => {
                    if (!sincronizzazioneInCorso) sincronizzaConCloud();
                }, 300);
            }
        }
    });

    intervalloSyncPeriodico = setInterval(() => {
        if (window.location.protocol.startsWith('http') && !sincronizzazioneInCorso) {
            const app = document.getElementById('schermata-app');
            if (app && !app.hidden) {
                sincronizzaConCloud();
            }
        }
    }, 20000);
}

function mostraApp(nomeUtente) {
    const loginSchermata = document.getElementById('schermata-login');
    const appSchermata = document.getElementById('schermata-app');
    const userNameEl = document.getElementById('auth-user-name');

    if (loginSchermata) loginSchermata.hidden = true;
    if (appSchermata) appSchermata.hidden = false;
    if (userNameEl && nomeUtente) userNameEl.textContent = nomeUtente;
    ultimaAttivita = Date.now();
    if (typeof aggiornaStatisticheSeVisibili === 'function') {
        aggiornaStatisticheSeVisibili();
    }
    if (window.location.protocol.startsWith('http')) {
        sincronizzaConCloud();
        avviaSincronizzazionePeriodica();
    }
}

function mostraLogin() {
    const loginSchermata = document.getElementById('schermata-login');
    const appSchermata = document.getElementById('schermata-app');

    if (loginSchermata) loginSchermata.hidden = false;
    if (appSchermata) appSchermata.hidden = true;
}

async function initAuth() {
    // Configurazione visibilità password (toggle icona occhio)
    const btnMostraPw = document.getElementById('btn-mostra-password');
    if (btnMostraPw) {
        btnMostraPw.addEventListener('click', () => {
            const campo = document.getElementById('campo-password');
            if (!campo) return;
            const mostrata = campo.type === 'text';
            campo.type = mostrata ? 'password' : 'text';
            btnMostraPw.setAttribute('aria-pressed', String(!mostrata));
            btnMostraPw.setAttribute('aria-label', mostrata ? 'Mostra password' : 'Nascondi password');
        });
    }

    // Gestione submit del form di login
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const errore = document.getElementById('errore-login');
            if (errore) errore.hidden = true;

            const utente = (document.getElementById('campo-utente')?.value || '').trim();
            const password = document.getElementById('campo-password')?.value || '';

            if (!utente || !password) {
                if (errore) {
                    errore.textContent = 'Specificare utente e password.';
                    errore.hidden = false;
                }
                return;
            }

            try {
                if (window.location.protocol.startsWith('http')) {
                    const res = await api('/api/login', {
                        method: 'POST',
                        corpo: { utente, password }
                    });
                    const campoPw = document.getElementById('campo-password');
                    if (campoPw) {
                        campoPw.value = '';
                        campoPw.type = 'password';
                    }
                    if (btnMostraPw) {
                        btnMostraPw.setAttribute('aria-pressed', 'false');
                        btnMostraPw.setAttribute('aria-label', 'Mostra password');
                    }
                    mostraApp(res.utente || utente);
                } else {
                    // Modalità standalone file:// (offline)
                    if ((utente.toLowerCase() === 'admin' && password === 'admin') ||
                        (utente.toLowerCase() === 'sindaco' && password === 'password123') ||
                        (utente.toLowerCase() === 'mrf' && password === 'mrf')) {
                        mostraApp(utente);
                    } else {
                        throw new Error('Utente o password non corretti.');
                    }
                }
            } catch (e) {
                if (errore) {
                    errore.textContent = e.message || 'Errore durante il login.';
                    errore.hidden = false;
                }
            }
        });
    }

    // Gestione pulsante Esci / Logout
    const btnEsci = document.getElementById('btn-esci');
    if (btnEsci) {
        btnEsci.addEventListener('click', async () => {
            try {
                if (window.location.protocol.startsWith('http')) {
                    await api('/api/logout', { method: 'POST' });
                }
            } catch {}
            location.reload();
        });
    }

    // Controllo stato sessione iniziale
    if (window.location.protocol.startsWith('http')) {
        try {
            const config = await api('/api/config');
            if (config.struttura && config.struttura !== 'Gestione Resoconto Miniere') {
                const struttLogin = document.getElementById('struttura-login');
                const struttBarra = document.getElementById('struttura-barra');
                if (struttLogin) struttLogin.textContent = config.struttura;
                if (struttBarra) struttBarra.textContent = config.struttura;
            }

            if (config.autenticato) {
                mostraApp(config.utente);
            } else {
                mostraLogin();
                segnalaLogoutInattivita();
            }
        } catch (e) {
            mostraLogin();
            segnalaLogoutInattivita();
        }
    } else {
        // Standalone offline
        mostraLogin();
        segnalaLogoutInattivita();
    }
}

function parseNumeroReport(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function caricaStipendiMiniere() {
    try {
        const raw = localStorage.getItem(STIPENDI_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        console.error("Errore nella lettura degli stipendi delle miniere:", e);
        return {};
    }
}

function salvaStipendiMiniere(stipendiMap, syncCloud = true) {
    localStorage.setItem(STIPENDI_STORAGE_KEY, JSON.stringify(stipendiMap));
    if (syncCloud && window.location.protocol.startsWith('http')) {
        pianificaSincronizzazioneCloud();
    }
}

function parseReport(testo, dataScelta) {
    const minereMap = {};
    const stipendiSalvati = caricaStipendiMiniere();
    const blocchi = testo.split(/(?=Miniera \d+\s*:)/);

    blocchi.forEach((blocco) => {
        const idMatch = blocco.match(/Miniera (\d+)\s*:/);
        if (!idMatch) return;
        const id = parseInt(idMatch[1]);

        if (!minereMap[id]) {
            minereMap[id] = {
                id: id,
                nodo: '',
                tipo: 'sconosciuto',
                nome: 'Sconosciuta',
                icona: '❓',
                img: '',
                chiusa: false,
                produzione: 0,
                affluenza: 0,
                manutenzione_pietra: 0,
                manutenzione_ferro: 0,
                stipendio_base: 0,
                stipendio_orario: 0,
                stipendio_totale: 0
            };
        }

        const m = minereMap[id];

        const nodoMatch = blocco.match(/Nodo (\d+)/);
        if (nodoMatch) {
            m.nodo = nodoMatch[1];
            const infoNodo = nodiMap[m.nodo];
            if (infoNodo) {
                m.tipo = infoNodo.tipo;
                m.nome = infoNodo.nome;
                m.icona = infoNodo.icona;
                m.img = infoNodo.img;
            }
        }

        if (blocco.includes('- CHIUSO')) {
            m.chiusa = true;
        }

        // Estrazione Affluenza (Ore di lavoro): "Numero di ore di lavoro in questi ultimi 7 giorni"
        const oreSection = blocco.split(/Numero di ore di lavoro in questi ultimi 7 giorni/i)[1];
        if (oreSection) {
            const oreText = oreSection.split(/Produzione in questi|Risorse consumate/i)[0];
            const lines = oreText.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{4}-\d{2}-\d{2}/));
            if (lines.length > 0) {
                let targetLine = lines[lines.length - 1];
                if (dataScelta) {
                    const specificLine = lines.find(l => l.startsWith(dataScelta));
                    if (specificLine) targetLine = specificLine;
                    else targetLine = null;
                }

                if (targetLine) {
                    const match = targetLine.match(/^\d{4}-\d{2}-\d{2}\s+([\d,.]+)/);
                    if (match) m.affluenza = parseNumeroReport(match[1]);
                }
            }
        }

        const prodSection = blocco.split(/Produzione in questi ultimi 7 giorni/i)[1];
        if (prodSection) {
            const prodText = prodSection.split(/Risorse consumate|Numero di ore di lavoro/i)[0];
            const lines = prodText.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{4}-\d{2}-\d{2}/));
            if (lines.length > 0) {
                let targetLine = lines[lines.length - 1];
                if (dataScelta) {
                    const specificLine = lines.find(l => l.startsWith(dataScelta));
                    if (specificLine) targetLine = specificLine;
                    else targetLine = null;
                }

                if (targetLine) {
                    const match = targetLine.match(/^\d{4}-\d{2}-\d{2}\s+([\d,.]+)/);
                    if (match) m.produzione = parseFloat(match[1].replace(/\./g, '').replace(',', '.')) || 0;
                }
            }
        }

        const risSection = blocco.split(/Risorse consumate dalla miniera in questi ultimi 7 giorni/i)[1];
        if (risSection) {
            const risText = risSection.split(/Numero di ore di lavoro|Produzione in questi/i)[0];
            const lines = risText.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{4}-\d{2}-\d{2}/));
            if (lines.length > 0) {
                let targetLine = lines[lines.length - 1];
                if (dataScelta) {
                    // I consumi di una produzione appaiono nel report del giorno successivo
                    let d = new Date(dataScelta);
                    d.setDate(d.getDate() + 1);
                    const dataConsumi = d.toISOString().split('T')[0];

                    const specificLine = lines.find(l => l.startsWith(dataConsumi));
                    if (specificLine) targetLine = specificLine;
                    else targetLine = null;
                }

                if (targetLine) {
                    const parts = targetLine.split(/\s+/);
                    if (parts.length >= 3) {
                        m.manutenzione_pietra = parseInt(parts[1]) || 0;
                        m.manutenzione_ferro = parseInt(parts[2]) || 0;
                    }
                }
            }
        }
    });

    return Object.values(minereMap).sort((a, b) => a.id - b.id).map(m => {
        const keyNodo = m.nodo || `id_${m.id}`;
        m.stipendio_base = parseFloat(stipendiSalvati[keyNodo]) || 0;
        m.stipendio_orario = m.stipendio_base / 20;
        m.stipendio_totale = m.chiusa ? 0 : (m.stipendio_orario * m.affluenza);
        return m;
    });
}

function formatNum(num) {
    if (typeof num !== 'number' || !isFinite(num)) return '0';
    return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace('.', ',');
}

function formatNumPreciso(num, decimali = 2) {
    if (typeof num !== 'number' || !isFinite(num)) return '0';
    if (Number.isInteger(num)) return num.toString();
    return num.toFixed(decimali).replace('.', ',');
}

function getUnitaProd(tipo) {
    switch (tipo) {
        case 'oro': return 'ducati';
        case 'ferro': return 'chili di ferro';
        case 'pietra': return 'quintali di pietra';
        case 'argilla': return "blocchi d'argilla";
        default: return '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    const reportInput = document.getElementById('reportInput');
    const selectData = document.getElementById('dataSelezionata');

    if (reportInput) {
        reportInput.addEventListener('input', () => {
            estraiDateDisponibili();
            renderTabellaStipendiInput();
        });
        if (reportInput.value) {
            estraiDateDisponibili();
        }
    }
    if (selectData) {
        selectData.addEventListener('change', () => {
            renderTabellaStipendiInput();
        });
    }

    aggiornaListaGiorniSalvati();
    renderTabellaStipendiInput();
});

function estraiDateDisponibili() {
    const testo = document.getElementById('reportInput').value;
    const blocchi = testo.split(/(?=Miniera \d+\s*:)/);

    let tutteLeDate = new Set();

    blocchi.forEach((blocco) => {
        const oreSection = blocco.split(/Numero di ore di lavoro in questi ultimi 7 giorni/i)[1];
        if (oreSection) {
            const oreText = oreSection.split(/Produzione in questi|Risorse consumate/i)[0];
            const lines = oreText.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{4}-\d{2}-\d{2}/));
            lines.forEach(line => {
                const dataMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
                if (dataMatch) {
                    tutteLeDate.add(dataMatch[1]);
                }
            });
        }

        const prodSection = blocco.split(/Produzione in questi ultimi 7 giorni/i)[1];
        if (prodSection) {
            const prodText = prodSection.split(/Risorse consumate|Numero di ore di lavoro/i)[0];
            const lines = prodText.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{4}-\d{2}-\d{2}/));
            lines.forEach(line => {
                const dataMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
                if (dataMatch) {
                    tutteLeDate.add(dataMatch[1]);
                }
            });
        }
    });

    const select = document.getElementById('dataSelezionata');
    if (!select) return;

    const dateOrdinate = Array.from(tutteLeDate).sort();
    const dataPrecedente = select.value;

    select.innerHTML = '';
    if (dateOrdinate.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Nessun dato';
        select.appendChild(opt);
        return;
    }

    dateOrdinate.forEach(data => {
        const opt = document.createElement('option');
        opt.value = data;
        opt.textContent = data;
        select.appendChild(opt);
    });

    if (dataPrecedente && tutteLeDate.has(dataPrecedente)) {
        select.value = dataPrecedente;
    } else {
        select.value = dateOrdinate[dateOrdinate.length - 1]; // Seleziona l'ultima di default
    }
}

// Calcoli centralizzati usati dai bottoni del resoconto giornaliero (INVARIATO)
function elaboraDati() {
    const testo = document.getElementById('reportInput').value;
    if (!testo.trim()) return null;

    const selectData = document.getElementById('dataSelezionata');
    const dataScelta = selectData ? selectData.value : null;

    const salari = parseFloat(document.getElementById('salari').value) || 0;
    const vFerro = parseFloat(document.getElementById('valoreFerro').value) || 0;
    const vPietra = parseFloat(document.getElementById('valorePietra').value) || 0;
    const vArgilla = parseFloat(document.getElementById('valoreArgilla').value) || 0;
    const minere = parseReport(testo, dataScelta);

    let totProdOro = 0, totProdFerro = 0, totProdPietra = 0, totProdArgilla = 0;
    let totManuPietra = 0, totManuFerro = 0;

    minere.forEach(m => {
        if (m.nome === 'Sconosciuta' || m.chiusa) return;
        if (m.tipo === 'oro') totProdOro += m.produzione;
        if (m.tipo === 'ferro') totProdFerro += m.produzione;
        if (m.tipo === 'pietra') totProdPietra += m.produzione;
        if (m.tipo === 'argilla') totProdArgilla += m.produzione;
        totManuPietra += m.manutenzione_pietra;
        totManuFerro += m.manutenzione_ferro;
    });

    let nettoOro = totProdOro - salari;
    let nettoFerro = totProdFerro - totManuFerro;
    let nettoPietra = totProdPietra - totManuPietra;
    let nettoArgilla = totProdArgilla;
    let cvFerro = nettoFerro * vFerro;
    let cvPietra = nettoPietra * vPietra;
    let cvArgilla = nettoArgilla * vArgilla;
    let totaleDucati = nettoOro + cvFerro + cvPietra + cvArgilla;

    return {
        data: dataScelta,
        testoOriginale: testo,
        minere,
        salari,
        vFerro,
        vPietra,
        vArgilla,
        totProdOro,
        totProdFerro,
        totProdPietra,
        totProdArgilla,
        totManuPietra,
        totManuFerro,
        nettoOro,
        nettoFerro,
        nettoPietra,
        nettoArgilla,
        cvFerro,
        cvPietra,
        cvArgilla,
        totaleDucati
    };
}

// -------------- RENDERING CONDIVISO HTML & BBCODE (INVARIATO RISPETTO A PRIMA) --------------
function renderDatiHTML(d, opzioni = {}) {
    document.getElementById('bbcode-section').style.display = 'none';

    const bannerEl = document.getElementById('report-header-banner');
    if (opzioni.titoloBanner) {
        bannerEl.innerHTML = `
            <span class="report-banner-title">${opzioni.titoloBanner}</span>
            ${opzioni.mostraBottoneBBCode ? `<button class="bbcode-btn" style="padding: 6px 12px; font-size: 14px;" onclick="${opzioni.azioneBBCode}">📝 Genera Formattazione BBCode</button>` : ''}
        `;
        bannerEl.style.display = 'flex';
    } else {
        bannerEl.style.display = 'none';
    }

    const riepilogoGiorniEl = document.getElementById('riepilogo-giorni-finale');
    if (opzioni.tabellaGiorniHTML) {
        riepilogoGiorniEl.innerHTML = opzioni.tabellaGiorniHTML;
        riepilogoGiorniEl.style.display = 'block';
    } else {
        riepilogoGiorniEl.innerHTML = '';
        riepilogoGiorniEl.style.display = 'none';
    }

    let htmlIndividuali = '<ul>';
    d.minere.forEach(m => {
        if (m.nome === 'Sconosciuta') return;
        let titleClass = m.chiusa ? 'class="closed-text"' : '';
        let prefix = m.chiusa ? '[CHIUSA] ' : '';
        htmlIndividuali += `<li class="mine-item"><span class="icon">${m.icona}</span><strong ${titleClass}>${prefix}Miniera n° ${m.id} (${m.tipo}, ${m.nome}):</strong><ul><li><strong>Produzione:</strong> ${formatNum(m.produzione)} ${getUnitaProd(m.tipo)}</li><li><strong>Manutenzione:</strong> ${m.manutenzione_pietra} quintali di pietra e ${m.manutenzione_ferro} chili di ferro</li></ul></li>`;
    });
    htmlIndividuali += '</ul>';
    document.getElementById('valori-individuali').innerHTML = htmlIndividuali;
    document.getElementById('out-salari').innerText = formatNum(d.salari);

    const classNetto = (val) => val >= 0 ? 'positive' : 'negative';
    const sign = (val) => val > 0 ? '+' : '';

    const formulaFerro = d.prezziVariabili ? '' : `${formatNum(d.nettoFerro)} x ${formatNum(d.vFerro)} = `;
    const formulaPietra = d.prezziVariabili ? '' : `${formatNum(d.nettoPietra)} x ${formatNum(d.vPietra)} = `;
    const formulaArgilla = d.prezziVariabili ? '' : `${formatNum(d.nettoArgilla)} x ${formatNum(d.vArgilla)} = `;

    document.getElementById('situazione-complessiva').innerHTML = `
        <ul class="summary-list">
            <li>Produzione lorda:<ul><li><span class="icon">💰</span> <strong>Oro:</strong> ${formatNum(d.totProdOro)} ducati</li><li><span class="icon">⛏️</span> <strong>Ferro:</strong> ${formatNum(d.totProdFerro)} chili di ferro</li><li><span class="icon">🪨</span> <strong>Pietra:</strong> ${formatNum(d.totProdPietra)} quintali di pietra</li><li><span class="icon">🧱</span> <strong>Argilla:</strong> ${formatNum(d.totProdArgilla)} blocchi d'argilla</li></ul></li>
            <li>Produzione al netto di manutenzioni e stipendi:<ul><li><span class="icon">💰</span> <strong>Oro:</strong> ${formatNum(d.totProdOro)} - ${formatNum(d.salari)} = <span class="${classNetto(d.nettoOro)}">${formatNum(d.nettoOro)}</span> ducati</li><li><span class="icon">⛏️</span> <strong>Ferro:</strong> ${formatNum(d.totProdFerro)} - ${formatNum(d.totManuFerro)} = <span class="${classNetto(d.nettoFerro)}">${sign(d.nettoFerro)}${formatNum(d.nettoFerro)}</span> chili di ferro</li><li><span class="icon">🪨</span> <strong>Pietra:</strong> ${formatNum(d.totProdPietra)} - ${formatNum(d.totManuPietra)} = <span class="${classNetto(d.nettoPietra)}">${sign(d.nettoPietra)}${formatNum(d.nettoPietra)}</span> quintali di pietra</li><li><span class="icon">🧱</span> <strong>Argilla:</strong> <span class="${classNetto(d.nettoArgilla)}">${sign(d.nettoArgilla)}${formatNum(d.nettoArgilla)}</span> blocchi d'argilla</li></ul></li>
            <li>Controvalore in ducati:<ul><li><span class="icon">💰</span> <strong>Oro:</strong> <span class="${classNetto(d.nettoOro)}">${formatNum(d.nettoOro)}</span> ducati</li><li><span class="icon">⛏️</span> <strong>Ferro:</strong> ${formulaFerro}<span class="${classNetto(d.cvFerro)}">${sign(d.cvFerro)}${formatNum(d.cvFerro)}</span> ducati</li><li><span class="icon">🪨</span> <strong>Pietra:</strong> ${formulaPietra}<span class="${classNetto(d.cvPietra)}">${sign(d.cvPietra)}${formatNum(d.cvPietra)}</span> ducati</li><li><span class="icon">🧱</span> <strong>Argilla:</strong> ${formulaArgilla}<span class="${classNetto(d.cvArgilla)}">${sign(d.cvArgilla)}${formatNum(d.cvArgilla)}</span> ducati</li><br><li><strong>TOTALE: <span class="${classNetto(d.totaleDucati)}">${sign(d.totaleDucati)}${formatNum(d.totaleDucati)}</span> ducati</strong></li></ul></li>
        </ul>`;
    document.getElementById('output-section').style.display = 'block';
}

function ottieniDataResocontoFormattata(d) {
    const MESI = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    const formattaSingola = (dataStr) => {
        if (!dataStr || typeof dataStr !== 'string') return null;
        const match = dataStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;
        const anno = parseInt(match[1], 10) - 552;
        const meseIdx = parseInt(match[2], 10) - 1;
        const giorno = parseInt(match[3], 10);
        const mese = MESI[meseIdx] || 'Novembre';
        return { giorno, mese, anno, formatted: `${giorno} ${mese} ${anno}` };
    };

    // Caso Resoconto Finale cumulativo (più giorni)
    if (d && Array.isArray(d.dateOrdinate) && d.dateOrdinate.length > 0) {
        if (d.dateOrdinate.length === 1) {
            const singola = formattaSingola(d.dateOrdinate[0]);
            if (singola) return `del ${singola.formatted}`;
        } else {
            const prima = formattaSingola(d.dateOrdinate[0]);
            const ultima = formattaSingola(d.dateOrdinate[d.dateOrdinate.length - 1]);
            if (prima && ultima) {
                if (prima.mese === ultima.mese && prima.anno === ultima.anno) {
                    return `dal ${prima.giorno} al ${ultima.giorno} ${ultima.mese} ${ultima.anno}`;
                }
                return `dal ${prima.formatted} al ${ultima.formatted}`;
            }
        }
    }

    // Caso resoconto giornaliero
    let dataStr = d ? d.data : null;
    if (!dataStr) {
        const select = document.getElementById('dataSelezionata');
        if (select && select.value) dataStr = select.value;
    }
    if (!dataStr && d && d.testoOriginale) {
        const match = d.testoOriginale.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (match) dataStr = match[1];
    }
    if (!dataStr) {
        const input = document.getElementById('reportInput');
        if (input && input.value) {
            const match = input.value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
            if (match) dataStr = match[1];
        }
    }

    const dataObj = formattaSingola(dataStr);
    if (dataObj) {
        return `del ${dataObj.formatted}`;
    }

    const oggi = new Date();
    const g = oggi.getDate();
    const m = MESI[oggi.getMonth()];
    const a = oggi.getFullYear() - 552;
    return `del ${g} ${m} ${a}`;
}

function renderDatiBBCode(d, intestazioneExtra = '') {
    document.getElementById('output-section').style.display = 'none';

    const bbColor = (val) => val >= 0 ? '#2E7D32' : '#D32F2F';
    const sign = (val) => val > 0 ? '+' : '';

    const dataResoconto = ottieniDataResocontoFormattata(d);

    let bbcode = `[rp]\n`;
    bbcode += `[center][img]https://i.imgur.com/Im0gy1o.png[/img][/center]\n\n`;
    bbcode += `[center][b][size=18][color=#C62828]Ufficio del Ministro delle Miniere e delle Grandi Opere[/color][/b][/size]\n`;
    bbcode += `[b][size=16][color=#8E0000]Resoconto minerario ${dataResoconto}[/color][/b][/size][/center]\n\n`;

    bbcode += `[quote]\n`;
    bbcode += `[color=#8E0000][size=15][b]Valori individuali[/b][/size][/color][list]\n`;

    d.minere.forEach(m => {
        if (m.nome === 'Sconosciuta') return;
        let prefix = m.chiusa ? '[color=#C62828][CHIUSA][/color] ' : '';
        bbcode += `[*] [size=13][img]${m.img}[/img] [b]${prefix}Miniera n° ${m.id} (${m.tipo}, ${m.nome}):[/b][/size][list]
[*] [b]Produzione[/b]: ${formatNum(m.produzione)} ${getUnitaProd(m.tipo)}
[*] [b]Manutenzione[/b]: ${m.manutenzione_pietra} quintali di pietra e ${m.manutenzione_ferro} chili di ferro[/list]\n\n`;
    });

    bbcode += `[*] [size=13][b]Salari dei minatori:[/b] ${formatNum(d.salari)} ducati[/size]\n[*] [size=13][b]La manutenzione avviene:[/b] automaticamente[/size]\n[/list][/quote]\n\n`;

    const formulaFerro = d.prezziVariabili ? '' : `${formatNum(d.nettoFerro)} x ${formatNum(d.vFerro)} = `;
    const formulaPietra = d.prezziVariabili ? '' : `${formatNum(d.nettoPietra)} x ${formatNum(d.vPietra)} = `;
    const formulaArgilla = d.prezziVariabili ? '' : `${formatNum(d.nettoArgilla)} x ${formatNum(d.vArgilla)} = `;

    bbcode += `[quote]\n[color=#8E0000][size=15][b]Situazione complessiva[/b][/size][/color][list]\n[*] [size=13][b]Produzione lorda:[/b][/size][list]\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/itemArgent.png[/img] [b]Oro[/b]: ${formatNum(d.totProdOro)} ducati\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item76.png[/img] [b]Ferro[/b]: ${formatNum(d.totProdFerro)} chili di ferro\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item59.png[/img] [b]Pietra[/b]: ${formatNum(d.totProdPietra)} quintali di pietra\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item150.png[/img] [b]Argilla[/b]: ${formatNum(d.totProdArgilla)} blocchi d'argilla[/list]\n\n`;

    bbcode += `[*] [size=13][b]Produzione al netto di manutenzioni e stipendi:[/b][/size][list]\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/itemArgent.png[/img] [b]Oro[/b]: ${formatNum(d.totProdOro)} - ${formatNum(d.salari)} = [color=${bbColor(d.nettoOro)}]${formatNum(d.nettoOro)}[/color] ducati\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item76.png[/img] [b]Ferro[/b]: ${formatNum(d.totProdFerro)} - ${formatNum(d.totManuFerro)} = [color=${bbColor(d.nettoFerro)}]${sign(d.nettoFerro)}${formatNum(d.nettoFerro)}[/color] chili di ferro\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item59.png[/img] [b]Pietra[/b]: ${formatNum(d.totProdPietra)} - ${formatNum(d.totManuPietra)} = [color=${bbColor(d.nettoPietra)}]${sign(d.nettoPietra)}${formatNum(d.nettoPietra)}[/color] quintali di pietra\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item150.png[/img] [b]Argilla[/b]: [color=${bbColor(d.nettoArgilla)}]${sign(d.nettoArgilla)}${formatNum(d.nettoArgilla)}[/color] blocchi d'argilla[/list]\n\n`;

    bbcode += `[*] [size=13][b]Controvalore in ducati:[/b][/size][list]\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/itemArgent.png[/img] [b]Oro[/b]: [color=${bbColor(d.nettoOro)}]${formatNum(d.nettoOro)}[/color] ducati\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item76.png[/img] [b]Ferro[/b]: ${formulaFerro}[color=${bbColor(d.cvFerro)}]${sign(d.cvFerro)}${formatNum(d.cvFerro)}[/color] ducati\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item59.png[/img] [b]Pietra[/b]: ${formulaPietra}[color=${bbColor(d.cvPietra)}]${sign(d.cvPietra)}${formatNum(d.cvPietra)}[/color] ducati\n`;
    bbcode += `[*] [img]https://lesroyaumes.cdn.oxv.fr/images/items/item150.png[/img] [b]Argilla[/b]: ${formulaArgilla}[color=${bbColor(d.cvArgilla)}]${sign(d.cvArgilla)}${formatNum(d.cvArgilla)}[/color] ducati\n\n`;
    bbcode += `[*] [b]TOTALE[/b]: [color=${bbColor(d.totaleDucati)}]${sign(d.totaleDucati)}${formatNum(d.totaleDucati)}[/color] ducati[/list]\n[/list][/quote]`;

    const testoResoconto = (d && d.testoOriginale)
        ? d.testoOriginale
        : (!d.dateOrdinate && document.getElementById('reportInput') ? document.getElementById('reportInput').value : '');

    if (testoResoconto && testoResoconto.trim()) {
        bbcode += `\n\n[spoiler]\n${testoResoconto.trim()}\n[/spoiler]`;
    }

    bbcode += `\n[/rp]`;

    document.getElementById('bbcode-output').value = bbcode;
    document.getElementById('bbcode-section').style.display = 'block';
}

// -------------- GENERATORE HTML DA INPUT CORRENTE --------------
function generaResoconto() {
    const d = elaboraDati();
    if (!d) return alert("Inserisci il testo del resoconto!");
    renderDatiHTML(d, {
        titoloBanner: d.data ? `📄 Resoconto del giorno: ${d.data}` : '📄 Resoconto Giornaliero'
    });
}

// -------------- GENERATORE BBCODE DA INPUT CORRENTE --------------
function generaBBCode() {
    const d = elaboraDati();
    if (!d) return alert("Inserisci il testo del resoconto!");
    renderDatiBBCode(d);
}

function copiaBBCode() {
    const copyText = document.getElementById("bbcode-output");
    copyText.select();
    copyText.setSelectionRange(0, 99999); /* Per dispositivi mobile */
    document.execCommand("copy");
    alert("Codice BBCode copiato negli appunti!");
}

// ============================================================
// PERSISTENZA E SINCRONIZZAZIONE CLOUD (NETLIFY BLOBS)
// ============================================================
let timerSyncCloud = null;
let sincronizzazioneInCorso = false;

function impostaStatoSync(stato, messaggioExtra = '') {
    const el = document.getElementById('sync-status-msg');
    const btn = document.getElementById('btnSyncCloud');
    if (!el) return;

    el.className = 'sync-status-indicator ' + stato;
    if (stato === 'syncing') {
        el.textContent = '☁️ Sincronizzazione con Netlify Cloud in corso...';
        if (btn) btn.disabled = true;
    } else if (stato === 'success') {
        const ora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        el.textContent = `☁️ Sincronizzato con Netlify Cloud (${ora})`;
        if (btn) btn.disabled = false;
    } else if (stato === 'pending') {
        el.textContent = '☁️ Modifiche salvate in locale, sincronizzazione cloud a breve...';
    } else if (stato === 'error') {
        el.textContent = messaggioExtra || '⚠️ Sincronizzazione cloud non riuscita (dati protetti in locale)';
        if (btn) btn.disabled = false;
    } else {
        el.textContent = '';
        if (btn) btn.disabled = false;
    }
}

function pianificaSincronizzazioneCloud() {
    if (timerSyncCloud) clearTimeout(timerSyncCloud);
    impostaStatoSync('pending');
    timerSyncCloud = setTimeout(() => {
        inviaDatiAlCloud();
    }, 600);
}

async function inviaDatiAlCloud(datiPersonalizzati = null) {
    if (!window.location.protocol.startsWith('http')) return;
    impostaStatoSync('syncing');
    try {
        const payload = datiPersonalizzati || {
            archivio: caricaArchivio(),
            stipendi: caricaStipendiMiniere()
        };
        const res = await api('/api/archivio', {
            method: 'POST',
            corpo: payload
        });
        if (res && res.ok) {
            impostaStatoSync('success');
        } else {
            impostaStatoSync('error');
        }
    } catch (e) {
        console.warn('Avviso invio cloud:', e.message);
        impostaStatoSync('error');
    }
}

async function sincronizzaConCloud(opzioni = {}) {
    if (sincronizzazioneInCorso) return;
    if (!window.location.protocol.startsWith('http')) return;

    sincronizzazioneInCorso = true;
    impostaStatoSync('syncing');

    try {
        const res = await api('/api/archivio');
        if (!res || !res.ok) {
            impostaStatoSync('error');
            return;
        }

        const cloudArchivio = (res.archivio && typeof res.archivio === 'object') ? res.archivio : {};
        const cloudStipendi = (res.stipendi && typeof res.stipendi === 'object') ? res.stipendi : {};

        const localeArchivio = caricaArchivio();
        const localeStipendi = caricaStipendiMiniere();

        let archivioFuso;
        let stipendiFusi;
        let deveInviareAlCloud = Boolean(opzioni.forzato);

        // Se il server ha già un archivio inizializzato (anche vuoto dopo svuota/elimina), il cloud è la fonte di verità
        const serverInizializzato = (res.aggiornatoIl !== null && res.aggiornatoIl !== undefined) || Object.keys(cloudArchivio).length > 0;

        if (serverInizializzato && !opzioni.forzato) {
            // Il Cloud fa fede: se un giorno è stato cancellato sul cloud, rimane cancellato
            archivioFuso = cloudArchivio;
            stipendiFusi = cloudStipendi;
        } else if (Object.keys(localeArchivio).length > 0) {
            // Primo bootstrap in assoluto da locale verso un cloud mai usato o sync forzato
            archivioFuso = { ...cloudArchivio, ...localeArchivio };
            stipendiFusi = { ...cloudStipendi, ...localeStipendi };
            deveInviareAlCloud = true;
        } else {
            archivioFuso = cloudArchivio;
            stipendiFusi = cloudStipendi;
        }

        salvaArchivio(archivioFuso, false);
        salvaStipendiMiniere(stipendiFusi, false);

        if (deveInviareAlCloud) {
            await api('/api/archivio', {
                method: 'POST',
                corpo: {
                    archivio: archivioFuso,
                    stipendi: stipendiFusi
                }
            });
        }

        aggiornaListaGiorniSalvati();
        renderTabellaStipendiInput();
        if (typeof aggiornaStatisticheSeVisibili === 'function') {
            aggiornaStatisticheSeVisibili();
        }

        impostaStatoSync('success');
    } catch (e) {
        console.warn('Avviso sincronizzazione cloud:', e.message);
        impostaStatoSync('error');
    } finally {
        sincronizzazioneInCorso = false;
    }
}

// -------------- GESTIONE ARCHIVIO JSON (SALVATAGGIO, MOSTRA, RESOCONTO FINALE) --------------
function caricaArchivio() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        console.error("Errore nella lettura dell'archivio JSON:", e);
        return {};
    }
}

function salvaArchivio(archivio, syncCloud = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archivio, null, 2));
    if (syncCloud && window.location.protocol.startsWith('http')) {
        pianificaSincronizzazioneCloud();
    }
}

function aggiornaListaGiorniSalvati(dataDaSelezionare = null) {
    const archivio = caricaArchivio();
    const dateSalvate = Object.keys(archivio).sort();
    const select = document.getElementById('giornoSalvatoSelect');
    const badge = document.getElementById('conteggioGiorniSalvati');

    if (badge) badge.textContent = dateSalvate.length;
    if (!select) return;

    const selezionePrecedente = dataDaSelezionare || select.value;
    select.innerHTML = '';

    if (dateSalvate.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Nessun giorno salvato';
        select.appendChild(opt);
        return;
    }

    dateSalvate.forEach(data => {
        const item = archivio[data];
        const tot = item && typeof item.totaleDucati === 'number' ? formatNum(item.totaleDucati) : '0';
        const segno = item && item.totaleDucati > 0 ? '+' : '';
        const opt = document.createElement('option');
        opt.value = data;
        opt.textContent = `${data} (Totale: ${segno}${tot} ducati)`;
        select.appendChild(opt);
    });

    if (selezionePrecedente && archivio[selezionePrecedente]) {
        select.value = selezionePrecedente;
    } else {
        select.value = dateSalvate[dateSalvate.length - 1];
    }
}

// 1. TASTINO SALVA GIORNO (con controllo sovrascrittura)
async function salvaGiorno() {
    const d = elaboraDati();
    if (!d) {
        return alert("Inserisci prima il testo del resoconto giornaliero da salvare!");
    }
    if (!d.data) {
        return alert("Nessuna data valida rilevata nel resoconto inserito!");
    }

    const archivio = caricaArchivio();

    // Se il giorno è già stato salvato, chiede conferma di sovrascrittura all'utente
    if (archivio[d.data]) {
        const conferma = confirm(
            `Attenzione: il giorno ${d.data} è già presente nell'archivio salvato.\n\n` +
            `Vuoi sovrascrivere i dati del giorno ${d.data} con quelli attuali?`
        );
        if (!conferma) {
            return;
        }
    }

    sincronizzazioneInCorso = true;
    try {
        archivio[d.data] = {
            ...d,
            salvatoIl: new Date().toISOString()
        };

        salvaArchivio(archivio, false);
        aggiornaListaGiorniSalvati(d.data);
        renderTabellaStipendiInput();
        if (typeof aggiornaStatisticheSeVisibili === 'function') {
            aggiornaStatisticheSeVisibili();
        }
        if (window.location.protocol.startsWith('http')) {
            await inviaDatiAlCloud({ archivio, stipendi: caricaStipendiMiniere() });
        }
        alert(`Dati del giorno ${d.data} salvati correttamente in formato JSON!`);
    } finally {
        sincronizzazioneInCorso = false;
    }
}

// 2. TASTINO MOSTRA GIORNO SALVATO
function mostraGiornoSalvato() {
    const select = document.getElementById('giornoSalvatoSelect');
    const dataScelta = select ? select.value : '';

    if (!dataScelta) {
        return alert("Nessun giorno salvato selezionato! Salva almeno un giorno o importa un file JSON.");
    }

    const archivio = caricaArchivio();
    const datiGiorno = archivio[dataScelta];

    if (!datiGiorno) {
        return alert(`Dati non trovati per il giorno ${dataScelta}.`);
    }

    // Aggiorna i campi input dei parametri con quelli salvati per quel giorno
    document.getElementById('salari').value = datiGiorno.salari;
    document.getElementById('valoreFerro').value = datiGiorno.vFerro;
    document.getElementById('valorePietra').value = datiGiorno.vPietra;
    document.getElementById('valoreArgilla').value = datiGiorno.vArgilla;
    if (datiGiorno.testoOriginale) {
        document.getElementById('reportInput').value = datiGiorno.testoOriginale;
        if (typeof estraiDateDisponibili === 'function') {
            estraiDateDisponibili();
        }
        const selectData = document.getElementById('dataSelezionata');
        if (selectData) selectData.value = dataScelta;
    }

    renderDatiHTML(datiGiorno, {
        titoloBanner: `📅 Giorno Salvato Visualizzato: ${dataScelta}`,
        mostraBottoneBBCode: true,
        azioneBBCode: `generaBBCodeGiornoSalvato('${dataScelta}')`
    });
}

function generaBBCodeGiornoSalvato(dataScelta) {
    const archivio = caricaArchivio();
    const datiGiorno = archivio[dataScelta];
    if (!datiGiorno) return;
    renderDatiBBCode(datiGiorno);
}

// 3. TASTINO RESOCONTO FINALE (conteggio cumulativo di tutti i giorni salvati - INVARIATO)
function calcolaDatiFinali() {
    const archivio = caricaArchivio();
    const dateOrdinate = Object.keys(archivio).sort();

    if (dateOrdinate.length === 0) return null;

    const minereTotaliMap = {};
    let salari = 0;
    let totProdOro = 0, totProdFerro = 0, totProdPietra = 0, totProdArgilla = 0;
    let totManuPietra = 0, totManuFerro = 0;
    let nettoOro = 0, nettoFerro = 0, nettoPietra = 0, nettoArgilla = 0;
    let cvFerro = 0, cvPietra = 0, cvArgilla = 0, totaleDucati = 0;

    const primoGiorno = archivio[dateOrdinate[0]];
    const vFerroRef = primoGiorno.vFerro;
    const vPietraRef = primoGiorno.vPietra;
    const vArgillaRef = primoGiorno.vArgilla;
    let prezziVariabili = false;

    dateOrdinate.forEach(data => {
        const g = archivio[data];
        if (!g) return;

        if (g.vFerro !== vFerroRef || g.vPietra !== vPietraRef || g.vArgilla !== vArgillaRef) {
            prezziVariabili = true;
        }

        salari += Number(g.salari) || 0;
        totProdOro += Number(g.totProdOro) || 0;
        totProdFerro += Number(g.totProdFerro) || 0;
        totProdPietra += Number(g.totProdPietra) || 0;
        totProdArgilla += Number(g.totProdArgilla) || 0;
        totManuPietra += Number(g.totManuPietra) || 0;
        totManuFerro += Number(g.totManuFerro) || 0;

        nettoOro += Number(g.nettoOro) || 0;
        nettoFerro += Number(g.nettoFerro) || 0;
        nettoPietra += Number(g.nettoPietra) || 0;
        nettoArgilla += Number(g.nettoArgilla) || 0;

        cvFerro += Number(g.cvFerro) || 0;
        cvPietra += Number(g.cvPietra) || 0;
        cvArgilla += Number(g.cvArgilla) || 0;
        totaleDucati += Number(g.totaleDucati) || 0;

        if (Array.isArray(g.minere)) {
            g.minere.forEach(m => {
                if (!minereTotaliMap[m.id]) {
                    minereTotaliMap[m.id] = {
                        id: m.id,
                        nodo: m.nodo,
                        tipo: m.tipo,
                        nome: m.nome,
                        icona: m.icona,
                        img: m.img,
                        chiusa: m.chiusa,
                        produzione: 0,
                        manutenzione_pietra: 0,
                        manutenzione_ferro: 0
                    };
                }
                minereTotaliMap[m.id].produzione += Number(m.produzione) || 0;
                minereTotaliMap[m.id].manutenzione_pietra += Number(m.manutenzione_pietra) || 0;
                minereTotaliMap[m.id].manutenzione_ferro += Number(m.manutenzione_ferro) || 0;
                // Se la miniera è stata attiva in almeno un giorno la consideriamo aperta nel riepilogo, altrimenti chiusa
                if (!m.chiusa) {
                    minereTotaliMap[m.id].chiusa = false;
                }
            });
        }
    });

    const minere = Object.values(minereTotaliMap).sort((a, b) => a.id - b.id);

    return {
        dateOrdinate,
        archivio,
        minere,
        salari,
        vFerro: vFerroRef,
        vPietra: vPietraRef,
        vArgilla: vArgillaRef,
        prezziVariabili,
        totProdOro,
        totProdFerro,
        totProdPietra,
        totProdArgilla,
        totManuPietra,
        totManuFerro,
        nettoOro,
        nettoFerro,
        nettoPietra,
        nettoArgilla,
        cvFerro,
        cvPietra,
        cvArgilla,
        totaleDucati
    };
}

function generaResocontoFinale() {
    const finale = calcolaDatiFinali();
    if (!finale) {
        return alert("Nessun giorno salvato in archivio! Salva almeno un giorno prima di visualizzare il Resoconto Finale.");
    }

    const classNetto = (val) => val >= 0 ? 'positive' : 'negative';
    const sign = (val) => val > 0 ? '+' : '';

    let righeTabella = '';
    finale.dateOrdinate.forEach(data => {
        const g = finale.archivio[data];
        righeTabella += `
            <tr>
                <td><strong>${data}</strong></td>
                <td>${formatNum(g.totProdOro)}</td>
                <td>${formatNum(g.salari)}</td>
                <td class="${classNetto(g.nettoFerro)}">${sign(g.nettoFerro)}${formatNum(g.nettoFerro)}</td>
                <td class="${classNetto(g.nettoPietra)}">${sign(g.nettoPietra)}${formatNum(g.nettoPietra)}</td>
                <td class="${classNetto(g.nettoArgilla)}">${sign(g.nettoArgilla)}${formatNum(g.nettoArgilla)}</td>
                <td class="${classNetto(g.totaleDucati)}"><strong>${sign(g.totaleDucati)}${formatNum(g.totaleDucati)}</strong></td>
            </tr>
        `;
    });

    const tabellaGiorniHTML = `
        <div class="days-summary-box">
            <strong>📅 Giorni conteggiati nel Resoconto Finale (${finale.dateOrdinate.length}):</strong>
            <table class="days-table">
                <thead>
                    <tr>
                        <th>Giorno</th>
                        <th>Oro Lordo</th>
                        <th>Salari</th>
                        <th>Ferro Netto</th>
                        <th>Pietra Netta</th>
                        <th>Argilla Netta</th>
                        <th>Totale Ducati</th>
                    </tr>
                </thead>
                <tbody>
                    ${righeTabella}
                </tbody>
            </table>
        </div>
    `;

    const intervallo = finale.dateOrdinate.length === 1
        ? `Giorno ${finale.dateOrdinate[0]}`
        : `${finale.dateOrdinate.length} giorni (dal ${finale.dateOrdinate[0]} al ${finale.dateOrdinate[finale.dateOrdinate.length - 1]})`;

    renderDatiHTML(finale, {
        titoloBanner: `📊 RESOCONTO FINALE COMPLESSIVO — ${intervallo}`,
        mostraBottoneBBCode: true,
        azioneBBCode: 'generaBBCodeResocontoFinale()',
        tabellaGiorniHTML
    });
}

function generaBBCodeResocontoFinale() {
    const finale = calcolaDatiFinali();
    if (!finale) return;
    const intervallo = finale.dateOrdinate.length === 1
        ? `Giorno ${finale.dateOrdinate[0]}`
        : `Resoconto Finale (${finale.dateOrdinate.length} giorni: dal ${finale.dateOrdinate[0]} al ${finale.dateOrdinate[finale.dateOrdinate.length - 1]})`;
    renderDatiBBCode(finale, intervallo);
}

// -------------- FUNZIONI AUSILIARIE ARCHIVIO (ELIMINA / ESPORTA / IMPORTA FILE JSON) --------------
async function eliminaGiornoSalvato() {
    const select = document.getElementById('giornoSalvatoSelect');
    const dataScelta = select ? select.value : '';
    if (!dataScelta) {
        return alert("Nessun giorno selezionato da eliminare.");
    }

    if (!confirm(`Vuoi davvero eliminare il giorno ${dataScelta} dall'archivio?`)) {
        return;
    }

    sincronizzazioneInCorso = true;
    try {
        const archivio = caricaArchivio();
        delete archivio[dataScelta];
        salvaArchivio(archivio, false);
        aggiornaListaGiorniSalvati();
        renderTabellaStipendiInput();
        if (typeof aggiornaStatisticheSeVisibili === 'function') {
            aggiornaStatisticheSeVisibili();
        }
        document.getElementById('output-section').style.display = 'none';
        document.getElementById('bbcode-section').style.display = 'none';
        if (window.location.protocol.startsWith('http')) {
            await inviaDatiAlCloud({ archivio, stipendi: caricaStipendiMiniere() });
        }
    } finally {
        sincronizzazioneInCorso = false;
    }
}

async function svuotaArchivio() {
    const archivio = caricaArchivio();
    if (Object.keys(archivio).length === 0) {
        return alert("L'archivio è già vuoto.");
    }
    if (!confirm("Attenzione: vuoi davvero cancellare TUTTI i giorni salvati nell'archivio?")) {
        return;
    }
    sincronizzazioneInCorso = true;
    try {
        salvaArchivio({}, false);
        localStorage.removeItem(STORAGE_KEY);
        aggiornaListaGiorniSalvati();
        renderTabellaStipendiInput();
        if (typeof aggiornaStatisticheSeVisibili === 'function') {
            aggiornaStatisticheSeVisibili();
        }
        document.getElementById('output-section').style.display = 'none';
        document.getElementById('bbcode-section').style.display = 'none';

        if (window.location.protocol.startsWith('http')) {
            await inviaDatiAlCloud({ archivio: {}, stipendi: caricaStipendiMiniere() });
        }
    } finally {
        sincronizzazioneInCorso = false;
    }
}

function esportaJSON() {
    const archivio = caricaArchivio();
    const date = Object.keys(archivio).sort();
    if (date.length === 0) {
        return alert("Non ci sono giorni salvati da esportare!");
    }

    const contenutoJSON = JSON.stringify(archivio, null, 2);
    const blob = new Blob([contenutoJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `resoconti_miniere_${date[0]}_${date[date.length - 1]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importaJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importato = JSON.parse(e.target.result);
            if (!importato || typeof importato !== 'object') {
                throw new Error("Formato JSON non valido");
            }

            const archivio = caricaArchivio();
            const dateImportate = Object.keys(importato).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));

            if (dateImportate.length === 0) {
                alert("Il file JSON selezionato non contiene date valide (formato YYYY-MM-DD).");
                return;
            }

            const duplicati = dateImportate.filter(d => archivio[d]);
            let sovrascriviDuplicati = true;

            if (duplicati.length > 0) {
                sovrascriviDuplicati = confirm(
                    `Nel file importato sono presenti ${duplicati.length} giorni già salvati (${duplicati.join(', ')}).\n\n` +
                    `Premi OK per sovrascriverli, oppure Annulla per importare solo i giorni nuovi.`
                );
            }

            let importatiCount = 0;
            dateImportate.forEach(data => {
                if (!archivio[data] || sovrascriviDuplicati) {
                    archivio[data] = importato[data];
                    importatiCount++;
                }
            });

            salvaArchivio(archivio, false);
            aggiornaListaGiorniSalvati();
            renderTabellaStipendiInput();
            if (typeof aggiornaStatisticheSeVisibili === 'function') {
                aggiornaStatisticheSeVisibili();
            }
            if (window.location.protocol.startsWith('http')) {
                inviaDatiAlCloud({ archivio, stipendi: caricaStipendiMiniere() });
            }
            alert(`Importazione completata: ${importatiCount} giorni caricati in archivio.`);
        } catch (err) {
            alert("Errore durante la lettura del file JSON: " + err.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// =================================================================================================
// SEZIONE SEPARATA: CALCOLO STIPENDI MINIERE & VALORE 1 PIETRA E 1 FERRO (1, 7, 15 E 30 GIORNI)
// =================================================================================================

function toggleCalcoloPietraFerro() {
    const sezione = document.getElementById('sezione-opzione-pietra-ferro');
    const btn = document.getElementById('btnTogglePietraFerro');
    if (!sezione) return;

    const isAttivo = sezione.style.display !== 'none';
    if (isAttivo) {
        sezione.style.display = 'none';
        if (btn) {
            btn.classList.remove('active');
            btn.textContent = '⚖️ Calcola Valore Pietra e Ferro';
        }
    } else {
        sezione.style.display = 'block';
        if (btn) {
            btn.classList.add('active');
            btn.textContent = '⚖️ Disabilita Calcolo Pietra e Ferro';
        }
        renderTabellaStipendiInput();
        sezione.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function ottieniMiniereCorrenti() {
    const testo = document.getElementById('reportInput') ? document.getElementById('reportInput').value : '';
    const selectData = document.getElementById('dataSelezionata');
    const dataScelta = selectData ? selectData.value : null;

    if (testo && testo.trim()) {
        const parsed = parseReport(testo, dataScelta);
        if (parsed.length > 0) return parsed;
    }

    const stipendiSalvati = caricaStipendiMiniere();
    return Object.entries(nodiMap).map(([nodo, info], idx) => {
        const stipBase = parseFloat(stipendiSalvati[nodo]) || 0;
        const stipOrario = stipBase / 20;
        return {
            id: idx + 1,
            nodo: nodo,
            tipo: info.tipo,
            nome: info.nome,
            icona: info.icona,
            img: info.img,
            chiusa: false,
            produzione: 0,
            affluenza: 0,
            manutenzione_pietra: 0,
            manutenzione_ferro: 0,
            stipendio_base: stipBase,
            stipendio_orario: stipOrario,
            stipendio_totale: 0
        };
    });
}

function getBadgeTipo(tipo) {
    switch (tipo) {
        case 'pietra': return '<span class="mine-type-badge badge-pietra">🪨 Pietra</span>';
        case 'ferro': return '<span class="mine-type-badge badge-ferro">⛏️ Ferro</span>';
        case 'oro': return '<span class="mine-type-badge badge-oro">💰 Oro</span>';
        case 'argilla': return '<span class="mine-type-badge badge-argilla">🧱 Argilla</span>';
        default: return `<span class="mine-type-badge">${tipo}</span>`;
    }
}

function calcolaMetrichePietraFerroDaMiniere(minere) {
    let stipendioTotPietra = 0;
    let stipendioTotFerro = 0;
    let stipendioTotTutte = 0;

    let prodLordaMinierePietra = 0;
    let consumoPietraMinierePietra = 0;
    let consumoFerroMinierePietra = 0;
    let affluenzaTotPietra = 0;

    let prodLordaMiniereFerro = 0;
    let consumoPietraMiniereFerro = 0;
    let consumoFerroMiniereFerro = 0;
    let affluenzaTotFerro = 0;

    let affluenzaTotTutte = 0;

    minere.forEach(m => {
        if (m.nome === 'Sconosciuta' || m.chiusa) return;
        const stipBase = Number(m.stipendio_base) || 0;
        const stipOrario = stipBase / 20;
        const aff = Number(m.affluenza) || 0;
        const stipTot = (m.stipendio_totale !== undefined && m.stipendio_totale !== null)
            ? Number(m.stipendio_totale)
            : (stipOrario * aff);

        stipendioTotTutte += stipTot;
        affluenzaTotTutte += aff;

        if (m.tipo === 'pietra') {
            stipendioTotPietra += stipTot;
            prodLordaMinierePietra += Number(m.produzione) || 0;
            consumoPietraMinierePietra += Number(m.manutenzione_pietra) || 0;
            consumoFerroMinierePietra += Number(m.manutenzione_ferro) || 0;
            affluenzaTotPietra += aff;
        } else if (m.tipo === 'ferro') {
            stipendioTotFerro += stipTot;
            prodLordaMiniereFerro += Number(m.produzione) || 0;
            consumoPietraMiniereFerro += Number(m.manutenzione_pietra) || 0;
            consumoFerroMiniereFerro += Number(m.manutenzione_ferro) || 0;
            affluenzaTotFerro += aff;
        }
    });

    const prodNettaMinierePietra = prodLordaMinierePietra - consumoPietraMinierePietra;
    const prodNettaMiniereFerro = prodLordaMiniereFerro - consumoFerroMiniereFerro;

    // Denominatore:
    // (Produzione Netta Miniere di Pietra * Produzione Netta Miniere di Ferro) - (Consumo Pietra delle Miniere di Ferro * Consumo Ferro delle Miniere di Pietra)
    const denominatore = (prodNettaMinierePietra * prodNettaMiniereFerro) - (consumoPietraMiniereFerro * consumoFerroMinierePietra);

    // 1 Pietra = [ (Stipendio Totale Miniere di Pietra * Produzione Netta Miniere di Ferro) - (Consumo Ferro delle Miniere di Pietra * Stipendio Totale Miniere di Ferro) ] / denominatore
    const numPietra = (stipendioTotPietra * prodNettaMiniereFerro) - (consumoFerroMinierePietra * stipendioTotFerro);

    // 1 Ferro = [ (Stipendio Totale Miniere di Ferro * Produzione Netta Miniere di Pietra) - (Consumo Pietra delle Miniere di Ferro * Stipendio Totale Miniere di Pietra) ] / denominatore
    const numFerro = (stipendioTotFerro * prodNettaMinierePietra) - (consumoPietraMiniereFerro * stipendioTotPietra);

    const valore1Pietra = denominatore !== 0 ? (numPietra / denominatore) : 0;
    const valore1Ferro = denominatore !== 0 ? (numFerro / denominatore) : 0;

    return {
        stipendioTotPietra,
        stipendioTotFerro,
        stipendioTotTutte,
        affluenzaTotPietra,
        affluenzaTotFerro,
        affluenzaTotTutte,
        prodLordaMinierePietra,
        consumoPietraMinierePietra,
        prodNettaMinierePietra,
        consumoFerroMinierePietra,
        prodLordaMiniereFerro,
        consumoFerroMiniereFerro,
        prodNettaMiniereFerro,
        consumoPietraMiniereFerro,
        numPietra,
        numFerro,
        denominatore,
        valore1Pietra,
        valore1Ferro
    };
}

function normalizzaMiniereGiorno(minere) {
    const stipendiAttuali = caricaStipendiMiniere();
    return (minere || []).map(m => {
        const keyNodo = m.nodo || `id_${m.id}`;
        const stipBase = parseFloat(stipendiAttuali[keyNodo]) || Number(m.stipendio_base) || 0;
        const stipOrario = stipBase / 20;
        const aff = Number(m.affluenza) || 0;
        const stipTot = m.chiusa ? 0 : (stipOrario * aff);
        return {
            ...m,
            affluenza: aff,
            stipendio_base: stipBase,
            stipendio_orario: stipOrario,
            stipendio_totale: stipTot
        };
    });
}

function aggregaMiniereSuGiorni(listaGiorni, fattoreScala = 1) {
    const mappa = {};
    listaGiorni.forEach(g => {
        const minereNorm = normalizzaMiniereGiorno(g.minere);
        minereNorm.forEach(m => {
            const key = m.nodo || `id_${m.id}`;
            if (!mappa[key]) {
                mappa[key] = {
                    id: m.id,
                    nodo: m.nodo,
                    tipo: m.tipo,
                    nome: m.nome,
                    icona: m.icona,
                    img: m.img,
                    chiusa: m.chiusa,
                    produzione: 0,
                    affluenza: 0,
                    manutenzione_pietra: 0,
                    manutenzione_ferro: 0,
                    stipendio_base: m.stipendio_base,
                    stipendio_orario: m.stipendio_orario,
                    stipendio_totale: 0
                };
            }
            mappa[key].produzione += (Number(m.produzione) || 0) * fattoreScala;
            mappa[key].affluenza += (Number(m.affluenza) || 0) * fattoreScala;
            mappa[key].manutenzione_pietra += (Number(m.manutenzione_pietra) || 0) * fattoreScala;
            mappa[key].manutenzione_ferro += (Number(m.manutenzione_ferro) || 0) * fattoreScala;
            mappa[key].stipendio_base = m.stipendio_base;
            mappa[key].stipendio_orario = m.stipendio_orario;
            mappa[key].stipendio_totale += (Number(m.stipendio_totale) || 0) * fattoreScala;
            if (!m.chiusa) {
                mappa[key].chiusa = false;
            }
        });
    });
    return Object.values(mappa).sort((a, b) => a.id - b.id);
}

function estraiListaDateDaTesto(testo) {
    if (!testo || !testo.trim()) return [];
    const blocchi = testo.split(/(?=Miniera \d+\s*:)/);
    let tutteLeDate = new Set();

    blocchi.forEach((blocco) => {
        const oreSection = blocco.split(/Numero di ore di lavoro in questi ultimi 7 giorni/i)[1];
        if (oreSection) {
            const oreText = oreSection.split(/Produzione in questi|Risorse consumate/i)[0];
            const lines = oreText.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{4}-\d{2}-\d{2}/));
            lines.forEach(line => {
                const dataMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
                if (dataMatch) tutteLeDate.add(dataMatch[1]);
            });
        }

        const prodSection = blocco.split(/Produzione in questi ultimi 7 giorni/i)[1];
        if (prodSection) {
            const prodText = prodSection.split(/Risorse consumate|Numero di ore di lavoro/i)[0];
            const lines = prodText.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{4}-\d{2}-\d{2}/));
            lines.forEach(line => {
                const dataMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
                if (dataMatch) tutteLeDate.add(dataMatch[1]);
            });
        }
    });

    return Array.from(tutteLeDate).sort();
}

function calcolaPeriodi1_7_15_30(minereGiornoCorrente = null, dataRiferimento = null) {
    const modalitaEl = document.getElementById('modalitaPeriodoSelect');
    const modalita = modalitaEl ? modalitaEl.value : 'misto';

    const minereBase = minereGiornoCorrente || ottieniMiniereCorrenti();
    const archivio = caricaArchivio();

    // 1. Carica tutti i giorni salvati nell'archivio JSON
    const giorniMap = {};
    Object.keys(archivio).forEach(data => {
        if (archivio[data] && Array.isArray(archivio[data].minere)) {
            giorniMap[data] = {
                data: data,
                minere: normalizzaMiniereGiorno(archivio[data].minere)
            };
        }
    });

    // 2. Estrae TUTTI i giorni presenti nel resoconto incollato (così i giorni successivi del report vengono sempre conteggiati!)
    const testoReport = document.getElementById('reportInput') ? document.getElementById('reportInput').value : '';
    const dateNelReport = estraiListaDateDaTesto(testoReport);
    dateNelReport.forEach(dt => {
        const minereParsed = normalizzaMiniereGiorno(parseReport(testoReport, dt));
        if (giorniMap[dt] && Array.isArray(giorniMap[dt].minere)) {
            // Unisce eventuali dati già salvati in archivio con quelli del report corrente
            const archMap = {};
            giorniMap[dt].minere.forEach(m => { archMap[m.id] = m; });
            minereParsed.forEach(m => {
                const a = archMap[m.id];
                if (a) {
                    if (!m.affluenza && a.affluenza) m.affluenza = a.affluenza;
                    if (!m.produzione && a.produzione) m.produzione = a.produzione;
                    if (!m.manutenzione_pietra && !m.manutenzione_ferro && (a.manutenzione_pietra || a.manutenzione_ferro)) {
                        m.manutenzione_pietra = a.manutenzione_pietra;
                        m.manutenzione_ferro = a.manutenzione_ferro;
                    }
                    m.stipendio_totale = m.chiusa ? 0 : (m.stipendio_orario * m.affluenza);
                }
            });
        }
        giorniMap[dt] = {
            data: dt,
            minere: minereParsed
        };
    });

    const selectData = document.getElementById('dataSelezionata');
    const dataCorr = dataRiferimento || (selectData && selectData.value ? selectData.value : null);

    if (minereBase && minereBase.length > 0 && !giorniMap[dataCorr || '__corrente__']) {
        const keyData = dataCorr || '__corrente__';
        giorniMap[keyData] = {
            data: keyData,
            minere: normalizzaMiniereGiorno(minereBase)
        };
    }

    const dateTutte = Object.keys(giorniMap).sort();

    const giornoSingolo = (dataCorr && giorniMap[dataCorr])
        ? giorniMap[dataCorr]
        : (dateTutte.length > 0 ? giorniMap[dateTutte[dateTutte.length - 1]] : { data: '', minere: normalizzaMiniereGiorno(minereBase) });

    const risultatiPeriodi = {};

    PERIODI_CALCOLO.forEach(giorni => {
        let minerePeriodo = [];
        let descrizioneFonte = '';
        let giorniRealiUsati = 1;

        if (giorni === 1 || modalita === 'proiezione') {
            minerePeriodo = aggregaMiniereSuGiorni([giornoSingolo], giorni);
            giorniRealiUsati = 1;
            descrizioneFonte = giorni === 1 ? '1 giorno (resoconto inserito)' : `Proiezione ×${giorni} gg (da 1g)`;
        } else {
            // Seleziona i giorni a partire da dataCorr includendo i giorni successivi (e precedenti se a fine intervallo)
            let dateSelezionate = [];
            const idx = dataCorr ? dateTutte.indexOf(dataCorr) : -1;
            if (idx !== -1) {
                dateSelezionate = dateTutte.slice(idx, idx + giorni);
                if (dateSelezionate.length < giorni) {
                    const mancanti = giorni - dateSelezionate.length;
                    const startIdx = Math.max(0, idx - mancanti);
                    dateSelezionate = dateTutte.slice(startIdx, idx + dateSelezionate.length);
                }
            } else {
                dateSelezionate = dateTutte.slice(-giorni);
            }

            const giorniEstratti = dateSelezionate.map(dt => giorniMap[dt]).filter(Boolean);
            giorniRealiUsati = giorniEstratti.length;

            if (modalita === 'archivio') {
                minerePeriodo = aggregaMiniereSuGiorni(giorniEstratti, 1);
                descrizioneFonte = `${giorniRealiUsati}/${giorni} gg reali`;
            } else {
                if (giorniRealiUsati >= giorni) {
                    minerePeriodo = aggregaMiniereSuGiorni(giorniEstratti, 1);
                    descrizioneFonte = `${giorni} gg reali (${dateSelezionate[0]} → ${dateSelezionate[dateSelezionate.length - 1]})`;
                } else if (giorniRealiUsati > 0) {
                    const fattore = giorni / giorniRealiUsati;
                    minerePeriodo = aggregaMiniereSuGiorni(giorniEstratti, fattore);
                    descrizioneFonte = giorniRealiUsati === 1
                        ? `Proiezione ${giorni} gg (da 1g)`
                        : `Proiezione ${giorni} gg (su media di ${giorniRealiUsati} gg reali)`;
                } else {
                    minerePeriodo = aggregaMiniereSuGiorni([giornoSingolo], giorni);
                    descrizioneFonte = `Proiezione ${giorni} gg`;
                }
            }
        }

        const metriche = calcolaMetrichePietraFerroDaMiniere(minerePeriodo);
        risultatiPeriodi[giorni] = {
            giorni,
            giorniRealiUsati,
            descrizioneFonte,
            minere: minerePeriodo,
            ...metriche
        };
    });

    return risultatiPeriodi;
}

function renderTabellaStipendiInput() {
    const tbody = document.getElementById('tabella-stipendi-miniere');
    if (!tbody) return;

    const minere = ottieniMiniereCorrenti();
    const periodi = calcolaPeriodi1_7_15_30(minere);

    const datiPerMiniera = {};
    PERIODI_CALCOLO.forEach(p => {
        datiPerMiniera[p] = {};
        if (periodi[p] && periodi[p].minere) {
            periodi[p].minere.forEach(m => {
                const key = m.nodo || `id_${m.id}`;
                datiPerMiniera[p][key] = {
                    stipendio_totale: m.stipendio_totale || 0,
                    affluenza: m.affluenza || 0
                };
            });
        }
    });

    let html = '';
    minere.forEach(m => {
        if (m.nome === 'Sconosciuta') return;
        const keyNodo = m.nodo || `id_${m.id}`;
        const closedBadge = m.chiusa ? ' <span class="closed-text">[CHIUSA]</span>' : '';
        const d1 = datiPerMiniera[1][keyNodo] || { stipendio_totale: 0, affluenza: 0 };
        const d7 = datiPerMiniera[7][keyNodo] || { stipendio_totale: 0, affluenza: 0 };
        const d15 = datiPerMiniera[15][keyNodo] || { stipendio_totale: 0, affluenza: 0 };
        const d30 = datiPerMiniera[30][keyNodo] || { stipendio_totale: 0, affluenza: 0 };

        html += `
            <tr class="${m.chiusa ? 'row-closed' : ''}">
                <td class="text-left">
                    <strong>Miniera ${m.id}</strong> (${m.nome}${m.nodo ? ` - Nodo ${m.nodo}` : ''})${closedBadge}
                </td>
                <td>${getBadgeTipo(m.tipo)}</td>
                <td>
                    <input type="number" step="0.01" min="0" class="salary-input"
                        data-nodo="${keyNodo}"
                        value="${m.stipendio_base || 0}"
                        oninput="onStipendioMinieraChange('${keyNodo}', this.value)">
                </td>
                <td><strong>${formatNumPreciso(m.stipendio_orario, 2)}</strong> <small>ducati/h</small></td>
                <td><strong>${formatNum(m.affluenza || 0)}</strong> <small>ore</small></td>
                <td><strong>${formatNum(d1.stipendio_totale)}</strong> <small>ducati</small></td>
                <td><strong>${formatNum(d7.stipendio_totale)}</strong> <small>ducati</small><br><small>(${formatNum(d7.affluenza)} ore)</small></td>
                <td><strong>${formatNum(d15.stipendio_totale)}</strong> <small>ducati</small><br><small>(${formatNum(d15.affluenza)} ore)</small></td>
                <td><strong>${formatNum(d30.stipendio_totale)}</strong> <small>ducati</small><br><small>(${formatNum(d30.affluenza)} ore)</small></td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    aggiornaBoxAnteprimaLive(periodi);
    mostraCalcoloPietraFerro(periodi, minere);
}

function onStipendioMinieraChange(keyNodo, valore) {
    const stipendi = caricaStipendiMiniere();
    stipendi[keyNodo] = parseFloat(valore) || 0;
    salvaStipendiMiniere(stipendi);
    aggiornaValoriTabellaStipendiInPlace();
    if (typeof aggiornaStatisticheSeVisibili === 'function') {
        aggiornaStatisticheSeVisibili();
    }
}

function applicaStipendioATutte() {
    const inputRapido = document.getElementById('stipendioRapido');
    if (!inputRapido || inputRapido.value === '') {
        return alert("Inserisci un valore di stipendio da applicare a tutte le miniere.");
    }
    const val = parseFloat(inputRapido.value) || 0;
    const minere = ottieniMiniereCorrenti();
    const stipendi = caricaStipendiMiniere();

    minere.forEach(m => {
        const keyNodo = m.nodo || `id_${m.id}`;
        stipendi[keyNodo] = val;
    });
    Object.keys(nodiMap).forEach(nodo => {
        stipendi[nodo] = val;
    });

    salvaStipendiMiniere(stipendi);
    renderTabellaStipendiInput();
    if (typeof aggiornaStatisticheSeVisibili === 'function') {
        aggiornaStatisticheSeVisibili();
    }
}

function aggiornaAnteprimaStipendi() {
    renderTabellaStipendiInput();
}

function aggiornaValoriTabellaStipendiInPlace() {
    const minere = ottieniMiniereCorrenti();
    const periodi = calcolaPeriodi1_7_15_30(minere);
    const tbody = document.getElementById('tabella-stipendi-miniere');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    const minereValide = minere.filter(m => m.nome !== 'Sconosciuta');

    rows.forEach((tr, idx) => {
        const m = minereValide[idx];
        if (!m) return;
        const keyNodo = m.nodo || `id_${m.id}`;
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 9) {
            cells[3].innerHTML = `<strong>${formatNumPreciso(m.stipendio_orario, 2)}</strong> <small>ducati/h</small>`;
            cells[4].innerHTML = `<strong>${formatNum(m.affluenza || 0)}</strong> <small>ore</small>`;
            const m1 = periodi[1].minere.find(x => (x.nodo || `id_${x.id}`) === keyNodo);
            const m7 = periodi[7].minere.find(x => (x.nodo || `id_${x.id}`) === keyNodo);
            const m15 = periodi[15].minere.find(x => (x.nodo || `id_${x.id}`) === keyNodo);
            const m30 = periodi[30].minere.find(x => (x.nodo || `id_${x.id}`) === keyNodo);
            cells[5].innerHTML = `<strong>${formatNum(m1 ? m1.stipendio_totale : 0)}</strong> <small>ducati</small>`;
            cells[6].innerHTML = `<strong>${formatNum(m7 ? m7.stipendio_totale : 0)}</strong> <small>ducati</small><br><small>(${formatNum(m7 ? m7.affluenza : 0)} ore)</small>`;
            cells[7].innerHTML = `<strong>${formatNum(m15 ? m15.stipendio_totale : 0)}</strong> <small>ducati</small><br><small>(${formatNum(m15 ? m15.affluenza : 0)} ore)</small>`;
            cells[8].innerHTML = `<strong>${formatNum(m30 ? m30.stipendio_totale : 0)}</strong> <small>ducati</small><br><small>(${formatNum(m30 ? m30.affluenza : 0)} ore)</small>`;
        }
    });

    aggiornaBoxAnteprimaLive(periodi);
    mostraCalcoloPietraFerro(periodi, minere);
}

function aggiornaBoxAnteprimaLive(periodi) {
    const previewEl = document.getElementById('live-pietra-ferro-preview');
    if (!previewEl) return;

    const pSelect = document.getElementById('periodoCalcoloSelect');
    const pScelto = pSelect ? (parseInt(pSelect.value) || 1) : 1;
    const datiP = periodi[pScelto] || periodi[1];

    previewEl.innerHTML = `
        <div class="live-preview-grid">
            <div class="live-preview-card">
                <span class="live-label">🪨 Stipendio Tot. Miniere Pietra (${pScelto}g)</span>
                <span class="live-value">${formatNum(datiP.stipendioTotPietra)} ducati</span>
                <small>Prod. Netta Pietra: ${formatNum(datiP.prodNettaMinierePietra)} | Consumo Ferro: ${formatNum(datiP.consumoFerroMinierePietra)}</small>
            </div>
            <div class="live-preview-card">
                <span class="live-label">⛏️ Stipendio Tot. Miniere Ferro (${pScelto}g)</span>
                <span class="live-value">${formatNum(datiP.stipendioTotFerro)} ducati</span>
                <small>Prod. Netta Ferro: ${formatNum(datiP.prodNettaMiniereFerro)} | Consumo Pietra: ${formatNum(datiP.consumoPietraMiniereFerro)}</small>
            </div>
            <div class="live-preview-card highlight-card">
                <span class="live-label">🪨 Valore Calcolato <strong>1 Pietra</strong> (${pScelto}g)</span>
                <span class="live-value price-highlight">${formatNumPreciso(datiP.valore1Pietra, 2)} ducati</span>
                <small>${datiP.descrizioneFonte}</small>
            </div>
            <div class="live-preview-card highlight-card">
                <span class="live-label">⛏️ Valore Calcolato <strong>1 Ferro</strong> (${pScelto}g)</span>
                <span class="live-value price-highlight">${formatNumPreciso(datiP.valore1Ferro, 2)} ducati</span>
                <small>${datiP.descrizioneFonte}</small>
            </div>
        </div>
    `;
}

function mostraCalcoloPietraFerro(periodiPrecalcolati = null, minerePrecalcolate = null) {
    const sezionePF = document.getElementById('sezione-calcolo-pietra-ferro');
    if (!sezionePF) return;

    const minere = minerePrecalcolate || ottieniMiniereCorrenti();
    const periodi = periodiPrecalcolati || calcolaPeriodi1_7_15_30(minere);
    const pSelect = document.getElementById('periodoCalcoloSelect');
    const pDettaglio = pSelect ? (parseInt(pSelect.value) || 1) : 1;
    const datiDettaglio = periodi[pDettaglio] || periodi[1];

    const p1 = periodi[1], p7 = periodi[7], p15 = periodi[15], p30 = periodi[30];

    sezionePF.innerHTML = `
        <div class="calc-pietra-ferro-container">
            <h4>📊 Riepilogo Calcolo Valore di 1 Pietra e 1 Ferro (1, 7, 15 e 30 Giorni)</h4>
            <div class="table-responsive">
                <table class="days-table periods-comparison-table">
                    <thead>
                        <tr>
                            <th>Voce di Calcolo</th>
                            <th>1 Giorno<br><small>${p1.descrizioneFonte}</small></th>
                            <th>7 Giorni<br><small>${p7.descrizioneFonte}</small></th>
                            <th>15 Giorni<br><small>${p15.descrizioneFonte}</small></th>
                            <th>30 Giorni<br><small>${p30.descrizioneFonte}</small></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="text-left">🪨 <strong>Stipendio Totale Miniere di Pietra</strong></td>
                            <td><strong>${formatNum(p1.stipendioTotPietra)}</strong> ducati</td>
                            <td><strong>${formatNum(p7.stipendioTotPietra)}</strong> ducati</td>
                            <td><strong>${formatNum(p15.stipendioTotPietra)}</strong> ducati</td>
                            <td><strong>${formatNum(p30.stipendioTotPietra)}</strong> ducati</td>
                        </tr>
                        <tr>
                            <td class="text-left">⛏️ <strong>Stipendio Totale Miniere di Ferro</strong></td>
                            <td><strong>${formatNum(p1.stipendioTotFerro)}</strong> ducati</td>
                            <td><strong>${formatNum(p7.stipendioTotFerro)}</strong> ducati</td>
                            <td><strong>${formatNum(p15.stipendioTotFerro)}</strong> ducati</td>
                            <td><strong>${formatNum(p30.stipendioTotFerro)}</strong> ducati</td>
                        </tr>
                        <tr>
                            <td class="text-left">💰 <strong>Stipendio Totale Tutte le Miniere</strong></td>
                            <td>${formatNum(p1.stipendioTotTutte)} ducati</td>
                            <td>${formatNum(p7.stipendioTotTutte)} ducati</td>
                            <td>${formatNum(p15.stipendioTotTutte)} ducati</td>
                            <td>${formatNum(p30.stipendioTotTutte)} ducati</td>
                        </tr>
                        <tr>
                            <td class="text-left">🪨 <strong>Produzione Netta Miniere di Pietra</strong><br><small>(Prod. Lorda Pietra - Consumo Pietra Miniere di Pietra)</small></td>
                            <td>${formatNum(p1.prodNettaMinierePietra)} q.li <small>(${formatNum(p1.prodLordaMinierePietra)} - ${formatNum(p1.consumoPietraMinierePietra)})</small></td>
                            <td>${formatNum(p7.prodNettaMinierePietra)} q.li <small>(${formatNum(p7.prodLordaMinierePietra)} - ${formatNum(p7.consumoPietraMinierePietra)})</small></td>
                            <td>${formatNum(p15.prodNettaMinierePietra)} q.li <small>(${formatNum(p15.prodLordaMinierePietra)} - ${formatNum(p15.consumoPietraMinierePietra)})</small></td>
                            <td>${formatNum(p30.prodNettaMinierePietra)} q.li <small>(${formatNum(p30.prodLordaMinierePietra)} - ${formatNum(p30.consumoPietraMinierePietra)})</small></td>
                        </tr>
                        <tr>
                            <td class="text-left">⛏️ <strong>Produzione Netta Miniere di Ferro</strong><br><small>(Prod. Lorda Ferro - Consumo Ferro Miniere di Ferro)</small></td>
                            <td>${formatNum(p1.prodNettaMiniereFerro)} kg <small>(${formatNum(p1.prodLordaMiniereFerro)} - ${formatNum(p1.consumoFerroMiniereFerro)})</small></td>
                            <td>${formatNum(p7.prodNettaMiniereFerro)} kg <small>(${formatNum(p7.prodLordaMiniereFerro)} - ${formatNum(p7.consumoFerroMiniereFerro)})</small></td>
                            <td>${formatNum(p15.prodNettaMiniereFerro)} kg <small>(${formatNum(p15.prodLordaMiniereFerro)} - ${formatNum(p15.consumoFerroMiniereFerro)})</small></td>
                            <td>${formatNum(p30.prodNettaMiniereFerro)} kg <small>(${formatNum(p30.prodLordaMiniereFerro)} - ${formatNum(p30.consumoFerroMiniereFerro)})</small></td>
                        </tr>
                        <tr>
                            <td class="text-left">🔩 <strong>Consumo Ferro delle Miniere di Pietra</strong></td>
                            <td>${formatNum(p1.consumoFerroMinierePietra)} kg</td>
                            <td>${formatNum(p7.consumoFerroMinierePietra)} kg</td>
                            <td>${formatNum(p15.consumoFerroMinierePietra)} kg</td>
                            <td>${formatNum(p30.consumoFerroMinierePietra)} kg</td>
                        </tr>
                        <tr>
                            <td class="text-left">🧱 <strong>Consumo Pietra delle Miniere di Ferro</strong></td>
                            <td>${formatNum(p1.consumoPietraMiniereFerro)} q.li</td>
                            <td>${formatNum(p7.consumoPietraMiniereFerro)} q.li</td>
                            <td>${formatNum(p15.consumoPietraMiniereFerro)} q.li</td>
                            <td>${formatNum(p30.consumoPietraMiniereFerro)} q.li</td>
                        </tr>
                        <tr class="result-row-pietra">
                            <td class="text-left">🪨 <strong>VALORE 1 PIETRA (ducati/quintale)</strong></td>
                            <td><strong class="result-price">${formatNumPreciso(p1.valore1Pietra, 2)}</strong> ducati</td>
                            <td><strong class="result-price">${formatNumPreciso(p7.valore1Pietra, 2)}</strong> ducati</td>
                            <td><strong class="result-price">${formatNumPreciso(p15.valore1Pietra, 2)}</strong> ducati</td>
                            <td><strong class="result-price">${formatNumPreciso(p30.valore1Pietra, 2)}</strong> ducati</td>
                        </tr>
                        <tr class="result-row-ferro">
                            <td class="text-left">⛏️ <strong>VALORE 1 FERRO (ducati/chilo)</strong></td>
                            <td><strong class="result-price">${formatNumPreciso(p1.valore1Ferro, 2)}</strong> ducati</td>
                            <td><strong class="result-price">${formatNumPreciso(p7.valore1Ferro, 2)}</strong> ducati</td>
                            <td><strong class="result-price">${formatNumPreciso(p15.valore1Ferro, 2)}</strong> ducati</td>
                            <td><strong class="result-price">${formatNumPreciso(p30.valore1Ferro, 2)}</strong> ducati</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="formula-breakdown-box">
                <h4>📐 Dettaglio Formula Applicata (${datiDettaglio.giorni || 1} ${(datiDettaglio.giorni || 1) === 1 ? 'Giorno' : 'Giorni'}):</h4>
                <p>
                    <strong>1 Pietra</strong> =
                    <code>[ (${formatNum(datiDettaglio.stipendioTotPietra)} × ${formatNum(datiDettaglio.prodNettaMiniereFerro)}) - (${formatNum(datiDettaglio.consumoFerroMinierePietra)} × ${formatNum(datiDettaglio.stipendioTotFerro)}) ] / [ (${formatNum(datiDettaglio.prodNettaMinierePietra)} × ${formatNum(datiDettaglio.prodNettaMiniereFerro)}) - (${formatNum(datiDettaglio.consumoPietraMiniereFerro)} × ${formatNum(datiDettaglio.consumoFerroMinierePietra)}) ]</code>
                    = <code>${formatNum(datiDettaglio.numPietra)} / ${formatNum(datiDettaglio.denominatore)}</code>
                    = <strong>${formatNumPreciso(datiDettaglio.valore1Pietra, 2)} ducati</strong>
                </p>
                <p>
                    <strong>1 Ferro</strong> =
                    <code>[ (${formatNum(datiDettaglio.stipendioTotFerro)} × ${formatNum(datiDettaglio.prodNettaMinierePietra)}) - (${formatNum(datiDettaglio.consumoPietraMiniereFerro)} × ${formatNum(datiDettaglio.stipendioTotPietra)}) ] / [ (${formatNum(datiDettaglio.prodNettaMinierePietra)} × ${formatNum(datiDettaglio.prodNettaMiniereFerro)}) - (${formatNum(datiDettaglio.consumoPietraMiniereFerro)} × ${formatNum(datiDettaglio.consumoFerroMinierePietra)}) ]</code>
                    = <code>${formatNum(datiDettaglio.numFerro)} / ${formatNum(datiDettaglio.denominatore)}</code>
                    = <strong>${formatNumPreciso(datiDettaglio.valore1Ferro, 2)} ducati</strong>
                </p>
            </div>
        </div>
    `;
}
