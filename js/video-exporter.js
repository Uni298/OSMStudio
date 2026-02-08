// Video Exporter - Handles frame capture and video generation (Pure Client-Side with Web Worker)
export class VideoExporter {
    constructor(mapManager, animationController, keyframeManager) {
        this.mapManager = mapManager;
        this.animationController = animationController;
        this.keyframeManager = keyframeManager;

        this.isExporting = false;
        this.exportProgress = 0;
        
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
        this.concurrencyInput = document.getElementById('export-concurrency');
        this.waitTimeInput = document.getElementById('export-wait-time');

        this.progressContainer = document.getElementById('export-progress');
        this.progressFill = document.getElementById('export-progress-fill');
        this.statusText = document.getElementById('export-status');
        this.percentageText = document.getElementById('export-percentage');

        // Bind events
        this.btnExport.addEventListener('click', () => this.showDialog());
        this.btnStartExport.addEventListener('click', () => this.startExport());
        
        // Disable server export for now as we are moving to client-side
        // if (this.btnServerExport) {
        //     this.btnServerExport.style.display = 'none'; 
        // }
        
        if (this.btnServerExport) {
            this.btnServerExport.style.display = 'inline-block';
            this.btnServerExport.addEventListener('click', () => this.startHybridParallelExport());
        }

        this.btnCancelExport.addEventListener('click', () => {
            if (this.isExporting) {
                if (confirm('エクスポートを中止しますか？')) {
                    this.isExporting = false; // Trigger cancellation in loop
                }
            } else {
                this.hideDialog();
            }
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

        // Bitrate calculation (Approximate)
        let bitrate = 8000000; // 8 Mbps default (Medium)
        if (quality === 'ultra') bitrate = 50000000; // 50 Mbps
        if (quality === 'high') bitrate = 25000000; // 25 Mbps
        if (quality === 'low') bitrate = 3000000;   // 3 Mbps
        if (width >= 3840) bitrate *= 2.5; // 4K needs more but scaled less since base is high

        this.isExporting = true;
        this.progressContainer.style.display = 'block';
        this.btnStartExport.disabled = true;

        if (this.pathVisualizer) {
             this.pathVisualizer.setEnabled(false);
        }

        let container = null;
        let originalStyle = null;
        let worker = null;

        try {
            this.updateProgress(0, 'エンコーダー初期化中 (Worker)...');

            // Initialize Worker
            worker = new Worker('js/video-encoder-worker.js', { type: 'module' });
            
            // Determine codec
            let codec = 'avc1.4d002a'; // High Profile Level 4.2
            if (width * height > 1920 * 1080) {
                codec = 'avc1.640033'; // High Profile Level 5.1
            }

            // Configure Worker
            worker.postMessage({
                type: 'configure',
                payload: {
                    width,
                    height,
                    fps,
                    bitrate,
                    codec
                }
            });

            // Wait for configuration
            await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    if (e.data.type === 'configured') resolve();
                    else if (e.data.type === 'error') reject(new Error(e.data.error));
                };
            });

            // Pause animation
            const wasPlaying = this.animationController.getIsPlaying();
            if (wasPlaying) {
                this.animationController.pause();
            }

            // Save original styles
            const viewer = this.mapManager.getViewer();
            container = document.getElementById(this.mapManager.containerId);
            originalStyle = {
                width: container.style.width,
                height: container.style.height,
                position: container.style.position,
                top: container.style.top,
                left: container.style.left,
                zIndex: container.style.zIndex
            };

            // Force fixed layout for capture
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = width + 'px';
            container.style.height = height + 'px';
            container.style.zIndex = '9999';
            this.mapManager.resize();

            // Capture Loop
            for (let frame = 0; frame < totalFrames; frame++) {
                if (!this.isExporting) throw new Error('Export Cancelled');

                const time = (frame / fps);
                
                // Update camera & Wait for render
                const cameraData = this.keyframeManager.interpolateAt(time);
                this.mapManager.setCameraPosition(cameraData, false);
                const waitTime = parseInt(this.waitTimeInput?.value) || 300;
                await this.waitForTiles(waitTime);
                
                // Wait for paint
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                await new Promise(r => setTimeout(r, 10)); // Yield for UI updates

                // Capture using html2canvas
                const canvas = await html2canvas(container, {
                    useCORS: true, 
                    allowTaint: true,
                    width: width,
                    height: height,
                    scale: 1,
                    logging: false,
                    backgroundColor: null
                });

                // Create ImageBitmap (Efficient Transfer)
                const bitmap = await createImageBitmap(canvas);

                // Send to Worker
                const timestamp = frame * (1000000 / fps); 
                const keyFrame = frame % (fps * 2) === 0;

                worker.postMessage({
                    type: 'encode',
                    payload: {
                        bitmap: bitmap,
                        timestamp: timestamp,
                        keyFrame: keyFrame
                    }
                }, [bitmap]); // Transfer bitmap ownership to worker

                // Update Progress
                const progress = ((frame + 1) / totalFrames) * 100;
                this.updateProgress(progress, `フレーム処理中... (${frame + 1}/${totalFrames})`);
            }

            // Finalize
            this.updateProgress(100, '動画ファイルの生成中...');
            
            // Request finalization
            worker.postMessage({ type: 'finalize' });

            // Wait for completion
            const buffer = await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    if (e.data.type === 'complete') resolve(e.data.buffer);
                    else if (e.data.type === 'error') reject(new Error(e.data.error));
                };
            });

            const blob = new Blob([buffer], { type: 'video/mp4' });
            
            // Download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `OSMStudio_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert('エクスポートが完了しました！');
            this.hideDialog();

        } catch (error) {
            console.error('Export failed:', error);
            alert('エクスポート失敗: ' + error.message);
        } finally {
            // Cleanup
            if (worker) {
                worker.terminate();
            }

            if (container && originalStyle) {
                container.style.width = originalStyle.width;
                container.style.height = originalStyle.height;
                container.style.position = originalStyle.position;
                container.style.top = originalStyle.top;
                container.style.left = originalStyle.left;
                container.style.zIndex = originalStyle.zIndex;
                this.mapManager.resize();
            }

            this.isExporting = false;
            this.btnStartExport.disabled = false;
            if (this.btnServerExport) this.btnServerExport.disabled = false;
            this.progressContainer.style.display = 'none';
            
            if (this.pathVisualizer) {
                this.pathVisualizer.setEnabled(true);
            }
            
            // Reset animation
            this.animationController.seekTo(0);
        }
    }

    async waitForTiles(additionalWait = 300) {
        return new Promise((resolve) => {
            const viewer = this.mapManager.getViewer();
            if (!viewer) return resolve();

            const check = () => {
                let loading = false;
                viewer.eachLayer((layer) => {
                    // Check if it's a TileLayer and if it has loading tiles
                    if (layer instanceof L.TileLayer && layer._loading) {
                        loading = true;
                    }
                });
                
                if (!loading) {
                    // Even if not "loading", wait a tiny bit more for potential flicker/texture upload
                    setTimeout(resolve, additionalWait);
                } else {
                    setTimeout(check, 100);
                }
            };
            
            check();
            // Fallback to resolve after 3 seconds to avoid infinite loop
            setTimeout(resolve, 3000);
        });
    }

    async startHybridParallelExport() {
        if (this.isExporting) return;

        // Check if server is reachable
        try {
            await fetch(this.serverUrl + '/export/server/check', { method: 'HEAD' }).catch(() => {});
        } catch (e) {
            // Likely static hosting
        }
        
        // Settings
        const resolution = this.resolutionSelect.value; // e.g., "1920x1080"
        const [width, height] = resolution.split('x').map(Number);
        const fps = parseInt(this.fpsSelect.value);
        const quality = this.qualitySelect.value;
        const duration = this.animationController.duration;

        // Bitrate calculation
        let bitrate = 10000000;
        if (quality === 'ultra') bitrate = 50000000;
        if (quality === 'high') bitrate = 25000000;
        if (quality === 'low') bitrate = 3000000;
        if (width >= 3840) bitrate *= 2.5;

        if (!confirm(`サーバーサイド並列キャプチャを開始します。\n\n※ Node.jsサーバーが起動している必要があります。\n※ 解像度: ${resolution}, FPS: ${fps}\n\nよろしいですか？`)) return;

        this.isExporting = true;
        this.progressContainer.style.display = 'block';
        this.btnStartExport.disabled = true;
        this.btnServerExport.disabled = true;

        let worker = null;

        try {
            // 1. Request Server Capture
            this.updateProgress(0, 'サーバー処理を開始しています... (並列キャプチャ)');

            const keyframes = this.keyframeManager.getKeyframes();
            
            const startResponse = await fetch('/export/server/hybrid-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyframes,
                    duration,
                    fps,
                    resolution,
                    quality,
                    concurrency: parseInt(this.concurrencyInput.value) || 4,
                    waitTime: parseInt(this.waitTimeInput.value) || 500
                })
            });

            if (!startResponse.ok) {
                const err = await startResponse.json();
                throw new Error(err.error || 'Server request failed');
            }

            const { sessionId } = await startResponse.json();
            console.log('Hybrid Export Session ID:', sessionId);

            // 2. Poll for Progress
            let isServerDone = false;
            while (!isServerDone && this.isExporting) {
                await new Promise(r => setTimeout(r, 1000));
                
                const statusRes = await fetch(`/export/server/status/${sessionId}`);
                
                if (!statusRes.ok) {
                    let errorMessage = `Server Error: ${statusRes.status}`;
                    try {
                        const errData = await statusRes.json();
                        if (errData.error) errorMessage = errData.error;
                            // Add debug info if available
                        if (errData.debug_existingKeys) errorMessage += ` (Existing: ${errData.debug_existingKeys})`;
                    } catch (e) {
                        // Ignore json parse error
                    }
                    throw new Error(errorMessage);
                }

                const status = await statusRes.json();
                
                // Display detailed progress
                let progressPercent = status.progress || 0;
                let message = status.message || 'Processing...';
                
                if (status.status === 'processing') {
                    message = `サーバーでキャプチャ中: ${message}`;
                } else if (status.status === 'encoding') {
                    message = `動画エンコード中: ${message}`;
                }
                
                this.updateProgress(progressPercent, message);

                if (status.status === 'completed') {
                    isServerDone = true;
                } else if (status.status === 'error') {
                    throw new Error(status.message || 'Server export failed');
                }
            }

            if (!this.isExporting) throw new Error('Export cancelled');

            // 3. Download completed video
            this.updateProgress(100, 'ダウンロード中...');
            
            const downloadUrl = `/export/server/download/${sessionId}`;
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `OSMStudio_Server_${sessionId}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            alert('サーバーエクスポート完了！');
            this.hideDialog();

        } catch (error) {
            console.error(error);
            alert('エクスポート失敗: ' + error.message);
        } finally {
            if (worker) worker.terminate();
            this.isExporting = false;
            this.btnStartExport.disabled = false;
            this.btnServerExport.disabled = false;
            this.progressContainer.style.display = 'none';
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
