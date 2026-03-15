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
const mainBtn = document.getElementById('connect-btn'); // Now the text container
const connIndicator = document.getElementById('connection-indicator');
const statusText = document.getElementById('status-text');
const actionText = document.getElementById('main-action-text');
const freqDisplay = document.getElementById('current-freq-display');
const freqPurpose = document.getElementById('freq-purpose-text');
const ambientGlow = document.getElementById('ambient-glow');
const freqDeck = document.getElementById('freq-deck');
const customFreqModule = document.getElementById('custom-freq-module');
const customFreqVal = document.getElementById('custom-freq-val');
const setCustomFreqBtn = document.getElementById('set-custom-freq-btn');
const openLibraryBtn = document.getElementById('open-library-btn');
const libraryModal = document.getElementById('library-modal');
const closeLibraryBtn = document.getElementById('close-library-btn');
const librarySearch = document.getElementById('library-search');
const libraryList = document.getElementById('library-list');
const freqCards = document.querySelectorAll('.freq-card');
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

// --- Simulation Bypass ---
// Click the status pill ("Disconnected") to simulate pairing without real BLE
connIndicator.addEventListener('click', () => {
    if (isConnected) {
        // If already connected, clicking the pill disconnects
        disconnectDevice();
        return;
    }
    if (document.body.classList.contains('connecting')) return;

    // Trigger visual feedback on the indicator
    connIndicator.style.background = "rgba(74, 222, 128, 0.2)";
    statusText.innerText = "Simulating Resonance...";

    console.log("Dev Bypass: Simulating Connection Sequence...");
    setUIState('scanning');

    // Simulate finding the device and connecting after 3 seconds
    setTimeout(() => {
        if (document.body.classList.contains('connecting')) {
            console.log("Simulated Device Connected!");
            setUIState('connected');
        }
    }, 3000);
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
        if (ambientGlow) ambientGlow.className = '';
        if (typeof clearGeometrySequence === 'function') clearGeometrySequence();

        // Update Orb
        mainBtn.classList.remove('scanning');
        if (actionText) { actionText.innerText = 'TAP TO CONNECT'; actionText.classList.remove('hidden'); }
        if (freqDisplay) freqDisplay.classList.add('hidden');
        freqPurpose.innerText = 'Bio-Resonance Inactive';
        freqPurpose.className = 'frequency-purpose disconnected';

        // Show connect prompt, hide deck & custom
        const connectPrompt = document.getElementById('connect-btn');
        if (connectPrompt) connectPrompt.classList.remove('hidden');
        freqDeck.classList.add('hidden');
        customFreqModule.classList.add('hidden');

    } else if (state === 'scanning') {
        document.body.classList.remove('disconnected');
        document.body.classList.add('connecting');

        statusText.innerText = 'Scanning...';
        if (actionText) actionText.innerText = 'LOCATING DEVICE';

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
        if (ambientGlow) ambientGlow.className = 'connected';

        // Hide connect prompt, show frequency controls
        if (actionText) actionText.classList.add('hidden');
        if (freqDisplay) freqDisplay.classList.remove('hidden');
        const connectPrompt = document.getElementById('connect-btn');
        if (connectPrompt) connectPrompt.classList.add('hidden');

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
    
    // Clear active sequence classes
    const layers = ['layer-vesica', 'layer-spiral', 'layer-seed', 'layer-flower'];
    layers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('scan-sequence-active');
            el.style.opacity = ''; // Reset for disconnected state
        }
    });
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

    const vesica = document.getElementById('layer-vesica');
    const spiral = document.getElementById('layer-spiral');
    const seed = document.getElementById('layer-seed');
    const flower = document.getElementById('layer-flower');

    // Sequence: Fade out Vesica, then cycle others
    if (vesica) vesica.style.opacity = '0';

    // 1. Fibonacci Spiral (1s delay)
    window.geoTimeouts.push(setTimeout(() => {
        if (spiral) spiral.classList.add('scan-sequence-active');
    }, 1000));

    // 2. Seed of Life (7s delay = 1s + 6s duration)
    window.geoTimeouts.push(setTimeout(() => {
        if (seed) seed.classList.add('scan-sequence-active');
    }, 7000));

    // 3. Flower of Life (13s delay = 7s + 6s duration)
    window.geoTimeouts.push(setTimeout(() => {
        if (flower) flower.classList.add('scan-sequence-active');
    }, 13000));

    // Auto-connect after sequence finishes (Bypass simulation)
    window.geoTimeouts.push(setTimeout(() => {
        if (document.body.classList.contains('connecting')) {
            setUIState('connected');
        }
    }, 19000));
}
