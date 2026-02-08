// Main Application Entry Point
import MapManager from './map-manager.js';
import { KeyframeManager } from './keyframe-manager.js';
import TimelineEditor from './timeline-editor.js';
import AnimationController from './animation-controller.js';
import PropertyPanel from './property-panel.js';
import VideoExporter from './video-exporter.js';
import PathManager from './path-manager.js';

class App {
    constructor() {
        this.init();
    }

    async init() {
        try {
            // Initialize managers
            this.keyframeManager = new KeyframeManager();
            this.mapManager = new MapManager('cesium-container');
            this.pathManager = new PathManager(this.mapManager);

            // Initialize Map viewer
            await this.mapManager.initialize();
            console.log('Map viewer initialized');

            // Initialize timeline
            this.timelineEditor = new TimelineEditor('timeline-canvas', this.keyframeManager, this.pathManager, 10);

            // Initialize animation controller
            this.animationController = new AnimationController(
                this.keyframeManager,
                this.mapManager,
                this.timelineEditor,
                this.pathManager
            );

            // Initialize property panel
            this.propertyPanel = new PropertyPanel(
                this.keyframeManager,
                this.mapManager,
                this.animationController,
                this.pathManager
            );

            // Initialize video exporter
            this.videoExporter = new VideoExporter(
                this.mapManager,
                this.animationController,
                this.keyframeManager
            );

            // Path visualizer removed for 2D map

            // Setup UI controls
            this.setupControls();
            this.setupProjectControls();

            // Force map resize after layout is complete
            setTimeout(() => {
                if (this.mapManager) {
                    console.log('Forcing map resize after layout...');
                    this.mapManager.resize();
                }
            }, 100);

            // Setup Keyboard shortcuts
            this.setupKeyboardShortcuts();

            // Add some default keyframes for demo
            this.addDemoKeyframes();

            console.log('Application initialized successfully');

            this.setupFullscreenPreview();

        } catch (error) {
            console.error('Initialization error:', error);
             alert('初期化エラー: ' + error.message + '\n\nコンソールで詳細を確認してください。');
        }
    }

    setupFullscreenPreview() {
        const fullscreenBtn = document.getElementById("btn-fullscreen");
        const container = document.getElementById("cesium-container");

        if (!fullscreenBtn || !container) return;

        let fullscreenActive = false;

        fullscreenBtn.addEventListener("click", async () => {
            if (!document.fullscreenElement) {
                await container.requestFullscreen();
            }

            document.body.classList.add("fullscreen-preview");
            fullscreenActive = true;

            // 8秒待ってからアニメーション開始 (optional)
            // setTimeout(() => {
            //     this.animationController.playFromStart();
            // }, 8000);
        });

        container.addEventListener("click", () => {
            if (!fullscreenActive) return;
            this.animationController.playFromStart();
        });

        this.animationController.on("finished", () => {
             // Optional auto-exit
        });

        document.addEventListener("fullscreenchange", () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove("fullscreen-preview");
                fullscreenActive = false;
            }
        });
    }

    setupControls() {
        // Playback controls
        const btnPlay = document.getElementById('btn-play');
        const btnPause = document.getElementById('btn-pause');
        const btnStop = document.getElementById('btn-stop');
        const btnStepBack = document.getElementById('btn-step-back');
        const btnStepForward = document.getElementById('btn-step-forward');

        btnPlay.addEventListener('click', () => {
            this.animationController.play();
            btnPlay.disabled = true;
            btnPause.disabled = false;
        });

        btnPause.addEventListener('click', () => {
            this.animationController.pause();
            btnPlay.disabled = false;
            btnPause.disabled = true;
        });

        btnStop.addEventListener('click', () => {
            this.animationController.stop();
            btnPlay.disabled = false;
            btnPause.disabled = true;
        });

        btnStepBack.addEventListener('click', () => {
            this.animationController.stepBackward();
        });

        btnStepForward.addEventListener('click', () => {
            this.animationController.stepForward();
        });

        // Video preview toggle
        const btnToggleMask = document.getElementById('btn-toggle-mask');
        let maskVisible = false;

        btnToggleMask.addEventListener('click', () => {
            maskVisible = !maskVisible;
            this.mapManager.toggleAspectMask(maskVisible);
            btnToggleMask.classList.toggle('active', maskVisible);

            // Handle resize to keep mask correct
            if (maskVisible) {
                window.addEventListener('resize', () => {
                    if (maskVisible) this.mapManager.updateAspectMask(16, 9);
                });
            }
        });

        // Timeline settings
        const selectFPS = document.getElementById('select-fps');
        const inputDuration = document.getElementById('input-duration');

        selectFPS.addEventListener('change', (e) => {
            const fps = parseInt(e.target.value);
            this.animationController.setFPS(fps);
        });

        inputDuration.addEventListener('change', (e) => {
            const duration = parseFloat(e.target.value);
            this.animationController.setDuration(duration);
            if (this.timelineEditor) {
                this.timelineEditor.setDuration(duration);
            }
        });

        // Progress slider
        const progressSlider = document.getElementById('progress-slider');
        progressSlider.addEventListener('input', (e) => {
            const progress = parseFloat(e.target.value) / 1000;
            const time = progress * this.animationController.duration;
            this.animationController.seekTo(time);
        });

        // Update progress slider during playback
        this.animationController.on('timeUpdate', (data) => {
            const progress = (data.time / this.animationController.duration) * 1000;
            progressSlider.value = progress;

            // Update time display
            const currentTimeEl = document.getElementById('current-time');
            const minutes = Math.floor(data.time / 60);
            const seconds = Math.floor(data.time % 60);
            const ms = Math.floor((data.time % 1) * 1000);
            currentTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
        });

        // Update total time display
        const updateTotalTime = () => {
            const totalTimeEl = document.getElementById('total-time');
            const duration = this.animationController.duration;
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            const ms = Math.floor((duration % 1) * 1000);
            totalTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
        };

        updateTotalTime();
        inputDuration.addEventListener('change', updateTotalTime);

        this.setupSplitter();
    }

    setupSplitter() {
        const splitter = document.getElementById('timeline-splitter');
        const timelinePanel = document.getElementById('timeline-panel');
        const appContainer = document.getElementById('app-container');
        
        if (!splitter || !timelinePanel) {
            console.error('Splitter or timeline panel not found!');
            return;
        }
        
        console.log('Timeline panel initial height:', timelinePanel.offsetHeight);
        
        let isDragging = false;
        let startY = 0;
        let startHeight = 0;

        const onStart = (clientY) => {
            isDragging = true;
            startY = clientY;
            startHeight = timelinePanel.offsetHeight;
            document.body.style.cursor = 'row-resize';
        };

        const onMove = (clientY) => {
            if (!isDragging) return;
            const deltaY = startY - clientY;
            const newHeight = Math.max(100, Math.min(window.innerHeight - 100, startHeight + deltaY));
            timelinePanel.style.height = `${newHeight}px`;
            
            if (this.mapManager && this.mapManager.map) {
                this.mapManager.map.invalidateSize();
            }
            if (this.timelineEditor) {
                this.timelineEditor.resizeCanvas();
            }
        };

        const onEnd = () => {
             if (isDragging) {
                isDragging = false;
                document.body.style.cursor = 'default';
             }
        };

        // Mouse Events
        splitter.addEventListener('mousedown', (e) => {
            onStart(e.clientY);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => onMove(e.clientY));
        document.addEventListener('mouseup', onEnd);

        // Touch Events
        splitter.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                onStart(e.touches[0].clientY);
                // Don't preventDefault here to allow scrolling if needed, 
                // but for a splitter drag, we usually want to prevent other actions.
                e.preventDefault(); 
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length > 0) {
                onMove(e.touches[0].clientY);
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('touchend', onEnd);
    }

    setupProjectControls() {
        const btnSave = document.getElementById('btn-save-project');
        const btnLoad = document.getElementById('btn-load-project');
        const inputLoad = document.getElementById('input-load-project');

        // Save Project
        btnSave.addEventListener('click', () => {
            const data = {
                version: 2.0, // Updated version
                timestamp: Date.now(),
                duration: this.animationController.duration,
                fps: this.animationController.fps,
                keyframes: this.keyframeManager.getAllKeyframes()
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `earth_studio_project_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        // Load Project
        btnLoad.addEventListener('click', () => inputLoad.click());

        inputLoad.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);

                    if (data.keyframes) {
                        this.keyframeManager.importFromJSON(data);
                    }
                    if (data.duration) {
                        this.animationController.setDuration(data.duration);
                        document.getElementById('input-duration').value = data.duration;
                    }
                    if (data.fps) {
                        this.animationController.setFPS(data.fps);
                        document.getElementById('select-fps').value = data.fps;
                    }

                    // Seek to start
                    this.animationController.seekTo(0);

                    alert('プロジェクトを読み込みました');
                } catch (error) {
                    console.error('Project load error:', error);
                    alert('ファイルの読み込みに失敗しました: ' + error.message);
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset input
        });
    }

    addDemoKeyframes() {
        // Add demo keyframes to showcase the system
        import('./keyframe-manager.js').then(module => {
            // Keyframe 1: Tokyo Tower
            const kf1 = new module.Keyframe(0, {
                latitude: 35.6586,
                longitude: 139.7454,
                zoom: 16
            }, 'easeInOut');

            // Keyframe 2: Zoom out
            const kf2 = new module.Keyframe(3, {
                latitude: 35.6586,
                longitude: 139.7454,
                zoom: 13
            }, 'easeInOut');

            // Keyframe 3: Move to Shibuya
            const kf3 = new module.Keyframe(6, {
                latitude: 35.6595,
                longitude: 139.7004,
                zoom: 15
            }, 'easeInOut');

            // Keyframe 4: Final position
            const kf4 = new module.Keyframe(10, {
                latitude: 35.6762,
                longitude: 139.6503,
                zoom: 12
            }, 'easeInOut');

            this.keyframeManager.addKeyframe(kf1);
            this.keyframeManager.addKeyframe(kf2);
            this.keyframeManager.addKeyframe(kf3);
            this.keyframeManager.addKeyframe(kf4);

            console.log('Demo keyframes added');
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if input focused
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (this.animationController.getIsPlaying()) {
                        this.animationController.pause();
                        // Update buttons
                        document.getElementById('btn-play').disabled = false;
                        document.getElementById('btn-pause').disabled = true;
                    } else {
                        this.animationController.play();
                        // Update buttons
                        document.getElementById('btn-play').disabled = true;
                        document.getElementById('btn-pause').disabled = false;
                    }
                    break;

                case 'Home':
                    e.preventDefault();
                    this.animationController.stop();
                    // Update buttons
                    document.getElementById('btn-play').disabled = false;
                    document.getElementById('btn-pause').disabled = true;
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    this.animationController.stepBackward();
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    this.animationController.stepForward();
                    break;
            }
        });
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
} else {
    window.app = new App();
}

