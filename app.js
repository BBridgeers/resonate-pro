// --- Constants & Config ---
const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_RX_CHARACTERISTIC = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Phone TX -> Pendant RX

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered.'))
            .catch(err => console.log('Service Worker failed:', err));
    });
}

// --- DOM Elements ---
const mainBtn = document.getElementById('connect-btn');
const actionText = document.getElementById('main-action-text');
const freqDisplay = document.getElementById('current-freq-display');
const freqPurpose = document.getElementById('freq-purpose-text');
const connIndicator = document.getElementById('connection-indicator');
const statusText = document.getElementById('status-text');
const freqDeck = document.getElementById('freq-deck');
const ambientGlow = document.getElementById('ambient-glow');
const freqCards = document.querySelectorAll('.freq-card');

// Custom & Library Elements
const customFreqModule = document.getElementById('custom-freq-module');
const customFreqVal = document.getElementById('custom-freq-val');
const setCustomFreqBtn = document.getElementById('set-custom-freq-btn');

const openLibraryBtn = document.getElementById('open-library-btn');
const libraryModal = document.getElementById('library-modal');
const closeLibraryBtn = document.getElementById('close-library-btn');
const librarySearch = document.getElementById('library-search');
const libraryList = document.getElementById('library-list');

// iOS Fallback Elements
const iosOverlay = document.getElementById('ios-instruction-overlay');
const closeIosBtn = document.getElementById('close-ios-btn');

// --- State Variables ---
let bluetoothDevice = null;
let rxCharacteristic = null;
let isConnected = false;
let currentFreq = 528;

// --- iOS Detection Check ---
const isIOS = () => {
    return [
        'iPad Simulator', 'iPhone Simulator', 'iPod Simulator',
        'iPad', 'iPhone', 'iPod'
    ].includes(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

if (isIOS() && !navigator.bluetooth) {
    // Show iOS specific warning if WebBluetooth is completely unavailable
    iosOverlay.classList.remove('hidden');
}

closeIosBtn.addEventListener('click', () => {
    iosOverlay.classList.add('hidden');
});

// --- Core Bluetooth Logic ---
mainBtn.addEventListener('click', async () => {
    if (isConnected) {
        disconnectDevice();
        return;
    }

    if (!navigator.bluetooth) {
        alert("Web Bluetooth is not supported in this browser. Please use Chrome for Android or Bluefy for iOS.");
        return;
    }

    try {
        setUIState('scanning');

        // Request device (filter by name prefix or specific service)
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Resonate' }],
            optionalServices: [NORDIC_UART_SERVICE]
        });

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        // Connect GATT
        const server = await bluetoothDevice.gatt.connect();

        // Get UART Service
        const service = await server.getPrimaryService(NORDIC_UART_SERVICE);

        // Get RX Characteristic (To write to device)
        rxCharacteristic = await service.getCharacteristic(NORDIC_RX_CHARACTERISTIC);

        setUIState('connected');

        // Immediately transmit the default frequency to sync
        transmitFrequency(currentFreq);

    } catch (error) {
        console.error("Bluetooth Error:", error);
        setUIState('disconnected');
    }
});

// --- Debug / Simulation Bypass ---
// Click the Bio-Resonance text to simulate pairing without a physical device
freqPurpose.addEventListener('click', () => {
    if (isConnected) return;
    console.log("Simulating Connection Sequence...");
    setUIState('scanning');

    // Simulate finding the device and connecting after 3.2 seconds
    setTimeout(() => {
        if (document.body.classList.contains('connecting')) {
            console.log("Simulated Device Connected!");
            setUIState('connected');
        }
    }, 3200);
});

function onDisconnected() {
    setUIState('disconnected');
}

function disconnectDevice() {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
    } else {
        // Handle simulated disconnect
        setUIState('disconnected');
    }
}

// --- Payload Transmission ---
async function transmitFrequency(freqHz) {
    if (!rxCharacteristic) {
        // Visual feedback pulse on the SVG geometry for simulation
        const svgElement = document.querySelector('.sacred-svg #layer-flower');
        if (svgElement) svgElement.style.strokeWidth = "2";
        setTimeout(() => { if (svgElement) svgElement.style.strokeWidth = ""; }, 300);
        return;
    }

    try {
        // Encode the integer frequency as a Uint16 ArrayBuffer
        // (Assuming the C firmware is expecting a 2-byte integer payload)
        const buffer = new ArrayBuffer(2);
        const dataView = new DataView(buffer);
        dataView.setUint16(0, freqHz, true); // true = little-endian

        await rxCharacteristic.writeValue(buffer);

        // Visual feedback pulse on the orb
        mainBtn.style.boxShadow = "0 0 40px rgba(0, 230, 118, 0.8)";
        setTimeout(() => {
            mainBtn.style.boxShadow = "0 8px 32px 0 rgba(0, 0, 0, 0.37)";
        }, 300);

    } catch (error) {
        console.error("Transmission failed:", error);
    }
}

// --- UI / State Management ---
function setUIState(state) {
    if (state === 'disconnected') {
        isConnected = false;
        rxCharacteristic = null;

        document.body.classList.remove('connecting', 'connected');
        document.body.classList.add('disconnected');

        // Update Indicator
        connIndicator.className = 'connection-status disconnected';
        statusText.innerText = 'Disconnected';
        ambientGlow.className = '';
        if (typeof clearGeometrySequence === 'function') clearGeometrySequence();

        // Update Orb
        mainBtn.classList.remove('scanning');
        actionText.innerText = 'TAP TO CONNECT';
        actionText.classList.remove('hidden');
        freqDisplay.classList.add('hidden');
        freqPurpose.innerText = 'Bio-Resonance Inactive';
        freqPurpose.className = 'frequency-purpose disconnected';

        // Hide Deck & Custom Module
        freqDeck.classList.add('hidden');
        customFreqModule.classList.add('hidden');

    } else if (state === 'scanning') {
        document.body.classList.remove('disconnected');
        document.body.classList.add('connecting');

        statusText.innerText = 'Scanning...';
        actionText.innerText = 'LOCATING DEVICE';

        freqPurpose.className = 'frequency-purpose connecting';
        freqPurpose.textContent = 'Seeking Resonance...';

        startGeometrySequence(); // Start the sacred geometry animation build-up

    } else if (state === 'connected') {
        isConnected = true;
        document.body.classList.remove('connecting');
        document.body.classList.add('connected');

        clearGeometrySequence(); // Lock the final geometry state

        // Update Indicator
        connIndicator.className = 'connection-status connected';
        statusText.innerText = 'Connected';
        ambientGlow.className = 'connected';

        // Update Orb
        actionText.classList.add('hidden');
        freqDisplay.classList.remove('hidden');

        freqPurpose.className = 'frequency-purpose connected';
        freqPurpose.textContent = 'Bio-Resonance Active';

        // Unhide logic
        freqDeck.classList.remove('hidden');
        customFreqModule.classList.remove('hidden');
        updateOrbFrequencyDisplay(currentFreq);
    }
}

function clearGeometrySequence() {
    if (window.geoTimeouts) {
        window.geoTimeouts.forEach(t => clearTimeout(t));
        window.geoTimeouts.forEach(t => clearInterval(t));
    }
    window.geoTimeouts = [];
    document.body.classList.remove('seq-fibonacci', 'seq-seed', 'seq-flower');
}

function updateOrbFrequencyDisplay(freq) {
    freqDisplay.innerHTML = `${freq}<span class="unit">Hz</span>`;

    // Find the corresponding purpose text
    const activeCard = Array.from(freqCards).find(card => card.dataset.freq == freq);
    if (activeCard) {
        freqPurpose.innerText = activeCard.dataset.purpose;
    }
}

// --- Deck Interaction ---
freqCards.forEach(card => {
    card.addEventListener('click', () => {
        if (!isConnected) return;

        // Visual update on deck
        freqCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        // Scroll into center view (snap)
        card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

        // Update state and UI
        currentFreq = parseInt(card.dataset.freq);
        updateOrbFrequencyDisplay(currentFreq);

        // Transmit immediately
        transmitFrequency(currentFreq);
    });
});

/* --- Custom Frequency Logic --- */
setCustomFreqBtn.addEventListener('click', () => {
    let val = parseFloat(customFreqVal.value);
    if (!val || val <= 0 || val > 20000) return;

    currentFreq = val;
    freqDisplay.innerHTML = `${currentFreq}<span class="unit">Hz</span>`;
    freqPurpose.innerText = "Custom Frequency Active";
    transmitFrequency(currentFreq);

    // Visually deselect preset deck cards
    freqCards.forEach(c => c.classList.remove('active'));
});

/* --- Rife Library Modal Logic --- */
let rifeDatabase = [];
let searchTimeout = null;
const RENDER_LIMIT = 50; // Performance: Only show first 50 results

async function loadRifeLibrary() {
    try {
        const response = await fetch('rife_library.json');
        rifeDatabase = await response.json();
        renderLibrary(rifeDatabase.slice(0, RENDER_LIMIT));
    } catch (e) {
        libraryList.innerHTML = "<p>Failed to load database. Please ensure rife_library.json is present.</p>";
    }
}

function renderLibrary(data) {
    libraryList.innerHTML = '';
    if (data.length === 0) {
        libraryList.innerHTML = '<p class="no-results">No resonant matches found.</p>';
        return;
    }

    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'rife-entry';
        div.innerHTML = `
            <div class="rife-header">
                <p class="rife-condition">${item.condition}</p>
                <span class="rife-source-badge">${item.source}</span>
            </div>
            ${item.notes ? `<p class="rife-notes">${item.notes}</p>` : ''}
            <div class="rife-controls">
                <p class="rife-freqs">${item.frequencies} Hz</p>
                <button class="rife-use-btn" data-freqs="${item.frequencies}">ACTIVATE</button>
            </div>
        `;
        const btn = div.querySelector('button');
        btn.addEventListener('click', () => {
            // Extract all frequencies
            const freqMatches = item.frequencies.match(/(\d+\.?\d*)/g);
            if (freqMatches && freqMatches.length > 0) {
                const firstFreq = parseFloat(freqMatches[0]);
                customFreqVal.value = firstFreq;
                setCustomFreqBtn.click();
                
                if (freqMatches.length > 1) {
                    freqPurpose.innerText = `${item.condition} (Cycle ${freqMatches.length} freqs)`;
                } else {
                    freqPurpose.innerText = item.condition;
                }
                
                closeLibraryModal();
            }
        });
        libraryList.appendChild(div);
    });
}

openLibraryBtn.addEventListener('click', () => {
    libraryModal.classList.remove('hidden');
    if (rifeDatabase.length === 0) loadRifeLibrary();
});

function closeLibraryModal() {
    libraryModal.classList.add('hidden');
}

closeLibraryBtn.addEventListener('click', closeLibraryModal);

librarySearch.addEventListener('input', (e) => {
    // Debounce search for performance
    if (searchTimeout) clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(() => {
        const term = e.target.value.toLowerCase();
        const filtered = rifeDatabase.filter(item =>
            item.condition.toLowerCase().includes(term) ||
            item.frequencies.toLowerCase().includes(term) ||
            (item.notes && item.notes.toLowerCase().includes(term))
        );
        renderLibrary(filtered.slice(0, RENDER_LIMIT));
    }, 250);
});

/* --- Sacred Geometry Animation Sequence --- */
window.geoTimeouts = [];

function startGeometrySequence() {
    clearGeometrySequence();

    // Sequence builds upon itself to form the final Flower of Life while searching
    window.geoTimeouts.push(setTimeout(() => { if (document.body.classList.contains('connecting')) document.body.classList.add('seq-fibonacci'); }, 1000));
    window.geoTimeouts.push(setTimeout(() => { if (document.body.classList.contains('connecting')) document.body.classList.add('seq-seed'); }, 2000));
    window.geoTimeouts.push(setTimeout(() => { if (document.body.classList.contains('connecting')) document.body.classList.add('seq-flower'); }, 3000));

    // If it takes a very long time, loop inner geometries
    window.geoTimeouts.push(setInterval(() => {
        if (document.body.classList.contains('connecting')) {
            document.body.classList.remove('seq-fibonacci', 'seq-seed', 'seq-flower');
            startGeometrySequence();
        }
    }, 5000));
}
