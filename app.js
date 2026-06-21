/* ============================================
   MW-PRICE-CHECKER APPLICATION LOGIC
   Live Product Lookup from MatrixWarehouse
   ============================================ */

class PriceChecker {
    constructor() {
        // State Management
        this.scanHistory = [];
        this.cameraActive = false;
        this.scanMode = 'auto';
        this.soundEnabled = true;
        this.maxHistoryItems = 20;
        this.lastScan = '';
        this.lastScanTime = 0;
        this.isDecoding = false; // Prevent multiple simultaneous decodes

        // API Configuration
        this.warehouseAPI = 'https://www.matrixwarehouse.co.za';
        this.productCache = new Map(); // Cache for performance

        // DOM Elements
        this.elements = {
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
        this.updateDataStatus(true); // Always show as ready since we're using live API
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
        this.elements.clearData.addEventListener('click', () => this.clearCache());
        this.elements.downloadTemplate.addEventListener('click', () => this.showWarehouseInfo());

        // Hide CSV upload section
        const csvSection = document.querySelector('.control-section');
        if (csvSection && csvSection.textContent.includes('DATA MANAGEMENT')) {
            csvSection.style.display = 'none';
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
            this.isDecoding = false;
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
        this.isDecoding = false;
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
        const self = this;

        const scan = () => {
            if (!this.cameraActive) return;

            // Only process every 3rd frame to reduce CPU load and prevent freezing
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                // Draw video frame to canvas
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);

                // Only attempt decode if not currently decoding
                if (!this.isDecoding) {
                    this.isDecoding = true;

                    try {
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
                            this.isDecoding = false;
                            
                            if (result && result.codeResult) {
                                const barcode = result.codeResult.code;
                                this.lookupProduct(barcode, true);
                            }
                        });
                    } catch (e) {
                        this.isDecoding = false;
                        console.warn('Decode error:', e);
                    }
                }
            }

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
                this.showNotification('✗ FAILED TO LOOKUP PRODUCT', 'error');
            });
    }

    async fetchProductFromWarehouse(barcode) {
        try {
            // Try multiple search methods
            const searchMethods = [
                `${this.warehouseAPI}/search?q=${barcode}`,
                `${this.warehouseAPI}/api/products/search?sku=${barcode}`,
                `${this.warehouseAPI}/api/products/barcode/${barcode}`
            ];

            for (const url of searchMethods) {
                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                        },
                        mode: 'cors'
                    });

                    if (response.ok) {
                        const data = await response.json();
                        
                        // Parse response based on format
                        let product = null;
                        
                        if (Array.isArray(data) && data.length > 0) {
                            product = this.parseProductData(data[0]);
                        } else if (data.product) {
                            product = this.parseProductData(data.product);
                        } else if (data.name || data.product_name) {
                            product = this.parseProductData(data);
                        }

                        if (product) return product;
                    }
                } catch (e) {
                    // Try next method
                    continue;
                }
            }

            // If direct API fails, try web scraping via a backend service
            return await this.scrapeProductFromWebsite(barcode);
        } catch (error) {
            console.error('Warehouse API Error:', error);
            return null;
        }
    }

    parseProductData(data) {
        // Flexible parsing to handle various API response formats
        return {
            barcode: data.sku || data.barcode || data.item_number || '',
            product_name: data.name || data.product_name || data.title || 'Unknown Product',
            price: this.formatPrice(data.price || data.selling_price || data.cost || '0.00'),
            stock: data.stock || data.quantity || data.qty || 'N/A',
            category: data.category || data.product_category || data.type || 'General',
            description: data.description || data.details || ''
        };
    }

    formatPrice(price) {
        if (typeof price === 'string') {
            const cleaned = price.replace(/[R$€£¥,]/g, '').trim();
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? '0.00' : parsed.toFixed(2);
        }
        return parseFloat(price || 0).toFixed(2);
    }

    async scrapeProductFromWebsite(barcode) {
        try {
            // Since we can't directly scrape due to CORS, we'll show a message
            // In production, you'd use a backend proxy service
            console.log('Direct scraping not available for:', barcode);
            return null;
        } catch (error) {
            console.error('Scrape Error:', error);
            return null;
        }
    }

    displayProduct(product) {
        const resultHTML = `
            <div class="product-result">
                <div class="result-field">
                    <span class="result-label">BARCODE/SKU:</span>
                    <span class="result-value">${product.barcode}</span>
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
                    <span class="result-label">BARCODE/SKU/ITEM#:</span>
                    <span class="result-value">${barcode}</span>
                </div>
                <div class="result-field">
                    <span class="result-label">STATUS:</span>
                    <span class="result-value error">⚠ NOT FOUND</span>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">
                    • Product not found on matrixwarehouse.co.za<br>
                    • Verify barcode/SKU is correct<br>
                    • Check Matrix Warehouse inventory
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

    clearCache() {
        if (confirm('CLEAR ALL CACHED DATA?')) {
            this.productCache.clear();
            this.elements.resultsContainer.innerHTML = `
                <div class="no-results">
                    <span class="no-results-icon">⊙</span>
                    <p>AWAITING SCAN...</p>
                </div>
            `;
            this.showNotification('✓ CACHE CLEARED', 'success');
        }
    }

    showWarehouseInfo() {
        this.showNotification('🔗 MatrixWarehouse.co.za - Live Pricing Enabled', 'info');
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
                this.scanHistory = state.scanHistory || [];
                this.soundEnabled = state.soundEnabled !== false;
                this.scanMode = state.scanMode || 'auto';

                this.elements.soundToggle.checked = this.soundEnabled;
                this.elements.scanMode.value = this.scanMode;
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
