// Timeline Editor - Visual timeline with keyframe markers
export class TimelineEditor {
    constructor(canvasId, keyframeManager, pathManager, duration = 10) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.keyframeManager = keyframeManager;
        this.pathManager = pathManager;
        this.duration = duration; // Total duration in seconds
        this.currentTime = 0;
        this.fps = 30;

        // Visual settings
        this.isDragging = false;
        this.draggedKeyframe = null;
        this.playheadDragging = false;
        this.currentTrackHeight = 24;
        this.currentTrackSpacing = 4;

        // Colors
        this.colors = {
            background: '#141824',
            ruler: '#9aa0a6',
            grid: 'rgba(255, 255, 255, 0.05)',
            snapGrid: 'rgba(255, 255, 255, 0.1)',
            playhead: '#4a9eff',
            keyframe: '#00d084',
            keyframeSelected: '#7b61ff',
            keyframeHover: '#4a9eff',
            pathBar: 'rgba(255, 255, 255, 0.2)',
            pathBarSelected: 'rgba(74, 158, 255, 0.4)',
            pathBarHover: 'rgba(255, 255, 255, 0.3)',
            pathText: '#ffffff'
        };

        this.hoveredKeyframe = null;

        this.setupCanvas();
        this.bindEvents();
        this.render();

        // Listen to keyframe changes
        this.keyframeManager.on('keyframesChanged', () => this.render());
        this.keyframeManager.on('keyframeSelected', () => this.render());
        
        // Listen to path changes
        if (this.pathManager) {
            this.pathManager.on('pathsChanged', () => this.render());
            this.pathManager.on('pathUpdated', () => this.render());
            this.pathManager.on('pathSelected', () => this.render());
        }
    }

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    bindEvents() {
        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));

        // Touch Events (iPad Support)
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Touch Event Handlers
    onTouchStart(e) {
        if (e.touches.length > 0) {
            e.preventDefault(); // Prevent scrolling
            const touch = e.touches[0];
            const mockEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0,
                shiftKey: e.shiftKey || false,
                ctrlKey: e.ctrlKey || false
            };
            this.onMouseDown(mockEvent);
        }
    }

    onTouchMove(e) {
        if (e.touches.length > 0) {
            e.preventDefault(); // Prevent scrolling
            const touch = e.touches[0];
            const mockEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                shiftKey: e.shiftKey || false,
                ctrlKey: e.ctrlKey || false
            };
            this.onMouseMove(mockEvent);
        }
    }

    onTouchEnd(e) {
        // Note: touchend doesn't usually have touches list for the ended touch
        const mockEvent = {};
        this.onMouseUp(mockEvent);
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 1. Check Playhead
        const playheadX = this.timeToX(this.currentTime);
        if (Math.abs(x - playheadX) < 15 && y < 60) { // Check top ruler area
            this.playheadDragging = true;
            return;
        }

        // 2. Check Keyframes
        const keyframes = this.keyframeManager.getAllKeyframes();
        for (const kf of keyframes) {
            const kfX = this.timeToX(kf.time);
            const kfY = 40; // Fixed Y for keyframes

            if (Math.abs(x - kfX) < 20 && Math.abs(y - kfY) < 20) {
                this.isDragging = true;
                this.draggedKeyframe = kf;
                this.keyframeManager.selectKeyframe(kf);
                return;
            }
        }
        
        // 3. Check Paths
        if (this.pathManager) {
            const paths = this.pathManager.paths;
            const trackHeight = this.currentTrackHeight || 24;
            const spacing = this.currentTrackSpacing || 4;
            const startY = 70;
            
            for (let i = 0; i < paths.length; i++) {
                const path = paths[i];
                const pathY = startY + (i * (trackHeight + spacing));
                const startX = this.timeToX(path.startTime);
                const endX = this.timeToX(path.endTime);
                
                // Hit test rect
                if (y >= pathY && y <= pathY + trackHeight && x >= startX - 5 && x <= endX + 5) {
                    this.isDragging = true;
                    this.draggedPath = path;
                    
                    // Determine Action: Resize Left, Resize Right, or Move
                    if (Math.abs(x - startX) < 10) {
                        this.dragAction = 'resizeLeft';
                    } else if (Math.abs(x - endX) < 10) {
                        this.dragAction = 'resizeRight';
                    } else {
                        this.dragAction = 'move';
                        this.dragStartX = x;
                        this.dragOriginalStart = path.startTime;
                    }
                    
                    this.pathManager.selectPath(path);
                    return;
                }
            }
        }

        // 4. Click on timeline to seek
        if (y < 60) { // Only seek if clicked in ruler/keyframe area
            let time = this.xToTime(x);
            let snapFrames = 1;
            if (e.shiftKey) snapFrames = 10;
            if (e.ctrlKey) snapFrames = this.fps;

            time = this.snapTime(time, snapFrames);
            this.setCurrentTime(time);
            this.playheadDragging = true;
        }
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Dragging Logic
        if (this.playheadDragging) {
            let time = Math.max(0, Math.min(this.duration, this.xToTime(x)));
            this.setCurrentTime(this.snapTime(time, e.shiftKey ? 10 : 1));
            return;
        }
        
        if (this.isDragging) {
            if (this.draggedKeyframe) {
                 let time = Math.max(0, Math.min(this.duration, this.xToTime(x)));
                 this.keyframeManager.updateKeyframe(this.draggedKeyframe, { time: this.snapTime(time, e.shiftKey ? 10 : 1) });
            } else if (this.draggedPath) {
                // Path Dragging
                let time = this.xToTime(x);
                // Snap
                time = this.snapTime(time, e.shiftKey ? 10 : 1);
                
                if (this.dragAction === 'resizeLeft') {
                    // Update start time, but keep < end time
                    const newStart = Math.min(time, this.draggedPath.endTime - 0.1);
                    this.pathManager.updatePathProperties(this.draggedPath, { startTime: newStart });
                } else if (this.dragAction === 'resizeRight') {
                     // Update end time, but keep > start time
                    const newEnd = Math.max(time, this.draggedPath.startTime + 0.1);
                    this.pathManager.updatePathProperties(this.draggedPath, { endTime: newEnd });
                } else if (this.dragAction === 'move') {
                    // Calculate delta
                    const timeDelta = this.xToTime(x) - this.xToTime(this.dragStartX);
                    const newStart = Math.max(0, this.dragOriginalStart + timeDelta);
                    const duration = this.draggedPath.endTime - this.draggedPath.startTime;
                    
                    this.pathManager.updatePathProperties(this.draggedPath, { 
                        startTime: newStart,
                        endTime: newStart + duration
                    });
                }
            }
            return;
        }

        // Hover Logic
        this.hoveredKeyframe = null;
        this.hoveredPath = null;
        this.canvas.style.cursor = 'default';
        
        // Check Keyframes
        const keyframes = this.keyframeManager.getAllKeyframes();
        for (const kf of keyframes) {
             const kfX = this.timeToX(kf.time);
             if (Math.abs(x - kfX) < 10 && Math.abs(y - 40) < 10) {
                 this.hoveredKeyframe = kf;
                 this.canvas.style.cursor = 'pointer';
                 break;
             }
        }
        
        // Check Paths
        if (!this.hoveredKeyframe && this.pathManager) {
            const paths = this.pathManager.paths;
            const trackHeight = this.currentTrackHeight || 24;
            const spacing = this.currentTrackSpacing || 4;
            const startY = 70;
             for (let i = 0; i < paths.length; i++) {
                const path = paths[i];
                const pathY = startY + (i * (trackHeight + spacing));
                const startX = this.timeToX(path.startTime);
                const endX = this.timeToX(path.endTime);
                
                if (y >= pathY && y <= pathY + trackHeight && x >= startX - 5 && x <= endX + 5) {
                    this.hoveredPath = path;
                    
                    if (Math.abs(x - startX) < 10 || Math.abs(x - endX) < 10) {
                        this.canvas.style.cursor = 'ew-resize';
                    } else {
                        this.canvas.style.cursor = 'grab';
                    }
                    break;
                }
            }
        }
        
        this.render();
    }

    onMouseUp(e) {
        this.isDragging = false;
        this.draggedKeyframe = null;
        this.draggedPath = null;
        this.dragAction = null;
        this.playheadDragging = false;
        this.canvas.style.cursor = 'default';
    }

    onWheel(e) {
        // Disabled scrolling/zooming as per request to "squeeze fit"
        e.preventDefault();
    }

    // Snap time to nearest frame interval
    snapTime(time, frames = 1) {
        const frameDuration = 1 / this.fps;
        const interval = frameDuration * frames;

        // Strong snap to whole seconds
        if (Math.abs(time - Math.round(time)) < 0.15) {
            return Math.round(time);
        }

        return Math.round(time / interval) * interval;
    }

    // Force update playhead position (sync with animation)
    updatePlayhead(time) {
        this.currentTime = time;
        this.render();
    } // No auto-scroll logic needed

    timeToX(time) {
        // Fixed fit-to-width calculation
        const padding = 40; // 20px left + 20px right
        const usableWidth = this.canvas.width - padding;
        const pixelsPerSecond = usableWidth / this.duration;
        return 20 + time * pixelsPerSecond;
    }

    xToTime(x) {
        const padding = 40;
        const usableWidth = this.canvas.width - padding;
        const pixelsPerSecond = usableWidth / this.duration;
        return (x - 20) / pixelsPerSecond;
    }

    setCurrentTime(time) {
        this.currentTime = Math.max(0, Math.min(this.duration, time));
        this.render();

        // Emit event for other components
        const event = new CustomEvent('timelineSeek', { detail: { time: this.currentTime } });
        window.dispatchEvent(event);
    }

    setDuration(duration) {
        this.duration = duration;
        this.render();
    }

    setFPS(fps) {
        this.fps = fps;
        this.render();
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        this.drawGrid();

        // Draw time ruler
        this.drawRuler();

        // Draw keyframes
        this.drawKeyframes();

        // Draw Paths
        this.drawPaths();
        
        // Draw playhead
        this.drawPlayhead();
    }

    // Scrollbar method removed


    drawGrid() {
        const ctx = this.ctx;
        const height = this.canvas.height;

        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;

        // Vertical grid lines (every second)
        for (let i = 0; i <= this.duration; i++) {
            const x = this.timeToX(i);
            if (x >= 0 && x <= this.canvas.width) {
                ctx.beginPath();
                ctx.moveTo(x, 30);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
        }
    }

    drawRuler() {
        const ctx = this.ctx;
        const width = this.canvas.width;

        ctx.fillStyle = this.colors.ruler;
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';

        // Draw time markers
        for (let i = 0; i <= this.duration; i++) {
            const x = this.timeToX(i);
            if (x >= 0 && x <= width) {
                // Draw tick
                ctx.beginPath();
                ctx.moveTo(x, 20);
                ctx.lineTo(x, 30);
                ctx.stroke();

                // Draw time label
                const minutes = Math.floor(i / 60);
                const seconds = i % 60;
                const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                ctx.fillText(label, x, 15);
            }
        }

        // Draw frame markers (smaller ticks)
        const frameInterval = 1 / this.fps;
        for (let t = 0; t <= this.duration; t += frameInterval) {
            const x = this.timeToX(t);
            if (x >= 0 && x <= width) {
                ctx.beginPath();
                ctx.moveTo(x, 25);
                ctx.lineTo(x, 30);
                ctx.strokeStyle = 'rgba(154, 160, 166, 0.3)';
                ctx.stroke();
            }
        }
    }

    drawKeyframes() {
        const ctx = this.ctx;
        const keyframes = this.keyframeManager.getAllKeyframes();
        const y = 40; // Keyframes at top track

        keyframes.forEach(kf => {
            const x = this.timeToX(kf.time);

            if (x < 0 || x > this.canvas.width) return;

            // Determine color
            let color = this.colors.keyframe;
            if (kf === this.keyframeManager.selectedKeyframe) {
                color = this.colors.keyframeSelected;
            } else if (kf === this.hoveredKeyframe) {
                color = this.colors.keyframeHover;
            }

            // Draw different shapes based on interpolation type
            ctx.fillStyle = color;
            ctx.beginPath();

            const size = 12; // Increased size

            switch (kf.interpolationType) {
                case 'linear':
                    // Diamond (◆)
                    ctx.moveTo(x, y - size);
                    ctx.lineTo(x + size, y);
                    ctx.lineTo(x, y + size);
                    ctx.lineTo(x - size, y);
                    break;

                case 'easeIn':
                    // Triangle Right (▶)
                    ctx.moveTo(x - size + 4, y - size);
                    ctx.lineTo(x + size - 2, y);
                    ctx.lineTo(x - size + 4, y + size);
                    break;

                case 'easeOut':
                    // Triangle Left (◀)
                    ctx.moveTo(x + size - 4, y - size);
                    ctx.lineTo(x - size + 2, y);
                    ctx.lineTo(x + size - 4, y + size);
                    break;

                case 'bezier':
                    // Square (■)
                    ctx.rect(x - size + 2, y - size + 2, (size - 2) * 2, (size - 2) * 2);
                    break;

                case 'easeInOut':
                default:
                    // Circle (●)
                    ctx.arc(x, y, size - 2, 0, Math.PI * 2);
                    break;
            }

            ctx.closePath();
            ctx.fill();

            // Draw outline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }

    drawPaths() {
        if (!this.pathManager) return;
        
        const ctx = this.ctx;
        const paths = this.pathManager.paths;
        
        // Dynamic Height Calculation
        const headerHeight = 70; // Keyframes area + buffer
        const availableHeight = this.canvas.height - headerHeight - 10; // 10px padding bottom
        
        let trackHeight = 24;
        let spacing = 4;
        
        if (paths.length > 0) {
            // Calculate ideal height to fit all
            const totalRequired = paths.length * (trackHeight + spacing);
            
            if (totalRequired > availableHeight) {
                // Shrink!
                const availablePerTrack = availableHeight / paths.length;
                trackHeight = Math.max(4, availablePerTrack - spacing); // Min 4px
                spacing = 2; // Reduce spacing
            }
        }
        
        this.currentTrackHeight = trackHeight; // Store for hit testing
        this.currentTrackSpacing = spacing;
        
        const startY = headerHeight; 
        
        paths.forEach((path, index) => {
            const y = startY + (index * (trackHeight + spacing));
            
            // Calculate X based on start/end
            const startX = this.timeToX(path.startTime);
            const endX = this.timeToX(path.endTime);
            const width = Math.max(2, endX - startX);
            
            // Skip if out of view
            if (endX < 0 || startX > this.canvas.width) return;
            
            // Draw Bar
            ctx.fillStyle = (path === this.pathManager.activePath) ? 
                            this.colors.pathBarSelected : this.colors.pathBar;
                            
            if (path === this.hoveredPath) {
                ctx.fillStyle = this.colors.pathBarHover;
            }
            
            // Rounded rect
            ctx.beginPath();
            // Fallback for roundRect in older context/browsers if needed, but modern browsers support it
            if (ctx.roundRect) {
                ctx.roundRect(startX, y, width, trackHeight, trackHeight > 10 ? 4 : 1);
            } else {
                ctx.rect(startX, y, width, trackHeight);
            }
            ctx.fill();
            
            // Draw Fade markers (simple lines for now)
            if (path.fadeDuration > 0) {
                const fadeOneX = this.timeToX(path.startTime + path.fadeDuration);
                const fadeTwoX = this.timeToX(path.endTime - path.fadeDuration);
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                
                if (fadeOneX > startX && fadeOneX < endX) {
                    ctx.beginPath();
                    ctx.moveTo(startX, y + trackHeight);
                    ctx.lineTo(fadeOneX, y);
                    ctx.lineTo(startX, y);
                    ctx.fill();
                }
                
                if (fadeTwoX < endX && fadeTwoX > startX) {
                    ctx.beginPath();
                    ctx.moveTo(endX, y + trackHeight);
                    ctx.lineTo(fadeTwoX, y);
                    ctx.lineTo(endX, y);
                    ctx.fill();
                }
            }
            
            // Outline
            ctx.strokeStyle = path.color || '#fff';
            ctx.lineWidth = trackHeight > 10 ? 2 : 1;
            ctx.stroke();
            
            // Text (Only if height is enough)
            if (trackHeight > 12) {
                ctx.fillStyle = this.colors.pathText;
                ctx.font = `${Math.min(10, trackHeight - 2)}px Inter, sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                
                // Clip text
                ctx.save();
                ctx.beginPath();
                ctx.rect(startX, y, width, trackHeight);
                ctx.clip();
                ctx.fillText(path.name, startX + 5, y + trackHeight/2);
                ctx.restore();
            }
        });
    }

    drawPlayhead() {
        const ctx = this.ctx;
        const x = this.timeToX(this.currentTime);
        const height = this.canvas.height;

        // Draw line
        ctx.strokeStyle = this.colors.playhead;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 30);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Draw handle
        ctx.fillStyle = this.colors.playhead;
        ctx.beginPath();
        ctx.arc(x, 30, 6, 0, Math.PI * 2);
        ctx.fill();

        // Draw time label
        ctx.fillStyle = this.colors.playhead;
        ctx.font = 'bold 11px Inter, monospace';
        ctx.textAlign = 'center';
        const minutes = Math.floor(this.currentTime / 60);
        const seconds = Math.floor(this.currentTime % 60);
        const ms = Math.floor((this.currentTime % 1) * 1000);
        const label = `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;

        // Background for label
        const labelWidth = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(74, 158, 255, 0.2)';
        ctx.fillRect(x - labelWidth / 2, height - 18, labelWidth, 16);

        ctx.fillStyle = this.colors.playhead;
        ctx.fillText(label, x, height - 6);
    }

    getCurrentTime() {
        return this.currentTime;
    }
}

export default TimelineEditor;
