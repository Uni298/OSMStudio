// Camera Path Visualization
export class PathVisualizer {
    constructor(viewer, keyframeManager) {
        this.viewer = viewer;
        this.keyframeManager = keyframeManager;
        this.pathEntity = null;
        this.keyframeEntities = [];
        this.isEnabled = true;

        // Setup updates
        this.keyframeManager.on('keyframesChanged', () => this.updatePath());
        this.keyframeManager.on('keyframeUpdated', () => this.updatePath());
        this.keyframeManager.on('keyframeAdded', () => this.updatePath());
        this.keyframeManager.on('keyframeRemoved', () => this.updatePath());
    }

    // Toggle visibility
    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (this.pathEntity) this.pathEntity.show = enabled;
        this.keyframeEntities.forEach(e => e.show = enabled);
        if (enabled) {
            this.updatePath();
        }
    }

    updatePath() {
        if (!this.isEnabled || !this.viewer) return;

        const keyframes = this.keyframeManager.getAllKeyframes();
        if (keyframes.length < 2) {
            this.clearPath();
            return;
        }

        // Generate path points
        const positions = [];
        const totalDuration = keyframes[keyframes.length - 1].time;
        const step = 0.1; // 10 samples per second

        for (let t = 0; t <= totalDuration; t += step) {
            const data = this.keyframeManager.interpolateAt(t);
            positions.push(Cesium.Cartesian3.fromDegrees(
                data.longitude,
                data.latitude,
                data.height
            ));
        }

        // Update or create path entity
        if (!this.pathEntity) {
            this.pathEntity = this.viewer.entities.add({
                name: 'Camera Path',
                polyline: {
                    positions: positions,
                    width: 2,
                    material: new Cesium.PolylineDashMaterialProperty({
                        color: Cesium.Color.CYAN,
                        dashLength: 16.0
                    })
                }
            });
        } else {
            this.pathEntity.polyline.positions = positions;
        }

        this.updateKeyframeMarkers(keyframes);
    }

    updateKeyframeMarkers(keyframes) {
        // Remove old markers
        this.keyframeEntities.forEach(e => this.viewer.entities.remove(e));
        this.keyframeEntities = [];

        // Add new markers
        keyframes.forEach((kf, index) => {
            const position = Cesium.Cartesian3.fromDegrees(
                kf.longitude,
                kf.latitude,
                kf.height
            );

            const entity = this.viewer.entities.add({
                name: `Keyframe ${index + 1}`,
                position: position,
                point: {
                    pixelSize: 10,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY // Always visible
                },
                label: {
                    text: `${index + 1}`,
                    font: '12px sans-serif',
                    pixelOffset: new Cesium.Cartesian2(0, -15),
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });

            this.keyframeEntities.push(entity);
        });
    }

    clearPath() {
        if (this.pathEntity) {
            this.viewer.entities.remove(this.pathEntity);
            this.pathEntity = null;
        }
        this.keyframeEntities.forEach(e => this.viewer.entities.remove(e));
        this.keyframeEntities = [];
    }
}

export default PathVisualizer;
