export class Workspace {
    constructor(containerId, viewportId) {
        this.container = document.getElementById(containerId);
        this.viewport = document.getElementById(viewportId);

        this.state = {
            scale: 1,
            x: 0,
            y: 0,
            isDragging: false,
            lastX: 0,
            lastY: 0
        };

        this.rafPending = false; // Throttle flag for requestAnimationFrame
        this.pendingZoomDelta = 0; // Accumulated zoom delta
        this.pendingMouseY = 0;
        this.spacePressed = false; // Track space key for pan mode
        this.onTransformChange = null; // Callback for when transform changes

        this.isPotentialDrag = false; // For lazy pan
        this.pointerId = null; // Track pointer for capture

        this.initEvents();
        this.centerViewport();
    }

    initEvents() {
        // Zoom
        this.container.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // Pan
        this.container.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    }

    centerViewport() {
        const rect = this.container.getBoundingClientRect();
        this.state.x = rect.width / 2;
        this.state.y = rect.height / 2;
        this.updateTransform();
    }

    fitToPages(pageManager) {
        if (!pageManager || !pageManager.pages.length) {
            this.centerViewport();
            return;
        }

        const rect = this.container.getBoundingClientRect();
        const containerWidth = rect.width;
        const containerHeight = rect.height;

        // Calculate total bounding box of all pages
        const totalWidth = (pageManager.settings.width * pageManager.settings.count) +
            (pageManager.settings.gap * (pageManager.settings.count - 1));
        const totalHeight = pageManager.settings.height;

        // Add padding (10% of viewport)
        const padding = 100;
        const availableWidth = containerWidth - padding * 2;
        const availableHeight = containerHeight - padding * 2;

        // Calculate scale to fit
        const scaleX = availableWidth / totalWidth;
        const scaleY = availableHeight / totalHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1:1

        // Center the pages
        this.state.scale = scale;
        this.state.x = containerWidth / 2;
        this.state.y = containerHeight / 2;

        this.updateTransform();
    }

    handleWheel(e) {
        e.preventDefault();

        // Accumulate zoom delta instead of processing immediately
        const ZOOM_SPEED = 0.001;
        this.pendingZoomDelta = (this.pendingZoomDelta || 0) + e.deltaY;

        // Store mouse position for zoom-to-point (use latest)
        const rect = this.container.getBoundingClientRect();
        this.pendingMouseX = e.clientX - rect.left;
        this.pendingMouseY = e.clientY - rect.top;

        // Throttle zoom application with RAF
        if (!this.rafPending) {
            this.rafPending = true;
            requestAnimationFrame(() => {
                // Apply accumulated zoom delta
                const newScale = this.state.scale - this.pendingZoomDelta * ZOOM_SPEED;
                const clampedScale = Math.min(Math.max(0.1, newScale), 5);

                // World coordinates before zoom
                const worldX = (this.pendingMouseX - this.state.x) / this.state.scale;
                const worldY = (this.pendingMouseY - this.state.y) / this.state.scale;

                this.state.scale = clampedScale;

                // Adjust translation to keep world point under mouse
                this.state.x = this.pendingMouseX - worldX * this.state.scale;
                this.state.y = this.pendingMouseY - worldY * this.state.scale;

                this.updateTransform();

                // Reset accumulated delta
                this.pendingZoomDelta = 0;
                this.rafPending = false;
            });
        }
    }

    handlePointerDown(e) {
        // Allow pan with: 
        // 1. Middle mouse button
        // 2. Left click on workspace background (container, viewport, pages) IF nothing is selected or being edited

        const isSelected = document.querySelector('.frame.selected, .frame.editing');
        // We removed !isFrameInteraction check to allow drag on unselected frames to pan

        if (e.button === 1 || (e.button === 0 && !isSelected)) {
            // e.preventDefault(); // REMOVED to allow click events to propagate to frames if not dragged
            // Start lazy pan
            this.isPotentialDrag = true;
            this.state.lastX = e.clientX;
            this.state.lastY = e.clientY;
            this.pointerId = e.pointerId;
            // Don't capture yet, wait for move threshold
        }
    }

    handlePointerMove(e) {
        if (this.isPotentialDrag) {
            const dist = Math.hypot(e.clientX - this.state.lastX, e.clientY - this.state.lastY);
            if (dist > 3) { // 3px threshold
                this.isPotentialDrag = false;
                this.state.isDragging = true;
                this.container.setPointerCapture(this.pointerId);
                this.container.style.cursor = 'grabbing';
            }
        }

        if (!this.state.isDragging) return;

        const deltaX = e.clientX - this.state.lastX;
        const deltaY = e.clientY - this.state.lastY;

        this.state.x += deltaX;
        this.state.y += deltaY;

        this.state.lastX = e.clientX;
        this.state.lastY = e.clientY;

        this.updateTransform();
    }

    handlePointerUp(e) {
        this.isPotentialDrag = false; // Reset potential drag
        if (this.state.isDragging) {
            this.state.isDragging = false;
            this.container.style.cursor = 'default';
            this.container.releasePointerCapture(e.pointerId);
        }
    }

    updateTransform() {
        this.viewport.style.transform = `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.scale})`;

        // Notify listeners of transform change (e.g., for updating frame handle scales)
        if (this.onTransformChange) {
            this.onTransformChange();
        }
    }

    // Coordinate conversion
    screenToWorld(x, y) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: (x - rect.left - this.state.x) / this.state.scale,
            y: (y - rect.top - this.state.y) / this.state.scale
        };
    }
}
