'use strict';

/**
 * Modulo Grafici e Statistiche delle Miniere (basato esclusivamente sui dati salvati)
 * Supporta visualizzazione integrata a sezione e apertura separata (?vista=statistiche).
 */

const STATS_PALETTE_MINIERE = [
    '#C79100', // Oro caldo
    '#2B5B84', // Blu ferro
    '#5E5448', // Grigio pietra
    '#B85D38', // Terracotta argilla
    '#2E7D32', // Verde bosco
    '#6A1B9A', // Viola scuro
    '#00796B', // Teal
    '#AD1457', // Amaranto
    '#4E342E', // Marrone
    '#1565C0'  // Blu intenso
];

const STATS_COLORI_TIPO = {
    oro: '#C79100',
    ferro: '#2B5B84',
    pietra: '#6D6559',
    argilla: '#B85D38',
    sconosciuto: '#888888'
};

const statsState = {
    modalitaBilancio: 'giornaliero',
    risorsaChart: 'ferro',
    modalitaDonut: 'risorse',
    metricaClassifica: 'valoreNetto',
    metricaTrendMiniere: 'valoreNetto',
    hiddenSeriesMiniere: new Set(),
    tableSortCol: 'valoreNetto',
    tableSortDir: 'desc',
    lastDataset: null
};

const statsTooltipMap = new Map();
let statsTooltipCounter = 0;

// Attiva immediatamente la modalità standalone prima del paint finale se ?vista=statistiche
(function applicaClasseStandaloneImmediata() {
    if (isStandaloneStatsMode() && document.body) {
        document.body.classList.add('standalone-stats-mode');
        document.title = 'Statistiche e Grafici Miniere - Resoconto Miniere';
    }
})();

function isStandaloneStatsMode() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('vista') === 'statistiche';
    } catch {
        return false;
    }
}

function escapeHtmlStats(val) {
    return String(val === null || val === undefined ? '' : val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function registerStatsTooltip(htmlContent) {
    statsTooltipCounter += 1;
    const id = `stip_${statsTooltipCounter}`;
    statsTooltipMap.set(id, htmlContent);
    return id;
}

function formatDataBreveStats(isoDate) {
    if (!isoDate || typeof isoDate !== 'string') return '';
    const parts = isoDate.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return isoDate;
}

function formatDataCompletaStats(isoDate) {
    if (!isoDate || typeof isoDate !== 'string') return '-';
    const parts = isoDate.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoDate;
}

function formatTickStats(val) {
    if (!isFinite(val)) return '0';
    if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (Math.abs(val) >= 10000) return (val / 1000).toFixed(1).replace('.', ',') + 'k';
    if (Math.abs(val) < 1e-6) return '0';
    return Number.isInteger(val) ? String(val) : val.toFixed(1).replace('.', ',');
}

function getUnitaBreveStats(tipo) {
    switch (tipo) {
        case 'oro': return 'duc.';
        case 'ferro': return 'kg';
        case 'pietra': return 'q.li';
        case 'argilla': return 'bl.';
        default: return '';
    }
}

function getNomeRisorsaStats(tipo) {
    switch (tipo) {
        case 'oro': return 'Oro';
        case 'ferro': return 'Ferro';
        case 'pietra': return 'Pietra';
        case 'argilla': return 'Argilla';
        default: return tipo || 'Altro';
    }
}

function getIconaTipoStats(tipo) {
    switch (tipo) {
        case 'oro': return '💰';
        case 'ferro': return '⛏️';
        case 'pietra': return '🪨';
        case 'argilla': return '🧱';
        default: return '⚒️';
    }
}

function computeNiceBounds(rawMin, rawMax, includeZero = true) {
    let min = isFinite(rawMin) ? rawMin : 0;
    let max = isFinite(rawMax) ? rawMax : 0;

    if (includeZero) {
        if (min > 0) min = 0;
        if (max < 0) max = 0;
    }

    if (min === max) {
        if (min === 0) return { min: 0, max: 10, ticks: [0, 2.5, 5, 7.5, 10] };
        const pad = Math.abs(min) * 0.2 || 1;
        min -= pad;
        max += pad;
    }

    const span = max - min;
    const targetTicks = 5;
    const rawStep = span / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;

    let stepFactor = 1;
    if (norm <= 1) stepFactor = 1;
    else if (norm <= 2) stepFactor = 2;
    else if (norm <= 2.5) stepFactor = 2.5;
    else if (norm <= 5) stepFactor = 5;
    else stepFactor = 10;

    const step = stepFactor * mag;
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;

    const ticks = [];
    const count = Math.min(12, Math.round((niceMax - niceMin) / step));
    for (let i = 0; i <= count; i++) {
        const val = niceMin + i * step;
        ticks.push(Math.abs(val) < step * 1e-6 ? 0 : Number(val.toFixed(6)));
    }

    return { min: niceMin, max: niceMax, ticks };
}

// =========================================================================
// APERTURA INLINE E APERTURA SEPARATA
// =========================================================================

function toggleStatisticheMiniere() {
    const sezione = document.getElementById('sezione-statistiche-miniere');
    const btn = document.getElementById('btnToggleStatistiche');
    if (!sezione) return;

    const isAttivo = sezione.style.display !== 'none';
    if (isAttivo) {
        sezione.style.display = 'none';
        if (btn) {
            btn.classList.remove('active');
            btn.textContent = '📈 Grafici e Statistiche';
        }
    } else {
        sezione.style.display = 'block';
        if (btn) {
            btn.classList.add('active');
            btn.textContent = '📈 Chiudi Statistiche';
        }
        renderStatisticheMiniere();
        sezione.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function apriStatisticheSeparate() {
    const url = new URL(window.location.href);
    url.searchParams.set('vista', 'statistiche');
    window.open(url.toString(), '_blank');
}

function tornaAlGestionale() {
    const url = new URL(window.location.href);
    url.searchParams.delete('vista');
    window.location.href = url.toString();
}

function aggiornaStatisticheSeVisibili() {
    const sezione = document.getElementById('sezione-statistiche-miniere');
    if (!sezione) return;
    if (isStandaloneStatsMode() || sezione.style.display !== 'none') {
        renderStatisticheMiniere();
    }
}

// =========================================================================
// AGGREGAZIONE E CALCOLO STATISTICHE DAI DATI SALVATI
// =========================================================================

function inizializzaDateFiltroSeVuote(dateTutte) {
    const daEl = document.getElementById('stats-data-da');
    const aEl = document.getElementById('stats-data-a');
    if (!daEl || !aEl || dateTutte.length === 0) return;

    const minData = dateTutte[0];
    const maxData = dateTutte[dateTutte.length - 1];
    daEl.min = minData;
    daEl.max = maxData;
    aEl.min = minData;
    aEl.max = maxData;

    if (!daEl.value) daEl.value = minData;
    if (!aEl.value) aEl.value = maxData;
}

function calcolaStatisticheDaArchivio() {
    const archivio = typeof caricaArchivio === 'function' ? caricaArchivio() : {};
    const stipendiSalvati = typeof caricaStipendiMiniere === 'function' ? caricaStipendiMiniere() : {};
    const dateTutte = Object.keys(archivio)
        .filter(k => archivio[k] && typeof archivio[k] === 'object')
        .sort();

    inizializzaDateFiltroSeVuote(dateTutte);

    const periodoEl = document.getElementById('stats-periodo-select');
    const periodo = periodoEl ? periodoEl.value : 'all';
    const tipoEl = document.getElementById('stats-tipo-select');
    const tipoFiltro = tipoEl ? tipoEl.value : 'all';

    let dateFiltrate = dateTutte.slice();
    if (periodo === '7' || periodo === '15' || periodo === '30') {
        const n = parseInt(periodo, 10);
        dateFiltrate = dateTutte.slice(-n);
    } else if (periodo === 'custom') {
        const da = document.getElementById('stats-data-da')?.value || '';
        const a = document.getElementById('stats-data-a')?.value || '';
        dateFiltrate = dateTutte.filter(dt => (!da || dt >= da) && (!a || dt <= a));
    }

    const giorni = [];
    const miniereMap = {};
    let cumulativo = 0;

    let sumValoreLordo = 0;
    let sumCostoManu = 0;
    let sumSalari = 0;
    let sumTotaleDucati = 0;
    let sumAffluenza = 0;

    let sumProdOro = 0, sumProdFerro = 0, sumProdPietra = 0, sumProdArgilla = 0;
    let sumValoreLordoOro = 0, sumValoreLordoFerro = 0, sumValoreLordoPietra = 0, sumValoreLordoArgilla = 0;
    let sumManuFerro = 0, sumManuPietra = 0;
    let sumNettoOro = 0, sumNettoFerro = 0, sumNettoPietra = 0, sumNettoArgilla = 0;
    let sumCvFerro = 0, sumCvPietra = 0, sumCvArgilla = 0;

    let giorniPositivi = 0, giorniNegativi = 0, giorniPareggio = 0;

    const vFerroArr = [], vPietraArr = [], vArgillaArr = [], salariArr = [];
    let migliorGiorno = null, peggiorGiorno = null, giornoMaxOro = null, giornoMaxAffluenza = null;

    dateFiltrate.forEach(data => {
        const g = archivio[data];
        if (!g) return;

        const vFerro = Number(g.vFerro) || 0;
        const vPietra = Number(g.vPietra) || 0;
        const vArgilla = Number(g.vArgilla) || 0;
        const salari = Number(g.salari) || 0;

        vFerroArr.push(vFerro);
        vPietraArr.push(vPietra);
        vArgillaArr.push(vArgilla);
        salariArr.push(salari);

        let fProdOro = 0, fProdFerro = 0, fProdPietra = 0, fProdArgilla = 0;
        let fManuPietra = 0, fManuFerro = 0;
        let fAffluenza = 0;
        let fValoreLordo = 0, fCostoManu = 0, fValoreNetto = 0;
        let aperteCount = 0, chiuseCount = 0;
        const perMinieraGiorno = {};

        const listaMin = Array.isArray(g.minere) ? g.minere : [];
        listaMin.forEach(m => {
            if (!m || m.nome === 'Sconosciuta') return;
            const tipo = m.tipo || 'sconosciuto';
            if (tipoFiltro !== 'all' && tipo !== tipoFiltro) return;

            const key = m.nodo ? String(m.nodo) : `id_${m.id}`;
            if (!miniereMap[key]) {
                miniereMap[key] = {
                    key,
                    id: Number(m.id) || 0,
                    nodo: m.nodo || '',
                    tipo,
                    nome: m.nome || `Nodo ${m.nodo || m.id}`,
                    icona: m.icona || getIconaTipoStats(tipo),
                    giorniPresenti: 0,
                    giorniAperti: 0,
                    giorniChiusi: 0,
                    produzione: 0,
                    affluenza: 0,
                    manutenzionePietra: 0,
                    manutenzioneFerro: 0,
                    valoreLordo: 0,
                    costoManutenzione: 0,
                    valoreNetto: 0,
                    stipendioTotale: 0,
                    maxProd: -Infinity,
                    maxProdData: '',
                    minProd: Infinity,
                    minProdData: '',
                    maxValoreNetto: -Infinity,
                    maxValoreNettoData: ''
                };
            }

            const ms = miniereMap[key];
            ms.giorniPresenti += 1;

            if (m.chiusa) {
                ms.giorniChiusi += 1;
                chiuseCount += 1;
                perMinieraGiorno[key] = {
                    chiusa: true,
                    produzione: 0,
                    affluenza: 0,
                    manutenzionePietra: 0,
                    manutenzioneFerro: 0,
                    valoreLordo: 0,
                    costoManutenzione: 0,
                    valoreNetto: 0
                };
                return;
            }

            ms.giorniAperti += 1;
            aperteCount += 1;

            const prod = Number(m.produzione) || 0;
            const aff = Number(m.affluenza) || 0;
            const mPietra = Number(m.manutenzione_pietra) || 0;
            const mFerro = Number(m.manutenzione_ferro) || 0;

            let unitPrice = 0;
            if (tipo === 'oro') { unitPrice = 1; fProdOro += prod; }
            else if (tipo === 'ferro') { unitPrice = vFerro; fProdFerro += prod; }
            else if (tipo === 'pietra') { unitPrice = vPietra; fProdPietra += prod; }
            else if (tipo === 'argilla') { unitPrice = vArgilla; fProdArgilla += prod; }

            const valLordo = prod * unitPrice;
            const costoManu = (mPietra * vPietra) + (mFerro * vFerro);
            const valNetto = valLordo - costoManu;

            const stipBase = Number(m.stipendio_base) || Number(stipendiSalvati[key]) || 0;
            const stipTot = (m.stipendio_totale !== undefined && m.stipendio_totale !== null && Number(m.stipendio_totale) > 0)
                ? Number(m.stipendio_totale)
                : ((stipBase / 20) * aff);

            fManuPietra += mPietra;
            fManuFerro += mFerro;
            fAffluenza += aff;
            fValoreLordo += valLordo;
            fCostoManu += costoManu;
            fValoreNetto += valNetto;

            ms.produzione += prod;
            ms.affluenza += aff;
            ms.manutenzionePietra += mPietra;
            ms.manutenzioneFerro += mFerro;
            ms.valoreLordo += valLordo;
            ms.costoManutenzione += costoManu;
            ms.valoreNetto += valNetto;
            ms.stipendioTotale += stipTot;

            if (prod > ms.maxProd) { ms.maxProd = prod; ms.maxProdData = data; }
            if (prod < ms.minProd) { ms.minProd = prod; ms.minProdData = data; }
            if (valNetto > ms.maxValoreNetto) { ms.maxValoreNetto = valNetto; ms.maxValoreNettoData = data; }

            perMinieraGiorno[key] = {
                chiusa: false,
                produzione: prod,
                affluenza: aff,
                manutenzionePietra: mPietra,
                manutenzioneFerro: mFerro,
                valoreLordo: valLordo,
                costoManutenzione: costoManu,
                valoreNetto: valNetto
            };
        });

        // Se filtro 'all', usa i valori ufficiali salvati del giorno (inclusi salari) per perfetta coerenza con il resoconto
        const isAll = (tipoFiltro === 'all');
        const totProdOro = isAll ? (Number(g.totProdOro) || 0) : fProdOro;
        const totProdFerro = isAll ? (Number(g.totProdFerro) || 0) : fProdFerro;
        const totProdPietra = isAll ? (Number(g.totProdPietra) || 0) : fProdPietra;
        const totProdArgilla = isAll ? (Number(g.totProdArgilla) || 0) : fProdArgilla;
        const totManuPietra = isAll ? (Number(g.totManuPietra) || 0) : fManuPietra;
        const totManuFerro = isAll ? (Number(g.totManuFerro) || 0) : fManuFerro;

        const nettoOro = isAll ? (Number(g.nettoOro) || 0) : fProdOro;
        const nettoFerro = isAll ? (Number(g.nettoFerro) || 0) : (fProdFerro - fManuFerro);
        const nettoPietra = isAll ? (Number(g.nettoPietra) || 0) : (fProdPietra - fManuPietra);
        const nettoArgilla = isAll ? (Number(g.nettoArgilla) || 0) : fProdArgilla;

        const cvFerro = isAll ? (Number(g.cvFerro) || 0) : (nettoFerro * vFerro);
        const cvPietra = isAll ? (Number(g.cvPietra) || 0) : (nettoPietra * vPietra);
        const cvArgilla = isAll ? (Number(g.cvArgilla) || 0) : (nettoArgilla * vArgilla);
        const totaleDucati = isAll ? (Number(g.totaleDucati) || 0) : fValoreNetto;

        const valoreLordoGiorno = totProdOro + (totProdFerro * vFerro) + (totProdPietra * vPietra) + (totProdArgilla * vArgilla);
        const costoManuGiorno = (totManuPietra * vPietra) + (totManuFerro * vFerro);

        cumulativo += totaleDucati;
        sumValoreLordo += valoreLordoGiorno;
        sumCostoManu += costoManuGiorno;
        sumSalari += isAll ? salari : 0;
        sumTotaleDucati += totaleDucati;
        sumAffluenza += fAffluenza;

        sumProdOro += totProdOro;
        sumProdFerro += totProdFerro;
        sumProdPietra += totProdPietra;
        sumProdArgilla += totProdArgilla;
        sumValoreLordoOro += totProdOro;
        sumValoreLordoFerro += totProdFerro * vFerro;
        sumValoreLordoPietra += totProdPietra * vPietra;
        sumValoreLordoArgilla += totProdArgilla * vArgilla;
        sumManuFerro += totManuFerro;
        sumManuPietra += totManuPietra;

        sumNettoOro += nettoOro;
        sumNettoFerro += nettoFerro;
        sumNettoPietra += nettoPietra;
        sumNettoArgilla += nettoArgilla;
        sumCvFerro += cvFerro;
        sumCvPietra += cvPietra;
        sumCvArgilla += cvArgilla;

        if (totaleDucati > 0) giorniPositivi += 1;
        else if (totaleDucati < 0) giorniNegativi += 1;
        else giorniPareggio += 1;

        const giornoObj = {
            data,
            salari: isAll ? salari : 0,
            salariRealiGiorno: salari,
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
            totaleDucati,
            bilancioCumulativo: cumulativo,
            valoreLordo: valoreLordoGiorno,
            costoManutenzione: costoManuGiorno,
            affluenzaTotale: fAffluenza,
            aperteCount,
            chiuseCount,
            perMiniera: perMinieraGiorno
        };

        if (!migliorGiorno || totaleDucati > migliorGiorno.totaleDucati) migliorGiorno = giornoObj;
        if (!peggiorGiorno || totaleDucati < peggiorGiorno.totaleDucati) peggiorGiorno = giornoObj;
        if (!giornoMaxOro || totProdOro > giornoMaxOro.totProdOro) giornoMaxOro = giornoObj;
        if (!giornoMaxAffluenza || fAffluenza > giornoMaxAffluenza.affluenzaTotale) giornoMaxAffluenza = giornoObj;

        giorni.push(giornoObj);
    });

    const miniere = Object.values(miniereMap)
        .map((m, idx) => {
            const mediaProdGiorno = m.giorniAperti > 0 ? (m.produzione / m.giorniAperti) : 0;
            const mediaOreGiorno = m.giorniAperti > 0 ? (m.affluenza / m.giorniAperti) : 0;
            const resaOraria = m.affluenza > 0 ? (m.produzione / m.affluenza) : 0;
            const uptimePct = m.giorniPresenti > 0 ? (m.giorniAperti / m.giorniPresenti) * 100 : 0;
            return {
                ...m,
                color: STATS_PALETTE_MINIERE[idx % STATS_PALETTE_MINIERE.length],
                mediaProdGiorno,
                mediaOreGiorno,
                resaOraria,
                uptimePct,
                maxProd: m.maxProd === -Infinity ? 0 : m.maxProd,
                minProd: m.minProd === Infinity ? 0 : m.minProd,
                maxValoreNetto: m.maxValoreNetto === -Infinity ? 0 : m.maxValoreNetto
            };
        })
        .sort((a, b) => a.id - b.id);

    const calcSeriesStats = (arr) => {
        if (!arr.length) return { min: 0, max: 0, avg: 0 };
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const avg = arr.reduce((acc, x) => acc + x, 0) / arr.length;
        return { min, max, avg };
    };

    const gCount = giorni.length;
    const minierePerValore = miniere.slice().sort((a, b) => b.valoreNetto - a.valoreNetto);
    const minierePerAffluenza = miniere.slice().sort((a, b) => b.affluenza - a.affluenza);

    return {
        totaleArchivioCount: dateTutte.length,
        periodo,
        tipoFiltro,
        giorni,
        miniere,
        totali: {
            giorniCount: gCount,
            giorniPositivi,
            giorniNegativi,
            giorniPareggio,
            totaleDucati: sumTotaleDucati,
            mediaDucatiGiorno: gCount > 0 ? sumTotaleDucati / gCount : 0,
            valoreLordoTotale: sumValoreLordo,
            costoManutenzioneTotale: sumCostoManu,
            salari: sumSalari,
            mediaSalariGiorno: gCount > 0 ? sumSalari / gCount : 0,
            affluenzaTotale: sumAffluenza,
            mediaAffluenzaGiorno: gCount > 0 ? sumAffluenza / gCount : 0,
            totProdOro: sumProdOro,
            totProdFerro: sumProdFerro,
            totProdPietra: sumProdPietra,
            totProdArgilla: sumProdArgilla,
            totManuFerro: sumManuFerro,
            totManuPietra: sumManuPietra,
            nettoOro: sumNettoOro,
            nettoFerro: sumNettoFerro,
            nettoPietra: sumNettoPietra,
            nettoArgilla: sumNettoArgilla,
            cvFerro: sumCvFerro,
            cvPietra: sumCvPietra,
            cvArgilla: sumCvArgilla,
            valoreLordoOro: sumValoreLordoOro,
            valoreLordoFerro: sumValoreLordoFerro,
            valoreLordoPietra: sumValoreLordoPietra,
            valoreLordoArgilla: sumValoreLordoArgilla,
            migliorGiorno,
            peggiorGiorno,
            giornoMaxOro,
            giornoMaxAffluenza,
            topMinieraEconomica: minierePerValore[0] || null,
            topMinieraAffluenza: minierePerAffluenza[0] || null,
            prezzi: {
                vFerro: calcSeriesStats(vFerroArr),
                vPietra: calcSeriesStats(vPietraArr),
                vArgilla: calcSeriesStats(vArgillaArr),
                salari: calcSeriesStats(salariArr)
            }
        }
    };
}

// =========================================================================
// CONTROLLI E SWITCHER INTERATTIVI
// =========================================================================

function onFiltroStatisticheChange() {
    const periodo = document.getElementById('stats-periodo-select')?.value || 'all';
    const customBox = document.getElementById('stats-custom-dates');
    if (customBox) {
        customBox.style.display = periodo === 'custom' ? 'flex' : 'none';
    }
    renderStatisticheMiniere();
}

function onTipoFiltroStatisticheChange() {
    const tipo = document.getElementById('stats-tipo-select')?.value || 'all';
    if (tipo !== 'all' && statsState.risorsaChart !== 'affluenza') {
        statsState.risorsaChart = tipo;
        const targetBtn = document.querySelector(`#tabs-chart-risorse .stats-tab[data-res="${tipo}"]`);
        aggiornaTabAttivo('tabs-chart-risorse', targetBtn);
    }
    renderStatisticheMiniere();
}

function aggiornaTabAttivo(groupId, activeBtn) {
    const grp = document.getElementById(groupId);
    if (!grp) return;
    grp.querySelectorAll('.stats-tab').forEach(btn => btn.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
}

function cambiaModalitaChartBilancio(mode, btn) {
    statsState.modalitaBilancio = mode;
    aggiornaTabAttivo('tabs-chart-bilancio', btn);
    if (statsState.lastDataset) renderChartBilancio(statsState.lastDataset);
}

function cambiaRisorsaChart(res, btn) {
    statsState.risorsaChart = res;
    aggiornaTabAttivo('tabs-chart-risorse', btn);
    if (statsState.lastDataset) renderChartRisorse(statsState.lastDataset);
}

function cambiaModalitaDonut(mode, btn) {
    statsState.modalitaDonut = mode;
    aggiornaTabAttivo('tabs-chart-donut', btn);
    if (statsState.lastDataset) renderChartDonut(statsState.lastDataset);
}

function cambiaMetricaClassifica(metric, btn) {
    statsState.metricaClassifica = metric;
    aggiornaTabAttivo('tabs-chart-classifica', btn);
    if (statsState.lastDataset) renderChartClassificaMiniere(statsState.lastDataset);
}

function cambiaMetricaTrendMiniere(metric, btn) {
    statsState.metricaTrendMiniere = metric;
    aggiornaTabAttivo('tabs-chart-trend-miniere', btn);
    if (statsState.lastDataset) renderChartAndamentoMiniere(statsState.lastDataset);
}

function toggleSerieMiniera(key) {
    if (statsState.hiddenSeriesMiniere.has(key)) {
        statsState.hiddenSeriesMiniere.delete(key);
    } else {
        statsState.hiddenSeriesMiniere.add(key);
    }
    if (statsState.lastDataset) renderChartAndamentoMiniere(statsState.lastDataset);
}

function ordinaTabellaMiniere(col) {
    if (statsState.tableSortCol === col) {
        statsState.tableSortDir = statsState.tableSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        statsState.tableSortCol = col;
        statsState.tableSortDir = (col === 'nome' || col === 'id') ? 'asc' : 'desc';
    }
    if (statsState.lastDataset) renderTabellaMiniere(statsState.lastDataset);
}

// =========================================================================
// RENDER PRINCIPALE DASHBOARD
// =========================================================================

function renderStatisticheMiniere() {
    statsTooltipMap.clear();
    statsTooltipCounter = 0;

    const ds = calcolaStatisticheDaArchivio();
    statsState.lastDataset = ds;

    const badgeEl = document.getElementById('stats-giorni-badge');
    if (badgeEl) {
        badgeEl.textContent = ds.totaleArchivioCount === 1
            ? '1 giorno salvato'
            : `${ds.totaleArchivioCount} giorni salvati`;
    }

    const summaryEl = document.getElementById('stats-filter-summary');
    if (summaryEl) {
        if (ds.giorni.length > 0) {
            const da = formatDataCompletaStats(ds.giorni[0].data);
            const a = formatDataCompletaStats(ds.giorni[ds.giorni.length - 1].data);
            const labelTipo = ds.tipoFiltro === 'all' ? 'Tutte le miniere' : `Solo ${getNomeRisorsaStats(ds.tipoFiltro)}`;
            summaryEl.innerHTML = `<strong>${ds.giorni.length}</strong> ${ds.giorni.length === 1 ? 'giorno' : 'giorni'} (${da} → ${a}) &bull; ${labelTipo}`;
        } else {
            summaryEl.textContent = '';
        }
    }

    const emptyEl = document.getElementById('stats-empty-state');
    const contentEl = document.getElementById('stats-dashboard-content');

    if (ds.totaleArchivioCount === 0 || ds.giorni.length === 0) {
        if (emptyEl) {
            emptyEl.style.display = 'block';
            if (ds.totaleArchivioCount > 0 && ds.giorni.length === 0) {
                emptyEl.querySelector('h3').textContent = 'Nessun giorno trovato per i filtri selezionati';
                emptyEl.querySelector('p').innerHTML = 'Prova ad ampliare l\'intervallo date o a selezionare <strong>Tutti i giorni salvati</strong>.';
            } else {
                emptyEl.querySelector('h3').textContent = 'Nessun dato salvato nell\'archivio';
                emptyEl.querySelector('p').innerHTML = 'Le statistiche e i grafici vengono generati dai giorni salvati. Salva almeno un giorno con <strong>💾 Salva Giorno</strong> oppure importa un file <code>.json</code>.';
            }
        }
        if (contentEl) contentEl.style.display = 'none';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    renderKPIs(ds);
    renderChartBilancio(ds);
    renderChartRisorse(ds);
    renderChartDonut(ds);
    renderChartConfrontoRisorse(ds);
    renderChartClassificaMiniere(ds);
    renderChartAndamentoMiniere(ds);
    renderChartManutenzioneMiniere(ds);
    renderChartOperativita(ds);
    renderTabellaMiniere(ds);
    renderRiepilogoParametri(ds);
}

// =========================================================================
// 1. KPI CARDS
// =========================================================================

function renderKPIs(ds) {
    const grid = document.getElementById('stats-kpi-grid');
    if (!grid) return;

    const t = ds.totali;
    const isAll = ds.tipoFiltro === 'all';
    const sign = (v) => (v > 0 ? '+' : '');
    const cls = (v) => (v >= 0 ? 'positive' : 'negative');
    const pctPos = t.giorniCount > 0 ? ((t.giorniPositivi / t.giorniCount) * 100).toFixed(0) : 0;

    const cardBilancio = `
        <div class="stats-kpi-card kpi-accent">
            <div class="kpi-label">${isAll ? '💰 Bilancio Netto Totale' : `💎 Contributo Netto (${getNomeRisorsaStats(ds.tipoFiltro)})`}</div>
            <div class="kpi-value ${cls(t.totaleDucati)}">${sign(t.totaleDucati)}${formatNum(t.totaleDucati)} <small>duc.</small></div>
            <div class="kpi-sub">Media: <strong>${sign(t.mediaDucatiGiorno)}${formatNum(t.mediaDucatiGiorno)}</strong> duc./giorno</div>
            <div class="kpi-sub">${isAll ? 'Lordo tot.' : 'Ricavo lordo'}: ${formatNum(t.valoreLordoTotale)} duc.</div>
        </div>
    `;

    const cardGiorni = `
        <div class="stats-kpi-card">
            <div class="kpi-label">📅 Giorni Analizzati</div>
            <div class="kpi-value">${t.giorniCount} <small>gg</small></div>
            <div class="kpi-sub"><span class="positive">${t.giorniPositivi} positivi</span> &bull; <span class="negative">${t.giorniNegativi} in perdita</span></div>
            <div class="kpi-sub">Tasso positivo: <strong>${pctPos}%</strong></div>
        </div>
    `;

    const incidenzaSalari = t.valoreLordoTotale > 0 ? ((t.salari / t.valoreLordoTotale) * 100).toFixed(1).replace('.', ',') : '0';
    const cardOroSalari = isAll ? `
        <div class="stats-kpi-card kpi-oro">
            <div class="kpi-label">🪙 Oro Lordo & Salari</div>
            <div class="kpi-value">${formatNum(t.totProdOro)} <small>duc.</small></div>
            <div class="kpi-sub">Salari: <strong class="negative">-${formatNum(t.salari)}</strong> duc. (${incidenzaSalari}% ricavi)</div>
            <div class="kpi-sub">Oro Netto: <strong class="${cls(t.nettoOro)}">${sign(t.nettoOro)}${formatNum(t.nettoOro)}</strong> duc.</div>
        </div>
    ` : `
        <div class="stats-kpi-card">
            <div class="kpi-label">🔧 Costo Manutenzioni</div>
            <div class="kpi-value negative">-${formatNum(t.costoManutenzioneTotale)} <small>duc.</small></div>
            <div class="kpi-sub">Pietra: <strong>${formatNum(t.totManuPietra)}</strong> q.li &bull; Ferro: <strong>${formatNum(t.totManuFerro)}</strong> kg</div>
            <div class="kpi-sub">Incidenza su lordo: <strong>${t.valoreLordoTotale > 0 ? ((t.costoManutenzioneTotale / t.valoreLordoTotale) * 100).toFixed(1).replace('.', ',') : '0'}%</strong></div>
        </div>
    `;

    const cardFerro = `
        <div class="stats-kpi-card kpi-ferro">
            <div class="kpi-label">⛏️ Ferro (Produzione & Saldo)</div>
            <div class="kpi-value">${formatNum(t.totProdFerro)} <small>kg</small></div>
            <div class="kpi-sub">Manut.: -${formatNum(t.totManuFerro)} kg &bull; Netto: <strong class="${cls(t.nettoFerro)}">${sign(t.nettoFerro)}${formatNum(t.nettoFerro)}</strong> kg</div>
            <div class="kpi-sub">Controvalore: <strong class="${cls(t.cvFerro)}">${sign(t.cvFerro)}${formatNum(t.cvFerro)}</strong> duc.</div>
        </div>
    `;

    const cardPietra = `
        <div class="stats-kpi-card kpi-pietra">
            <div class="kpi-label">🪨 Pietra (Produzione & Saldo)</div>
            <div class="kpi-value">${formatNum(t.totProdPietra)} <small>q.li</small></div>
            <div class="kpi-sub">Manut.: -${formatNum(t.totManuPietra)} q.li &bull; Netto: <strong class="${cls(t.nettoPietra)}">${sign(t.nettoPietra)}${formatNum(t.nettoPietra)}</strong> q.li</div>
            <div class="kpi-sub">Controvalore: <strong class="${cls(t.cvPietra)}">${sign(t.cvPietra)}${formatNum(t.cvPietra)}</strong> duc.</div>
        </div>
    `;

    const topMin = t.topMinieraEconomica;
    const cardExtra = `
        <div class="stats-kpi-card kpi-argilla">
            <div class="kpi-label">🧱 Argilla & ⏱️ Ore Lavoro</div>
            <div class="kpi-value">${formatNum(t.totProdArgilla)} <small>bl.</small></div>
            <div class="kpi-sub">Controvalore: <strong class="positive">+${formatNum(t.cvArgilla)}</strong> duc.</div>
            <div class="kpi-sub">Ore totali: <strong>${formatNum(t.affluenzaTotale)}</strong> h (media ${formatNum(t.mediaAffluenzaGiorno)} h/g)</div>
        </div>
        <div class="stats-kpi-card kpi-top">
            <div class="kpi-label">🏆 Miniera Più Redditizia</div>
            <div class="kpi-value" style="font-size: 16px;">${topMin ? `${topMin.icona} Miniera ${topMin.id}` : '-'}</div>
            <div class="kpi-sub">${topMin ? escapeHtmlStats(topMin.nome) : 'Nessuna'}</div>
            <div class="kpi-sub">${topMin ? `Netto pre-salari: <strong class="${cls(topMin.valoreNetto)}">${sign(topMin.valoreNetto)}${formatNum(topMin.valoreNetto)}</strong> duc.` : ''}</div>
        </div>
    `;

    grid.innerHTML = cardBilancio + cardGiorni + cardOroSalari + cardFerro + cardPietra + cardExtra;
}

// =========================================================================
// 2. ENGINE GRAFICI SVG (LINEA, BARRE, DONUT)
// =========================================================================

function buildLinearChartSVG({ width = 760, height = 270, xLabels, series, mode = 'line', averageLine = null, unitSuffix = '' }) {
    const padL = 56, padR = 20, padT = 18, padB = 40;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const n = xLabels.length;

    let minVal = Infinity;
    let maxVal = -Infinity;
    series.forEach(s => {
        s.values.forEach(v => {
            if (isFinite(v)) {
                if (v < minVal) minVal = v;
                if (v > maxVal) maxVal = v;
            }
        });
    });
    if (averageLine !== null && isFinite(averageLine)) {
        if (averageLine < minVal) minVal = averageLine;
        if (averageLine > maxVal) maxVal = averageLine;
    }
    if (!isFinite(minVal) || !isFinite(maxVal)) {
        minVal = 0;
        maxVal = 10;
    }

    const bounds = computeNiceBounds(minVal, maxVal, true);
    const range = (bounds.max - bounds.min) || 1;
    const yToPx = (val) => padT + plotH - ((val - bounds.min) / range) * plotH;
    const zeroY = yToPx(0);

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="stats-svg" role="img">`;

    // Griglia orizzontale e etichette asse Y
    bounds.ticks.forEach(tick => {
        const y = yToPx(tick);
        const isZero = Math.abs(tick) < 1e-6;
        svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="${isZero ? '#8c7a53' : '#e6dcc2'}" stroke-width="${isZero ? 1.4 : 1}" ${isZero ? '' : 'stroke-dasharray="3,3"'} />`;
        svg += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="svg-axis-text">${escapeHtmlStats(formatTickStats(tick))}</text>`;
    });

    // Calcolo posizioni X
    const stepX = n > 0 ? plotW / n : plotW;
    const xPosBar = (i) => padL + i * stepX + stepX / 2;
    const xPosLine = (i) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
    const xAt = (i) => (mode === 'bar' ? xPosBar(i) : xPosLine(i));

    // Etichette asse X diradate in modo intelligente
    const maxXLabels = Math.min(n, 10);
    const labelStep = n <= maxXLabels ? 1 : Math.ceil(n / maxXLabels);
    for (let i = 0; i < n; i++) {
        if (i % labelStep === 0 || i === n - 1) {
            const x = xAt(i);
            svg += `<text x="${x.toFixed(1)}" y="${height - 12}" text-anchor="middle" class="svg-axis-text">${escapeHtmlStats(formatDataBreveStats(xLabels[i]))}</text>`;
        }
    }

    // Disegno barre (se mode === 'bar')
    if (mode === 'bar' && series.length > 0) {
        const s = series[0];
        const barW = Math.max(4, Math.min(36, stepX * 0.62));
        s.values.forEach((v, i) => {
            const cx = xAt(i);
            const yVal = yToPx(v);
            const barY = Math.min(yVal, zeroY);
            const barH = Math.max(1.5, Math.abs(yVal - zeroY));
            const fillColor = typeof s.colorFn === 'function' ? s.colorFn(v, i) : (s.color || '#8b0000');
            svg += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${fillColor}" opacity="0.88" />`;
        });
    }

    // Linea media orizzontale opzionale
    if (averageLine !== null && isFinite(averageLine)) {
        const avgY = yToPx(averageLine);
        svg += `<line x1="${padL}" y1="${avgY.toFixed(1)}" x2="${width - padR}" y2="${avgY.toFixed(1)}" stroke="#B76E00" stroke-width="1.6" stroke-dasharray="6,4" />`;
        svg += `<text x="${width - padR - 4}" y="${(avgY - 5).toFixed(1)}" text-anchor="end" class="svg-avg-label">Media: ${escapeHtmlStats(formatNum(averageLine))}${escapeHtmlStats(unitSuffix ? ' ' + unitSuffix : '')}</text>`;
    }

    // Disegno linee e aree (se mode === 'line' o 'area')
    if (mode === 'line' || mode === 'area') {
        series.forEach(s => {
            if (!s.values.length) return;
            const pts = s.values.map((v, i) => ({ x: xAt(i), y: yToPx(v), v }));

            if (mode === 'area' && pts.length > 1) {
                const areaPoints = [
                    `${pts[0].x.toFixed(1)},${zeroY.toFixed(1)}`,
                    ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
                    `${pts[pts.length - 1].x.toFixed(1)},${zeroY.toFixed(1)}`
                ].join(' ');
                svg += `<polygon points="${areaPoints}" fill="${s.areaColor || s.color}" opacity="0.16" />`;
            }

            if (pts.length > 1) {
                const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="5,4"' : ''} points="${poly}" />`;
            }

            const showAllDots = n <= 35;
            pts.forEach((p, idx) => {
                if (showAllDots || idx === 0 || idx === n - 1) {
                    const dotColor = typeof s.colorFn === 'function' ? s.colorFn(p.v, idx) : s.color;
                    svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${n > 20 ? 3 : 4}" fill="#fffdf7" stroke="${dotColor}" stroke-width="2" />`;
                }
            });
        });
    }

    // Colonne interattive invisibili per tooltip unificato al passaggio del mouse
    const colW = n > 0 ? (mode === 'bar' ? stepX : (n > 1 ? plotW / (n - 1) : plotW)) : plotW;
    for (let i = 0; i < n; i++) {
        const cx = xAt(i);
        const rx = Math.max(padL, cx - colW / 2);
        const rw = Math.min(width - padR - rx, cx + colW / 2 - rx);
        const tipHtml = series.map(s => {
            if (typeof s.tooltipRowFn === 'function') return s.tooltipRowFn(i);
            const val = s.values[i];
            const dotColor = typeof s.colorFn === 'function' ? s.colorFn(val, i) : s.color;
            return `<div class="tip-row"><span class="tip-dot" style="background:${dotColor}"></span><span>${escapeHtmlStats(s.label)}:</span> <strong>${escapeHtmlStats(formatNum(val))}${unitSuffix ? ' ' + escapeHtmlStats(unitSuffix) : ''}</strong></div>`;
        }).join('');

        const extraTip = typeof series[0]?.extraTooltipFn === 'function' ? series[0].extraTooltipFn(i) : '';
        const fullTip = `<div class="tip-title">${escapeHtmlStats(formatDataCompletaStats(xLabels[i]))}</div>${tipHtml}${extraTip}`;
        const tipId = registerStatsTooltip(fullTip);

        svg += `<rect x="${rx.toFixed(1)}" y="${padT}" width="${Math.max(8, rw).toFixed(1)}" height="${plotH}" fill="transparent" class="svg-hover-zone" data-tip="${tipId}" />`;
    }

    svg += `</svg>`;
    return svg;
}

// =========================================================================
// GRAFICO 1: BILANCIO ECONOMICO GIORNALIERO / CUMULATIVO / ORO VS SALARI
// =========================================================================

function renderChartBilancio(ds) {
    const container = document.getElementById('stats-chart-bilancio');
    const subtitle = document.getElementById('subtitle-chart-bilancio');
    if (!container) return;

    const giorni = ds.giorni;
    const xLabels = giorni.map(g => g.data);
    const isAll = ds.tipoFiltro === 'all';
    const mode = statsState.modalitaBilancio;

    if (mode === 'giornaliero') {
        if (subtitle) {
            subtitle.textContent = isAll
                ? 'Utile o perdita giornaliera netta in ducati (verde = profitto, rosso = perdita)'
                : `Contributo economico netto giornaliero per le miniere di ${getNomeRisorsaStats(ds.tipoFiltro)} (pre-salari)`;
        }
        const series = [{
            label: isAll ? 'Totale Netto' : 'Contributo Netto',
            values: giorni.map(g => g.totaleDucati),
            colorFn: (v) => (v >= 0 ? '#2E7D32' : '#B71C1C'),
            extraTooltipFn: (i) => {
                const g = giorni[i];
                if (!isAll) {
                    return `<div class="tip-sep"></div><div class="tip-meta">Lordo: ${formatNum(g.valoreLordo)} duc. | Manut.: -${formatNum(g.costoManutenzione)} duc.</div>`;
                }
                return `<div class="tip-sep"></div>
                    <div class="tip-meta">Oro Netto: ${formatNum(g.nettoOro)} | Ferro: ${formatNum(g.cvFerro)} | Pietra: ${formatNum(g.cvPietra)} | Argilla: ${formatNum(g.cvArgilla)}</div>`;
            }
        }];
        container.innerHTML = buildLinearChartSVG({
            xLabels,
            series,
            mode: 'bar',
            averageLine: ds.totali.mediaDucatiGiorno,
            unitSuffix: 'duc.'
        }) + `<div class="stats-legend">
            <span><i class="legend-swatch" style="background:#2E7D32"></i> Giorno in positivo</span>
            <span><i class="legend-swatch" style="background:#B71C1C"></i> Giorno in perdita</span>
            <span><i class="legend-dash" style="border-color:#B76E00"></i> Media giornaliera (${formatNum(ds.totali.mediaDucatiGiorno)} duc.)</span>
        </div>`;
    } else if (mode === 'cumulativo') {
        if (subtitle) {
            subtitle.textContent = 'Andamento progressivo del saldo totale accumulato nel periodo selezionato';
        }
        const series = [{
            label: 'Saldo Cumulativo',
            color: ds.totali.totaleDucati >= 0 ? '#2E7D32' : '#B71C1C',
            values: giorni.map(g => g.bilancioCumulativo),
            extraTooltipFn: (i) => {
                const g = giorni[i];
                const sg = g.totaleDucati > 0 ? '+' : '';
                return `<div class="tip-sep"></div><div class="tip-meta">Variazione giorno: <strong>${sg}${formatNum(g.totaleDucati)} duc.</strong></div>`;
            }
        }];
        container.innerHTML = buildLinearChartSVG({
            xLabels,
            series,
            mode: 'area',
            unitSuffix: 'duc.'
        }) + `<div class="stats-legend">
            <span><i class="legend-swatch" style="background:${series[0].color}"></i> Bilancio Cumulativo</span>
        </div>`;
    } else {
        if (subtitle) {
            subtitle.textContent = isAll
                ? 'Confronto tra Oro estratto (ducati) e Salari pagati ai minatori giorno per giorno'
                : 'Confronto tra Oro estratto nei giorni selezionati e Salari totali giornalieri registrati';
        }
        const series = [
            {
                label: 'Oro Lordo',
                color: '#C79100',
                values: giorni.map(g => g.totProdOro)
            },
            {
                label: 'Salari Minatori',
                color: '#B71C1C',
                dashed: true,
                values: giorni.map(g => g.salariRealiGiorno)
            }
        ];
        container.innerHTML = buildLinearChartSVG({
            xLabels,
            series,
            mode: 'line',
            unitSuffix: 'duc.'
        }) + `<div class="stats-legend">
            <span><i class="legend-swatch" style="background:#C79100"></i> Oro Lordo (duc.)</span>
            <span><i class="legend-dash" style="border-color:#B71C1C"></i> Salari Minatori (duc.)</span>
        </div>`;
    }
}

// =========================================================================
// GRAFICO 2: ANDAMENTO RISORSE E AFFLUENZA NEL TEMPO
// =========================================================================

function renderChartRisorse(ds) {
    const container = document.getElementById('stats-chart-risorse');
    const subtitle = document.getElementById('subtitle-chart-risorse');
    if (!container) return;

    const giorni = ds.giorni;
    const xLabels = giorni.map(g => g.data);
    const res = statsState.risorsaChart;

    let series = [];
    let unitSuffix = '';
    let subText = '';

    if (res === 'ferro') {
        unitSuffix = 'kg';
        subText = 'Produzione lorda di Ferro, consumo di manutenzione e saldo netto giornaliero (chili)';
        series = [
            { label: 'Ferro Lordo', color: '#2B5B84', values: giorni.map(g => g.totProdFerro) },
            { label: 'Manutenzione Ferro', color: '#B71C1C', dashed: true, values: giorni.map(g => g.totManuFerro) },
            { label: 'Ferro Netto', color: '#2E7D32', values: giorni.map(g => g.nettoFerro) }
        ];
    } else if (res === 'pietra') {
        unitSuffix = 'q.li';
        subText = 'Produzione lorda di Pietra, consumo di manutenzione e saldo netto giornaliero (quintali)';
        series = [
            { label: 'Pietra Lorda', color: '#6D6559', values: giorni.map(g => g.totProdPietra) },
            { label: 'Manutenzione Pietra', color: '#B71C1C', dashed: true, values: giorni.map(g => g.totManuPietra) },
            { label: 'Pietra Netta', color: '#2E7D32', values: giorni.map(g => g.nettoPietra) }
        ];
    } else if (res === 'oro') {
        unitSuffix = 'duc.';
        subText = 'Oro lordo estratto, salari minatori e saldo netto dell\'oro (ducati)';
        series = [
            { label: 'Oro Lordo', color: '#C79100', values: giorni.map(g => g.totProdOro) },
            { label: 'Salari', color: '#B71C1C', dashed: true, values: giorni.map(g => g.salari) },
            { label: 'Oro Netto', color: '#2E7D32', values: giorni.map(g => g.nettoOro) }
        ];
    } else if (res === 'argilla') {
        unitSuffix = 'bl.';
        subText = 'Blocchi d\'argilla prodotti giornalmente (nessun costo diretto di manutenzione)';
        series = [
            {
                label: 'Argilla Prodotta',
                color: '#B85D38',
                values: giorni.map(g => g.totProdArgilla),
                extraTooltipFn: (i) => `<div class="tip-sep"></div><div class="tip-meta">Controvalore: <strong>${formatNum(giorni[i].cvArgilla)} duc.</strong> (prezzo ${formatNum(giorni[i].vArgilla)})</div>`
            }
        ];
    } else {
        unitSuffix = 'ore';
        subText = 'Totale ore lavorate (affluenza) registrate sulle miniere aperte';
        series = [
            {
                label: 'Ore Lavoro Totali',
                color: '#6A1B9A',
                values: giorni.map(g => g.affluenzaTotale),
                extraTooltipFn: (i) => `<div class="tip-sep"></div><div class="tip-meta">Miniere aperte: ${giorni[i].aperteCount} | Chiuse: ${giorni[i].chiuseCount}</div>`
            }
        ];
    }

    if (subtitle) subtitle.textContent = subText;

    const legendHtml = series.map(s => `
        <span><i class="${s.dashed ? 'legend-dash' : 'legend-swatch'}" style="${s.dashed ? 'border-color' : 'background'}:${s.color}"></i> ${escapeHtmlStats(s.label)}</span>
    `).join('');

    container.innerHTML = buildLinearChartSVG({
        xLabels,
        series,
        mode: series.length === 1 ? 'area' : 'line',
        unitSuffix
    }) + `<div class="stats-legend">${legendHtml}</div>`;
}

// =========================================================================
// GRAFICO 3: DONUT RIPARTIZIONE VALORE ECONOMICO
// =========================================================================

function buildDonutSVG(items, centerTitle, centerValue) {
    const positiveItems = items.filter(it => it.value > 0);
    const total = positiveItems.reduce((a, it) => a + it.value, 0);

    if (total <= 0) {
        return `<div class="stats-no-chart-data">Nessun valore positivo da rappresentare nel grafico a ciambella per questa selezione.</div>`;
    }

    const size = 210;
    const cx = size / 2;
    const cy = size / 2;
    const r = 74;
    const strokeW = 30;
    const circ = 2 * Math.PI * r;

    let svg = `<svg viewBox="0 0 ${size} ${size}" class="stats-donut-svg" role="img">`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#efe8d2" stroke-width="${strokeW}" />`;

    let offset = 0;
    positiveItems.forEach(it => {
        const pct = (it.value / total) * 100;
        const dash = (it.value / total) * circ;
        const gap = circ - dash;
        const tipId = registerStatsTooltip(
            `<div class="tip-title">${escapeHtmlStats(it.label)}</div>` +
            `<div class="tip-row">Valore: <strong>${escapeHtmlStats(formatNum(it.value))} duc.</strong></div>` +
            `<div class="tip-row">Quota: <strong>${pct.toFixed(1).replace('.', ',')}%</strong></div>`
        );

        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${strokeW}" ` +
               `stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" ` +
               `transform="rotate(-90 ${cx} ${cy})" class="donut-slice" data-tip="${tipId}" />`;
        offset += dash;
    });

    svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-center-label">${escapeHtmlStats(centerTitle)}</text>`;
    svg += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-center-value">${escapeHtmlStats(centerValue)}</text>`;
    svg += `</svg>`;

    const legendRows = items.map(it => {
        const pct = it.value > 0 && total > 0 ? ((it.value / total) * 100).toFixed(1).replace('.', ',') + '%' : '—';
        const valClass = it.value < 0 ? 'negative' : '';
        return `
            <div class="donut-legend-row">
                <span class="donut-legend-name"><i class="legend-swatch" style="background:${it.color}"></i> ${escapeHtmlStats(it.label)}</span>
                <span class="donut-legend-vals"><strong class="${valClass}">${formatNum(it.value)} duc.</strong> <small>(${pct})</small></span>
            </div>
        `;
    }).join('');

    return `<div class="donut-layout">${svg}<div class="donut-legend">${legendRows}</div></div>`;
}

function renderChartDonut(ds) {
    const container = document.getElementById('stats-chart-composizione');
    const subtitle = document.getElementById('subtitle-chart-donut');
    if (!container) return;

    const mode = statsState.modalitaDonut;
    const t = ds.totali;

    if (mode === 'risorse') {
        if (subtitle) subtitle.textContent = 'Valore lordo generato da ciascuna risorsa (in ducati)';
        const items = [
            { label: '💰 Oro', value: t.valoreLordoOro, color: STATS_COLORI_TIPO.oro },
            { label: '⛏️ Ferro', value: t.valoreLordoFerro, color: STATS_COLORI_TIPO.ferro },
            { label: '🪨 Pietra', value: t.valoreLordoPietra, color: STATS_COLORI_TIPO.pietra },
            { label: '🧱 Argilla', value: t.valoreLordoArgilla, color: STATS_COLORI_TIPO.argilla }
        ].filter(it => ds.tipoFiltro === 'all' || it.value > 0);

        const totLordo = items.reduce((a, x) => a + Math.max(0, x.value), 0);
        container.innerHTML = buildDonutSVG(items, 'Lordo Tot.', `${formatTickStats(totLordo)} duc.`);
    } else {
        if (subtitle) subtitle.textContent = 'Quota di contributo economico netto (pre-salari) per singola miniera';
        const items = ds.miniere.map(m => ({
            label: `${m.icona} Miniera ${m.id} (${getNomeRisorsaStats(m.tipo)})`,
            value: m.valoreNetto,
            color: m.color
        }));
        const totPos = items.reduce((a, x) => a + Math.max(0, x.value), 0);
        container.innerHTML = buildDonutSVG(items, 'Contributo +', `${formatTickStats(totPos)} duc.`);
    }
}

// =========================================================================
// GRAFICO 4: BILANCIO FISICO LORDO VS COSTI E NETTO
// =========================================================================

function renderChartConfrontoRisorse(ds) {
    const container = document.getElementById('stats-chart-confronto-risorse');
    if (!container) return;

    const t = ds.totali;
    const isAll = ds.tipoFiltro === 'all';

    const righe = [
        {
            titolo: '💰 Oro vs Salari',
            unita: 'ducati',
            lordo: t.totProdOro,
            costo: isAll ? t.salari : 0,
            costoLabel: 'Salari',
            netto: t.nettoOro,
            colorLordo: '#C79100',
            colorCosto: '#B71C1C'
        },
        {
            titolo: '⛏️ Ferro (Estrazione vs Manutenzione)',
            unita: 'kg',
            lordo: t.totProdFerro,
            costo: t.totManuFerro,
            costoLabel: 'Manut. Ferro',
            netto: t.nettoFerro,
            colorLordo: '#2B5B84',
            colorCosto: '#B71C1C'
        },
        {
            titolo: '🪨 Pietra (Estrazione vs Manutenzione)',
            unita: 'q.li',
            lordo: t.totProdPietra,
            costo: t.totManuPietra,
            costoLabel: 'Manut. Pietra',
            netto: t.nettoPietra,
            colorLordo: '#6D6559',
            colorCosto: '#B71C1C'
        },
        {
            titolo: '🧱 Argilla (100% Netta)',
            unita: 'blocchi',
            lordo: t.totProdArgilla,
            costo: 0,
            costoLabel: 'Manut.',
            netto: t.nettoArgilla,
            colorLordo: '#B85D38',
            colorCosto: '#B71C1C'
        }
    ];

    const html = righe.map(r => {
        const maxVal = Math.max(r.lordo, r.costo, 1);
        const wLordo = Math.max(0, (r.lordo / maxVal) * 100);
        const wCosto = Math.max(0, (r.costo / maxVal) * 100);
        const pctConsumo = r.lordo > 0 ? ((r.costo / r.lordo) * 100).toFixed(1).replace('.', ',') : (r.costo > 0 ? '∞' : '0');
        const clsNet = r.netto >= 0 ? 'positive' : 'negative';
        const sign = r.netto > 0 ? '+' : '';

        return `
            <div class="res-compare-item">
                <div class="res-compare-head">
                    <strong>${r.titolo}</strong>
                    <span class="${clsNet}">Netto: <strong>${sign}${formatNum(r.netto)} ${r.unita}</strong></span>
                </div>
                <div class="res-bar-row">
                    <span class="res-bar-label">Lordo</span>
                    <div class="res-bar-track"><div class="res-bar-fill" style="width:${wLordo.toFixed(1)}%; background:${r.colorLordo};"></div></div>
                    <span class="res-bar-val">${formatNum(r.lordo)}</span>
                </div>
                ${r.costo > 0 || r.costoLabel !== 'Manut.' ? `
                <div class="res-bar-row">
                    <span class="res-bar-label">${r.costoLabel}</span>
                    <div class="res-bar-track"><div class="res-bar-fill" style="width:${wCosto.toFixed(1)}%; background:${r.colorCosto};"></div></div>
                    <span class="res-bar-val negative">-${formatNum(r.costo)} <small>(${pctConsumo}%)</small></span>
                </div>` : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="res-compare-list">${html}</div>`;
}

// =========================================================================
// GRAFICO 5: CLASSIFICA & CONFRONTO TRA MINIERE
// =========================================================================

function renderChartClassificaMiniere(ds) {
    const container = document.getElementById('stats-chart-classifica-miniere');
    const subtitle = document.getElementById('subtitle-chart-miniere');
    if (!container) return;

    const metric = statsState.metricaClassifica;
    const cfg = {
        valoreNetto: {
            titolo: 'Contributo economico netto (Valore Lordo - Costo Manutenzioni, in ducati)',
            getValue: m => m.valoreNetto,
            format: (m, v) => `${v > 0 ? '+' : ''}${formatNum(v)} duc.`
        },
        produzione: {
            titolo: 'Quantità totale prodotta da ciascuna miniera (nelle rispettive unità)',
            getValue: m => m.produzione,
            format: (m, v) => `${formatNum(v)} ${getUnitaBreveStats(m.tipo)}`
        },
        affluenza: {
            titolo: 'Ore totali lavorate (affluenza complessiva registrata nel periodo)',
            getValue: m => m.affluenza,
            format: (m, v) => `${formatNum(v)} ore`
        },
        resaOraria: {
            titolo: 'Produttività media per ora di lavoro (Produzione Totale / Ore Totali)',
            getValue: m => m.resaOraria,
            format: (m, v) => `${formatNumPreciso(v, 2)} ${getUnitaBreveStats(m.tipo)}/h`
        },
        costoManutenzione: {
            titolo: 'Costo totale delle manutenzioni (Pietra + Ferro valorizzati ai prezzi giornalieri)',
            getValue: m => m.costoManutenzione,
            format: (m, v) => `${formatNum(v)} duc.`
        }
    }[metric];

    if (subtitle) subtitle.textContent = cfg.titolo;

    const sorted = ds.miniere.slice().sort((a, b) => cfg.getValue(b) - cfg.getValue(a));
    if (sorted.length === 0) {
        container.innerHTML = `<div class="stats-no-chart-data">Nessuna miniera disponibile per i filtri attuali.</div>`;
        return;
    }

    const maxAbs = Math.max(...sorted.map(m => Math.abs(cfg.getValue(m))), 1);

    const rowsHtml = sorted.map((m, idx) => {
        const val = cfg.getValue(m);
        const pct = Math.max(0, (Math.abs(val) / maxAbs) * 100);
        const barColor = val < 0 ? '#B71C1C' : (STATS_COLORI_TIPO[m.tipo] || m.color);
        const closedTag = m.giorniAperti === 0 ? ' <span class="closed-text">[SEMPRE CHIUSA]</span>' : '';

        const tipId = registerStatsTooltip(
            `<div class="tip-title">${m.icona} Miniera ${m.id} (${escapeHtmlStats(m.nome)})</div>` +
            `<div class="tip-row">Tipo: <strong>${escapeHtmlStats(getNomeRisorsaStats(m.tipo))}</strong> | Giorni aperti: <strong>${m.giorniAperti}/${m.giorniPresenti}</strong></div>` +
            `<div class="tip-row">Produzione: <strong>${formatNum(m.produzione)} ${escapeHtmlStats(getUnitaBreveStats(m.tipo))}</strong></div>` +
            `<div class="tip-row">Ore lavoro: <strong>${formatNum(m.affluenza)} ore</strong> (resa ${formatNumPreciso(m.resaOraria, 2)}/h)</div>` +
            `<div class="tip-row">Manutenzione: <strong>${formatNum(m.manutenzionePietra)} q.li, ${formatNum(m.manutenzioneFerro)} kg</strong> (-${formatNum(m.costoManutenzione)} duc.)</div>` +
            `<div class="tip-row">Valore Netto pre-salari: <strong>${val > 0 ? '+' : ''}${formatNum(m.valoreNetto)} duc.</strong></div>`
        );

        return `
            <div class="hbar-row" data-tip="${tipId}">
                <div class="hbar-label">
                    <span class="hbar-rank">#${idx + 1}</span>
                    <span>${m.icona} <strong>Miniera ${m.id}</strong> <small>(${escapeHtmlStats(m.nome)})</small>${closedTag}</span>
                </div>
                <div class="hbar-track-wrap">
                    <div class="hbar-track">
                        <div class="hbar-fill" style="width:${pct.toFixed(1)}%; background:${barColor};"></div>
                    </div>
                    <span class="hbar-val ${val < 0 ? 'negative' : ''}">${escapeHtmlStats(cfg.format(m, val))}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="hbar-list">${rowsHtml}</div>`;
}

// =========================================================================
// GRAFICO 6: TREND STORICO DELLE SINGOLE MINIERE
// =========================================================================

function renderChartAndamentoMiniere(ds) {
    const container = document.getElementById('stats-chart-andamento-miniere');
    if (!container) return;

    const metric = statsState.metricaTrendMiniere;
    const xLabels = ds.giorni.map(g => g.data);
    const unitMap = {
        valoreNetto: 'duc.',
        produzione: '',
        affluenza: 'ore',
        costoManutenzione: 'duc.'
    };

    const allSeries = ds.miniere.map(m => ({
        key: m.key,
        label: `${m.icona} M${m.id} (${getNomeRisorsaStats(m.tipo)})`,
        fullName: m.nome,
        tipo: m.tipo,
        color: m.color,
        values: ds.giorni.map(g => {
            const pm = g.perMiniera[m.key];
            if (!pm) return 0;
            return pm[metric] || 0;
        }),
        tooltipRowFn: (i) => {
            const pm = ds.giorni[i].perMiniera[m.key];
            const val = pm ? (pm[metric] || 0) : 0;
            const unit = metric === 'produzione' ? getUnitaBreveStats(m.tipo) : unitMap[metric];
            const closedBadge = pm && pm.chiusa ? ' [CHIUSA]' : '';
            return `<div class="tip-row"><span class="tip-dot" style="background:${m.color}"></span><span>M${m.id} ${escapeHtmlStats(getNomeRisorsaStats(m.tipo))}${closedBadge}:</span> <strong>${escapeHtmlStats(formatNum(val))}${unit ? ' ' + escapeHtmlStats(unit) : ''}</strong></div>`;
        }
    }));

    const activeSeries = allSeries.filter(s => !statsState.hiddenSeriesMiniere.has(s.key));

    const legendButtons = allSeries.map(s => {
        const isHidden = statsState.hiddenSeriesMiniere.has(s.key);
        return `
            <button type="button" class="legend-toggle-pill ${isHidden ? 'is-hidden' : ''}" onclick="toggleSerieMiniera('${escapeHtmlStats(s.key)}')" title="${escapeHtmlStats(s.fullName)}">
                <i class="legend-swatch" style="background:${s.color}"></i>
                <span>${escapeHtmlStats(s.label)}</span>
            </button>
        `;
    }).join('');

    const chartSvg = activeSeries.length > 0
        ? buildLinearChartSVG({
            xLabels,
            series: activeSeries,
            mode: 'line',
            unitSuffix: unitMap[metric]
        })
        : `<div class="stats-no-chart-data">Tutte le miniere sono nascoste: clicca su una miniera qui sotto per riattivarla.</div>`;

    container.innerHTML = chartSvg + `<div class="stats-legend-interactive">${legendButtons}</div>`;
}

// =========================================================================
// GRAFICO 7: CONSUMI MANUTENZIONE PER MINIERA
// =========================================================================

function renderChartManutenzioneMiniere(ds) {
    const container = document.getElementById('stats-chart-manutenzione-miniere');
    if (!container) return;

    const sorted = ds.miniere.slice().sort((a, b) => b.costoManutenzione - a.costoManutenzione);
    if (sorted.length === 0) {
        container.innerHTML = `<div class="stats-no-chart-data">Nessuna miniera disponibile.</div>`;
        return;
    }

    const maxPietra = Math.max(...sorted.map(m => m.manutenzionePietra), 1);
    const maxFerro = Math.max(...sorted.map(m => m.manutenzioneFerro), 1);

    const rowsHtml = sorted.map(m => {
        const wP = (m.manutenzionePietra / maxPietra) * 100;
        const wF = (m.manutenzioneFerro / maxFerro) * 100;
        const tipId = registerStatsTooltip(
            `<div class="tip-title">${m.icona} Miniera ${m.id} (${escapeHtmlStats(m.nome)})</div>` +
            `<div class="tip-row">🪨 Pietra consumata: <strong>${formatNum(m.manutenzionePietra)} q.li</strong></div>` +
            `<div class="tip-row">⛏️ Ferro consumato: <strong>${formatNum(m.manutenzioneFerro)} kg</strong></div>` +
            `<div class="tip-row">💰 Costo manutenzione totale: <strong>${formatNum(m.costoManutenzione)} duc.</strong></div>`
        );

        return `
            <div class="maint-row" data-tip="${tipId}">
                <div class="maint-row-head">
                    <span>${m.icona} <strong>Miniera ${m.id}</strong> (${escapeHtmlStats(getNomeRisorsaStats(m.tipo))})</span>
                    <strong class="negative">-${formatNum(m.costoManutenzione)} duc.</strong>
                </div>
                <div class="maint-sub-bar">
                    <span>🪨</span>
                    <div class="res-bar-track"><div class="res-bar-fill" style="width:${wP.toFixed(1)}%; background:#6D6559;"></div></div>
                    <small>${formatNum(m.manutenzionePietra)} q.li</small>
                </div>
                <div class="maint-sub-bar">
                    <span>⛏️</span>
                    <div class="res-bar-track"><div class="res-bar-fill" style="width:${wF.toFixed(1)}%; background:#2B5B84;"></div></div>
                    <small>${formatNum(m.manutenzioneFerro)} kg</small>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="maint-list">${rowsHtml}</div>`;
}

// =========================================================================
// GRAFICO 8: OPERATIVITÀ & AFFLUENZA MINIERE
// =========================================================================

function renderChartOperativita(ds) {
    const container = document.getElementById('stats-chart-operativita');
    if (!container) return;

    if (ds.miniere.length === 0) {
        container.innerHTML = `<div class="stats-no-chart-data">Nessuna miniera disponibile.</div>`;
        return;
    }

    const rowsHtml = ds.miniere.map(m => {
        const openPct = m.uptimePct;
        const closePct = Math.max(0, 100 - openPct);
        const tipId = registerStatsTooltip(
            `<div class="tip-title">${m.icona} Miniera ${m.id} (${escapeHtmlStats(m.nome)})</div>` +
            `<div class="tip-row">Giorni attivi: <strong>${m.giorniAperti}</strong> / ${m.giorniPresenti} (${openPct.toFixed(0)}%)</div>` +
            `<div class="tip-row">Giorni chiusi: <strong>${m.giorniChiusi}</strong></div>` +
            `<div class="tip-row">Ore totali: <strong>${formatNum(m.affluenza)} h</strong> (media ${formatNum(m.mediaOreGiorno)} h/giorno attivo)</div>`
        );

        return `
            <div class="uptime-row" data-tip="${tipId}">
                <div class="uptime-head">
                    <span>${m.icona} <strong>Miniera ${m.id}</strong> (${escapeHtmlStats(getNomeRisorsaStats(m.tipo))})</span>
                    <span><strong>${m.giorniAperti}/${m.giorniPresenti} gg</strong> (${openPct.toFixed(0)}%) &bull; ${formatNum(m.mediaOreGiorno)} h/g</span>
                </div>
                <div class="uptime-track">
                    <div class="uptime-open" style="width:${openPct.toFixed(1)}%"></div>
                    <div class="uptime-closed" style="width:${closePct.toFixed(1)}%"></div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="uptime-list">${rowsHtml}</div>
        <div class="stats-legend" style="margin-top:10px;">
            <span><i class="legend-swatch" style="background:#2E7D32"></i> Giorni Aperti</span>
            <span><i class="legend-swatch" style="background:#c98a8a"></i> Giorni Chiusi</span>
        </div>`;
}

// =========================================================================
// TABELLA DETTAGLIATA PER MINIERA (ORDINABILE)
// =========================================================================

function renderTabellaMiniere(ds) {
    const container = document.getElementById('stats-tabella-miniere');
    if (!container) return;

    const col = statsState.tableSortCol;
    const dir = statsState.tableSortDir === 'asc' ? 1 : -1;

    const rows = ds.miniere.slice().sort((a, b) => {
        if (col === 'nome') return a.nome.localeCompare(b.nome) * dir;
        if (col === 'manutenzione') return (a.costoManutenzione - b.costoManutenzione) * dir;
        const va = Number(a[col]) || 0;
        const vb = Number(b[col]) || 0;
        return (va - vb) * dir;
    });

    const th = (id, label, alignLeft = false) => {
        const isSorted = statsState.tableSortCol === id;
        const arrow = isSorted ? (statsState.tableSortDir === 'asc' ? ' ▲' : ' ▼') : '';
        return `<th class="sortable-th ${alignLeft ? 'text-left' : ''}" onclick="ordinaTabellaMiniere('${id}')">${label}${arrow}</th>`;
    };

    const sign = (v) => (v > 0 ? '+' : '');
    const cls = (v) => (v >= 0 ? 'positive' : 'negative');

    const bodyRows = rows.map(m => {
        const unita = getUnitaBreveStats(m.tipo);
        const badgeTipo = typeof getBadgeTipo === 'function' ? getBadgeTipo(m.tipo) : escapeHtmlStats(m.tipo);
        const closedMark = m.giorniAperti === 0 ? ' <span class="closed-text">[CHIUSA]</span>' : '';
        return `
            <tr class="${m.giorniAperti === 0 ? 'row-closed' : ''}">
                <td class="text-left">
                    <strong>${m.icona} Miniera ${m.id}</strong>${closedMark}<br>
                    <small>${escapeHtmlStats(m.nome)}${m.nodo ? ` · Nodo ${escapeHtmlStats(m.nodo)}` : ''}</small>
                </td>
                <td>${badgeTipo}</td>
                <td><strong>${m.giorniAperti}</strong>/${m.giorniPresenti} <small>(${m.uptimePct.toFixed(0)}%)</small></td>
                <td><strong>${formatNum(m.produzione)}</strong> <small>${unita}</small></td>
                <td>${formatNum(m.mediaProdGiorno)} <small>${unita}/g</small><br><small>Max: ${formatNum(m.maxProd)} (${formatDataBreveStats(m.maxProdData)})</small></td>
                <td><strong>${formatNum(m.affluenza)}</strong> <small>h</small><br><small>${formatNum(m.mediaOreGiorno)} h/g</small></td>
                <td><strong>${formatNumPreciso(m.resaOraria, 2)}</strong> <small>${unita}/h</small></td>
                <td>${formatNum(m.manutenzionePietra)} q.li<br>${formatNum(m.manutenzioneFerro)} kg</td>
                <td class="negative">-${formatNum(m.costoManutenzione)} <small>duc.</small></td>
                <td>${formatNum(m.valoreLordo)} <small>duc.</small></td>
                <td class="${cls(m.valoreNetto)}"><strong>${sign(m.valoreNetto)}${formatNum(m.valoreNetto)}</strong> <small>duc.</small></td>
            </tr>
        `;
    }).join('');

    const totLordo = ds.miniere.reduce((a, m) => a + m.valoreLordo, 0);
    const totManuCost = ds.miniere.reduce((a, m) => a + m.costoManutenzione, 0);
    const totNetto = ds.miniere.reduce((a, m) => a + m.valoreNetto, 0);
    const totAff = ds.miniere.reduce((a, m) => a + m.affluenza, 0);
    const totMPietra = ds.miniere.reduce((a, m) => a + m.manutenzionePietra, 0);
    const totMFerro = ds.miniere.reduce((a, m) => a + m.manutenzioneFerro, 0);

    container.innerHTML = `
        <table class="salaries-table stats-detail-table">
            <thead>
                <tr>
                    ${th('id', 'Miniera', true)}
                    <th>Tipo</th>
                    ${th('giorniAperti', 'Attività')}
                    ${th('produzione', 'Produzione Tot.')}
                    ${th('mediaProdGiorno', 'Media & Picco')}
                    ${th('affluenza', 'Ore Lavoro')}
                    ${th('resaOraria', 'Resa/Ora')}
                    <th>Manutenzione</th>
                    ${th('costoManutenzione', 'Costo Manut.')}
                    ${th('valoreLordo', 'Valore Lordo')}
                    ${th('valoreNetto', 'Netto Pre-Salari')}
                </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
                <tr class="stats-table-total-row">
                    <td class="text-left" colspan="5"><strong>TOTALE MINIERE MOSTRATE (${rows.length})</strong></td>
                    <td><strong>${formatNum(totAff)} h</strong></td>
                    <td>—</td>
                    <td><strong>${formatNum(totMPietra)} q.li / ${formatNum(totMFerro)} kg</strong></td>
                    <td class="negative"><strong>-${formatNum(totManuCost)} duc.</strong></td>
                    <td><strong>${formatNum(totLordo)} duc.</strong></td>
                    <td class="${cls(totNetto)}"><strong>${sign(totNetto)}${formatNum(totNetto)} duc.</strong></td>
                </tr>
            </tfoot>
        </table>
    `;
}

// =========================================================================
// RIEPILOGO PREZZI SALVATI E RECORD GIORNALIERI
// =========================================================================

function renderRiepilogoParametri(ds) {
    const container = document.getElementById('stats-riepilogo-parametri');
    if (!container) return;

    const t = ds.totali;
    const p = t.prezzi;
    const sign = (v) => (v > 0 ? '+' : '');
    const cls = (v) => (v >= 0 ? 'positive' : 'negative');

    const best = t.migliorGiorno;
    const worst = t.peggiorGiorno;
    const maxOro = t.giornoMaxOro;
    const maxAff = t.giornoMaxAffluenza;

    container.innerHTML = `
        <div class="stats-params-grid">
            <div class="stats-param-box">
                <h4>💹 Prezzi Unitari & Salari Salvati</h4>
                <table class="days-table">
                    <thead>
                        <tr>
                            <th class="text-left">Parametro</th>
                            <th>Media</th>
                            <th>Minimo</th>
                            <th>Massimo</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="text-left">⛏️ Valore Ferro (duc./kg)</td>
                            <td><strong>${formatNumPreciso(p.vFerro.avg, 2)}</strong></td>
                            <td>${formatNumPreciso(p.vFerro.min, 2)}</td>
                            <td>${formatNumPreciso(p.vFerro.max, 2)}</td>
                        </tr>
                        <tr>
                            <td class="text-left">🪨 Valore Pietra (duc./q.le)</td>
                            <td><strong>${formatNumPreciso(p.vPietra.avg, 2)}</strong></td>
                            <td>${formatNumPreciso(p.vPietra.min, 2)}</td>
                            <td>${formatNumPreciso(p.vPietra.max, 2)}</td>
                        </tr>
                        <tr>
                            <td class="text-left">🧱 Valore Argilla (duc./bl.)</td>
                            <td><strong>${formatNumPreciso(p.vArgilla.avg, 2)}</strong></td>
                            <td>${formatNumPreciso(p.vArgilla.min, 2)}</td>
                            <td>${formatNumPreciso(p.vArgilla.max, 2)}</td>
                        </tr>
                        <tr>
                            <td class="text-left">👷 Salari Giornalieri (duc.)</td>
                            <td><strong>${formatNum(p.salari.avg)}</strong></td>
                            <td>${formatNum(p.salari.min)}</td>
                            <td>${formatNum(p.salari.max)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="stats-param-box">
                <h4>🏅 Record Giornalieri nell'Intervallo</h4>
                <ul class="stats-records-list">
                    <li>
                        <span>📈 <strong>Miglior Bilancio:</strong></span>
                        <span>${best ? `${formatDataCompletaStats(best.data)} (<strong class="${cls(best.totaleDucati)}">${sign(best.totaleDucati)}${formatNum(best.totaleDucati)} duc.</strong>)` : '-'}</span>
                    </li>
                    <li>
                        <span>📉 <strong>Peggior Bilancio:</strong></span>
                        <span>${worst ? `${formatDataCompletaStats(worst.data)} (<strong class="${cls(worst.totaleDucati)}">${sign(worst.totaleDucati)}${formatNum(worst.totaleDucati)} duc.</strong>)` : '-'}</span>
                    </li>
                    <li>
                        <span>💰 <strong>Picco Oro Estratto:</strong></span>
                        <span>${maxOro ? `${formatDataCompletaStats(maxOro.data)} (<strong>${formatNum(maxOro.totProdOro)} duc.</strong>)` : '-'}</span>
                    </li>
                    <li>
                        <span>⏱️ <strong>Picco Ore Lavoro:</strong></span>
                        <span>${maxAff ? `${formatDataCompletaStats(maxAff.data)} (<strong>${formatNum(maxAff.affluenzaTotale)} ore</strong>)` : '-'}</span>
                    </li>
                    <li>
                        <span>👷 <strong>Miniera Più Frequentata:</strong></span>
                        <span>${t.topMinieraAffluenza ? `${t.topMinieraAffluenza.icona} Miniera ${t.topMinieraAffluenza.id} (<strong>${formatNum(t.topMinieraAffluenza.affluenza)} ore</strong>)` : '-'}</span>
                    </li>
                </ul>
            </div>
        </div>
    `;
}

// =========================================================================
// ESPORTAZIONE CSV STATISTICHE
// =========================================================================

function esportaStatisticheCSV() {
    const ds = statsState.lastDataset || calcolaStatisticheDaArchivio();
    if (!ds || ds.miniere.length === 0) {
        return alert('Nessun dato statistico salvato da esportare.');
    }

    const csvCell = (val) => {
        const s = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
        return `"${s}"`;
    };

    const intestazione = [
        'Miniera ID', 'Nodo', 'Nome', 'Tipo', 'Giorni Presenti', 'Giorni Aperti', 'Uptime (%)',
        'Produzione Totale', 'Media Produzione/Giorno', 'Picco Produzione', 'Data Picco',
        'Ore Lavoro Totali', 'Media Ore/Giorno', 'Resa Oraria',
        'Manutenzione Pietra (q.li)', 'Manutenzione Ferro (kg)',
        'Costo Manutenzione (ducati)', 'Valore Lordo (ducati)', 'Valore Netto Pre-Salari (ducati)'
    ];

    const righe = ds.miniere.map(m => [
        m.id,
        m.nodo,
        m.nome,
        getNomeRisorsaStats(m.tipo),
        m.giorniPresenti,
        m.giorniAperti,
        m.uptimePct.toFixed(1).replace('.', ','),
        formatNum(m.produzione),
        formatNum(m.mediaProdGiorno),
        formatNum(m.maxProd),
        m.maxProdData,
        formatNum(m.affluenza),
        formatNum(m.mediaOreGiorno),
        formatNumPreciso(m.resaOraria, 2),
        formatNum(m.manutenzionePietra),
        formatNum(m.manutenzioneFerro),
        formatNum(m.costoManutenzione),
        formatNum(m.valoreLordo),
        formatNum(m.valoreNetto)
    ]);

    const csv = '\uFEFF' + [intestazione, ...righe].map(r => r.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const da = ds.giorni[0]?.data || 'inizio';
    const a = ds.giorni[ds.giorni.length - 1]?.data || 'fine';

    const link = document.createElement('a');
    link.href = url;
    link.download = `statistiche_miniere_${da}_${a}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// =========================================================================
// TOOLTIP INTERATTIVO & SINCRONIZZAZIONE MULTI-SCHEDA
// =========================================================================

function initTooltipStats() {
    const sezione = document.getElementById('sezione-statistiche-miniere');
    const tooltip = document.getElementById('stats-chart-tooltip');
    if (!sezione || !tooltip) return;

    let activeTipId = null;

    const posizionaTooltip = (clientX, clientY) => {
        const margin = 14;
        tooltip.hidden = false;
        const rect = tooltip.getBoundingClientRect();
        let left = clientX + margin;
        let top = clientY + margin;

        if (left + rect.width > window.innerWidth - 10) {
            left = Math.max(10, clientX - rect.width - margin);
        }
        if (top + rect.height > window.innerHeight - 10) {
            top = Math.max(10, clientY - rect.height - margin);
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };

    sezione.addEventListener('mousemove', (e) => {
        const target = e.target.closest ? e.target.closest('[data-tip]') : null;
        if (!target) {
            if (activeTipId) {
                activeTipId = null;
                tooltip.hidden = true;
            }
            return;
        }
        const tipId = target.getAttribute('data-tip');
        if (tipId !== activeTipId) {
            const html = statsTooltipMap.get(tipId);
            if (!html) {
                tooltip.hidden = true;
                return;
            }
            tooltip.innerHTML = html;
            activeTipId = tipId;
        }
        posizionaTooltip(e.clientX, e.clientY);
    });

    sezione.addEventListener('mouseleave', () => {
        activeTipId = null;
        tooltip.hidden = true;
    });

    window.addEventListener('scroll', () => {
        if (activeTipId) {
            activeTipId = null;
            tooltip.hidden = true;
        }
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
    initTooltipStats();

    if (isStandaloneStatsMode()) {
        document.body.classList.add('standalone-stats-mode');
        document.title = 'Statistiche e Grafici Miniere - Resoconto Miniere';
        const sezione = document.getElementById('sezione-statistiche-miniere');
        if (sezione) {
            sezione.style.display = 'block';
        }
        renderStatisticheMiniere();
    }
});

// Sincronizzazione automatica se l'archivio viene salvato/modificato in un'altra scheda aperta
window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === STIPENDI_STORAGE_KEY) {
        if (typeof aggiornaListaGiorniSalvati === 'function') aggiornaListaGiorniSalvati();
        if (typeof renderTabellaStipendiInput === 'function') renderTabellaStipendiInput();
        aggiornaStatisticheSeVisibili();
    }
});
