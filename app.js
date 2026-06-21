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
        this.backupProducts = [];
        this.backupCsvFileName = '';
        this.backupCsvSavedAt = '';
        this.liveDataAvailable = false;
        this.backupDataAvailable = false;
        this.backupPersistenceWarningShown = false;
        this.productCache = new Map();

        // Configuration
        this.warehouseURL = 'https://www.matrixwarehouse.co.za';

        // DOM Elements
        this.elements = {
            quickSearch: document.getElementById('quickSearch'),
            quickSearchBtn: document.getElementById('quickSearchBtn'),
            backupCsvInput: document.getElementById('backupCsvInput'),
            backupCsvLabel: document.getElementById('backupCsvLabel'),
            backupCsvMeta: document.getElementById('backupCsvMeta'),
            clearBackupData: document.getElementById('clearBackupData'),
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

        // CSV Backup
        this.elements.backupCsvInput.addEventListener('change', (event) => {
            this.handleBackupFileUpload(event.target.files && event.target.files[0]);
        });
        this.elements.clearBackupData.addEventListener('click', () => this.clearBackupData());

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
                this.liveDataAvailable = this.products.length > 0;
                console.log(`✓ Loaded ${this.products.length} products`);
                this.updateDataStatus();
                this.showNotification(`✓ LOADED ${this.products.length} PRODUCTS`, 'success');
            } else {
                throw new Error(`Status ${response.status}`);
            }
        } catch (error) {
            console.error('❌ API Error:', error);
            this.products = [];
            this.liveDataAvailable = false;
            this.updateDataStatus();
            this.showNotification('⚠ LIVE API OFFLINE - USE CSV BACKUP IF NEEDED', 'info');
        }

        this.showLoading(false);
    }

    // =============== CSV BACKUP ===============

    async handleBackupFileUpload(file) {
        if (!file) return;

        this.showLoading(true);

        try {
            const csvText = await this.readFileAsText(file);
            const rows = this.parseCSV(csvText);
            const parsedBackupProducts = this.normalizeBackupRows(rows);

            this.backupProducts = parsedBackupProducts;
            this.backupCsvFileName = file.name;
            this.backupCsvSavedAt = new Date().toISOString();
            this.backupDataAvailable = this.backupProducts.length > 0;
            this.productCache.clear();
            this.updateDataStatus();
            this.updateBackupCsvUI();
            this.saveState();

            this.elements.backupCsvInput.value = '';

            if (this.backupDataAvailable) {
                this.showNotification(`✓ CSV BACKUP LOADED (${this.backupProducts.length} PRODUCTS) - PERSISTS UNTIL REPLACED`, 'success');
            } else {
                this.showNotification('⚠ CSV LOADED WITH 0 SEARCHABLE PRODUCTS - PERSISTS UNTIL REPLACED', 'info');
            }
        } catch (error) {
            console.error('❌ CSV backup load error:', error);
            this.updateBackupCsvUI();
            const retainedMessage = this.backupProducts.length > 0
                ? ' - PREVIOUS CSV BACKUP RETAINED'
                : '';
            this.showNotification(`✗ CSV LOAD FAILED - ${error.message}${retainedMessage}`, 'error');
        }

        this.showLoading(false);
    }

    clearBackupData() {
        if (this.backupProducts.length === 0) {
            this.showNotification('⊙ NO CSV BACKUP TO REMOVE', 'info');
            return;
        }

        this.showNotification('ℹ CSV BACKUP PERSISTS - UPLOAD A NEW CSV TO REPLACE IT', 'info');
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(String(event.target?.result || ''));
            reader.onerror = () => reject(new Error('Unable to read file'));
            reader.readAsText(file);
        });
    }

    parseCSV(csvText) {
        const rows = [];
        let currentField = '';
        let currentRow = [];
        let inQuotes = false;

        const sanitized = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const delimiter = this.detectDelimiter(sanitized);

        for (let i = 0; i < sanitized.length; i += 1) {
            const char = sanitized[i];
            const nextChar = sanitized[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    currentField += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (!inQuotes && char === delimiter) {
                currentRow.push(currentField.trim());
                currentField = '';
                continue;
            }

            if (!inQuotes && char === '\n') {
                currentRow.push(currentField.trim());
                if (currentRow.some((field) => field !== '')) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                continue;
            }

            currentField += char;
        }

        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some((field) => field !== '')) {
                rows.push(currentRow);
            }
        }

        if (rows.length < 2) {
            return [];
        }

        const headers = rows[0];
        return rows.slice(1).map((row) => this.buildCsvRowObject(headers, row));
    }

    detectDelimiter(csvText) {
        const firstLine = csvText.split('\n').find((line) => line.trim().length > 0) || '';
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        return semicolonCount > commaCount ? ';' : ',';
    }

    buildCsvRowObject(headers, row) {
        const record = {};
        headers.forEach((header, index) => {
            record[this.normalizeColumnName(header)] = String(row[index] || '').trim();
        });
        return record;
    }

    normalizeBackupRows(rows) {
        const records = [];

        rows.forEach((row, index) => {
            const barcode = this.findColumnValue(row, ['barcode', 'barcodenumber', 'barcodeid', 'ean', 'upc']);
            const itemCode = this.findColumnValue(row, ['itemcode', 'itemnumber', 'itemno', 'item', 'code', 'productcode']);
            const sku = this.findColumnValue(row, ['sku', 'sku_', 'stockcode', 'suppliercode', 'supplieritemcode']);
            const title = this.findColumnValue(row, ['name', 'productname', 'itemname', 'description', 'itemdescription', 'desc']);
            const description = this.findColumnValue(row, ['description', 'itemdescription', 'productdescription', 'desc', 'longdescription', 'brand']);
            const category = this.findColumnValue(row, ['category', 'categorydescription', 'department', 'group', 'productgroup']);
            const stock = this.findColumnValue(row, ['stock', 'availablestock', 'qty', 'quantity', 'available', 'onhand', 'stockonhand']);
            const price = this.findColumnValue(row, ['price', 'sellingprice', 'retailprice', 'unitprice', 'sellprice', 'amount', 'priceex']);

            if (!barcode && !itemCode && !sku && !title) {
                return;
            }

            records.push({
                id: `csv-${index + 1}`,
                source: 'csv',
                title: title || itemCode || sku || barcode || 'Unknown Product',
                description: description || '',
                barcode: barcode || itemCode || sku || '',
                itemCode: itemCode || '',
                sku: sku || itemCode || '',
                price: this.parsePrice(price),
                stock: stock || 'N/A',
                category: category || 'CSV Backup',
                image: '',
                url: ''
            });
        });

        return records;
    }

    normalizeColumnName(columnName) {
        return String(columnName || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    findColumnValue(row, aliases) {
        const keys = Object.keys(row);
        for (const alias of aliases) {
            if (row[alias]) {
                return row[alias];
            }
            const matchedKey = keys.find((key) => key.includes(alias));
            if (matchedKey && row[matchedKey]) {
                return row[matchedKey];
            }
        }
        return '';
    }

    parsePrice(value) {
        if (!value) return '';
        const cleaned = String(value).replace(/[^0-9.-]/g, '');
        const numeric = parseFloat(cleaned);
        return Number.isFinite(numeric) ? numeric.toFixed(2) : '';
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
        const searchCode = String(barcode || '').trim();
        const cacheKey = this.normalizeCodeValue(searchCode) || this.normalizeSearchValue(searchCode);
        console.log('🔎 Looking up product:', searchCode);

        if (!cacheKey) {
            return;
        }

        // Check cache
        if (this.productCache.has(cacheKey)) {
            console.log('✓ Found in cache');
            const product = this.productCache.get(cacheKey);
            this.displayProduct(product);
            this.addToHistory(searchCode, product.title);
            if (fromCamera) this.playBeep();
            return;
        }

        // Search in live products first, then CSV backup products
        const product = this.searchLocalProducts(searchCode);

        if (product) {
            console.log('✓ Product found:', product.title);
            this.productCache.set(cacheKey, product);
            this.displayProduct(product);
            this.addToHistory(searchCode, product.title);
            if (fromCamera) this.playBeep();
        } else {
            console.log('❌ Product not found');
            this.displayNotFound(searchCode);
            if (fromCamera) this.playError();
        }
    }

    searchLocalProducts(searchTerm) {
        const term = this.normalizeSearchValue(searchTerm);
        const codeTerm = this.normalizeCodeValue(searchTerm);
        console.log('🔍 Searching local products for:', term);

        if (!term) {
            return null;
        }

        const liveResult = this.searchShopifyProducts(term, codeTerm);
        if (liveResult) return liveResult;

        return this.searchBackupProducts(term, codeTerm);
    }

    searchShopifyProducts(term, codeTerm) {
        for (const product of this.products) {
            // Check barcode
            if (
                this.normalizeCodeValue(product.barcode) === codeTerm ||
                this.normalizeSearchValue(product.barcode) === term
            ) {
                return this.parseShopifyProduct(product);
            }

            // Check handle
            if (this.normalizeSearchValue(product.handle).includes(term)) {
                return this.parseShopifyProduct(product);
            }

            // Check title
            if (this.normalizeSearchValue(product.title).includes(term)) {
                return this.parseShopifyProduct(product);
            }

            // Check variant SKU
            if (product.variants) {
                for (const variant of product.variants) {
                    if (
                        this.normalizeCodeValue(variant.sku) === codeTerm ||
                        this.normalizeCodeValue(variant.barcode) === codeTerm ||
                        this.normalizeSearchValue(variant.sku) === term ||
                        this.normalizeSearchValue(variant.barcode) === term
                    ) {
                        return this.parseShopifyProduct(product, variant);
                    }
                }
            }
        }

        return null;
    }

    searchBackupProducts(term, codeTerm) {
        for (const product of this.backupProducts) {
            const barcode = this.normalizeCodeValue(product.barcode);
            const sku = this.normalizeCodeValue(product.sku);
            const itemCode = this.normalizeCodeValue(product.itemCode);
            const title = this.normalizeSearchValue(product.title);
            const description = this.normalizeSearchValue(product.description);

            if (
                (codeTerm && (barcode === codeTerm || sku === codeTerm || itemCode === codeTerm)) ||
                this.normalizeSearchValue(product.barcode) === term ||
                this.normalizeSearchValue(product.sku) === term ||
                this.normalizeSearchValue(product.itemCode) === term
            ) {
                return product;
            }

            if (title.includes(term) || description.includes(term)) {
                return product;
            }
        }

        return null;
    }

    normalizeSearchValue(value) {
        return String(value || '').toLowerCase().trim();
    }

    normalizeCodeValue(value) {
        return this.normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');
    }

    parseShopifyProduct(product, variant = null) {
        const v = variant || (product.variants && product.variants[0]) || {};

        return {
            id: product.id,
            title: product.title,
            description: product.body_html || '',
            barcode: v.barcode || product.barcode || '',
            sku: v.sku || '',
            price: v.price || '0.00',
            stock: v.inventory_quantity || 'N/A',
            category: product.product_type || 'General',
            image: product.featured_image?.src || '',
            source: 'live',
            url: product.handle ? `${this.warehouseURL}/products/${product.handle}` : ''
        };
    }

    displayProduct(product) {
        console.log('📊 Displaying product:', product.title);

        const safeImageUrl = this.sanitizeUrl(product.image);
        const safeProductTitle = this.escapeHtml(product.title || 'N/A');
        const safeBarcode = this.escapeHtml(product.barcode || 'N/A');
        const safeStock = this.escapeHtml(product.stock || 'N/A');
        const safeCategory = this.escapeHtml(product.category || 'N/A');

        const imageHTML = safeImageUrl
            ? `<img src="${safeImageUrl}" alt="${safeProductTitle}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 4px;">`
            : '';
        const priceLabel = this.formatPrice(product.price);
        const sourceLabel = product.source === 'csv' ? 'CSV BACKUP' : 'LIVE API';
        const safeProductUrl = this.sanitizeUrl(product.url);
        const linkHTML = safeProductUrl
            ? `<div style="margin-top: 15px;">
                    <a href="${safeProductUrl}" target="_blank" class="btn btn-primary" style="display: inline-block; text-decoration: none;">VIEW ON WEBSITE</a>
               </div>`
            : '';

        const resultHTML = `
            <div class="product-result">
                ${imageHTML}
                <div class="result-field">
                    <span class="result-label">BARCODE/SKU:</span>
                    <span class="result-value">${safeBarcode}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRODUCT:</span>
                    <span class="result-value">${safeProductTitle}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRICE:</span>
                    <span class="result-value price">${priceLabel}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">STOCK:</span>
                    <span class="result-value">${safeStock}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">CATEGORY:</span>
                    <span class="result-value">${safeCategory}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">SOURCE:</span>
                    <span class="result-value">${sourceLabel}</span>
                </div>
                ${linkHTML}
            </div>
        `;

        this.elements.resultsContainer.innerHTML = resultHTML;
    }

    displayNotFound(barcode) {
        console.log('❌ Displaying not found for:', barcode);
        const safeBarcode = this.escapeHtml(barcode);

        const resultHTML = `
            <div class="product-result error">
                <div class="result-field">
                    <span class="result-label">SEARCH CODE:</span>
                    <span class="result-value">${safeBarcode}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">STATUS:</span>
                    <span class="result-value error">⚠ NOT FOUND</span>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">
                    • Product not found in live or CSV backup data<br>
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
                <div class="history-barcode">${this.escapeHtml(item.barcode)}</div>
                <div style="color: var(--text-secondary); margin: 3px 0; font-size: 0.8rem;">${this.escapeHtml(item.productName)}</div>
                <div class="history-time">${this.escapeHtml(item.timestamp)}</div>
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

    updateBackupCsvUI() {
        if (this.backupProducts.length > 0) {
            const fileName = this.backupCsvFileName || 'RESTORED CSV BACKUP';
            this.elements.backupCsvLabel.textContent = `✓ ${fileName}`;
            this.elements.backupCsvMeta.textContent = `${this.backupProducts.length} BACKUP PRODUCTS READY (PERSISTS UNTIL REPLACED)`;
            return;
        }

        if (this.backupCsvFileName) {
            this.elements.backupCsvLabel.textContent = `✓ ${this.backupCsvFileName}`;
            this.elements.backupCsvMeta.textContent = 'CSV BACKUP LOADED (0 SEARCHABLE PRODUCTS, PERSISTS UNTIL REPLACED)';
            return;
        }

        this.elements.backupCsvLabel.textContent = 'SELECT CSV BACKUP FILE';
        this.elements.backupCsvMeta.textContent = 'NO CSV BACKUP LOADED';
    }

    // =============== UI UPDATES ===============

    updateDataStatus() {
        const hasLive = this.liveDataAvailable;
        const hasBackup = this.backupDataAvailable;

        if (hasLive || hasBackup) {
            this.elements.dataStatus.classList.add('active');
        } else {
            this.elements.dataStatus.classList.remove('active');
        }

        if (hasLive && hasBackup) {
            this.elements.dataStatus.querySelector('.status-text').textContent = '🔗 LIVE API + 📁 CSV BACKUP READY';
        } else if (hasLive) {
            this.elements.dataStatus.querySelector('.status-text').textContent = '🔗 LIVE API READY';
        } else if (hasBackup) {
            this.elements.dataStatus.querySelector('.status-text').textContent = '📁 CSV BACKUP READY';
        } else {
            this.elements.dataStatus.querySelector('.status-text').textContent = '⚠ NO PRODUCT DATA';
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

    formatPrice(price) {
        const numeric = parseFloat(String(price ?? '').replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(numeric)) {
            return `R${numeric.toFixed(2)}`;
        }
        return 'N/A';
    }

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    sanitizeUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';

        try {
            const parsedUrl = new URL(raw, window.location.href);
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                return parsedUrl.href;
            }
        } catch (error) {
            return '';
        }

        return '';
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
            soundEnabled: this.soundEnabled,
            backupProducts: this.backupProducts,
            backupCsvFileName: this.backupCsvFileName,
            backupCsvSavedAt: this.backupCsvSavedAt
        };
        try {
            localStorage.setItem('priceCheckerState', JSON.stringify(state));
        } catch (error) {
            console.error('State save error:', error);
            if (
                !this.backupPersistenceWarningShown &&
                String(error?.name || '').toLowerCase().includes('quota')
            ) {
                this.backupPersistenceWarningShown = true;
                this.showNotification('⚠ STORAGE FULL - CSV BACKUP CANNOT BE SAVED FOR PAGE REFRESH', 'info');
            }
        }
    }

    restoreState() {
        const saved = localStorage.getItem('priceCheckerState');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.scanHistory = state.scanHistory || [];
                this.soundEnabled = state.soundEnabled !== false;
                this.backupProducts = Array.isArray(state.backupProducts) ? state.backupProducts : [];
                this.backupCsvFileName = String(state.backupCsvFileName || '');
                this.backupCsvSavedAt = String(state.backupCsvSavedAt || '');
                this.backupDataAvailable = this.backupProducts.length > 0;
                this.elements.soundToggle.checked = this.soundEnabled;
                this.updateHistoryDisplay();
                this.updateBackupCsvUI();
                this.updateDataStatus();
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
