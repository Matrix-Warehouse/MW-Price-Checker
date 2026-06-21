/* ============================================
   MW-PRICE-CHECKER APPLICATION LOGIC
   Barcode Scanning & Product Lookup
   ============================================ */

class PriceChecker {
    constructor() {
        // State Management
        this.products = new Map();
        this.scanHistory = [];
        this.cameraActive = false;
        this.scanMode = 'auto';
        this.soundEnabled = true;
        this.maxHistoryItems = 20;

        // DOM Elements
        this.elements = {
            csvFile: document.getElementById('csvFile'),
            cameraToggle: document.getElementById('cameraToggle'),
            cameraVideo: document.getElementById('cameraVideo'),
            scanCanvas: document.getElementById('scanCanvas'),
            manualBarcode: document.getElementById('manualBarcode'),
            submitBarcode: document.getElementById('submitBarcode'),
            scanMode: document.getElementById('scanMode'),
            soundToggle: document.getElementById('soundToggle'),
            resultsContainer: document.getElementById('resultsContainer'),
            dataStatus: document.getElementById('dataStatus'),
            cameraStatus: document.getElementById('cameraStatus'),
            scanHistory: document.getElementById('scanHistory'),
            clearHistory: document.getElementById('clearHistory'),
            clearData: document.getElementById('clearData'),
            downloadTemplate: document.getElementById('downloadTemplate'),
            manualInputContainer: document.getElementById('manualInputContainer'),
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
        // File Upload
        this.elements.csvFile.addEventListener('change', (e) => this.handleCSVUpload(e));

        // Camera Control
        this.elements.cameraToggle.addEventListener('click', () => this.toggleCamera());

        // Barcode Input
        this.elements.submitBarcode.addEventListener('click', () => this.processManualBarcode());
        this.elements.manualBarcode.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.processManualBarcode();
        });

        // Settings
        this.elements.scanMode.addEventListener('change', (e) => this.handleScanModeChange(e));
        this.elements.soundToggle.addEventListener('change', (e) => {
            this.soundEnabled = e.target.checked;
            this.saveState();
        });

        // History & Data
        this.elements.clearHistory.addEventListener('click', () => this.clearScanHistory());
        this.elements.clearData.addEventListener('click', () => this.clearProductData());
        this.elements.downloadTemplate.addEventListener('click', () => this.downloadCSVTemplate());
    }

    // =============== CSV HANDLING ===============

    handleCSVUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showLoading(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csv = e.target.result;
                const result = this.parseCSV(csv);
                this.showLoading(false);
                
                if (result.success) {
                    this.updateDataStatus(true);
                    this.showNotification(`✓ LOADED ${this.products.size} PRODUCTS`, 'success');
                } else {
                    this.showNotification(`✗ ${result.error}`, 'error');
                    console.error('CSV Parse Error:', result.error);
                }
            } catch (error) {
                this.showLoading(false);
                this.showNotification(`✗ CSV ERROR: ${error.message}`, 'error');
                console.error('CSV Error:', error);
            }
        };
        reader.onerror = () => {
            this.showLoading(false);
            this.showNotification('✗ FAILED TO READ FILE', 'error');
        };
        reader.readAsText(file);
    }

    /**
     * Parse CSV with flexible column mapping
     * Supports multiple column name variations:
     * - Barcode: barcode, item_number, item number, sku, product_code, code
     * - Product: product_name, product name, description, item_description
     * - Price: price, selling_price, selling price, unit_price, unit price
     * - Stock: stock, quantity, qty, stock_qty
     */
    parseCSV(csv) {
        if (!csv || csv.trim() === '') {
            return { success: false, error: 'CSV file is empty' };
        }

        const lines = csv.trim().split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            return { success: false, error: 'CSV must have header row and at least one data row' };
        }

        // Parse header - handle quoted values
        const headerLine = lines[0];
        const headers = this.parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

        if (headers.length === 0) {
            return { success: false, error: 'CSV header is empty or malformed' };
        }

        // Define column mapping with priority order
        const columnMappings = {
            barcode: ['barcode', 'item_number', 'item number', 'sku', 'product_code', 'code'],
            productName: ['product_name', 'product name', 'description', 'item_description', 'item description', 'name', 'product'],
            price: ['price', 'selling_price', 'selling price', 'unit_price', 'unit price', 'cost'],
            stock: ['stock', 'quantity', 'qty', 'stock_qty', 'stock qty', 'available', 'on_hand'],
            category: ['category', 'product_category', 'type', 'classification'],
            description: ['description', 'details', 'notes', 'comments']
        };

        // Find column indices using priority mapping
        const findColumnIndex = (aliases) => {
            for (const alias of aliases) {
                const idx = headers.indexOf(alias);
                if (idx !== -1) return idx;
            }
            return -1;
        };

        const barcodeIdx = findColumnIndex(columnMappings.barcode);
        const productIdx = findColumnIndex(columnMappings.productName);
        const priceIdx = findColumnIndex(columnMappings.price);

        // Validation
        if (barcodeIdx === -1) {
            return { 
                success: false, 
                error: `Barcode column not found. Expected one of: ${columnMappings.barcode.join(', ')}. Found columns: ${headers.join(', ')}`
            };
        }
        if (productIdx === -1) {
            return { 
                success: false, 
                error: `Product name column not found. Expected one of: ${columnMappings.productName.join(', ')}. Found columns: ${headers.join(', ')}`
            };
        }
        if (priceIdx === -1) {
            return { 
                success: false, 
                error: `Price column not found. Expected one of: ${columnMappings.price.join(', ')}. Found columns: ${headers.join(', ')}`
            };
        }

        const stockIdx = findColumnIndex(columnMappings.stock);
        const categoryIdx = findColumnIndex(columnMappings.category);
        const descriptionIdx = findColumnIndex(columnMappings.description);

        this.products.clear();
        let successCount = 0;
        let errorCount = 0;

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            try {
                const line = lines[i].trim();
                if (!line) continue;

                const fields = this.parseCSVLine(line);

                // Validate field count
                if (fields.length < Math.max(barcodeIdx, productIdx, priceIdx) + 1) {
                    errorCount++;
                    continue;
                }

                const barcode = fields[barcodeIdx]?.trim();

                if (!barcode) {
                    errorCount++;
                    continue;
                }

                const productName = fields[productIdx]?.trim() || 'Unknown Product';
                
                // Parse price - handle various currency formats
                let price = '0.00';
                if (priceIdx >= 0 && fields[priceIdx]) {
                    const rawPrice = fields[priceIdx]
                        .replace(/[R$€£¥,]/g, '')
                        .trim();
                    const parsedPrice = parseFloat(rawPrice);
                    if (!isNaN(parsedPrice) && parsedPrice >= 0) {
                        price = parsedPrice.toFixed(2);
                    }
                }

                const stock = stockIdx >= 0 && fields[stockIdx] ? fields[stockIdx].trim() : 'N/A';
                const category = categoryIdx >= 0 && fields[categoryIdx] ? fields[categoryIdx].trim() : 'General';
                const description = descriptionIdx >= 0 && fields[descriptionIdx] ? fields[descriptionIdx].trim() : '';

                // Normalize barcode to uppercase for consistent lookups
                const normalizedBarcode = barcode.toUpperCase();

                this.products.set(normalizedBarcode, {
                    barcode: normalizedBarcode,
                    product_name: productName,
                    price,
                    stock,
                    category,
                    description
                });

                successCount++;
            } catch (rowError) {
                errorCount++;
                console.warn(`Error parsing row ${i}:`, rowError);
            }
        }

        if (successCount === 0) {
            return { success: false, error: 'No valid products found in CSV' };
        }

        this.saveState();
        return { 
            success: true, 
            message: `Loaded ${successCount} products${errorCount > 0 ? ` (${errorCount} rows skipped)` : ''}` 
        };
    }

    /**
     * Parse a CSV line handling quoted values
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
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

            // Start barcode scanning if in auto mode
            if (this.scanMode === 'auto') {
                this.startBarcodeScanning();
            }
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
        this.updateCameraStatus(false);
        this.elements.cameraToggle.innerHTML = '<span class="btn-icon">▶</span>ACTIVATE CAMERA';
        this.showNotification('⊙ CAMERA DEACTIVATED', 'info');
    }

    // =============== BARCODE SCANNING ===============

    startBarcodeScanning() {
        if (!this.cameraActive) return;

        const canvas = this.elements.scanCanvas;
        const ctx = canvas.getContext('2d');
        const video = this.elements.cameraVideo;

        const scan = () => {
            if (!this.cameraActive) return;

            // Draw video frame to canvas
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            // Try to detect barcode using Quagga
            Quagga.decodeSingle({
                src: canvas.toDataURL(),
                numOfWorkers: 0,
                inputStream: {
                    size: 800
                },
                decoder: {
                    readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'code_39_reader', 'upc_reader']
                }
            }, (result) => {
                if (result && result.codeResult) {
                    const barcode = result.codeResult.code;
                    this.lookupProduct(barcode, true);
                }
            });

            requestAnimationFrame(scan);
        };

        scan();
    }

    // =============== PRODUCT LOOKUP ===============

    processManualBarcode() {
        const input = this.elements.manualBarcode.value.trim().toUpperCase();
        if (input) {
            this.lookupProduct(input, false);
            this.elements.manualBarcode.value = '';
        }
    }

    lookupProduct(barcode, fromCamera = false) {
        // Normalize input for lookup
        const normalizedBarcode = barcode.toUpperCase();
        
        if (!this.products.has(normalizedBarcode)) {
            this.displayNotFound(barcode);
            return;
        }

        const product = this.products.get(normalizedBarcode);
        this.displayProduct(product);
        this.addToHistory(normalizedBarcode, product.product_name);

        if (fromCamera) {
            this.playBeep();
        }
    }

    displayProduct(product) {
        const resultHTML = `
            <div class="product-result">
                <div class="result-field">
                    <span class="result-label">BARCODE:</span>
                    <span class="result-value">${product.barcode}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRODUCT:</span>
                    <span class="result-value">${product.product_name}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">PRICE:</span>
                    <span class="result-value price">$${product.price}</span>
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
                    <span class="result-label">BARCODE/SKU/ITEM#:</span>
                    <span class="result-value">${barcode}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">STATUS:</span>
                    <span class="result-value error">⚠ NOT FOUND IN DATABASE</span>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">
                    • Verify barcode/SKU/item number is correct<br>
                    • Check product data is loaded<br>
                    • Ensure value matches CSV data exactly
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
            item.addEventListener('click', (e) => {
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

    // =============== DATA MANAGEMENT ===============

    clearProductData() {
        if (confirm('CLEAR ALL PRODUCT DATA?\n\nThis cannot be undone.')) {
            this.products.clear();
            this.elements.resultsContainer.innerHTML = `
                <div class="no-results">
                    <span class="no-results-icon">⊙</span>
                    <p>AWAITING SCAN...</p>
                </div>
            `;
            this.updateDataStatus(false);
            this.elements.csvFile.value = '';
            this.saveState();
            this.showNotification('✓ DATA CLEARED', 'success');
        }
    }

    downloadCSVTemplate() {
        const template = `barcode,product_name,price,stock,category,description
5901234123457,Premium Widget,29.99,100,Electronics,High-end wireless device
5901234123458,Standard Widget,19.99,150,Electronics,Standard model with core features
5901234123459,Budget Widget,9.99,200,Electronics,Affordable entry-level option
5901234123460,Pro Gadget,49.99,75,Premium,Professional grade equipment
5901234123461,Lite Device,14.99,250,Consumer,Lightweight portable version`;

        const blob = new Blob([template], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'products-template.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        this.showNotification('✓ TEMPLATE DOWNLOADED', 'success');
    }

    // =============== SETTINGS & MODES ===============

    handleScanModeChange(event) {
        this.scanMode = event.target.value;

        if (this.scanMode === 'manual') {
            this.elements.manualInputContainer.style.display = 'block';
            this.stopCamera();
        } else {
            this.elements.manualInputContainer.style.display = 'none';
            if (this.cameraActive) {
                this.startBarcodeScanning();
            }
        }

        this.saveState();
    }

    // =============== STATUS & UI UPDATES ===============

    updateDataStatus(loaded) {
        if (loaded) {
            this.elements.dataStatus.classList.add('active');
            this.elements.dataStatus.querySelector('.status-text').textContent = `${this.products.size} PRODUCTS LOADED`;
        } else {
            this.elements.dataStatus.classList.remove('active');
            this.elements.dataStatus.querySelector('.status-text').textContent = 'NO DATA LOADED';
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
        // Log to console
        console.log(`[${type.toUpperCase()}] ${message}`);

        // Show visual notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        this.elements.notificationContainer.appendChild(notification);

        // Auto-remove after 5 seconds
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
            products: Array.from(this.products.entries()),
            scanHistory: this.scanHistory,
            soundEnabled: this.soundEnabled,
            scanMode: this.scanMode
        };
        localStorage.setItem('priceCheckerState', JSON.stringify(state));
    }

    restoreState() {
        const saved = localStorage.getItem('priceCheckerState');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.products = new Map(state.products || []);
                this.scanHistory = state.scanHistory || [];
                this.soundEnabled = state.soundEnabled !== false;
                this.scanMode = state.scanMode || 'auto';

                this.elements.soundToggle.checked = this.soundEnabled;
                this.elements.scanMode.value = this.scanMode;
                this.updateHistoryDisplay();
                
                if (this.products.size > 0) {
                    this.updateDataStatus(true);
                }
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
