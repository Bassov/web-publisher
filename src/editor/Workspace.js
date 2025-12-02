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
            lastY: 0,
            isZooming: false  // OPTIMIZATION: Track active zoom state
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

        // PageManager positions pages with first page centered at (0, 0)
        // First page starts at x = -(firstPageWidth/2)
        // Last page ends at approximately x = totalWidth - (firstPageWidth/2)
        // So the center of all pages is at x = (totalWidth - firstPageWidth) / 2 - firstPageWidth/2
        // Simplifying: x = totalWidth/2 - firstPageWidth/2
        // And y = 0 (pages are vertically centered at 0)
        const firstPageWidth = pageManager.getPageSettings(0).width;
        const pagesCenterX = (totalWidth - firstPageWidth) / 2;
        const pagesCenterY = 0;

        // Position viewport so pages center appears at screen center
        // Account for media library panel at bottom (~150px height)
        // Shift pages up by ~75px to better center them in visible area
        const mediaLibraryOffset = 75; // Half of media library height
        this.state.scale = scale;
        this.state.x = containerWidth / 2 - pagesCenterX * scale;
        this.state.y = (containerHeight / 2 - mediaLibraryOffset) - pagesCenterY * scale;

        this.updateTransform();
    }

    handleWheel(e) {
        e.preventDefault();

        // CRITICAL OPTIMIZATION: Mark as zooming to skip handle updates
        this.state.isZooming = true;

        // Clear existing zoom-end timer
        if (this.zoomEndTimer) {
            clearTimeout(this.zoomEndTimer);
        }

        // Set timer to mark zoom as ended after 200ms
        this.zoomEndTimer = setTimeout(() => {
            this.state.isZooming = false;
            // Trigger handle update after zoom ends
            if (this.onTransformChange) {
                const viewportBounds = this.getViewportBounds();
                this.onTransformChange(viewportBounds, true); // true = zoom ended
            }
        }, 200);

        // Accumulate zoom delta from ALL events (don't skip any!)
        const ZOOM_SPEED = 0.001;
        this.pendingZoomDelta += e.deltaY;

        // Store raw client coordinates (we'll calculate relative pos in RAF)
        this.pendingClientX = e.clientX;
        this.pendingClientY = e.clientY;

        // Throttle zoom application with RAF
        if (!this.rafPending) {
            this.rafPending = true;
            requestAnimationFrame(() => {
                // OPTIMIZATION: Calculate rect only once per frame inside RAF
                const rect = this.container.getBoundingClientRect();
                const mouseX = this.pendingClientX - rect.left;
                const mouseY = this.pendingClientY - rect.top;

                // Apply accumulated zoom delta
                const newScale = this.state.scale - this.pendingZoomDelta * ZOOM_SPEED;
                const clampedScale = Math.min(Math.max(0.1, newScale), 5);

                // World coordinates before zoom (using latest mouse pos)
                const worldX = (mouseX - this.state.x) / this.state.scale;
                const worldY = (mouseY - this.state.y) / this.state.scale;

                this.state.scale = clampedScale;

                // Adjust translation to keep world point under mouse
                this.state.x = mouseX - worldX * this.state.scale;
                this.state.y = mouseY - worldY * this.state.scale;

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

        // OPTIMIZATION: Update grid line width to remain constant on screen (1px / scale)
        // This ensures grid is visible even when zoomed out far
        const lineWidth = Math.max(1, 1 / this.state.scale);
        this.viewport.style.setProperty('--grid-line-width', `${lineWidth}px`);

        // Notify listeners of transform change (e.g., for updating frame handle scales)
        if (this.onTransformChange) {
            // OPTIMIZATION: Don't calculate bounds here to avoid reflow.
            // App.js calculates it only when needed (and skips during zoom).
            this.onTransformChange(null);
        }
    }

    // Get viewport bounds in world coordinates (for culling)
    getViewportBounds() {
        const rect = this.container.getBoundingClientRect();
        return {
            left: (0 - this.state.x) / this.state.scale,
            right: (rect.width - this.state.x) / this.state.scale,
            top: (0 - this.state.y) / this.state.scale,
            bottom: (rect.height - this.state.y) / this.state.scale
        };
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
