// Video Exporter - Handles frame capture and video generation
export class VideoExporter {
    constructor(mapManager, animationController, keyframeManager) {
        this.mapManager = mapManager;
        this.animationController = animationController;
        this.keyframeManager = keyframeManager;

        this.isExporting = false;
        this.exportProgress = 0;
        this.capturedFrames = [];

        // Use current origin to support access from other devices (e.g., iPad)
        this.serverUrl = window.location.origin;

        this.initializeUI();
    }

    initializeUI() {
        this.dialog = document.getElementById('export-dialog');
        this.btnExport = document.getElementById('btn-export');
        this.btnStartExport = document.getElementById('btn-start-export');
        this.btnServerExport = document.getElementById('btn-server-export');
        this.btnCancelExport = document.getElementById('btn-cancel-export');
        this.btnCloseDialog = document.getElementById('btn-close-dialog');

        this.resolutionSelect = document.getElementById('export-resolution');
        this.fpsSelect = document.getElementById('export-fps');
        this.qualitySelect = document.getElementById('export-quality');

        this.progressContainer = document.getElementById('export-progress');
        this.progressFill = document.getElementById('export-progress-fill');
        this.statusText = document.getElementById('export-status');
        this.percentageText = document.getElementById('export-percentage');

        // Bind events
        this.btnExport.addEventListener('click', () => this.showDialog());
        this.btnStartExport.addEventListener('click', () => this.startExport());
        this.btnServerExport.addEventListener('click', () => this.startServerExport());
        this.btnCancelExport.addEventListener('click', () => {
            this.isExporting = false; // Trigger cancellation in loop
            this.hideDialog();
        });
        this.btnCloseDialog.addEventListener('click', () => {
            if (this.isExporting) {
                if (confirm('エクスポートを中止しますか？')) {
                    this.isExporting = false;
                } else {
                    return;
                }
            }
            this.hideDialog();
        });
    }

    showDialog() {
        this.dialog.style.display = 'flex';
        this.progressContainer.style.display = 'none';
        this.exportProgress = 0;
        this.updateProgress(0, '準備完了');
    }

    hideDialog() {
        if (!this.isExporting) {
            this.dialog.style.display = 'none';
        }
    }

    async startExport() {
        if (this.isExporting) return;

        // Get export settings
        const resolution = this.resolutionSelect.value.split('x').map(Number);
        const fps = parseInt(this.fpsSelect.value);
        const quality = this.qualitySelect.value;

        const width = resolution[0];
        const height = resolution[1];
        const duration = this.animationController.duration;
        const totalFrames = Math.ceil(duration * fps);

        this.isExporting = true;
        this.progressContainer.style.display = 'block';
        this.btnStartExport.disabled = true;

        if (this.pathVisualizer) {
            this.pathVisualizer.setEnabled(false);
        }

        try {
            // 1. Start Export Session
            this.updateProgress(0, 'エクスポート準備中...');
            const startResponse = await fetch(`${this.serverUrl}/export/start`, { method: 'POST' });
            if (!startResponse.ok) throw new Error('サーバー接続エラー');
            const { sessionId } = await startResponse.json();

            // Pause animation
            const wasPlaying = this.animationController.getIsPlaying();
            if (wasPlaying) {
                this.animationController.pause();
            }

            // Save original viewer size and style
            const viewer = this.mapManager.getViewer();
            const container = document.getElementById(this.mapManager.containerId);
            const originalStyle = {
                width: container.style.width,
                height: container.style.height,
                position: container.style.position,
                top: container.style.top,
                left: container.style.left,
                zIndex: container.style.zIndex
            };

            // Resize viewer and force layout
            // Use fixed positioning to ignore parent layout constraints
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = width + 'px';
            container.style.height = height + 'px';
            container.style.zIndex = '9999';
            
            this.mapManager.resize();

            // 2. Capture and Upload Loop (Batched)
            let frameBuffer = [];
            const BATCH_SIZE = 5; // Send 5 frames at once
            const apiEndpoint = `${this.serverUrl}/export/frame-batch`;
            const uploadPromises = []; // Track active uploads

            for (let frame = 0; frame < totalFrames; frame++) {
                if (!this.isExporting) throw new Error('Export Cancelled');

                const time = (frame / fps);

                // Update camera
                const cameraData = this.keyframeManager.interpolateAt(time);
                // Use animate:false to ensure exact positioning for frame capture
                // This prevents "moving target" jitter during export
                this.mapManager.setCameraPosition(cameraData, false);

                // Wait for tiles
                await this.waitForTiles();

                // CRITICAL: Wait for browser paint
                // requestAnimationFrame ensures layout/paint is done for current frame
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                
                // Extra yield for UI updates (progress bar)
                await new Promise(r => setTimeout(r, 10));

                // Capture
                const canvas = await html2canvas(container, {
                    useCORS: true,
                    allowTaint: true,
                    width: width,
                    height: height,
                    scale: 1,
                    logging: false
                });
                
                const frameData = canvas.toDataURL('image/png'); // Base64 for JSON batching

                frameBuffer.push({
                    index: frame,
                    image: frameData
                });

                // Update progress
                if (frame % 5 === 0 || frame === totalFrames - 1) {
                    const progress = ((frame + 1) / totalFrames) * 80;
                    this.updateProgress(progress, `フレーム処理中... (${frame + 1}/${totalFrames})`);
                }

                // If buffer full or last frame, upload
                if (frameBuffer.length >= BATCH_SIZE || frame === totalFrames - 1) {
                    const batch = [...frameBuffer];
                    frameBuffer = []; // Clear buffer immediately

                    // Async Upload (Fire and Forget but track)
                    const p = fetch(apiEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, frames: batch })
                    }).catch(err => {
                        console.error('Batch upload failed', err);
                        this.isExporting = false; // Stop on error
                    });
                    
                    uploadPromises.push(p);
                    
                    // Manage concurrency to avoid memory explosion (e.g. max 50 pending batches)
                    if (uploadPromises.length > 50) {
                         const done = await Promise.race(uploadPromises);
                         // Ideally remove done promise but for simplicity just await race
                    }
                    
                    // Small yield to let network request start
                    await new Promise(r => setTimeout(r, 0));
                }
            }
            
            // Wait for all uploads to complete
            this.updateProgress(80, 'アップロード完了待ち...');
            await Promise.all(uploadPromises);

            // Restore viewer style
            container.style.width = originalStyle.width;
            container.style.height = originalStyle.height;
            container.style.position = originalStyle.position;
            container.style.top = originalStyle.top;
            container.style.left = originalStyle.left;
            container.style.zIndex = originalStyle.zIndex;
            
            this.mapManager.resize();

            // Reset animation
            this.animationController.seekTo(0);
            if (wasPlaying) this.animationController.play();

            // 3. Finish and Encode
            this.updateProgress(80, '動画をエンコード中... (数秒〜数分かかります)');

            const finishResponse = await fetch(`${this.serverUrl}/export/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId,
                    fps: fps,
                    quality: quality
                })
            });

            if (!finishResponse.ok) throw new Error('エンコードエラー');

            const blob = await finishResponse.blob();

            // Download video
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `animation_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.updateProgress(100, 'エクスポート完了！');

            setTimeout(() => {
                this.isExporting = false;
                this.btnStartExport.disabled = false;
                this.hideDialog();
                if (this.pathVisualizer) {
                    this.pathVisualizer.setEnabled(true);
                }
            }, 2000);

        } catch (error) {
            console.error('Export error:', error);
            this.updateProgress(0, 'エラー: ' + error.message);
            this.isExporting = false;
            this.btnStartExport.disabled = false;

            if (this.pathVisualizer) {
                this.pathVisualizer.setEnabled(true);
            }

            const container = document.getElementById(this.mapManager.containerId);
            if (container) {
                container.style.width = '100%';
                container.style.height = '100%';
                this.mapManager.resize();
            }
        }
    }

    async waitForTiles() {
        // Smart wait: Check if tiles are loading
        const layer = this.mapManager.activeLayer;
        
        let isReady = false;
        let attempts = 0;
        const maxAttempts = 100; // Total 2s max

        // Aggressive flow: Check immediately
        // Minimal buffer for initial render trigger
        await new Promise(r => setTimeout(r, 10));

        while (!isReady && attempts < maxAttempts) {
            const loading = layer.isLoading ? layer.isLoading() : false;
            const tilesToLoad = layer._tilesToLoad || 0;
            
            if (!loading && tilesToLoad === 0) {
                isReady = true;
            } else {
                // Short check interval
                await new Promise(r => setTimeout(r, 20)); 
                attempts++;
            }
        }
        
    }
    
    // Server export uses Puppeteer, which works fine with DOM
    async startServerExport() {
        if (this.isExporting) return;
        this.isExporting = true;
        this.progressContainer.style.display = 'block';
        this.btnStartExport.disabled = true;
        document.getElementById('btn-server-export').disabled = true;

        try {
            // 1. Initial Request
            const keyframes = this.keyframeManager.getAllKeyframes();
            const duration = this.animationController.duration;
            const fps = parseInt(this.fpsSelect.value);
            const resolution = this.resolutionSelect.value;
            const quality = this.qualitySelect.value;

            this.updateProgress(0, 'サーバー処理を開始中...');

            const startRes = await fetch(`${this.serverUrl}/export/server/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyframes, duration, fps, resolution, quality })
            });

            if (!startRes.ok) throw new Error('Server start failed');
            const { sessionId } = await startRes.json();

            // 2. Polling Loop
            await new Promise((resolve, reject) => {
                const interval = setInterval(async () => {
                    // Check cancellation
                    if (!this.isExporting) {
                        clearInterval(interval);
                        // Optional: Notify server to cancel
                        reject(new Error('Cancelled'));
                        return;
                    }

                    try {
                        const statusRes = await fetch(`${this.serverUrl}/export/server/status/${sessionId}`);
                        if (!statusRes.ok) {
                            clearInterval(interval);
                            throw new Error('Status check failed');
                        }

                        const status = await statusRes.json();

                        if (status.status === 'failed') {
                            clearInterval(interval);
                            throw new Error(status.error || 'Server processing failed');
                        }

                        this.updateProgress(status.progress, status.message);

                        if (status.status === 'completed') {
                            clearInterval(interval);

                            // 3. Download
                            this.updateProgress(100, 'ダウンロード中...');
                            window.location.href = `${this.serverUrl}/export/server/download/${sessionId}`;
                            resolve();

                            setTimeout(() => this.hideDialog(), 1000);
                        }

                    } catch (err) {
                        clearInterval(interval);
                        reject(err);
                    }
                }, 1000); // Poll every second
            });

        } catch (error) {
            console.error('Server export error:', error);
            this.updateProgress(0, 'エラー: ' + error.message);
            alert('サーバーエクスポートエラー: ' + error.message);
        } finally {
            this.isExporting = false;
            this.btnStartExport.disabled = false;
            document.getElementById('btn-server-export').disabled = false;
        }
    }

    updateProgress(percentage, status) {
        this.exportProgress = percentage;
        this.progressFill.style.width = percentage + '%';
        this.statusText.textContent = status;
        this.percentageText.textContent = Math.round(percentage) + '%';
    }

    setPathVisualizer(visualizer) {
        this.pathVisualizer = visualizer;
    }
}

export default VideoExporter;
