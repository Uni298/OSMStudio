const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { encodeVideo } = require('./ffmpeg-encoder');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.static(path.join(__dirname, '..')));

// Temporary directory for frames
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure temp directory exists
async function ensureTempDir() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
        console.error('Failed to create temp directory:', error);
    }
}

// Clean up old temp files
async function cleanupTempFiles(sessionId) {
    try {
        const files = await fs.readdir(TEMP_DIR);
        for (const file of files) {
            if (file.startsWith(sessionId)) {
                await fs.unlink(path.join(TEMP_DIR, file));
            }
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Export Start Endpoint
app.post('/export/start', async (req, res) => {
    const sessionId = Date.now().toString();
    try {
        const frameDir = path.join(TEMP_DIR, sessionId);
        await fs.mkdir(frameDir, { recursive: true });
        res.json({ sessionId });
    } catch (error) {
        console.error('Start export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export Frame Batch Endpoint (To bypass browser connection limits)
app.post('/export/frame-batch', express.json({ limit: '100mb' }), async (req, res) => {
    try {
        const { sessionId, frames } = req.body;
        if (!sessionId || !Array.isArray(frames)) {
            return res.status(400).json({ error: 'Invalid batch data' });
        }

        const frameDir = path.join(TEMP_DIR, sessionId);
        
        // Process frames in parallel
        await Promise.all(frames.map(async (frame) => {
            const { index, image } = frame;
            const framePath = path.join(frameDir, `frame_${String(index).padStart(6, '0')}.png`);
            if (image) { // Skip if empty (optional check)
                const frameData = image.replace(/^data:image\/\w+;base64,/, '');
                await fs.writeFile(framePath, Buffer.from(frameData, 'base64'));
            }
        }));

        res.json({ success: true, count: frames.length });
    } catch (error) {
        console.error('Batch save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export Frame Endpoint (Supports both JSON and Binary)
app.post('/export/frame', express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
    try {
        let sessionId, index, buffer;

        // Check content type
        if (req.is('application/octet-stream')) {
            // Binary mode (for Mobile/iPad)
            sessionId = req.headers['x-session-id'];
            index = parseInt(req.headers['x-frame-index']);
            buffer = req.body; // Raw buffer

            if (!sessionId || isNaN(index) || !buffer) {
                return res.status(400).json({ error: 'Missing headers or body' });
            }
        } else {
            // JSON mode (Legacy fallback)
            const { sessionId: sid, index: idx, image } = req.body;
            if (!sid || idx === undefined || !image) {
                return res.status(400).json({ error: 'Missing JSON parameters' });
            }
            sessionId = sid;
            index = idx;
            const frameData = image.replace(/^data:image\/\w+;base64,/, '');
            buffer = Buffer.from(frameData, 'base64');
        }

        const frameDir = path.join(TEMP_DIR, sessionId);
        const framePath = path.join(frameDir, `frame_${String(index).padStart(6, '0')}.png`);

        await fs.writeFile(framePath, buffer);
        res.json({ success: true });
    } catch (error) {
        console.error('Frame save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export Finish Endpoint
app.post('/export/finish', async (req, res) => {
    try {
        const { sessionId, fps, quality } = req.body;
        if (!sessionId || !fps) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const frameDir = path.join(TEMP_DIR, sessionId);
        const outputPath = path.join(TEMP_DIR, `${sessionId}_output.mp4`);

        console.log(`Finishing export for session ${sessionId}, FPS: ${fps}`);

        // Encode video
        await encodeVideo(frameDir, outputPath, fps, quality);

        // Read video file
        const videoBuffer = await fs.readFile(outputPath);

        // Send video
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="animation.mp4"`);
        res.send(videoBuffer);

        // Cleanup after delay
        setTimeout(async () => {
            try {
                await fs.unlink(outputPath);
                await fs.rmdir(frameDir, { recursive: true });
            } catch (error) {
                console.error('Cleanup error:', error);
            }
        }, 5000);

    } catch (error) {
        console.error('Finish export error:', error);
        res.status(500).json({ error: error.message });

        // Try cleanup
        if (req.body.sessionId) {
            try {
                const frameDir = path.join(TEMP_DIR, req.body.sessionId);
                await fs.rmdir(frameDir, { recursive: true });
            } catch (e) { }
        }
    }
});

// Job Store
const exportJobs = new Map();

// Export Server Start Endpoint
app.post('/export/server/start', async (req, res) => {
    try {
        const { keyframes, duration, fps, resolution, quality } = req.body;
        const sessionId = Date.now().toString();

        // Initialize Job
        exportJobs.set(sessionId, {
            status: 'initiating',
            progress: 0,
            message: 'Initializing server renderer...',
            filePath: null,
            error: null,
            startTime: Date.now()
        });

        res.json({ sessionId });

        // Start Process Async
        (async () => {
            const job = exportJobs.get(sessionId);
            try {
                console.log(`Starting Job: ${sessionId}`);

                // 1. Setup
                const frameDir = path.join(TEMP_DIR, sessionId);
                await fs.mkdir(frameDir, { recursive: true });

                const browser = await puppeteer.launch({
                    headless: 'new',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        // WebGL flags removed as Leaflet is DOM-based
                    ]
                });
                const page = await browser.newPage();

                // Log Relay
                page.on('console', msg => console.log(`[Browser ${sessionId}]`, msg.text()));
                page.on('pageerror', err => console.error(`[Browser ${sessionId} ERROR]`, err.toString()));

                const width = resolution ? parseInt(resolution.split('x')[0]) : 1920;
                const height = resolution ? parseInt(resolution.split('x')[1]) : 1080;
                await page.setViewport({ width, height });

                // 2. Load
                job.status = 'loading';
                job.message = 'Loading Earth Studio...';
                await page.goto(`http://localhost:${PORT}?mode=render`, { waitUntil: 'domcontentloaded', timeout: 60000 });

                await page.waitForFunction(() => window.app && window.app.mapManager && window.app.mapManager.map, { timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                exportJobs.set(sessionId, { ...job, status: 'rendering', message: 'Starting capture...' });

                // 3. Inject and Setup
                await page.evaluate((data) => {
                    if (!window.app) throw new Error('App not ready');
                    window.app.keyframeManager.importFromJSON({ keyframes: data.keyframes });
                    window.app.timelineEditor.setDuration(data.duration);
                    window.app.animationController.setFPS(data.fps);

                    // Hide all UI elements
                    const uiElements = document.querySelectorAll('#property-panel, #timeline-panel, #top-bar, .dialog, #btn-toggle-mask');
                    uiElements.forEach(el => { if (el) el.style.display = 'none'; });

                    // Expand Viewer to full window
                    const mapContainer = document.getElementById('cesium-container'); // ID is still cesium-container
                    if (mapContainer) {
                        mapContainer.style.position = 'fixed';
                        mapContainer.style.top = '0';
                        mapContainer.style.left = '0';
                        mapContainer.style.width = '100vw';
                        mapContainer.style.height = '100vh';
                        // Force high z-index to be on top
                        mapContainer.style.zIndex = '9999';
                    }

                    window.app.mapManager.resize();
                }, { keyframes, duration, fps });

                // 4. Capture Loop
                const totalFrames = Math.ceil(duration * fps);
                for (let i = 0; i < totalFrames; i++) {
                    // Check cancellation (optional, implies removing job)
                    if (!exportJobs.has(sessionId)) {
                        await browser.close();
                        return;
                    }

                    const time = i / fps;
                    await page.evaluate(async (t) => {
                        window.app.animationController.seekTo(t);
                        // Wait for tiles to load (simple delay for now)
                        await new Promise(r => setTimeout(r, 1000)); // 1 sec wait for tile load
                    }, time);

                    const framePath = path.join(frameDir, `frame_${String(i).padStart(6, '0')}.png`);
                    await page.screenshot({ path: framePath, type: 'png' });

                    // Update Progress
                    const progress = Math.round((i / totalFrames) * 80); // 80% for capture
                    exportJobs.set(sessionId, {
                        ...job,
                        progress: progress,
                        message: `Capturing frame ${i + 1}/${totalFrames}`
                    });
                }

                await browser.close();

                // 5. Encode
                exportJobs.set(sessionId, { ...job, status: 'encoding', progress: 85, message: 'Encoding video...' });
                const outputPath = path.join(TEMP_DIR, `${sessionId}_output.mp4`);
                await encodeVideo(frameDir, outputPath, fps, quality || 'high');

                // 6. Complete
                exportJobs.set(sessionId, {
                    ...job,
                    status: 'completed',
                    progress: 100,
                    message: 'Export complete!',
                    filePath: outputPath
                });

                // Schedule cleanup
                setTimeout(async () => {
                    try {
                        exportJobs.delete(sessionId); // Remove from memory
                        await fs.unlink(outputPath);
                        await fs.rmdir(frameDir, { recursive: true });
                    } catch (e) { }
                }, 300000); // Keep for 5 mins

            } catch (error) {
                console.error(`Job ${sessionId} Failed:`, error);
                exportJobs.set(sessionId, { ...job, status: 'failed', error: error.message });
            }
        })();

    } catch (error) {
        console.error('Server Start Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export Status Endpoint
app.get('/export/server/status/:sessionId', (req, res) => {
    const job = exportJobs.get(req.params.sessionId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

// Export Download Endpoint
app.get('/export/server/download/:sessionId', async (req, res) => {
    const job = exportJobs.get(req.params.sessionId);
    if (!job || job.status !== 'completed' || !job.filePath) {
        return res.status(404).send('File not ready or job not found');
    }
    res.download(job.filePath, `server_export_${req.params.sessionId}.mp4`);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Start server
async function startServer() {
    await ensureTempDir();

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Temp directory: ${TEMP_DIR}`);
    });
}

startServer();
