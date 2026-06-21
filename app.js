/* ============================================
   MW-PRICE-CHECKER APPLICATION LOGIC
   Camera Barcode Scanning + Live Pricing
   ============================================ */

class PriceChecker {
    constructor() {
        console.log('🚀 PriceChecker Initializing...');
        
        // State Management
        this.scanHistory = [];
        this.cameraActive = false;
        this.soundEnabled = true;
        this.maxHistoryItems = 20;
        this.lastScan = '';
        this.lastScanTime = 0;
        this.products = [];
        this.productCache = new Map();

        // Configuration
        this.warehouseURL = 'https://www.matrixwarehouse.co.za';

        // DOM Elements
        this.elements = {
            quickSearch: document.getElementById('quickSearch'),
            quickSearchBtn: document.getElementById('quickSearchBtn'),
            cameraToggle: document.getElementById('cameraToggle'),
            cameraVideo: document.getElementById('cameraVideo'),
            soundToggle: document.getElementById('soundToggle'),
            resultsContainer: document.getElementById('resultsContainer'),
            dataStatus: document.getElementById('dataStatus'),
            cameraStatus: document.getElementById('cameraStatus'),
            scanHistory: document.getElementById('scanHistory'),
            clearHistory: document.getElementById('clearHistory'),
            clearData: document.getElementById('clearData'),
            loadingSpinner: document.getElementById('loadingSpinner'),
            notificationContainer: null
        };

        this.init();
    }

    init() {
        console.log('📍 Initializing components...');
        this.createNotificationContainer();
        this.attachEventListeners();
        this.restoreState();
        this.loadProducts();
        console.log('✓ Initialization complete');
    }

    createNotificationContainer() {
        if (!this.elements.notificationContainer) {
            const container = document.createElement('div');
            container.id = 'notificationContainer';
            container.className = 'notification-container';
            document.body.appendChild(container);
            this.elements.notificationContainer = container;
        }
    }

    attachEventListeners() {
        console.log('📌 Attaching event listeners...');
        
        // Quick Search
        this.elements.quickSearchBtn.addEventListener('click', () => {
            console.log('🔍 Search button clicked');
            this.processQuickSearch();
        });
        this.elements.quickSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('🔍 Enter pressed in search');
                this.processQuickSearch();
            }
        });

        // Camera
        this.elements.cameraToggle.addEventListener('click', () => {
            console.log('📷 Camera toggle clicked');
            this.toggleCamera();
        });

        // Sound
        this.elements.soundToggle.addEventListener('change', (e) => {
            this.soundEnabled = e.target.checked;
            this.saveState();
            console.log('🔊 Sound:', this.soundEnabled ? 'ON' : 'OFF');
        });

        // History & Cache
        this.elements.clearHistory.addEventListener('click', () => this.clearScanHistory());
        this.elements.clearData.addEventListener('click', () => this.clearCache());

        console.log('✓ Event listeners attached');
    }

    // =============== LOAD PRODUCTS ===============

    async loadProducts() {
        console.log('📦 Loading products from Matrix Warehouse...');
        this.showLoading(true);

        try {
            // Try products.json endpoint
            console.log('🌐 Trying:', `${this.warehouseURL}/products.json`);
            const response = await fetch(`${this.warehouseURL}/products.json`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });

            if (response.ok) {
                const data = await response.json();
                this.products = data.products || [];
                console.log(`✓ Loaded ${this.products.length} products`);
                this.updateDataStatus(true);
                this.showNotification(`✓ LOADED ${this.products.length} PRODUCTS`, 'success');
            } else {
                throw new Error(`Status ${response.status}`);
            }
        } catch (error) {
            console.error('❌ API Error:', error);
            this.updateDataStatus(false);
            this.showNotification('⚠ OFFLINE MODE - Search may be limited', 'info');
        }

        this.showLoading(false);
    }

    // =============== QUICK SEARCH ===============

    processQuickSearch() {
        const input = this.elements.quickSearch.value.trim().toUpperCase();
        console.log('🔍 Searching for:', input);

        if (input) {
            this.lookupProduct(input, false);
            this.elements.quickSearch.value = '';
        } else {
            this.showNotification('⚠ PLEASE ENTER A CODE', 'error');
        }
    }

    // =============== CAMERA HANDLING ===============

    async toggleCamera() {
        if (this.cameraActive) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    async startCamera() {
        console.log('📷 Starting camera...');
        this.showLoading(true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            console.log('✓ Camera stream acquired');
            this.elements.cameraVideo.srcObject = stream;
            this.cameraActive = true;
            this.updateCameraStatus(true);
            this.elements.cameraToggle.innerHTML = '<span class="btn-icon">⏹</span>STOP CAMERA';

            this.showNotification('✓ CAMERA ACTIVE - SCANNING...', 'success');
            this.startBarcodeScanning();

        } catch (error) {
            console.error('❌ Camera Error:', error);
            this.showNotification('✗ CAMERA ACCESS DENIED: ' + error.message, 'error');
        }

        this.showLoading(false);
    }

    stopCamera() {
        console.log('📷 Stopping camera...');
        
        const stream = this.elements.cameraVideo.srcObject;
        if (stream) {
            stream.getTracks().forEach(track => {
                track.stop();
                console.log('✓ Track stopped:', track.label);
            });
        }

        if (window.Quagga) {
            try {
                Quagga.stop();
                console.log('✓ Quagga stopped');
            } catch (e) {
                console.warn('Quagga stop error:', e);
            }
        }

        this.cameraActive = false;
        this.updateCameraStatus(false);
        this.elements.cameraToggle.innerHTML = '<span class="btn-icon">▶</span>ACTIVATE CAMERA';
        this.showNotification('⊙ CAMERA DEACTIVATED', 'info');
    }

    // =============== BARCODE SCANNING ===============

    startBarcodeScanning() {
        if (!this.cameraActive) {
            console.warn('⚠ Camera not active');
            return;
        }

        if (!window.Quagga) {
            console.error('❌ Quagga library not loaded');
            this.showNotification('✗ BARCODE LIBRARY NOT LOADED', 'error');
            return;
        }

        console.log('🎯 Starting Quagga barcode scanning...');
        const self = this;

        try {
            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: this.elements.cameraVideo,
                    constraints: {
                        width: { min: 640 },
                        height: { min: 480 },
                        facingMode: "environment"
                    }
                },
                decoder: {
                    readers: [
                        "code_128_reader",
                        "ean_reader",
                        "ean_8_reader",
                        "upc_reader",
                        "upc_e_reader",
                        "code_39_reader"
                    ],
                    debug: {
                        showCanvas: false,
                        showPatterns: false,
                        showLines: false,
                        showTiming: false
                    }
                },
                locator: {
                    halfSample: true,
                    patchSize: "medium"
                },
                numOfWorkers: 2,
                frequency: 10
            }, function(err) {
                if (err) {
                    console.error('❌ Quagga init error:', err);
                    self.showNotification('✗ SCAN ERROR: ' + err.message, 'error');
                    return;
                }

                console.log('✓ Quagga initialized');
                Quagga.start();
                console.log('✓ Quagga started');

                // Barcode detection
                Quagga.onDetected((result) => {
                    if (result && result.codeResult && result.codeResult.code) {
                        const barcode = result.codeResult.code;
                        console.log('📊 BARCODE DETECTED:', barcode);
                        
                        // Prevent duplicate scans
                        if (barcode !== self.lastScan || Date.now() - self.lastScanTime > 3000) {
                            self.lastScan = barcode;
                            self.lastScanTime = Date.now();
                            self.lookupProduct(barcode, true);
                        }
                    }
                });
            });
        } catch (error) {
            console.error('❌ Quagga start error:', error);
            this.showNotification('✗ SCAN ERROR: ' + error.message, 'error');
        }
    }

    // =============== PRODUCT LOOKUP ===============

    lookupProduct(barcode, fromCamera = false) {
        console.log('🔎 Looking up product:', barcode);

        // Check cache
        if (this.productCache.has(barcode)) {
            console.log('✓ Found in cache');
            const product = this.productCache.get(barcode);
            this.displayProduct(product);
            this.addToHistory(barcode, product.title);
            if (fromCamera) this.playBeep();
            return;
        }

        // Search in products
        const product = this.searchLocalProducts(barcode);

        if (product) {
            console.log('✓ Product found:', product.title);
            this.productCache.set(barcode, product);
            this.displayProduct(product);
            this.addToHistory(barcode, product.title);
            if (fromCamera) this.playBeep();
        } else {
            console.log('❌ Product not found');
            this.displayNotFound(barcode);
            if (fromCamera) this.playError();
        }
    }

    searchLocalProducts(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        console.log('🔍 Searching local products for:', term);

        for (const product of this.products) {
            // Check barcode
            if (product.barcode && product.barcode.toLowerCase() === term) {
                return this.parseShopifyProduct(product);
            }

            // Check handle
            if (product.handle && product.handle.toLowerCase().includes(term)) {
                return this.parseShopifyProduct(product);
            }

            // Check title
            if (product.title && product.title.toLowerCase().includes(term)) {
                return this.parseShopifyProduct(product);
            }

            // Check variant SKU
            if (product.variants) {
                for (const variant of product.variants) {
                    if (variant.sku && variant.sku.toLowerCase() === term) {
                        return this.parseShopifyProduct(product, variant);
                    }
                }
            }
        }

        return null;
    }

    parseShopifyProduct(product, variant = null) {
        const v = variant || (product.variants && product.variants[0]) || {};

        return {
            id: product.id,
            title: product.title,
            barcode: v.barcode || product.barcode || '',
            price: v.price || '0.00',
            stock: v.inventory_quantity || 'N/A',
            category: product.product_type || 'General',
            image: product.featured_image?.src || '',
            url: `${this.warehouseURL}/products/${product.handle}`
        };
    }

    displayProduct(product) {
        console.log('📊 Displaying product:', product.title);

        const imageHTML = product.image 
            ? `<img src="${product.image}" alt="${product.title}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 4px;">`
            : '';

        const resultHTML = `
            <div class="product-result">
                ${imageHTML}
                <div class="result-field">
                    <span class="result-label">BARCODE/SKU:</span>
                    <span class="result-value">${product.barcode || 'N/A'}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRODUCT:</span>
                    <span class="result-value">${product.title}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRICE:</span>
                    <span class="result-value price">R${parseFloat(product.price).toFixed(2)}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">STOCK:</span>
                    <span class="result-value">${product.stock}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">CATEGORY:</span>
                    <span class="result-value">${product.category}</span>
                </div>
                <div style="margin-top: 15px;">
                    <a href="${product.url}" target="_blank" class="btn btn-primary" style="display: inline-block; text-decoration: none;">VIEW ON WEBSITE</a>
                </div>
            </div>
        `;

        this.elements.resultsContainer.innerHTML = resultHTML;
    }

    displayNotFound(barcode) {
        console.log('❌ Displaying not found for:', barcode);

        const resultHTML = `
            <div class="product-result error">
                <div class="result-field">
                    <span class="result-label">SEARCH CODE:</span>
                    <span class="result-value">${barcode}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">STATUS:</span>
                    <span class="result-value error">⚠ NOT FOUND</span>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">
                    • Product not found in database<br>
                    • Verify code is correct<br>
                    <a href="${this.warehouseURL}" target="_blank" style="color: var(--primary-red); text-decoration: underline;">Visit Matrix Warehouse →</a>
                </div>
            </div>
        `;

        this.elements.resultsContainer.innerHTML = resultHTML;
    }

    // =============== HISTORY ===============

    addToHistory(barcode, productName) {
        const timestamp = new Date().toLocaleTimeString();
        this.scanHistory.unshift({ barcode, productName, timestamp });

        if (this.scanHistory.length > this.maxHistoryItems) {
            this.scanHistory.pop();
        }

        this.updateHistoryDisplay();
        this.saveState();
    }

    updateHistoryDisplay() {
        if (this.scanHistory.length === 0) {
            this.elements.scanHistory.innerHTML = '<div class="history-empty">NO SCANS</div>';
            return;
        }

        const historyHTML = this.scanHistory.map((item) => `
            <div class="history-item" style="cursor: pointer;">
                <div class="history-barcode">${item.barcode}</div>
                <div style="color: var(--text-secondary); margin: 3px 0; font-size: 0.8rem;">${item.productName}</div>
                <div class="history-time">${item.timestamp}</div>
            </div>
        `).join('');

        this.elements.scanHistory.innerHTML = historyHTML;

        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const barcode = item.querySelector('.history-barcode').textContent;
                this.lookupProduct(barcode, false);
            });
        });
    }

    clearScanHistory() {
        if (confirm('CLEAR ALL SCAN HISTORY?')) {
            this.scanHistory = [];
            this.updateHistoryDisplay();
            this.saveState();
            this.showNotification('✓ HISTORY CLEARED', 'success');
        }
    }

    clearCache() {
        if (confirm('CLEAR ALL CACHED DATA?')) {
            this.productCache.clear();
            this.elements.resultsContainer.innerHTML = `
                <div class="no-results">
                    <span class="no-results-icon">⊙</span>
                    <p>AWAITING SCAN OR SEARCH...</p>
                </div>
            `;
            this.showNotification('✓ CACHE CLEARED', 'success');
        }
    }

    // =============== UI UPDATES ===============

    updateDataStatus(loaded) {
        if (loaded) {
            this.elements.dataStatus.classList.add('active');
            this.elements.dataStatus.querySelector('.status-text').textContent = '🔗 LIVE API READY';
        } else {
            this.elements.dataStatus.classList.remove('active');
            this.elements.dataStatus.querySelector('.status-text').textContent = 'OFFLINE MODE';
        }
    }

    updateCameraStatus(active) {
        if (active) {
            this.elements.cameraStatus.classList.add('active');
            this.elements.cameraStatus.querySelector('.status-text').textContent = 'CAMERA ACTIVE';
        } else {
            this.elements.cameraStatus.classList.remove('active');
            this.elements.cameraStatus.querySelector('.status-text').textContent = 'CAMERA INACTIVE';
        }
    }

    showLoading(show) {
        if (show) {
            this.elements.loadingSpinner.classList.add('active');
        } else {
            this.elements.loadingSpinner.classList.remove('active');
        }
    }

    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        this.elements.notificationContainer.appendChild(notification);

        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    playBeep() {
        if (!this.soundEnabled) return;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.connect(gain);
            gain.connect(audioContext.destination);

            osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

            osc.start(audioContext.currentTime);
            osc.stop(audioContext.currentTime + 0.1);
        } catch (e) {
            console.warn('Audio error:', e);
        }
    }

    playError() {
        if (!this.soundEnabled) return;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.connect(gain);
            gain.connect(audioContext.destination);

            osc.frequency.value = 400;
            gain.gain.setValueAtTime(0.2, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

            osc.start(audioContext.currentTime);
            osc.stop(audioContext.currentTime + 0.2);
        } catch (e) {
            console.warn('Audio error:', e);
        }
    }

    // =============== STATE ===============

    saveState() {
        const state = {
            scanHistory: this.scanHistory,
            soundEnabled: this.soundEnabled
        };
        localStorage.setItem('priceCheckerState', JSON.stringify(state));
    }

    restoreState() {
        const saved = localStorage.getItem('priceCheckerState');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.scanHistory = state.scanHistory || [];
                this.soundEnabled = state.soundEnabled !== false;
                this.elements.soundToggle.checked = this.soundEnabled;
                this.updateHistoryDisplay();
            } catch (e) {
                console.error('State restore error:', e);
            }
        }
    }
}

// Start app
console.log('✅ App script loaded');
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM ready - starting PriceChecker');
    window.priceChecker = new PriceChecker();
});
