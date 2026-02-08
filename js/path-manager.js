// import { Utils } from './utils.js'; // Utility for ID gen if needed, or just Math.random

export class PathManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.paths = []; // Array of Path objects
        this.activePath = null;
        this.isDrawing = false;
        
        // Listeners
        this.listeners = {
            'pathAdded': [],
            'pathRemoved': [],
            'pathUpdated': [],
            'pathSelected': [],
            'pathsChanged': []
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

    // Start drawing a new path
    startDrawing(properties = {}) {
        this.isDrawing = true;
        const id = 'path_' + Date.now();
        
        const path = {
            id: id,
            name: `Path ${this.paths.length + 1}`,
            points: [], // Array of {lat, lng}
            color: properties.color || '#ff0000',
            width: properties.width || 4,
            opacity: properties.opacity !== undefined ? properties.opacity : 1.0,
            
            // Advanced Properties
            startTime: properties.startTime !== undefined ? properties.startTime : 0,
            endTime: properties.endTime !== undefined ? properties.endTime : 9999,
            fadeDuration: properties.fadeDuration !== undefined ? properties.fadeDuration : 0.5,
            
            stroked: properties.stroked !== undefined ? properties.stroked : true,
            
            filled: properties.filled !== undefined ? properties.filled : false,
            fillColor: properties.fillColor || '#ff0000',
            fillOpacity: properties.fillOpacity !== undefined ? properties.fillOpacity : 0.4,
            
            layer: null // Leaflet layer
        };

        this.paths.push(path);
        this.activePath = path;
        
        // Create Leaflet layer
        this.createLayer(path);

        this.emit('pathAdded', path);
        this.emit('pathSelected', path);

        return path;
    }

    // Add point to active path
    addPoint(lat, lng) {
        if (!this.activePath || !this.isDrawing) return;

        this.activePath.points.push({ lat, lng });
        this.updateLayer(this.activePath);
        this.emit('pathUpdated', this.activePath);
    }

    // Stop drawing
    stopDrawing() {
        this.isDrawing = false;
        // If filled, close the path visually if needed? L.polygon does it auto.
        // We might want to switch layer type if not already done?
        // For now, let createLayer handle type logic.
        this.emit('pathsChanged', this.paths);
    }

    // Create Leaflet layer for a path
    createLayer(path) {
        const points = path.points.map(p => [p.lat, p.lng]);
        
        const options = {
            color: path.color,
            weight: path.width,
            opacity: path.opacity,
            fill: path.filled,
            fillColor: path.fillColor,
            fillOpacity: path.fillOpacity,
            stroke: path.stroked,
            lineCap: 'round',
            lineJoin: 'round'
        };

        // Use L.polygon if filled (auto-closes), L.polyline otherwise
        if (path.filled) {
            path.layer = L.polygon(points, options);
        } else {
            path.layer = L.polyline(points, options);
        }
        
        path.layer.addTo(this.mapManager.getViewer());

        // Add click listener to select path
        path.layer.on('click', () => {
            this.selectPath(path);
        });
    }

    // Update existing layer (e.g. after adding points or changing props)
    updateLayer(path) {
        if (!path.layer) return;

        // If filled state changed, we might need to recreate layer to switch between polyline/polygon
        const isPolygon = path.layer instanceof L.Polygon;
        const needsRecreation = (path.filled && !isPolygon) || (!path.filled && isPolygon);

        if (needsRecreation) {
            this.mapManager.getViewer().removeLayer(path.layer);
            this.createLayer(path);
            return;
        }

        const points = path.points.map(p => [p.lat, p.lng]);
        path.layer.setLatLngs(points);
        
        path.layer.setStyle({
            color: path.color,
            weight: path.width,
            opacity: path.opacity,
            fill: path.filled,
            fillColor: path.fillColor,
            fillOpacity: path.fillOpacity,
            stroke: path.stroked
        });
    }
    
    // Update visual state based on time
    updateTime(currentTime) {
        this.currentTime = currentTime; // Store for property updates
        this.paths.forEach(path => {
            if (!path.layer) return;

            // Calculate opacity factor based on fade
            let alpha = 1.0;
            const fadeIn = path.fadeDuration || 0.5;
            const fadeOut = path.fadeDuration || 0.5;

            if (currentTime < path.startTime) {
                alpha = 0;
            } else if (currentTime < path.startTime + fadeIn) {
                alpha = (currentTime - path.startTime) / fadeIn;
            } else if (currentTime > path.endTime) {
                alpha = 0;
            } else if (currentTime > path.endTime - fadeOut) {
                alpha = (path.endTime - currentTime) / fadeOut;
            }

            // Apply opacity
            const currentStrokeOpacity = (path.opacity !== undefined ? path.opacity : 1.0) * alpha;
            const currentFillOpacity = (path.fillOpacity !== undefined ? path.fillOpacity : 0.4) * alpha;

            path.layer.setStyle({
                opacity: currentStrokeOpacity,
                fillOpacity: currentFillOpacity
            });
            
            // Optimization: toggle visibility to prevent interaction/rendering when invisible
            if (alpha <= 0) {
                 if (this.mapManager.getViewer().hasLayer(path.layer)) {
                     this.mapManager.getViewer().removeLayer(path.layer);
                 }
            } else {
                 if (!this.mapManager.getViewer().hasLayer(path.layer)) {
                     path.layer.addTo(this.mapManager.getViewer());
                 }
            }
        });
    }

    // Update path properties
    updatePathProperties(path, props) {
        Object.assign(path, props);
        this.updateLayer(path);
        
        // Re-evaluate visibility since timing might have changed
        if (this.currentTime !== undefined) {
            this.updateTime(this.currentTime);
        }
        
        this.emit('pathUpdated', path);
    }

    // Select a path
    selectPath(path) {
        this.activePath = path;
        this.emit('pathSelected', path);
    }

    // Delete a path
    deletePath(path) {
        if (path.layer) {
            this.mapManager.getViewer().removeLayer(path.layer);
        }
        
        this.paths = this.paths.filter(p => p.id !== path.id);
        if (this.activePath === path) {
            this.activePath = null;
        }

        this.emit('pathRemoved', path);
        this.emit('pathsChanged', this.paths);
    }

    // Export/Import JSON (for project save)
    exportToJSON() {
        return this.paths.map(p => ({
            id: p.id,
            name: p.name,
            points: p.points,
            color: p.color,
            width: p.width,
            opacity: p.opacity,
            // Advanced
            startTime: p.startTime,
            endTime: p.endTime,
            fadeDuration: p.fadeDuration,
            stroked: p.stroked,
            filled: p.filled,
            fillColor: p.fillColor,
            fillOpacity: p.fillOpacity
        }));

    }

    importFromJSON(data) {
        // Clear existing
        this.paths.forEach(p => {
            if (p.layer) this.mapManager.getViewer().removeLayer(p.layer);
        });
        this.paths = [];

        if (Array.isArray(data)) {
            data.forEach(pData => {
                const path = {
                    ...pData,
                    layer: null
                };
                this.paths.push(path);
                this.createLayer(path);
            });
        }
        this.emit('pathsChanged', this.paths);
    }
}

export default PathManager;
