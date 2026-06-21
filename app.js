/* ============================================
   MW-PRICE-CHECKER APPLICATION LOGIC
   Live Product Lookup from MatrixWarehouse
   ============================================ */

class PriceChecker {
    constructor() {
        // State Management
        this.scanHistory = [];
        this.cameraActive = false;
        this.soundEnabled = true;
        this.maxHistoryItems = 20;
        this.lastScan = '';
        this.lastScanTime = 0;
        this.isScanning = false;

        // API Configuration
        this.warehouseAPI = 'https://www.matrixwarehouse.co.za';
        this.productCache = new Map();

        // DOM Elements
        this.elements = {
            quickSearch: document.getElementById('quickSearch'),
            quickSearchBtn: document.getElementById('quickSearchBtn'),
            cameraToggle: document.getElementById('cameraToggle'),
            cameraVideo: document.getElementById('cameraVideo'),
            scanCanvas: document.getElementById('scanCanvas'),
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

        // Initialize
        this.init();
    }

    init() {
        this.createNotificationContainer();
        this.attachEventListeners();
        this.restoreState();
        this.updateDataStatus(true);
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
        // Quick Search
        this.elements.quickSearchBtn.addEventListener('click', () => this.processQuickSearch());
        this.elements.quickSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.processQuickSearch();
        });

        // Camera Control
        this.elements.cameraToggle.addEventListener('click', () => this.toggleCamera());

        // Settings
        this.elements.soundToggle.addEventListener('change', (e) => {
            this.soundEnabled = e.target.checked;
            this.saveState();
        });

        // History & Data
        this.elements.clearHistory.addEventListener('click', () => this.clearScanHistory());
        this.elements.clearData.addEventListener('click', () => this.clearCache());
    }

    // =============== QUICK SEARCH ===============

    processQuickSearch() {
        const input = this.elements.quickSearch.value.trim().toUpperCase();
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
        try {
            this.showLoading(true);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            this.elements.cameraVideo.srcObject = stream;
            this.cameraActive = true;
            this.updateCameraStatus(true);
            this.elements.cameraToggle.innerHTML = '<span class="btn-icon">⏹</span>STOP CAMERA';

            this.showLoading(false);
            this.showNotification('✓ CAMERA ACTIVATED', 'success');

            // Start barcode scanning
            this.startBarcodeScanning();
        } catch (error) {
            this.showLoading(false);
            this.showNotification('✗ CAMERA ACCESS DENIED', 'error');
            console.error('Camera Error:', error);
        }
    }

    stopCamera() {
        const stream = this.elements.cameraVideo.srcObject;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        this.cameraActive = false;
        this.isScanning = false;
        this.updateCameraStatus(false);
        this.elements.cameraToggle.innerHTML = '<span class="btn-icon">▶</span>ACTIVATE CAMERA';
        this.showNotification('⊙ CAMERA DEACTIVATED', 'info');
    }

    // =============== BARCODE SCANNING WITH QUAGGA ===============

    startBarcodeScanning() {
        if (!this.cameraActive) return;

        this.isScanning = true;
        const self = this;
        let frameCount = 0;

        // Initialize Quagga with camera constraints
        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: this.elements.cameraVideo,
                constraints: {
                    width: { min: 640 },
                    height: { min: 480 },
                    facingMode: "environment",
                    aspectRatio: { min: 1, max: 100 }
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
                console.error('Quagga init error:', err);
                self.showNotification('✗ CAMERA SCAN ERROR', 'error');
                return;
            }

            Quagga.start();

            // Handle detected barcodes
            Quagga.onDetected((result) => {
                if (result.codeResult) {
                    const code = result.codeResult.code;
                    
                    // Prevent rapid duplicate scans
                    if (code !== self.lastScan || Date.now() - self.lastScanTime > 2000) {
                        self.lastScan = code;
                        self.lastScanTime = Date.now();
                        
                        console.log('Barcode detected:', code);
                        self.lookupProduct(code, true);
                    }
                }
            });
        });
    }

    // =============== PRODUCT LOOKUP ===============

    lookupProduct(barcode, fromCamera = false) {
        // Prevent duplicate scans within 2 seconds
        const now = Date.now();
        if (
            barcode === this.lastScan &&
            now - this.lastScanTime < 2000
        ) {
            return;
        }

        this.lastScan = barcode;
        this.lastScanTime = now;

        // Check cache first
        if (this.productCache.has(barcode)) {
            const product = this.productCache.get(barcode);
            this.displayProduct(product);
            this.addToHistory(barcode, product.product_name);
            if (fromCamera) this.playBeep();
            return;
        }

        // Fetch from MatrixWarehouse API
        this.showLoading(true);
        this.fetchProductFromWarehouse(barcode)
            .then(product => {
                this.showLoading(false);
                if (product) {
                    this.productCache.set(barcode, product);
                    this.displayProduct(product);
                    this.addToHistory(barcode, product.product_name);
                    if (fromCamera) this.playBeep();
                } else {
                    this.displayNotFound(barcode);
                }
            })
            .catch(error => {
                this.showLoading(false);
                console.error('Lookup Error:', error);
                this.displayNotFound(barcode);
            });
    }

    async fetchProductFromWarehouse(barcode) {
        try {
            // Try multiple search endpoints
            const searchMethods = [
                `${this.warehouseAPI}/api/products/search?sku=${encodeURIComponent(barcode)}`,
                `${this.warehouseAPI}/api/products/barcode/${encodeURIComponent(barcode)}`,
                `${this.warehouseAPI}/search?q=${encodeURIComponent(barcode)}`,
                `${this.warehouseAPI}/api/v1/products/${encodeURIComponent(barcode)}`
            ];

            for (const url of searchMethods) {
                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        },
                        mode: 'cors'
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const product = this.parseProductData(data);
                        
                        if (product && product.product_name) {
                            return product;
                        }
                    }
                } catch (e) {
                    console.warn(`Endpoint failed: ${url}`);
                    continue;
                }
            }

            return null;
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    }

    parseProductData(data) {
        // Handle array responses
        let product = Array.isArray(data) ? data[0] : data;

        // Unwrap nested responses
        if (product.product) {
            product = product.product;
        } else if (product.data) {
            product = product.data;
        } else if (product.results && Array.isArray(product.results)) {
            product = product.results[0];
        }

        return {
            barcode: product.sku || product.barcode || product.item_number || product.code || '',
            product_name: product.name || product.product_name || product.title || product.description || 'Unknown Product',
            price: this.formatPrice(product.price || product.selling_price || product.cost || '0.00'),
            stock: String(product.stock || product.quantity || product.qty || product.available || 'N/A'),
            category: product.category || product.product_category || product.type || 'General',
            description: product.description || product.details || ''
        };
    }

    formatPrice(price) {
        if (typeof price === 'string') {
            const cleaned = price.replace(/[R$€£¥,\s]/g, '').trim();
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? '0.00' : parsed.toFixed(2);
        }
        return parseFloat(price || 0).toFixed(2);
    }

    displayProduct(product) {
        const resultHTML = `
            <div class="product-result">
                <div class="result-field">
                    <span class="result-label">BARCODE/SKU:</span>
                    <span class="result-value">${product.barcode || 'N/A'}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRODUCT:</span>
                    <span class="result-value">${product.product_name}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRICE:</span>
                    <span class="result-value price">R${product.price}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">STOCK:</span>
                    <span class="result-value">${product.stock}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">CATEGORY:</span>
                    <span class="result-value">${product.category}</span>
                </div>
                ${product.description ? `<div class="result-field">
                    <span class="result-label">DETAILS:</span>
                    <span class="result-value">${product.description}</span>
                </div>` : ''}
            </div>
        `;

        this.elements.resultsContainer.innerHTML = resultHTML;
    }

    displayNotFound(barcode) {
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
                    • Product not found on matrixwarehouse.co.za<br>
                    • Verify barcode/SKU is correct<br>
                    • Try manual search above
                </div>
            </div>
        `;

        this.elements.resultsContainer.innerHTML = resultHTML;
    }

    // =============== HISTORY MANAGEMENT ===============

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

        const historyHTML = this.scanHistory.map((item, index) => `
            <div class="history-item" data-index="${index}">
                <div class="history-barcode">${item.barcode}</div>
                <div style="color: var(--text-secondary); margin: 3px 0;">${item.productName}</div>
                <div class="history-time">${item.timestamp}</div>
            </div>
        `).join('');

        this.elements.scanHistory.innerHTML = historyHTML;

        // Add click handlers to history items
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

    // =============== STATUS & UI UPDATES ===============

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
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (e) {
            console.warn('Audio not available');
        }
    }

    // =============== STATE MANAGEMENT ===============

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
                console.error('Failed to restore state:', e);
            }
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.priceChecker = new PriceChecker();
});
