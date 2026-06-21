/* ============================================
   MW-PRICE-CHECKER APPLICATION LOGIC
   Live Product Lookup from MatrixWarehouse Website
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
        this.products = []; // Normalized product catalog

        // API Configuration
        this.warehouseURL = 'https://www.matrixwarehouse.co.za';
        this.localCatalogURL = './sample-products.csv.csv';
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
        this.loadProducts();
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

    // =============== LOAD PRODUCTS FROM SHOPIFY JSON ===============

    async loadProducts() {
        this.showLoading(true);
        try {
            const response = await fetch(`${this.warehouseURL}/products.json`, {
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.products = this.normalizeShopifyProducts(data.products || []);
                this.updateDataStatus(true, '🔗 LIVE API READY');
                this.showNotification(`✓ LOADED ${this.products.length} PRODUCTS`, 'success');
                console.log('Loaded products:', this.products.length);
            } else {
                await this.loadProductsViaSearch();
            }
        } catch (error) {
            console.error('Products.json error:', error);
            await this.loadProductsViaSearch();
        }
        this.showLoading(false);
    }

    async loadProductsViaSearch() {
        try {
            // Try to load products via search endpoint or collection
            const response = await fetch(`${this.warehouseURL}/collections/all/products.json`, {
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.products = this.normalizeShopifyProducts(data.products || []);
                this.updateDataStatus(true, '🔗 LIVE API READY');
                this.showNotification(`✓ LOADED ${this.products.length} PRODUCTS`, 'success');
            } else {
                await this.loadProductsFromCSV();
            }
        } catch (error) {
            console.error('Search error:', error);
            await this.loadProductsFromCSV();
        }
    }

    async loadProductsFromCSV() {
        try {
            const response = await fetch(this.localCatalogURL);
            if (!response.ok) {
                throw new Error(`CSV request failed with status ${response.status}`);
            }

            const csvText = await response.text();
            const rows = this.parseCSV(csvText);
            this.products = rows
                .map((row, index) => this.parseCSVProduct(row, index))
                .filter(Boolean);

            this.updateDataStatus(true, '💾 LOCAL CATALOG READY');
            this.showNotification(`✓ LOADED ${this.products.length} LOCAL PRODUCTS`, 'success');
            console.log('Loaded local products:', this.products.length);
        } catch (error) {
            console.error('CSV fallback error:', error);
            this.products = [];
            this.updateDataStatus(false);
            this.showNotification('✗ PRODUCT DATA UNAVAILABLE', 'error');
        }
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
            this.showNotification('✓ CAMERA ACTIVATED - SCANNING...', 'success');

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
        
        // Stop Quagga
        if (window.Quagga) {
            Quagga.stop();
        }
        
        this.cameraActive = false;
        this.isScanning = false;
        this.updateCameraStatus(false);
        this.elements.cameraToggle.innerHTML = '<span class="btn-icon">▶</span>ACTIVATE CAMERA';
        this.showNotification('⊙ CAMERA DEACTIVATED', 'info');
    }

    // =============== BARCODE SCANNING WITH QUAGGA ===============

    startBarcodeScanning() {
        if (!this.cameraActive || !window.Quagga) {
            console.warn('Quagga not available');
            return;
        }

        this.isScanning = true;
        const self = this;

        // Initialize Quagga
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
                if (result.codeResult && result.codeResult.code) {
                    const code = result.codeResult.code;
                    
                    // Prevent rapid duplicate scans
                    if (code !== self.lastScan || Date.now() - self.lastScanTime > 3000) {
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
        // Prevent duplicate scans
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
            this.addToHistory(barcode, product.title);
            if (fromCamera) this.playBeep();
            return;
        }

        // Search in local products
        const product = this.searchLocalProducts(barcode);
        
        if (product) {
            this.productCache.set(barcode, product);
            this.displayProduct(product);
            this.addToHistory(barcode, product.title);
            if (fromCamera) this.playBeep();
        } else {
            this.displayNotFound(barcode);
            if (fromCamera) this.playError();
        }
    }

    searchLocalProducts(searchTerm) {
        const term = this.normalizeSearchValue(searchTerm);
        if (!term) return null;

        const exactMatch = this.products.find(product =>
            Array.isArray(product.lookupKeys) && product.lookupKeys.includes(term)
        );
        if (exactMatch) return exactMatch;

        if (term.length < 2) return null;

        return this.products.find(product =>
            product.searchText && product.searchText.includes(term)
        ) || null;
    }

    normalizeShopifyProducts(products) {
        return products.flatMap(product => {
            const variants = Array.isArray(product.variants) && product.variants.length
                ? product.variants
                : [null];

            return variants.map(variant => this.parseShopifyProduct(product, variant));
        }).filter(Boolean);
    }

    parseShopifyProduct(product, variant = null) {
        const selectedVariant = variant || (product.variants && product.variants[0]) || {};

        const variantTitle = selectedVariant.title && selectedVariant.title !== 'Default Title'
            ? ` - ${selectedVariant.title}`
            : '';

        return this.normalizeProduct({
            id: selectedVariant.id || product.id,
            title: `${product.title || 'Unknown Product'}${variantTitle}`,
            barcode: selectedVariant.barcode || product.barcode || '',
            sku: selectedVariant.sku || '',
            price: selectedVariant.price || '0.00',
            stock: typeof selectedVariant.inventory_quantity === 'number'
                ? selectedVariant.inventory_quantity
                : 'N/A',
            category: product.product_type || 'General',
            image: product.featured_image?.src || product.image?.src || '',
            description: product.body_html || '',
            url: product.handle ? `${this.warehouseURL}/products/${product.handle}` : this.warehouseURL,
            brand: product.vendor || '',
            extraSearchTerms: [
                product.handle,
                product.title,
                selectedVariant.title,
                selectedVariant.barcode,
                selectedVariant.sku
            ]
        });
    }

    parseCSVProduct(row, index) {
        const sku = row.SKU_ || row.SKU || row.Item || '';
        const title = row.Description || row.Product || row.Name || '';

        if (!sku && !title) {
            return null;
        }

        return this.normalizeProduct({
            id: sku || `csv-${index}`,
            title: title || sku,
            barcode: row.Barcode || sku,
            sku,
            price: row.Price_EX || row.Price || '0.00',
            stock: row.AvailableStock || row.Stock || 'N/A',
            category: row.Category_Description || row.Category_Code || 'General',
            image: '',
            description: '',
            url: this.warehouseURL,
            brand: row.Brand || '',
            extraSearchTerms: [
                row.Group,
                row.Category_Code,
                row.Category_Description,
                row.Brand
            ]
        });
    }

    normalizeProduct(product) {
        const barcode = this.asDisplayString(product.barcode);
        const sku = this.asDisplayString(product.sku);
        const title = this.asDisplayString(product.title) || 'Unknown Product';
        const description = this.asDisplayString(product.description);
        const brand = this.asDisplayString(product.brand);
        const category = this.asDisplayString(product.category) || 'General';

        const lookupKeys = Array.from(new Set([
            barcode,
            sku,
            this.asDisplayString(product.id),
            ...(product.extraSearchTerms || [])
        ].map(value => this.normalizeSearchValue(value)).filter(Boolean)));

        const searchText = [
            title,
            description,
            brand,
            category,
            ...(product.extraSearchTerms || [])
        ]
            .map(value => this.normalizeSearchValue(value))
            .filter(Boolean)
            .join(' ');

        return {
            id: product.id || barcode || sku || title,
            title,
            barcode: barcode || sku || 'N/A',
            sku,
            price: this.normalizePrice(product.price),
            stock: this.asDisplayString(product.stock) || 'N/A',
            category,
            image: this.asDisplayString(product.image),
            description,
            url: this.asDisplayString(product.url) || this.warehouseURL,
            brand,
            lookupKeys,
            searchText
        };
    }

    parseCSV(csvText) {
        const rows = [];
        let currentValue = '';
        let currentRow = [];
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    currentValue += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                currentRow.push(currentValue);
                currentValue = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }

                currentRow.push(currentValue);
                if (currentRow.some(value => value !== '')) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentValue = '';
            } else {
                currentValue += char;
            }
        }

        if (currentValue !== '' || currentRow.length > 0) {
            currentRow.push(currentValue);
            rows.push(currentRow);
        }

        const [headerRow, ...dataRows] = rows;
        if (!headerRow) return [];

        return dataRows.map(row => {
            const record = {};
            headerRow.forEach((header, index) => {
                record[header.trim()] = (row[index] || '').trim();
            });
            return record;
        });
    }

    normalizeSearchValue(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    }

    normalizePrice(value) {
        const normalized = String(value ?? '')
            .replace(/[^0-9.-]/g, '')
            .trim();

        return normalized || '0.00';
    }

    asDisplayString(value) {
        return typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : '';
    }

    displayProduct(product) {
        const imageHTML = product.image ? `<img src="${product.image}" alt="${product.title}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 4px;">` : '';
        
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
                    • Verify barcode/SKU is correct<br>
                    • Try manual search or visit website<br>
                    <a href="${this.warehouseURL}" target="_blank" style="color: var(--primary-red); text-decoration: underline;">Go to Matrix Warehouse →</a>
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

        const historyHTML = this.scanHistory.map((item) => `
            <div class="history-item" style="cursor: pointer;">
                <div class="history-barcode">${item.barcode}</div>
                <div style="color: var(--text-secondary); margin: 3px 0; font-size: 0.8rem;">${item.productName}</div>
                <div class="history-time">${item.timestamp}</div>
            </div>
        `).join('');

        this.elements.scanHistory.innerHTML = historyHTML;

        // Add click handlers
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

    updateDataStatus(loaded, statusText = 'LIVE API READY') {
        if (loaded) {
            this.elements.dataStatus.classList.add('active');
            this.elements.dataStatus.querySelector('.status-text').textContent = statusText;
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

    playError() {
        if (!this.soundEnabled) return;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 400;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
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
    // Load Quagga library
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/quagga@0.3.2/dist/quagga.min.js';
    script.onload = () => {
        window.priceChecker = new PriceChecker();
    };
    document.head.appendChild(script);
});
