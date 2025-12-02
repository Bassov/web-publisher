export class Frame {
    constructor(x, y, width, height, imageSrc = null, app = null) {
        this.app = app;
        this.element = document.createElement('div');
        this.element.className = 'frame';
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
        this.element.style.width = `${width}px`;
        this.element.style.height = `${height}px`;

        this.element.style.height = `${height}px`;
        this.element.style.willChange = 'transform'; // Optimize for resize/move

        // Create clipping mask for content
        this.mask = document.createElement('div');
        this.mask.style.position = 'absolute';
        this.mask.style.width = '100%';
        this.mask.style.height = '100%';
        this.mask.style.overflow = 'hidden';
        this.mask.style.pointerEvents = 'none'; // Let events pass through to frame/content?
        // Actually, we need pointer events on the image for panning.
        // If mask is pointer-events: none, children (image) can still have pointer-events: auto?
        // No, usually not.
        // Let's make mask pointer-events: auto but transparent.
        this.mask.style.pointerEvents = 'auto';
        this.element.appendChild(this.mask);

        this.content = document.createElement('img');
        this.content.style.position = 'absolute';
        this.content.style.left = '0';
        this.content.style.top = '0';
        this.content.style.transformOrigin = '0 0';
        this.mask.appendChild(this.content);

        this.state = {
            x, y, width, height,
            contentX: 0,
            contentY: 0,
            contentScale: 1,
            isSelected: false,
            mode: 'normal'
        };

        // Lazy init flags - create UI elements only when needed
        this.handlesRendered = false;
        this.contentHandlesRendered = false;

        this.initEvents();
        // Don't render handles immediately - lazy init on first select
        // this.renderHandles();
        // this.renderContentHandles();

        if (imageSrc) {
            this.setImage(imageSrc);
        }
    }

    renderHandles() {
        ['nw', 'ne', 'sw', 'se'].forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `handle ${pos}`;
            handle.style.position = 'absolute';
            handle.style.width = '14px';
            handle.style.height = '14px';
            handle.style.backgroundColor = 'var(--accent-color)';
            handle.style.border = '2px solid white';
            handle.style.zIndex = '10';
            handle.style.display = 'none';
            handle.style.cursor = `${pos}-resize`;
            handle.style.borderRadius = '2px';

            // Use CSS variable for scale
            handle.style.transform = 'scale(var(--handle-scale, 1))';
            handle.style.transformOrigin = 'center';

            if (pos.includes('n')) handle.style.top = '-7px';
            if (pos.includes('s')) handle.style.bottom = '-7px';
            if (pos.includes('w')) handle.style.left = '-7px';
            if (pos.includes('e')) handle.style.right = '-7px';

            handle.dataset.handle = pos;
            this.element.appendChild(handle);
        });

        // OPTIMIZATION: Cache handle elements to avoid querySelectorAll
        this.cachedHandles = Array.from(this.element.querySelectorAll('.handle'));

        // Apply initial scale
        this.updateHandleScale();
    }

    updateHandleScale(workspaceScale) {
        // CRITICAL FIX: Accept workspace scale as parameter to avoid expensive getComputedStyle()
        // getComputedStyle() forces reflow and is VERY slow when called frequently

        // Fallback: get scale from viewport if not provided (for backwards compatibility)
        if (workspaceScale === undefined) {
            if (this.app && this.app.workspace) {
                workspaceScale = this.app.workspace.state.scale;
            } else {
                const viewport = this.element.parentElement;
                if (!viewport) return;
                const style = window.getComputedStyle(viewport);
                const matrix = new WebKitCSSMatrix(style.transform);
                workspaceScale = matrix.a || 1;
            }
        }

        // Calculate inverse scale for handles
        const inverseScale = 1 / workspaceScale;

        // OPTIMIZATION: Use cached handles instead of querySelectorAll
        // Update frame resize handles (blue ones)
        if (this.cachedHandles) {
            this.cachedHandles.forEach(handle => {
                handle.style.setProperty('--handle-scale', inverseScale);
                // Transform is now handled in CSS using the variable
            });
        }

        // Content handles (yellow ones) - use same scale as blue handles
        if (this.cachedContentHandles) {
            this.cachedContentHandles.forEach(handle => {
                handle.style.setProperty('--handle-scale', inverseScale);
            });
        }
    }

    renderContentHandles() {
        // Overlay that matches image transform
        this.contentOverlay = document.createElement('div');
        this.contentOverlay.className = 'content-overlay';
        this.contentOverlay.style.position = 'absolute';
        this.contentOverlay.style.left = '0';
        this.contentOverlay.style.top = '0';
        this.contentOverlay.style.transformOrigin = '0 0';
        this.contentOverlay.style.pointerEvents = 'none'; // Allow clicks to pass through to image/frame
        this.contentOverlay.style.display = 'none'; // Always start hidden
        this.contentOverlay.style.border = '2px dashed #ffd700';
        this.contentOverlay.style.zIndex = '5'; // Lower than edit mode z-index
        this.element.appendChild(this.contentOverlay);

        ['nw', 'ne', 'sw', 'se'].forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `content-handle ${pos}`;
            handle.style.position = 'absolute';
            handle.style.width = '14px';
            handle.style.height = '14px';
            handle.style.backgroundColor = '#ffd700';
            handle.style.border = '2px solid white'; // Match resize handle border
            handle.style.pointerEvents = 'auto'; // Enable interaction
            handle.style.cursor = `${pos}-resize`;
            handle.style.zIndex = '6';
            handle.style.borderRadius = '2px'; // Match resize handle style

            // Use CSS variable for scale
            handle.style.transform = 'scale(var(--handle-scale, 1))';
            handle.style.transformOrigin = 'center';

            if (pos.includes('n')) handle.style.top = '-7px'; // Half of size
            if (pos.includes('s')) handle.style.bottom = '-7px';
            if (pos.includes('w')) handle.style.left = '-7px';
            if (pos.includes('e')) handle.style.right = '-7px';

            handle.dataset.handle = pos;

            // Add event listener directly here or delegate
            handle.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this.startContentResize(e, pos);
            });

            this.contentOverlay.appendChild(handle);
        });

        // OPTIMIZATION: Cache content handle elements to avoid querySelectorAll
        this.cachedContentHandles = Array.from(this.element.querySelectorAll('.content-handle'));

        // Apply initial scale immediately
        this.updateHandleScale();
    }

    setImage(src, preserveState = false) {
        this.content.src = src;
        this.content.onload = () => {
            // Update overlay size to match natural image size
            if (this.contentOverlay) {
                this.contentOverlay.style.width = `${this.content.naturalWidth}px`;
                this.contentOverlay.style.height = `${this.content.naturalHeight}px`;
            }

            // Only calculate default scale if NOT preserving state (e.g. restoring from history)
            if (!preserveState) {
                // Center and cover
                const aspect = this.content.naturalWidth / this.content.naturalHeight;
                const frameAspect = this.state.width / this.state.height;

                let scale;
                if (aspect > frameAspect) {
                    scale = this.state.height / this.content.naturalHeight;
                } else {
                    scale = this.state.width / this.content.naturalWidth;
                }

                this.state.contentScale = scale;
            }

            this.updateContentTransform();
        };
    }

    initEvents() {
        this.element.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        this.element.addEventListener('dblclick', (e) => this.enterContentEditMode(e));

        // Select on click (if not panned)
        // Select on click (if not panned)
        this.element.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent App deselect
            // OPTIMIZATION: Delegate to App for O(1) selection
            if (this.app) {
                this.app.selectFrame(this);
            }
        });

        // Drop handling for image swap
        this.element.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.element.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.element.addEventListener('drop', (e) => this.handleDrop(e));

        // Escape key to exit content-edit mode
        this.escapeHandler = (e) => {
            if (e.key === 'Escape' && this.state.mode === 'content-edit') {
                this.exitContentEditMode();
            }
        };
        window.addEventListener('keydown', this.escapeHandler);
    }

    handleDragOver(e) {
        // Check if dragging from media library
        const hasMediaData = e.dataTransfer.types.includes('application/media-library');
        if (hasMediaData) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            this.element.classList.add('drag-over-swap');
        }
    }

    handleDragLeave(e) {
        // Remove highlight when actually leaving the frame element
        // Check if we're leaving to outside the frame (not just entering a child element)
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || !this.element.contains(relatedTarget)) {
            this.element.classList.remove('drag-over-swap');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.element.classList.remove('drag-over-swap');

        try {
            const data = e.dataTransfer.getData('application/media-library');
            if (!data) return;

            const mediaData = JSON.parse(data);
            console.log('Dropping media onto frame:', mediaData);

            // Capture state for undo
            if (this.app) {
                this.app.pushState('swap_frame_image');
            }

            // Swap or Remove:
            if (this.content && this.content.src && this.app && this.app.mediaLibrary) {
                // If frame has content, swap it back to library
                console.log('Swapping library image at position:', mediaData.id);
                this.app.mediaLibrary.swapImage(mediaData.id, this.content.src, this.content);
            } else if (this.app && this.app.mediaLibrary) {
                // If frame is empty, just remove from library
                this.app.mediaLibrary.removeImage(mediaData.id);
            }

            // Reset content position to center before setting new image
            this.state.contentX = 0;
            this.state.contentY = 0;

            // Set new image from library in the frame (will auto-fit and center)
            this.setImage(mediaData.objectURL, false);

            console.log('Image swapped successfully');
        } catch (err) {
            console.error('Failed to handle drop:', err);
        }
    }

    handlePointerDown(e) {
        if (this.state.mode === 'content-edit') {
            // Let content handles work (they have their own listeners, but just in case)
            // Actually content handles stop propagation themselves.
            // If we click on image in content-edit mode, we might want to pan content?
            // Existing logic had startContentPan. Let's keep it if needed, or check requirements.
            // User said: "if frame selected and two times clicked on frame, content selected".
            // If content selected, "pan works only in frame area"?
            // If I drag content, it pans content.
            this.startContentPan(e);
            return;
        }

        // If selected, we handle the drag (move frame)
        if (this.state.isSelected) {
            e.stopPropagation(); // Stop workspace pan

            if (e.target.classList.contains('handle')) {
                this.startResize(e, e.target.dataset.handle);
            } else {
                this.startDrag(e);
            }
        }
        // If NOT selected, we do NOTHING here.
        // Event bubbles to Workspace -> Workspace handles Pan (Lazy Pan).
        // If it's just a click (no pan), 'click' event fires and we select (via initEvents listener).
    }

    startDrag(e) {
        this.element.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const initialX = this.state.x;
        const initialY = this.state.y;

        // Capture state BEFORE drag starts
        let stateBefore = null;
        try {
            stateBefore = this.app ? this.app.historyManager.captureState() : null;
        } catch (e) {
            console.error('Failed to capture state on drag start', e);
        }

        // Removed dragging class - lift effect was buggy
        // this.element.classList.add('dragging');

        const viewport = this.element.parentElement;
        const style = window.getComputedStyle(viewport);
        const matrix = new WebKitCSSMatrix(style.transform);
        const scale = matrix.a || 1;

        const onMove = (ev) => {
            const deltaX = (ev.clientX - startX) / scale;
            const deltaY = (ev.clientY - startY) / scale;

            let newX = initialX + deltaX;
            let newY = initialY + deltaY;

            // Check if dragging over Media Library
            const mediaLibrary = document.getElementById('media-library');
            if (mediaLibrary) {
                const rect = mediaLibrary.getBoundingClientRect();
                if (ev.clientX >= rect.left && ev.clientX <= rect.right &&
                    ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
                    mediaLibrary.classList.add('drag-over-delete');

                    const grid = mediaLibrary.querySelector('.media-library-grid');
                    if (grid) {
                        // Find insertion position based on cursor
                        const items = Array.from(grid.querySelectorAll('.media-item:not(.library-preview-placeholder)'));
                        let insertBefore = null;
                        let minDistance = Infinity;

                        items.forEach(item => {
                            const itemRect = item.getBoundingClientRect();
                            const itemCenterX = itemRect.left + itemRect.width / 2;
                            const distance = Math.abs(ev.clientX - itemCenterX);

                            if (distance < minDistance) {
                                minDistance = distance;
                                // If cursor is to the left of center, insert before; otherwise after
                                let candidate = (ev.clientX < itemCenterX) ? item : item.nextSibling;
                                // Skip placeholder if it's the nextSibling (can happen during drag)
                                if (candidate && candidate.classList.contains('library-preview-placeholder')) {
                                    candidate = candidate.nextSibling;
                                }
                                insertBefore = candidate;
                            }
                        });

                        // Create or move preview placeholder
                        if (!this._libraryPreview) {
                            this._libraryPreview = document.createElement('div');
                            this._libraryPreview.className = 'media-item library-preview-placeholder';
                            this._libraryPreview.innerHTML = `
                                <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: rgba(76, 175, 80, 0.2); border: 2px dashed #4CAF50; border-radius: 4px;">
                                    <span style="color: #4CAF50; font-size: 24px;">📸</span>
                                </div>
                            `;
                        }

                        // Insert preview at calculated position
                        if (insertBefore && insertBefore.parentNode === grid) {
                            grid.insertBefore(this._libraryPreview, insertBefore);
                        } else {
                            grid.appendChild(this._libraryPreview);
                        }

                        // Store the insertion reference for later (ensure it's stable and valid)
                        // Make sure insertBefore is either null or a valid media-item (not the placeholder)
                        if (insertBefore && insertBefore.classList && insertBefore.classList.contains('library-preview-placeholder')) {
                            insertBefore = insertBefore.nextSibling;
                        }
                        this._libraryInsertBefore = insertBefore;

                        // Scroll to show it if needed
                        this._libraryPreview.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                } else {
                    mediaLibrary.classList.remove('drag-over-delete');
                    // Remove preview placeholder
                    if (this._libraryPreview) {
                        this._libraryPreview.remove();
                        this._libraryPreview = null;
                        this._libraryInsertBefore = null;
                    }
                }
            }

            // Apply snapping if app reference exists
            // Check all four corners and snap to nearest
            if (this.app && this.app.snapHelper) {
                const { xLines, yLines } = this.app.snapHelper.getGridLines();
                const thresholdWorld = this.app.snapHelper.threshold / scale;

                // Corners to check
                const corners = [
                    { x: newX, y: newY }, // top-left
                    { x: newX + this.state.width, y: newY }, // top-right
                    { x: newX, y: newY + this.state.height }, // bottom-left
                    { x: newX + this.state.width, y: newY + this.state.height } // bottom-right
                ];

                // Find best X snap
                let bestXSnap = null;
                let minXDist = Infinity;
                for (const corner of corners) {
                    for (const lineX of xLines) {
                        const dist = Math.abs(corner.x - lineX);
                        if (dist < minXDist && dist < thresholdWorld) {
                            minXDist = dist;
                            bestXSnap = { line: lineX, corner: corner.x };
                        }
                    }
                }

                // Find best Y snap
                let bestYSnap = null;
                let minYDist = Infinity;
                for (const corner of corners) {
                    for (const lineY of yLines) {
                        const dist = Math.abs(corner.y - lineY);
                        if (dist < minYDist && dist < thresholdWorld) {
                            minYDist = dist;
                            bestYSnap = { line: lineY, corner: corner.y };
                        }
                    }
                }

                // Apply snaps
                if (bestXSnap) {
                    newX += (bestXSnap.line - bestXSnap.corner);
                }
                if (bestYSnap) {
                    newY += (bestYSnap.line - bestYSnap.corner);
                }
            }

            this.state.x = newX;
            this.state.y = newY;
            this.updateTransform();
        };

        const onUp = (ev) => {
            this.element.releasePointerCapture(ev.pointerId);
            this.element.removeEventListener('pointermove', onMove);
            this.element.removeEventListener('pointerup', onUp);
            // Removed dragging class
            // this.element.classList.remove('dragging');

            // Check if dropped on Media Library
            const mediaLibrary = document.getElementById('media-library');
            if (mediaLibrary) {
                mediaLibrary.classList.remove('drag-over-delete'); // Clean up

                // Remove preview placeholder
                if (this._libraryPreview) {
                    this._libraryPreview.remove();
                    this._libraryPreview = null;
                }

                const rect = mediaLibrary.getBoundingClientRect();
                if (ev.clientX >= rect.left && ev.clientX <= rect.right &&
                    ev.clientY >= rect.top && ev.clientY <= rect.bottom) {

                    // Dropped on library - Delete Frame and restore image at cursor position
                    if (this.app) {
                        // Restore image to library at the insertion point
                        if (this.content && this.content.src) {
                            console.log('Frame dropped on library. Restoring src at insertion point:', this.content.src);
                            // Pass the insertion reference and image element
                            this.app.mediaLibrary.restoreImageAt(this.content.src, this._libraryInsertBefore, this.content);
                        } else {
                            console.log('Frame dropped on library but no content src found');
                        }

                        this._libraryInsertBefore = null; // Clean up
                        this.app.pushState('delete_frame_via_drag');
                        this.app.deleteFrame(this);
                        return; // Stop processing
                    }
                }
            }

            // Push state if position changed
            if (this.state.x !== initialX || this.state.y !== initialY) {
                if (this.app && stateBefore) {
                    this.app.historyManager.pushExplicitState(stateBefore, 'move_frame');
                }
            }
        };

        this.element.addEventListener('pointermove', onMove);
        this.element.addEventListener('pointerup', onUp);
    }

    startResize(e, handle) {
        e.stopPropagation();
        this.element.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const initial = { ...this.state };

        // Capture state BEFORE resize starts
        let stateBefore = null;
        try {
            stateBefore = this.app ? this.app.historyManager.captureState() : null;
        } catch (e) {
            console.error('Failed to capture state on resize start', e);
        }

        const viewport = this.element.parentElement;
        // OPTIMIZATION: Use cached workspace scale if available to avoid getComputedStyle
        let scale = 1;
        if (this.app && this.app.workspace) {
            scale = this.app.workspace.state.scale;
        } else {
            const style = window.getComputedStyle(viewport);
            const matrix = new WebKitCSSMatrix(style.transform);
            scale = matrix.a || 1;
        }

        // Determine anchor point (opposite corner from handle)
        let anchorX, anchorY;
        if (handle.includes('w')) {
            anchorX = initial.x + initial.width; // Right edge
        } else {
            anchorX = initial.x; // Left edge
        }
        if (handle.includes('n')) {
            anchorY = initial.y + initial.height; // Bottom edge
        } else {
            anchorY = initial.y; // Top edge
        }

        // Pre-calculate content offset from center for proportional resizing
        let initialOffsetX = 0;
        let initialOffsetY = 0;
        const hasContent = this.content.naturalWidth && this.content.naturalHeight;

        if (hasContent) {
            const initialImgWidth = this.content.naturalWidth * this.state.contentScale;
            const initialImgHeight = this.content.naturalHeight * this.state.contentScale;

            const initialFrameCenterX = initial.width / 2;
            const initialFrameCenterY = initial.height / 2;

            const initialImgCenterX = this.state.contentX + initialImgWidth / 2;
            const initialImgCenterY = this.state.contentY + initialImgHeight / 2;

            initialOffsetX = initialImgCenterX - initialFrameCenterX;
            initialOffsetY = initialImgCenterY - initialFrameCenterY;
        }

        const onMove = (ev) => {
            const deltaX = (ev.clientX - startX) / scale;
            const deltaY = (ev.clientY - startY) / scale;

            // Calculate new corner position (the one being dragged)
            let movingX, movingY;

            if (handle.includes('e')) {
                movingX = initial.x + initial.width + deltaX;
            } else if (handle.includes('w')) {
                movingX = initial.x + deltaX;
            } else {
                movingX = null;
            }

            if (handle.includes('s')) {
                movingY = initial.y + initial.height + deltaY;
            } else if (handle.includes('n')) {
                movingY = initial.y + deltaY;
            } else {
                movingY = null;
            }

            // Apply snapping to the moving corner ONLY
            if (this.app && this.app.snapHelper) {
                const { xLines, yLines } = this.app.snapHelper.getGridLines();
                const thresholdWorld = this.app.snapHelper.threshold / scale;

                // Snap X if handle affects horizontal
                if (movingX !== null) {
                    let minDistX = Infinity;
                    let snappedX = movingX;
                    for (const lineX of xLines) {
                        const dist = Math.abs(movingX - lineX);
                        if (dist < minDistX && dist < thresholdWorld) {
                            minDistX = dist;
                            snappedX = lineX;
                        }
                    }
                    movingX = snappedX;
                }

                // Snap Y if handle affects vertical
                if (movingY !== null) {
                    let minDistY = Infinity;
                    let snappedY = movingY;
                    for (const lineY of yLines) {
                        const dist = Math.abs(movingY - lineY);
                        if (dist < minDistY && dist < thresholdWorld) {
                            minDistY = dist;
                            snappedY = lineY;
                        }
                    }
                    movingY = snappedY;
                }
            }

            // Calculate new position and size from anchor and moving corner
            let newX = initial.x;
            let newY = initial.y;
            let newWidth = initial.width;
            let newHeight = initial.height;

            if (movingX !== null) {
                if (handle.includes('e')) {
                    // Moving right edge
                    newWidth = Math.max(10, movingX - anchorX);
                } else if (handle.includes('w')) {
                    // Moving left edge
                    newWidth = Math.max(10, anchorX - movingX);
                    newX = anchorX - newWidth;
                }
            }

            if (movingY !== null) {
                if (handle.includes('s')) {
                    // Moving bottom edge
                    newHeight = Math.max(10, movingY - anchorY);
                } else if (handle.includes('n')) {
                    // Moving top edge
                    newHeight = Math.max(10, anchorY - movingY);
                    newY = anchorY - newHeight;
                }
            }

            this.state.x = newX;
            this.state.y = newY;
            this.state.width = newWidth;
            this.state.height = newHeight;
            this.updateTransform(scale); // Pass scale to avoid re-calculation

            // REAL-TIME CONTENT ADJUSTMENT
            if (hasContent) {
                // Recalculate scale to maintain "cover" fit
                const aspect = this.content.naturalWidth / this.content.naturalHeight;
                const frameAspect = newWidth / newHeight;

                let newScale;
                if (aspect > frameAspect) {
                    // Image is wider - fit to height
                    newScale = newHeight / this.content.naturalHeight;
                } else {
                    // Image is taller - fit to width
                    newScale = newWidth / this.content.naturalWidth;
                }

                this.state.contentScale = newScale;

                // Calculate NEW image dimensions after scale update
                const newImgWidth = this.content.naturalWidth * newScale;
                const newImgHeight = this.content.naturalHeight * newScale;

                // Calculate new offset proportionally to size change
                const scaleX = newWidth / initial.width;
                const scaleY = newHeight / initial.height;
                const newOffsetX = initialOffsetX * scaleX;
                const newOffsetY = initialOffsetY * scaleY;

                // Calculate new position to maintain proportional offset
                const newCenterX = newWidth / 2;
                const newCenterY = newHeight / 2;
                this.state.contentX = (newCenterX + newOffsetX) - newImgWidth / 2;
                this.state.contentY = (newCenterY + newOffsetY) - newImgHeight / 2;

                this.updateContentTransform();
            }
        };

        const onUp = (ev) => {
            this.element.releasePointerCapture(ev.pointerId);
            this.element.removeEventListener('pointermove', onMove);
            this.element.removeEventListener('pointerup', onUp);

            // Push state if size/pos changed
            if (this.state.width !== initial.width || this.state.height !== initial.height ||
                this.state.x !== initial.x || this.state.y !== initial.y) {
                if (this.app && stateBefore) {
                    this.app.historyManager.pushExplicitState(stateBefore, 'resize_frame');
                }
            }
        };

        this.element.addEventListener('pointermove', onMove);
        this.element.addEventListener('pointerup', onUp);
    }

    enterContentEditMode(e) {
        if (e) e.stopPropagation();
        this.state.mode = 'content-edit';

        // Lazy init: render content overlay/handles only on first edit
        if (!this.contentHandlesRendered) {
            this.renderContentHandles();
            this.contentHandlesRendered = true;
            // Ensure overlay has correct size immediately
            this.updateContentTransform();
        }

        // Make frame visible outside boundaries so handles show up
        this.element.style.overflow = 'visible';
        this.element.style.zIndex = '1000';

        // Show crop area clearly
        this.element.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.5)';
        this.element.style.outline = 'none';
        this.element.classList.remove('selected');
        this.element.classList.add('editing');
        this.updateHandleVisibility();

        if (this.contentOverlay) {
            this.contentOverlay.style.display = 'block';
            // Ensure overlay is on top of mask
            this.contentOverlay.style.zIndex = '1001';
        }

        // Add wheel listener for zoom - REMOVED as per user request
        // this.wheelHandler = (ev) => { ... };
        // this.element.addEventListener('wheel', this.wheelHandler, { passive: false });
    }

    exitContentEditMode() {
        this.state.mode = 'normal';
        this.element.classList.remove('editing');

        // Restore overflow and z-index
        this.element.style.overflow = 'hidden'; // Clip everything again
        this.element.style.zIndex = '';
        this.element.style.boxShadow = '';

        this.element.style.border = '1px solid #ddd';
        this.element.style.outline = '';
        if (this.state.isSelected) {
            this.element.classList.add('selected');
        }
        this.updateHandleVisibility();

        if (this.contentOverlay) {
            this.contentOverlay.style.display = 'none';
        }

        if (this.wheelHandler) {
            this.element.removeEventListener('wheel', this.wheelHandler);
            this.wheelHandler = null;
        }
    }

    startContentPan(e) {
        this.element.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const initialX = this.state.contentX;
        const initialY = this.state.contentY;

        // Capture state BEFORE pan starts
        let stateBefore = null;
        try {
            stateBefore = this.app ? this.app.historyManager.captureState() : null;
        } catch (e) {
            console.error('Failed to capture state on pan start', e);
        }

        const viewport = this.element.parentElement;
        const style = window.getComputedStyle(viewport);
        const matrix = new WebKitCSSMatrix(style.transform);
        const scale = matrix.a || 1;

        const onMove = (ev) => {
            const deltaX = (ev.clientX - startX) / scale;
            const deltaY = (ev.clientY - startY) / scale;

            let newX = initialX + deltaX;
            let newY = initialY + deltaY;

            // Snapping Logic
            const SNAP_THRESHOLD = 10;
            const currentWidth = this.content.naturalWidth * this.state.contentScale;
            const currentHeight = this.content.naturalHeight * this.state.contentScale;

            // Horizontal Snaps
            // Left to Left
            if (Math.abs(newX) < SNAP_THRESHOLD) newX = 0;
            // Right to Right
            else if (Math.abs((newX + currentWidth) - this.state.width) < SNAP_THRESHOLD) newX = this.state.width - currentWidth;
            // Center to Center
            else if (Math.abs((newX + currentWidth / 2) - (this.state.width / 2)) < SNAP_THRESHOLD) newX = (this.state.width / 2) - (currentWidth / 2);
            // Left to Right (Outer)
            else if (Math.abs(newX - this.state.width) < SNAP_THRESHOLD) newX = this.state.width;
            // Right to Left (Outer)
            else if (Math.abs(newX + currentWidth) < SNAP_THRESHOLD) newX = -currentWidth;

            // Vertical Snaps
            // Top to Top
            if (Math.abs(newY) < SNAP_THRESHOLD) newY = 0;
            // Bottom to Bottom
            else if (Math.abs((newY + currentHeight) - this.state.height) < SNAP_THRESHOLD) newY = this.state.height - currentHeight;
            // Center to Center
            else if (Math.abs((newY + currentHeight / 2) - (this.state.height / 2)) < SNAP_THRESHOLD) newY = (this.state.height / 2) - (currentHeight / 2);
            // Top to Bottom (Outer)
            else if (Math.abs(newY - this.state.height) < SNAP_THRESHOLD) newY = this.state.height;
            // Bottom to Top (Outer)
            else if (Math.abs(newY + currentHeight) < SNAP_THRESHOLD) newY = -currentHeight;

            this.state.contentX = newX;
            this.state.contentY = newY;
            this.updateContentTransform();
        };

        const onUp = (ev) => {
            this.element.releasePointerCapture(ev.pointerId);
            this.element.removeEventListener('pointermove', onMove);
            this.element.removeEventListener('pointerup', onUp);

            if (this.app && stateBefore) {
                this.app.historyManager.pushExplicitState(stateBefore, 'pan_content');
            }
        };

        this.element.addEventListener('pointermove', onMove);
        this.element.addEventListener('pointerup', onUp);
    }

    startContentResize(e, handle) {
        this.element.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;

        const initialX = this.state.contentX;
        const initialY = this.state.contentY;
        const initialScale = this.state.contentScale;
        const naturalWidth = this.content.naturalWidth;
        const naturalHeight = this.content.naturalHeight;
        const currentWidth = naturalWidth * initialScale;
        const currentHeight = naturalHeight * initialScale;

        // Capture state
        let stateBefore = null;
        try {
            stateBefore = this.app ? this.app.historyManager.captureState() : null;
        } catch (e) {
            console.error('Failed to capture state on content resize', e);
        }

        const viewport = this.element.parentElement;
        const style = window.getComputedStyle(viewport);
        const matrix = new WebKitCSSMatrix(style.transform);
        const viewportScale = matrix.a || 1;

        // Calculate anchor point (fixed point)
        // TL is (initialX, initialY)
        // BR is (initialX + currentWidth, initialY + currentHeight)

        let anchorX, anchorY;

        if (handle === 'se') {
            anchorX = initialX;
            anchorY = initialY;
        } else if (handle === 'nw') {
            anchorX = initialX + currentWidth;
            anchorY = initialY + currentHeight;
        } else if (handle === 'sw') {
            anchorX = initialX + currentWidth;
            anchorY = initialY;
        } else if (handle === 'ne') {
            anchorX = initialX;
            anchorY = initialY + currentHeight;
        }

        const onMove = (ev) => {
            const deltaX = (ev.clientX - startX) / viewportScale;
            const deltaY = (ev.clientY - startY) / viewportScale;

            let newScale = initialScale;
            let newX = initialX;
            let newY = initialY;

            // 1. Calculate raw new dimensions/position based on mouse
            // ... (existing logic logic reused/refactored for snapping)

            // We need to calculate the "proposed" edges first to check for snaps
            let proposedWidth, proposedHeight, proposedX, proposedY;

            // Helper to calculate proposed state without snapping
            const calculateProposed = (dx, dy) => {
                let w = currentWidth;
                let h = currentHeight;
                let x = initialX;
                let y = initialY;

                if (handle === 'se') {
                    w = Math.max(10, currentWidth + dx);
                    // Aspect ratio constraint
                    h = w / (naturalWidth / naturalHeight);
                } else if (handle === 'nw') {
                    w = Math.max(10, currentWidth - dx);
                    h = w / (naturalWidth / naturalHeight);
                    x = anchorX - w;
                    y = anchorY - h;
                } else if (handle === 'sw') {
                    w = Math.max(10, currentWidth - dx);
                    h = w / (naturalWidth / naturalHeight);
                    x = anchorX - w;
                    // y stays same
                } else if (handle === 'ne') {
                    w = Math.max(10, currentWidth + dx);
                    h = w / (naturalWidth / naturalHeight);
                    // x stays same
                    y = anchorY - h;
                }
                return { w, h, x, y };
            };

            const proposed = calculateProposed(deltaX, deltaY);

            // 2. Check Snaps
            const SNAP_THRESHOLD = 10;
            let bestSnap = null;
            let minSnapDist = Infinity;

            // Check X Snaps (Left/Right)
            if (handle.includes('w')) {
                // Dragging Left edge
                const distLeft = Math.abs(proposed.x); // Snap to 0
                if (distLeft < SNAP_THRESHOLD && distLeft < minSnapDist) {
                    minSnapDist = distLeft;
                    bestSnap = { type: 'x', val: 0, edge: 'left' };
                }
            } else if (handle.includes('e')) {
                // Dragging Right edge
                const rightEdge = proposed.x + proposed.w;
                const distRight = Math.abs(rightEdge - this.state.width); // Snap to Frame Width
                if (distRight < SNAP_THRESHOLD && distRight < minSnapDist) {
                    minSnapDist = distRight;
                    bestSnap = { type: 'x', val: this.state.width, edge: 'right' };
                }
            }

            // Check Y Snaps (Top/Bottom)
            if (handle.includes('n')) {
                // Dragging Top edge
                const distTop = Math.abs(proposed.y); // Snap to 0
                if (distTop < SNAP_THRESHOLD && distTop < minSnapDist) {
                    minSnapDist = distTop;
                    bestSnap = { type: 'y', val: 0, edge: 'top' };
                }
            } else if (handle.includes('s')) {
                // Dragging Bottom edge
                const bottomEdge = proposed.y + proposed.h;
                const distBottom = Math.abs(bottomEdge - this.state.height); // Snap to Frame Height
                if (distBottom < SNAP_THRESHOLD && distBottom < minSnapDist) {
                    minSnapDist = distBottom;
                    bestSnap = { type: 'y', val: this.state.height, edge: 'bottom' };
                }
            }

            // 3. Apply Snap if found
            if (bestSnap) {
                if (bestSnap.type === 'x') {
                    // Snap Width
                    let snappedWidth;
                    if (bestSnap.edge === 'left') {
                        // Left edge snapped to 0. Anchor is Right.
                        // Width = AnchorX - 0
                        snappedWidth = anchorX; // Since anchorX is the fixed right edge
                    } else {
                        // Right edge snapped to Width. Anchor is Left.
                        // Width = FrameWidth - AnchorX
                        snappedWidth = this.state.width - anchorX;
                    }
                    newScale = snappedWidth / naturalWidth;
                } else {
                    // Snap Height
                    let snappedHeight;
                    if (bestSnap.edge === 'top') {
                        // Top edge snapped to 0. Anchor is Bottom.
                        // Height = AnchorY - 0
                        snappedHeight = anchorY;
                    } else {
                        // Bottom edge snapped to Height. Anchor is Top.
                        // Height = FrameHeight - AnchorY
                        snappedHeight = this.state.height - anchorY;
                    }
                    newScale = snappedHeight / naturalHeight;
                }
            } else {
                // No snap, use proposed scale
                newScale = proposed.w / naturalWidth;
            }

            // 4. Recalculate Position based on Final Scale
            const finalWidth = naturalWidth * newScale;
            const finalHeight = naturalHeight * newScale;

            if (handle === 'se') {
                newX = initialX;
                newY = initialY;
            } else if (handle === 'nw') {
                newX = anchorX - finalWidth;
                newY = anchorY - finalHeight;
            } else if (handle === 'sw') {
                newX = anchorX - finalWidth;
                newY = anchorY;
            } else if (handle === 'ne') {
                newX = anchorX;
                newY = anchorY - finalHeight;
            }

            this.state.contentScale = newScale;
            this.state.contentX = newX;
            this.state.contentY = newY;
            this.updateContentTransform();
        };

        const onUp = (ev) => {
            this.element.releasePointerCapture(ev.pointerId);
            this.element.removeEventListener('pointermove', onMove);
            this.element.removeEventListener('pointerup', onUp);

            if (this.app && stateBefore) {
                this.app.historyManager.pushExplicitState(stateBefore, 'resize_content');
            }
        };

        this.element.addEventListener('pointermove', onMove);
        this.element.addEventListener('pointerup', onUp);
    }

    select() {
        if (this.state.isSelected) return;

        this.state.isSelected = true;
        this.element.classList.add('selected');

        // Lazy init handles
        if (!this.handlesRendered) {
            this.renderHandles();
            this.handlesRendered = true;
        }

        this.updateHandleVisibility();
    }

    deselect() {
        if (!this.state.isSelected) return;

        this.state.isSelected = false;
        this.element.classList.remove('selected');

        // Exit content edit mode if active
        if (this.state.mode === 'content-edit') {
            this.exitContentEditMode();
        }

        // Remove handles to save memory/DOM
        if (this.handlesContainer) {
            this.handlesContainer.remove();
            this.handlesContainer = null;
        }
        // Note: We don't necessarily need to remove handles every time if we want to cache them,
        // but removing them keeps DOM light. 
        // For now, let's just hide them or remove them. 
        // The previous logic removed them.

        // Actually, renderHandles appends to this.element directly, not a container?
        // Let's check renderHandles again. It appends children.
        // If we want to remove them, we should remove the elements.
        if (this.cachedHandles) {
            this.cachedHandles.forEach(h => h.remove());
            this.cachedHandles = null;
        }
        if (this.contentOverlay) {
            this.contentOverlay.remove();
            this.contentOverlay = null;
        }

        this.handlesRendered = false;
        this.contentHandlesRendered = false;
        this.cachedContentHandles = null;
    }

    updateTransform(scale) {
        this.element.style.left = `${this.state.x}px`;
        this.element.style.top = `${this.state.y}px`;
        this.element.style.width = `${this.state.width}px`;
        this.element.style.height = `${this.state.height}px`;

        // Update handle scale when frame transform changes
        if (this.handlesRendered || this.contentHandlesRendered) {
            this.updateHandleScale(scale);
        }
    }

    updateContentTransform() {
        const transform = `translate(${this.state.contentX}px, ${this.state.contentY}px) scale(${this.state.contentScale})`;
        this.content.style.transform = transform;

        if (this.contentOverlay) {
            // Do NOT scale the overlay, otherwise borders and handles shrink too.
            // Instead, set its dimensions to the scaled size of the image.
            const scaledWidth = this.content.naturalWidth * this.state.contentScale;
            const scaledHeight = this.content.naturalHeight * this.state.contentScale;

            this.contentOverlay.style.width = `${scaledWidth}px`;
            this.contentOverlay.style.height = `${scaledHeight}px`;
            this.contentOverlay.style.transform = `translate(${this.state.contentX}px, ${this.state.contentY}px)`;
        }
    }

    updateHandleVisibility() {
        const shouldShow = this.state.isSelected && this.state.mode !== 'content-edit';
        this.element.querySelectorAll('.handle').forEach(h => {
            h.style.display = shouldShow ? 'block' : 'none';
        });
    }

    destroy() {
        // Cleanup event listeners
        if (this.escapeHandler) {
            window.removeEventListener('keydown', this.escapeHandler);
        }
        if (this.wheelHandler) {
            this.element.removeEventListener('wheel', this.wheelHandler);
        }
        this.element.remove();
    }
}
