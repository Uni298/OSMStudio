
// Animation Controller - Handles playback
export class AnimationController {
    constructor(keyframeManager, mapManager, timelineEditor, pathManager) {
        this.keyframeManager = keyframeManager;
        this.mapManager = mapManager;
        this.timelineEditor = timelineEditor;
        this.pathManager = pathManager;

        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 10;
        this.fps = 30;
        this.frameInterval = 1000 / this.fps;
        this.lastFrameTime = 0;
        this.playInterval = null;
        this.loop = false;

        this.listeners = {
            'play': [],
            'pause': [],
            'stop': [],
            'timeUpdate': [],
            'frameUpdate': [],
            'finished': []
        };
    }

    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.playStartTime = Date.now() - this.currentTime * 1000;

        // Disable camera controls during playback
        this.mapManager.enableCameraControls(false);

        this.playInterval = setInterval(() => {
            const now = Date.now();
            this.currentTime = (now - this.playStartTime) / 1000;

            if (this.currentTime >= this.duration) {
                if (this.loop) {
                    this.playStartTime = now;
                    this.currentTime = 0;
                } else {
                    this.currentTime = this.duration;
                    this.pause();
                }
            }

            this.updateCamera();
            this.timelineEditor.updatePlayhead(this.currentTime);
            if (this.pathManager) this.pathManager.updateTime(this.currentTime);
            this.emit('frameUpdate', { time: this.currentTime });
        }, this.frameInterval); // 30 FPS

        this.emit('play', { time: this.currentTime });
    }

    pause() {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        clearInterval(this.playInterval);

        // Re-enable camera controls
        this.mapManager.enableCameraControls(true);

        this.emit('pause', { time: this.currentTime });
    }

    stop() {
        this.pause();
        this.currentTime = 0;
        this.updateCamera();
        this.timelineEditor.updatePlayhead(this.currentTime);
        this.emit('stop', { time: this.currentTime });
    }

    // Seek to specific time
    seekTo(time) {
        this.currentTime = Math.max(0, Math.min(time, this.duration));
        this.updateCamera();
        this.timelineEditor.updatePlayhead(this.currentTime);
        if (this.pathManager) this.pathManager.updateTime(this.currentTime);
        this.emit('timeUpdate', { time: this.currentTime });
    }

    // Update camera based on current time
    updateCamera() {
        const cameraData = this.keyframeManager.interpolateAt(this.currentTime);
        if (cameraData) {
            // Use animate:false for timeline playback to ensure synchronization
            // flyTo (animate:true) is used for manual property updates
            this.mapManager.setCameraPosition(cameraData, false);
        }
    }

    setDuration(duration) {
        this.duration = duration;
    }

    toggleLoop() {
        this.loop = !this.loop;
        return this.loop;
    }

    getIsPlaying() {
        return this.isPlaying;
    }

    setFPS(fps) {
        this.fps = fps;
        this.frameInterval = 1000 / this.fps;
    }
}

export default AnimationController;
