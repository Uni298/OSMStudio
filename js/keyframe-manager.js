import Interpolation from './interpolation.js';

// Keyframe class
export class Keyframe {
    constructor(time, cameraData, interpolationType = 'easeInOut') {
        this.time = time; // Time in seconds
        this.latitude = cameraData.latitude;
        this.longitude = cameraData.longitude;
        this.zoom = cameraData.zoom; // Changed form height/3d to zoom
        this.interpolationType = interpolationType;
    }

    clone() {
        return new Keyframe(this.time, {
            latitude: this.latitude,
            longitude: this.longitude,
            zoom: this.zoom
        }, this.interpolationType);
    }

    toJSON() {
        return {
            time: this.time,
            latitude: this.latitude,
            longitude: this.longitude,
            zoom: this.zoom,
            interpolationType: this.interpolationType
        };
    }

    static fromJSON(data) {
        return new Keyframe(data.time, {
            latitude: data.latitude,
            longitude: data.longitude,
            zoom: data.zoom
        }, data.interpolationType);
    }
}

// Keyframe Manager
export class KeyframeManager {
    constructor() {
        this.keyframes = [];
        this.selectedKeyframe = null;
        this.listeners = {
            'keyframeAdded': [],
            'keyframeRemoved': [],
            'keyframeUpdated': [],
            'keyframeSelected': [],
            'keyframesChanged': []
        };
    }

    // Event system
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

    // Add a keyframe
    addKeyframe(keyframe) {
        this.keyframes.push(keyframe);
        this.sortKeyframes();
        this.emit('keyframeAdded', keyframe);
        this.emit('keyframesChanged', this.keyframes);
        return keyframe;
    }

    // Remove a keyframe
    removeKeyframe(keyframe) {
        const index = this.keyframes.indexOf(keyframe);
        if (index !== -1) {
            this.keyframes.splice(index, 1);
            if (this.selectedKeyframe === keyframe) {
                this.selectedKeyframe = null;
                this.emit('keyframeSelected', null);
            }
            this.emit('keyframeRemoved', keyframe);
            this.emit('keyframesChanged', this.keyframes);
            return true;
        }
        return false;
    }

    // Update a keyframe
    updateKeyframe(keyframe, newData) {
        Object.assign(keyframe, newData);
        this.sortKeyframes();
        this.emit('keyframeUpdated', keyframe);
        this.emit('keyframesChanged', this.keyframes);
    }

    // Select a keyframe
    selectKeyframe(keyframe) {
        this.selectedKeyframe = keyframe;
        this.emit('keyframeSelected', keyframe);
    }

    // Get keyframe at specific time
    getKeyframeAtTime(time, tolerance = 0.1) {
        return this.keyframes.find(kf => Math.abs(kf.time - time) < tolerance);
    }

    // Sort keyframes by time
    sortKeyframes() {
        this.keyframes.sort((a, b) => a.time - b.time);
    }

    // Get surrounding keyframes for interpolation
    getSurroundingKeyframes(time) {
        if (this.keyframes.length === 0) return { before: null, after: null };

        let before = null;
        let after = null;

        for (let i = 0; i < this.keyframes.length; i++) {
            if (this.keyframes[i].time <= time) {
                before = this.keyframes[i];
            }
            if (this.keyframes[i].time >= time && !after) {
                after = this.keyframes[i];
                break;
            }
        }

        return { before, after };
    }

    // Interpolate camera data at specific time
    interpolateAt(time) {
        const { before, after } = this.getSurroundingKeyframes(time);

        // If no keyframes, return default
        if (!before && !after) {
            return {
                latitude: 35.6762,
                longitude: 139.6503,
                zoom: 13
            };
        }

        // If only one keyframe or time is before first/after last
        if (!before) return after.toJSON();
        if (!after) return before.toJSON();
        if (before === after) return before.toJSON();

        // Calculate interpolation factor
        const duration = after.time - before.time;
        const elapsed = time - before.time;
        const t = duration > 0 ? elapsed / duration : 0;

        // Use the interpolation type from the "before" keyframe
        const interpType = before.interpolationType;

        // Interpolate all properties
        return {
            latitude: Interpolation.interpolate(before.latitude, after.latitude, t, interpType),
            longitude: Interpolation.interpolate(before.longitude, after.longitude, t, interpType),
            zoom: Interpolation.interpolate(before.zoom, after.zoom, t, interpType)
        };
    }

    // Get all keyframes
    getAllKeyframes() {
        return [...this.keyframes];
    }

    // Clear all keyframes
    clear() {
        this.keyframes = [];
        this.selectedKeyframe = null;
        this.emit('keyframesChanged', this.keyframes);
    }

    // Export keyframes to JSON
    exportToJSON() {
        return {
            version: '2.0', // Updated version for 2D
            keyframes: this.keyframes.map(kf => kf.toJSON())
        };
    }

    // Import keyframes from JSON
    importFromJSON(data) {
        this.clear();
        if (data.keyframes) {
            data.keyframes.forEach(kfData => {
                // Compatibility for old 3D keyframes (convert height to zoom approx?)
                // For now, simple import or default
                if (kfData.height && !kfData.zoom) {
                     // Very rough conversion: Height 1000m -> Zoom 15, Height 100000m -> Zoom 5
                     // This is just a fallback for old projects
                     kfData.zoom = 10; 
                }
                this.addKeyframe(Keyframe.fromJSON(kfData));
            });
        }
    }
}

export default KeyframeManager;
