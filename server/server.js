const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
        await fs.promises.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
        console.error('Failed to create temp directory:', error);
    }
}

// Clean up old temp files
async function cleanupTempFiles(sessionId) {
    try {
        const files = await fs.promises.readdir(TEMP_DIR);
        for (const file of files) {
            if (file.startsWith(sessionId)) {
                await fs.promises.unlink(path.join(TEMP_DIR, file));
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
        await fs.promises.mkdir(frameDir, { recursive: true });
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
                await fs.promises.writeFile(framePath, Buffer.from(frameData, 'base64'));
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

        await fs.promises.writeFile(framePath, buffer);
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
        const videoBuffer = await fs.promises.readFile(outputPath);

        // Send video
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="animation.mp4"`);
        res.send(videoBuffer);

        // Cleanup after delay
        setTimeout(async () => {
            try {
                await fs.promises.unlink(outputPath);
                await fs.promises.rm(frameDir, { recursive: true, force: true });
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
                await fs.promises.rm(frameDir, { recursive: true, force: true });
            } catch (e) { }
        }
    }
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
const { Cluster } = require('puppeteer-cluster');

// ... (Existing code)

// Status Endpoint
// File-based session storage
const SESSION_FILE = path.join(__dirname, 'sessions.json');

function saveSession(sessionId, data) {
    console.log(`[saveSession] Saving session ${sessionId} to ${SESSION_FILE}`);
    let sessions = {};
    if (fs.existsSync(SESSION_FILE)) {
        try {
            sessions = JSON.parse(fs.readFileSync(SESSION_FILE));
            console.log(`[saveSession] Loaded existing sessions:`, Object.keys(sessions));
        } catch (e) {
            console.error(`[saveSession] Error reading existing file:`, e.message);
        }
    } else {
        console.log(`[saveSession] No existing session file, creating new`);
    }
    sessions[sessionId] = data;
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
        console.log(`[saveSession] Successfully wrote session ${sessionId}`);
    } catch (e) {
        console.error(`[saveSession] Error writing file:`, e.message);
    }
}

function getSession(sessionId) {
    console.log(`[getSession] Looking for session ${sessionId} in ${SESSION_FILE}`);
    if (fs.existsSync(SESSION_FILE)) {
        console.log(`[getSession] File exists, reading...`);
        try {
            const sessions = JSON.parse(fs.readFileSync(SESSION_FILE));
            console.log(`[getSession] Found sessions:`, Object.keys(sessions));
            const result = sessions[sessionId];
            console.log(`[getSession] Session ${sessionId} found:`, !!result);
            return result;
        } catch (e) {
            console.error(`[getSession] Error reading file:`, e.message);
        }
    } else {
        console.log(`[getSession] File does not exist`);
    }
    return null;
}

// Hybrid Parallel Export Endpoint
app.get('/export/server/check', (req, res) => {
    res.sendStatus(200);
});

app.post('/export/server/hybrid-start', async (req, res) => {
    console.log('=== HYBRID START CALLED ===', Date.now());
    try {
        const { keyframes, duration, fps, resolution, quality, concurrency, waitTime } = req.body;
        const sessionId = Date.now().toString();
        console.log(`Session ID generated: ${sessionId}`);
        const frameDir = path.join(TEMP_DIR, sessionId);
        await fs.promises.mkdir(frameDir, { recursive: true });

        const Width = parseInt(resolution.split('x')[0]);
        const Height = parseInt(resolution.split('x')[1]);
        const totalFrames = Math.ceil(duration * fps);
        const maxConcurrency = concurrency || 4; // Default to 4 workers
        const captureDelay = waitTime || 500; // Default to 500ms

        console.log(`About to launch Puppeteer Cluster with ${maxConcurrency} workers and ${captureDelay}ms delay...`);
        // Initialize Cluster
        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: maxConcurrency, 
            puppeteerOptions: {
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=egl']
            }
        });

        const status = {
            progress: 0,
            status: 'processing',
            message: 'Starting parallel capture...',
            frames: [],
            totalFrames: totalFrames
        };
        
        // Save to file
        saveSession(sessionId, status);
        console.log(`Created session: ${sessionId}, Total Frames: ${totalFrames}`);

        // Define task
        await cluster.task(async ({ page, data }) => {
            const { frameIndex, time } = data;
            
            try {
                console.log(`[Task ${frameIndex}] Starting frame capture at time ${time}s`);
                
                // Setup page
                await page.setViewport({ width: Width, height: Height });
                console.log(`[Task ${frameIndex}] Viewport set`);
                
                await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });
                console.log(`[Task ${frameIndex}] Page loaded`);

                await page.evaluate((kfs, t) => {
                    if (window.app) {
                        // Hide all UI elements
                        const uiElements = document.querySelectorAll('#property-panel, #timeline-panel, #top-bar, .dialog, .leaflet-control-container, #btn-toggle-mask');
                        uiElements.forEach(el => { if (el) el.style.display = 'none'; });
                        
                        // Expand map to full viewport
                        const mapContainer = document.getElementById('cesium-container');
                        if (mapContainer) {
                            mapContainer.style.position = 'fixed';
                            mapContainer.style.top = '0';
                            mapContainer.style.left = '0';
                            mapContainer.style.width = '100vw';
                            mapContainer.style.height = '100vh';
                            mapContainer.style.zIndex = '9999';
                        }
                        
                        window.app.keyframeManager.setKeyframes(kfs);
                        window.app.mapManager.resize();
                        const cameraData = window.app.keyframeManager.interpolateAt(t);
                        window.app.mapManager.setCameraPosition(cameraData, false);
                    }
                }, keyframes, time);
                console.log(`[Task ${frameIndex}] State injected and UI hidden`);

                // Wait for tiles to load
                await new Promise(resolve => setTimeout(resolve, captureDelay));

                const fileName = `frame_${String(frameIndex).padStart(6, '0')}.png`;
                const filePath = path.join(frameDir, fileName);
                await page.screenshot({ path: filePath, type: 'png' });
                
                console.log(`[Frame ${frameIndex}] Captured: ${fileName}`);
                
                // Update status
                status.frames.push({ index: frameIndex, path: filePath });
                status.progress = (status.frames.length / totalFrames) * 100;
                status.message = `Captured ${status.frames.length}/${totalFrames} frames`;
                
                // Debounce file save? No, let's just save.
                saveSession(sessionId, status);
                
            } catch (error) {
                console.error(`[Task ${frameIndex}] Error:`, error.message);
                throw error; // Re-throw to let cluster handle it
            }
        });

        // Queue tasks
        for (let i = 0; i < totalFrames; i++) {
            const time = i / fps;
            cluster.queue({ frameIndex: i, time: time });
        }

        // Monitoring and Encoding
        (async () => {
            try {
                await cluster.idle();
                await cluster.close();
                
                // Update status: encoding
                status.status = 'encoding';
                status.progress = 90;
                status.message = 'Encoding video with ffmpeg...';
                saveSession(sessionId, status);
                console.log(`Encoding video for session ${sessionId}...`);
                
                // Encode with ffmpeg
                const outputPath = path.join(TEMP_DIR, `${sessionId}_output.mp4`);
                await encodeVideo(frameDir, outputPath, fps, quality || 'high');
                
                // Complete
                status.status = 'completed';
                status.progress = 100;
                status.message = 'Export complete! Ready for download.';
                status.downloadUrl = `/export/server/download/${sessionId}`;
                status.filePath = outputPath;
                saveSession(sessionId, status);
                console.log(`Session ${sessionId} completed successfully`);
                
                // Schedule cleanup (keep for 10 minutes)
                setTimeout(async () => {
                    try {
                        await fs.promises.unlink(outputPath);
                        await fs.promises.rm(frameDir, { recursive: true, force: true });
                        console.log(`Cleaned up session ${sessionId}`);
                    } catch (e) {
                        console.error(`Cleanup error for ${sessionId}:`, e);
                    }
                }, 600000);
                
            } catch (error) {
                console.error(`Encoding error for session ${sessionId}:`, error);
                status.status = 'error';
                status.message = `Encoding failed: ${error.message}`;
                saveSession(sessionId, status);
            }
        })();

        res.json({ sessionId });

    } catch (error) {
        console.error('Hybrid export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Status Endpoint
app.get('/export/server/status/:sessionId', (req, res) => {
    console.log(`Checking status for session: ${req.params.sessionId}`);
    
    const status = getSession(req.params.sessionId);
    if (status) {
        res.json(status);
    } else {
        let sessions = {};
        if (fs.existsSync(SESSION_FILE)) {
             try {
                sessions = JSON.parse(fs.readFileSync(SESSION_FILE));
             } catch (e) {}
        }
        const debugKeys = Object.keys(sessions).join(',');
        res.status(404).json({ 
            error: `Session not found in file. Requested: ${req.params.sessionId}, Existing: [${debugKeys}]`,
            debug_sessionId: req.params.sessionId,
            debug_existingKeys: debugKeys
        });
    }
});

// Download Endpoint
app.get('/export/server/download/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    const status = getSession(sessionId);
    
    if (!status || status.status !== 'completed' || !status.filePath) {
        return res.status(404).json({ error: 'Video not ready or session not found' });
    }
    
    try {
        res.download(status.filePath, `OSMStudio_${sessionId}.mp4`);
    } catch (error) {
        console.error(`Download error for ${sessionId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Frames List Endpoint (for client to fetch)
app.get('/export/server/frames/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    const frameDir = path.join(TEMP_DIR, sessionId);
    try {
        const files = await fs.promises.readdir(frameDir);
        const frames = files.filter(f => f.endsWith('.png')).sort();
        // Return URLs
        const urls = frames.map(f => `/export/server/file/${sessionId}/${f}`);
        res.json({ frames: urls });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve Frame File
app.get('/export/server/file/:sessionId/:filename', async (req, res) => {
    const { sessionId, filename } = req.params;
    const filePath = path.join(TEMP_DIR, sessionId, filename);
    res.sendFile(filePath);
});
