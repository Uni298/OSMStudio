// Property Panel - UI for editing keyframe properties
export class PropertyPanel {
    constructor(keyframeManager, mapManager, animationController, pathManager) {
        this.keyframeManager = keyframeManager;
        this.mapManager = mapManager;
        this.animationController = animationController;
        this.pathManager = pathManager;

        this.initializeElements();
        this.bindEvents();
        this.updateUI();

        // Listen to keyframe selection
        this.keyframeManager.on('keyframeSelected', (kf) => {
            this.updateUI();
        });

        // Listen to timeline seek
        window.addEventListener('timelineSeek', (e) => {
            this.updateCameraFromInterpolation(e.detail.time);
        });
    }

    initializeElements() {
        // Position inputs
        this.latitudeInput = document.getElementById('input-latitude');
        this.longitudeInput = document.getElementById('input-longitude');
        this.zoomInput = document.getElementById('input-zoom'); // Changed from height to zoom

        // Interpolation
        this.interpolationSelect = document.getElementById('select-interpolation');

        // Buttons
        this.addButton = document.getElementById('btn-add-keyframe');
        this.updateButton = document.getElementById('btn-update-keyframe');
        this.deleteButton = document.getElementById('btn-delete-keyframe');

        // Settings UI
        this.btnSettings = document.getElementById('btn-settings');
        this.settingsDialog = document.getElementById('settings-dialog');
        this.btnCloseSettings = document.getElementById('btn-close-settings');
        this.btnSaveSettings = document.getElementById('btn-save-settings');
        this.btnCancelSettings = document.getElementById('btn-cancel-settings');
        this.selectBasemap = document.getElementById('select-basemap');
        this.inputApiKey = document.getElementById('input-api-key');
        this.groupApiKey = document.getElementById('group-api-key');

        // Drawing UI
        this.btnAddPath = document.getElementById('btn-add-path');
        this.drawingProperties = document.getElementById('drawing-properties');
        
        // Timing
        this.inputPathStart = document.getElementById('input-path-start');
        this.inputPathEnd = document.getElementById('input-path-end');
        this.inputPathFade = document.getElementById('input-path-fade');

        // Stroke
        this.checkPathStroke = document.getElementById('check-path-stroke');
        this.groupPathStroke = document.getElementById('group-path-stroke');
        this.inputPathColor = document.getElementById('input-path-color');
        this.inputPathWidth = document.getElementById('input-path-width');
        this.inputPathOpacity = document.getElementById('input-path-opacity');

        // Fill
        this.checkPathFill = document.getElementById('check-path-fill');
        this.groupPathFill = document.getElementById('group-path-fill');
        this.inputPathFillColor = document.getElementById('input-path-fill-color');
        this.inputPathFillOpacity = document.getElementById('input-path-fill-opacity');
        
        this.btnFinishDrawing = document.getElementById('btn-finish-drawing');
        this.btnDeletePath = document.getElementById('btn-delete-path');
        this.selectPathList = document.getElementById('select-path-list');
    }

    bindEvents() {
        this.latitudeInput.addEventListener('input', () => this.onPropertyChange());
        this.longitudeInput.addEventListener('input', () => this.onPropertyChange());
        this.zoomInput.addEventListener('input', () => this.onPropertyChange());

        // Add keyframe button
        this.addButton.addEventListener('click', () => {
            this.addKeyframe();
        });

        // Capture current camera button
        const captureButton = document.createElement('button');
        captureButton.className = 'btn-secondary';
        captureButton.innerHTML = '<span class="icon">📷</span> 現在のカメラ位置を取得';
        captureButton.style.marginBottom = '8px';
        captureButton.addEventListener('click', () => {
            this.captureCurrentCamera();
        });

        // Insert before add button
        this.addButton.parentElement.insertBefore(captureButton, this.addButton);

        // Update UI when map moves
        let updateTimeout;
        const updateFromMap = () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                if (!this.animationController.getIsPlaying()) {
                    this.updateUIFromCamera();
                }
            }, 100);
        };

        // Listen to map changes
        if (this.mapManager.getViewer()) {
            this.mapManager.getViewer().on('moveend', updateFromMap);
            this.mapManager.getViewer().on('zoomend', updateFromMap);
        }

        // Update keyframe button
        this.updateButton.addEventListener('click', () => {
            this.updateKeyframe();
        });

        // Delete keyframe button
        this.deleteButton.addEventListener('click', () => {
            this.deleteKeyframe();
        });

        // Settings Events
        this.btnSettings.addEventListener('click', () => this.showSettingsDialog());
        this.btnCloseSettings.addEventListener('click', () => this.hideSettingsDialog());
        this.btnCancelSettings.addEventListener('click', () => this.hideSettingsDialog());
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());

        this.selectBasemap.addEventListener('change', () => {
            this.updateSettingsUI();
        });

        // Drawing Events
        this.btnAddPath.addEventListener('click', () => {
            const path = this.pathManager.startDrawing();
            this.updateDrawingUI(path);
        });

        // Helper to update path props
        const updatePath = (props) => {
            if (this.pathManager.activePath) {
                this.pathManager.updatePathProperties(this.pathManager.activePath, props);
            }
        };

        // Property Listeners
        this.inputPathStart.addEventListener('change', (e) => updatePath({ startTime: parseFloat(e.target.value) }));
        this.inputPathEnd.addEventListener('change', (e) => updatePath({ endTime: parseFloat(e.target.value) }));
        this.inputPathFade.addEventListener('change', (e) => updatePath({ fadeDuration: parseFloat(e.target.value) }));

        this.checkPathStroke.addEventListener('change', (e) => {
             updatePath({ stroked: e.target.checked });
             this.groupPathStroke.style.display = e.target.checked ? 'block' : 'none';
        });

        this.inputPathColor.addEventListener('input', (e) => updatePath({ color: e.target.value }));
        this.inputPathWidth.addEventListener('input', (e) => updatePath({ width: parseInt(e.target.value) }));
        this.inputPathOpacity.addEventListener('input', (e) => updatePath({ opacity: parseFloat(e.target.value) }));

        this.checkPathFill.addEventListener('change', (e) => {
            updatePath({ filled: e.target.checked });
            this.groupPathFill.style.display = e.target.checked ? 'block' : 'none';
        });

        this.inputPathFillColor.addEventListener('input', (e) => updatePath({ fillColor: e.target.value }));
        this.inputPathFillOpacity.addEventListener('input', (e) => updatePath({ fillOpacity: parseFloat(e.target.value) }));


        this.btnFinishDrawing.addEventListener('click', () => {
            this.pathManager.stopDrawing();
            this.updateDrawingUI(null);
        });

        this.btnDeletePath.addEventListener('click', () => {
            if (this.pathManager.activePath) {
                this.pathManager.deletePath(this.pathManager.activePath);
                this.updateDrawingUI(null);
            }
        });

        this.selectPathList.addEventListener('change', (e) => {
            const pathId = e.target.value;
            const path = this.pathManager.paths.find(p => p.id === pathId);
            if (path) {
                this.pathManager.selectPath(path);
                this.updateDrawingUI(path);
            }
        });
        
        // Map Click for Drawing
        if (this.mapManager.getViewer()) {
            this.mapManager.getViewer().on('click', (e) => {
                if (this.pathManager.isDrawing) {
                    this.pathManager.addPoint(e.latlng.lat, e.latlng.lng);
                }
            });
        }

        // Listen to PathManager events
        this.pathManager.on('pathsChanged', (paths) => {
            this.updatePathList(paths);
        });
        
        this.pathManager.on('pathSelected', (path) => {
             this.updateDrawingUI(path);
             this.selectPathList.value = path.id;
        });
    }

    updateCameraFromInputs() {
        const cameraData = {
            latitude: parseFloat(this.latitudeInput.value),
            longitude: parseFloat(this.longitudeInput.value),
            zoom: parseFloat(this.zoomInput.value)
        };

        this.mapManager.setCameraPosition(cameraData);
    }

    onPropertyChange() {
        if (!this.animationController.getIsPlaying()) {
            this.updateCameraFromInputs();
        }
    }

    updateCameraFromInterpolation(time) {
        const cameraData = this.keyframeManager.interpolateAt(time);
        this.mapManager.setCameraPosition(cameraData);

        // Update inputs to show interpolated values
        this.latitudeInput.value = cameraData.latitude.toFixed(4);
        this.longitudeInput.value = cameraData.longitude.toFixed(4);
        this.zoomInput.value = cameraData.zoom.toFixed(2);
    }

    addKeyframe() {
        const currentTime = this.animationController.getCurrentTime();

        const cameraData = {
            latitude: parseFloat(this.latitudeInput.value),
            longitude: parseFloat(this.longitudeInput.value),
            zoom: parseFloat(this.zoomInput.value)
        };

        const interpolationType = this.interpolationSelect.value;

        // Import Keyframe class
        import('./keyframe-manager.js').then(module => {
            const keyframe = new module.Keyframe(currentTime, cameraData, interpolationType);
            this.keyframeManager.addKeyframe(keyframe);
            this.keyframeManager.selectKeyframe(keyframe);
        });
    }

    updateKeyframe() {
        const selectedKeyframe = this.keyframeManager.selectedKeyframe;
        if (!selectedKeyframe) return;

        const newData = {
            latitude: parseFloat(this.latitudeInput.value),
            longitude: parseFloat(this.longitudeInput.value),
            zoom: parseFloat(this.zoomInput.value),
            interpolationType: this.interpolationSelect.value
        };

        this.keyframeManager.updateKeyframe(selectedKeyframe, newData);
    
    // Check if we need to update total duration based on new keyframe time (if editable)
    // For now, duration is global setting.
    // However, if we added a setting to change duration, we must call timelineEditor.setDuration
    // Let's assume there is a global duration setting or we are adding one.
    }

    deleteKeyframe() {
        const selectedKeyframe = this.keyframeManager.selectedKeyframe;
        if (!selectedKeyframe) return;

        this.keyframeManager.removeKeyframe(selectedKeyframe);
    }

    updateUI() {
        const selectedKeyframe = this.keyframeManager.selectedKeyframe;

        if (selectedKeyframe) {
            // Populate inputs with keyframe data
            this.latitudeInput.value = selectedKeyframe.latitude.toFixed(4);
            this.longitudeInput.value = selectedKeyframe.longitude.toFixed(4);
            this.zoomInput.value = selectedKeyframe.zoom.toFixed(2);
            this.interpolationSelect.value = selectedKeyframe.interpolationType;

            // Enable update and delete buttons
            this.updateButton.disabled = false;
            this.deleteButton.disabled = false;
        } else {
            // Get current camera position
            const cameraData = this.mapManager.getCameraPosition();
            if (cameraData) {
                this.latitudeInput.value = cameraData.latitude.toFixed(4);
                this.longitudeInput.value = cameraData.longitude.toFixed(4);
                this.zoomInput.value = cameraData.zoom.toFixed(2);
            }

            // Disable update and delete buttons
            this.updateButton.disabled = true;
            this.deleteButton.disabled = true;
        }
    }

    // Capture current camera position
    captureCurrentCamera() {
        const cameraData = this.mapManager.getCameraPosition();
        if (cameraData) {
            this.latitudeInput.value = cameraData.latitude.toFixed(4);
            this.longitudeInput.value = cameraData.longitude.toFixed(4);
            this.zoomInput.value = cameraData.zoom.toFixed(2);

            // Show notification
            this.showNotification('カメラ位置を取得しました');
        }
    }

    // Update UI from camera (カメラが動いたら表示を更新)
    updateUIFromCamera() {
        if (this.keyframeManager.selectedKeyframe) return; // キーフレーム選択中は更新しない

        const cameraData = this.mapManager.getCameraPosition();
        if (cameraData) {
            this.latitudeInput.value = cameraData.latitude.toFixed(4);
            this.longitudeInput.value = cameraData.longitude.toFixed(4);
            this.zoomInput.value = cameraData.zoom.toFixed(2);
        }
    }

    // Show notification
    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #4a9eff, #7b61ff);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(74, 158, 255, 0.4);
            z-index: 1000;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    // Settings Dialog Methods
    showSettingsDialog() {
        const settings = this.mapManager.getSettings();
        
        // Populate fields
        this.selectBasemap.value = settings.provider;
        
        // Populate API key if available for current provider
        // Or specific logic to show key for selected provider
        // Since we only really need key for mapbox now:
        this.inputApiKey.value = settings.apiKeys.mapbox || '';

        this.updateSettingsUI();
        this.settingsDialog.style.display = 'flex';
    }

    hideSettingsDialog() {
        this.settingsDialog.style.display = 'none';
    }

    updateSettingsUI() {
        const provider = this.selectBasemap.value;
        if (provider === 'mapbox') {
            this.groupApiKey.style.display = 'flex';
        } else {
            this.groupApiKey.style.display = 'none';
        }
    }

    saveSettings() {
        const provider = this.selectBasemap.value;
        const apiKey = this.inputApiKey.value;

        // Save to MapManager
        this.mapManager.setApiKey('mapbox', apiKey); // Always save mapbox key if entered
        this.mapManager.setLayer(provider);

        this.showNotification('設定を保存しました');
        this.hideSettingsDialog();
    }

    // Drawing UI Methods
    updateDrawingUI(activePath) {
        if (activePath) {
            this.drawingProperties.style.display = 'block';
            // this.btnAddPath.style.display = 'none'; // Allow adding new path even while editing? 
            // Better UX: Change button text to "New Path" or keep it visible
            this.btnAddPath.style.display = 'block'; 
            
            this.inputPathStart.value = activePath.startTime;
            this.inputPathEnd.value = activePath.endTime;
            this.inputPathFade.value = activePath.fadeDuration;

            this.checkPathStroke.checked = activePath.stroked;
            this.groupPathStroke.style.display = activePath.stroked ? 'block' : 'none';
            this.inputPathColor.value = activePath.color;
            this.inputPathWidth.value = activePath.width;
            this.inputPathOpacity.value = activePath.opacity;

            this.checkPathFill.checked = activePath.filled;
            this.groupPathFill.style.display = activePath.filled ? 'block' : 'none';
            this.inputPathFillColor.value = activePath.fillColor;
            this.inputPathFillOpacity.value = activePath.fillOpacity;
            
            // Show finish button only if drawing
            this.btnFinishDrawing.style.display = this.pathManager.isDrawing ? 'block' : 'none';
            // Show delete button always if path selected
            this.btnDeletePath.style.display = 'block';

        } else {
            this.drawingProperties.style.display = 'none';
            this.btnAddPath.style.display = 'block';
            if (this.selectPathList) this.selectPathList.value = "";
        }
    }

    updatePathList(paths) {
        this.selectPathList.innerHTML = '';
        paths.forEach(path => {
            const option = document.createElement('option');
            option.value = path.id; // Use ID as value
            option.textContent = path.name;
            this.selectPathList.appendChild(option);
        });
    }
}

export default PropertyPanel;
