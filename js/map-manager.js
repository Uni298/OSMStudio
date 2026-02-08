// Leaflet Map Manager
export class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.activeLayer = null;
    
    // Default settings
    this.provider = localStorage.getItem('osmstudio_provider') || 'esri';
    this.apiKeys = JSON.parse(localStorage.getItem('osmstudio_api_keys') || '{}');
  }

  // Initialize Leaflet map
  async initialize() {
    console.log('MapManager: Initializing map...');
    console.log('Container ID:', this.containerId);
    
    const container = document.getElementById(this.containerId);
    console.log('Container element:', container);
    console.log('Container dimensions:', container?.clientWidth, 'x', container?.clientHeight);
    
    // Create map instance
    this.map = L.map(this.containerId, {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
      zoomAnimation: false,
      zoomSnap: 0.00001,
      zoomDelta: 0,
      preferCanvas: true,
    }).setView([35.6762, 139.6503], 13);
    
    console.log('Map created:', this.map);

    // Initial layer setup
    this.setLayer(this.provider);
    
    console.log('Tile layer added:', this.activeLayer);

    // Add aspect ratio mask for video preview
    this.addAspectMask();

    return this.map;
  }

  // Set tile layer
  setLayer(provider) {
    if (this.activeLayer) {
      this.map.removeLayer(this.activeLayer);
    }

    this.provider = provider;
    localStorage.setItem('osmstudio_provider', provider);

    const commonOptions = {
        maxZoom: 19,
        maxNativeZoom: 19,
        keepBuffer: 4,
        updateInterval: 20
    };

    let url = "";
    let options = { ...commonOptions };

    if (provider === 'esri') {
        url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
        options.attribution = "Tiles &copy; Esri";
    } else if (provider === 'mapbox') {
        const key = this.apiKeys.mapbox || '';
        url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${key}`;
        options.attribution = '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>';
        options.tileSize = 512;
        options.zoomOffset = -1;
    } else if (provider === 'google') {
        url = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
        options.attribution = '&copy; Google Maps';
    } else if (provider === 'osm') {
        url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        options.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }

    this.activeLayer = L.tileLayer(url, options).addTo(this.map);
  }

  // Set API Key
  setApiKey(provider, key) {
    this.apiKeys[provider] = key;
    localStorage.setItem('osmstudio_api_keys', JSON.stringify(this.apiKeys));
    
    // Refresh layer if it's the current provider
    if (this.provider === provider) {
        this.setLayer(provider);
    }
  }

  // Get current settings
  getSettings() {
      return {
          provider: this.provider,
          apiKeys: this.apiKeys
      };
  }

  // Set camera position (Lat, Lng, Zoom)
  setCameraPosition(data) {
    if (!this.map) return;
    const { latitude, longitude, zoom } = data;
    
    // Use flyTo for smooth animation instead of instant setView
    // Duration matches the frame interval (33ms for 30fps)
    this.map.setView([latitude, longitude], zoom, {
      animate: false,
      duration: 0.01, // 33ms = 1 frame at 30fps
      easeLinearity: 1.0 // Linear easing for consistent frame-by-frame movement
    });
  }

  // Get current camera position
  getCameraPosition() {
    if (!this.map) return null;
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    return {
      latitude: center.lat,
      longitude: center.lng,
      zoom: zoom,
    };
  }

  // Get Viewer (Map) instance
  getViewer() {
    return this.map;
  }

  // Capture current frame as blob
  captureFrame() {
    return null;
  }

  // Resize map
  resize() {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  // Enable/disable interactions
  enableCameraControls(enable = true) {
    if (!this.map) return;
    if (enable) {
      this.map.dragging.enable();
      this.map.touchZoom.enable();
      this.map.doubleClickZoom.enable();
      this.map.scrollWheelZoom.enable();
      this.map.boxZoom.enable();
      this.map.keyboard.enable();
    } else {
      this.map.dragging.disable();
      this.map.touchZoom.disable();
      this.map.doubleClickZoom.disable();
      this.map.scrollWheelZoom.disable();
      this.map.boxZoom.disable();
      this.map.keyboard.disable();
    }
  }

  // Add aspect ratio mask
  addAspectMask() {
    if (!document.getElementById("aspect-mask")) {
      const mask = document.createElement("div");
      mask.id = "aspect-mask";
      mask.className = "aspect-mask";
      mask.style.display = "none";
      this.updateAspectMask(16, 9);

      const container = document.getElementById(this.containerId);
      if (container) container.appendChild(mask);
    }
  }

  // Update aspect ratio mask dimensions
  updateAspectMask(widthRatio, heightRatio) {
    const mask = document.getElementById("aspect-mask");
    if (!mask) return;

    const container = document.getElementById(this.containerId);
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const containerRatio = containerWidth / containerHeight;
    const targetRatio = widthRatio / heightRatio;

    let width, height;

    if (containerRatio > targetRatio) {
      height = containerHeight;
      width = height * targetRatio;
    } else {
      width = containerWidth;
      height = width / targetRatio;
    }

    mask.style.width = `${width}px`;
    mask.style.height = `${height}px`;
  }

  // Toggle mask visibility
  toggleAspectMask(show) {
    const mask = document.getElementById("aspect-mask");
    if (mask) {
      mask.style.display = show ? "block" : "none";
      if (show) {
        this.updateAspectMask(16, 9);
      }
    }
  }
}

export default MapManager;
