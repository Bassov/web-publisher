import { Workspace } from './Workspace.js';
import { PageManager } from './PageManager.js';
import { Frame } from './Frame.js';
import { Exporter } from '../utils/Exporter.js';
import { PropertiesPanel } from '../ui/PropertiesPanel.js';
import { MediaLibrary } from '../ui/MediaLibrary.js';
import { SnapHelper } from '../utils/SnapHelper.js';
import { HistoryManager } from '../utils/HistoryManager.js';

export class App {
    constructor() {
        console.log('App Initialized');
        this.init();
    }

    init() {
        this.workspace = new Workspace('workspace', 'viewport');
        this.pageManager = new PageManager(this.workspace.viewport, this);
        this.snapHelper = new SnapHelper(this.pageManager);
        this.propertiesPanel = new PropertiesPanel('properties-content', this);
        this.mediaLibrary = new MediaLibrary('media-library');
        this.historyManager = new HistoryManager(this);

        this.frames = [];

        // Debounce helper
        this.debounce = (func, wait) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        };

        // Set workspace callback to update frame handles on zoom/pan
        // CRITICAL OPTIMIZATION: Skip ALL updates during active zoom
        this.workspace.onTransformChange = (viewportBounds, zoomEnded = false) => {
            // If actively zooming, skip all updates for maximum performance
            if (this.workspace.state.isZooming && !zoomEnded) {
                return; // Skip completely during zoom
            }

            // Only update handles when zoom has ended
            this.updateVisibleFrameHandles();
        };

        this.initDragDrop();
        // this.initAddImage(); // Handled by MediaLibrary
        this.initExport();
        this.initFrameSelection();
        this.initShortcutsModal();
        this.initContextualPanelToggles();

        // Auto-fit all pages in viewport on startup
        this.workspace.fitToPages(this.pageManager);
    }

    // OPTIMIZATION: Check if frame is visible in viewport
    isFrameInViewport(frame, bounds) {
        const { x, y, width, height } = frame.state;
        return !(x + width < bounds.left ||
            x > bounds.right ||
            y + height < bounds.top ||
            y > bounds.bottom);
    }

    // OPTIMIZATION: Update handles only for visible frames
    updateVisibleFrameHandles() {
        // CRITICAL FIX: Pass workspace scale directly to avoid getComputedStyle()
        const workspaceScale = this.workspace.state.scale;
        const viewportBounds = this.workspace.getViewportBounds();

        this.frames.forEach(frame => {
            if (this.isFrameInViewport(frame, viewportBounds)) {
                if (frame.handlesRendered || frame.contentHandlesRendered) {
                    // Pass scale directly instead of letting frame calculate it
                    frame.updateHandleScale(workspaceScale);
                }
            }
        });
    }

    initContextualPanelToggles() {
        const sidebar = document.getElementById('sidebar');
        let currentMode = null;

        const closePanel = () => {
            sidebar.classList.remove('visible');
            this.propertiesPanel.hide();
            currentMode = null;
        };

        const togglePanel = (mode) => {
            if (currentMode === mode) {
                closePanel();
            } else {
                // Open sidebar with new mode
                sidebar.classList.add('visible');
                if (mode === 'grid') {
                    this.propertiesPanel.showGridSettings();
                } else if (mode === 'page') {
                    this.propertiesPanel.showPageSettings();
                }
                currentMode = mode;
            }
        };

        // Grid settings button
        const gridBtn = document.getElementById('btn-grid-settings');
        if (gridBtn) {
            gridBtn.addEventListener('click', () => togglePanel('grid'));
        }

        // Page settings button
        const pageBtn = document.getElementById('btn-page-settings');
        if (pageBtn) {
            pageBtn.addEventListener('click', () => togglePanel('page'));
        }

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) &&
                !gridBtn?.contains(e.target) &&
                !pageBtn?.contains(e.target) &&
                sidebar.classList.contains('visible')) {
                closePanel();
            }
        });

        // Close sidebar on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('visible')) {
                closePanel();
            }
        });
    }

    initDragDrop() {
        const container = document.body;
        let dragCounter = 0;

        container.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;

            // Don't show global drop zone for internal media drags
            if (!e.dataTransfer.types.includes('application/media-library')) {
                container.classList.add('drag-over');
            }
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter === 0) {
                container.classList.remove('drag-over');
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            container.classList.remove('drag-over');

            // Check for Media Library drop using types first (more reliable)
            if (e.dataTransfer.types.includes('application/media-library')) {
                const mediaData = e.dataTransfer.getData('application/media-library');
                if (mediaData) {
                    try {
                        this.handleMediaDrop(JSON.parse(mediaData), e.clientX, e.clientY);
                    } catch (err) {
                        console.error('Failed to handle media drop:', err);
                    }
                    return;
                }
            }

            // Only handle files if it's NOT an internal drag
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFiles(files, e.clientX, e.clientY);
            }
        });
    }

    handleFiles(files, clientX, clientY) {
        if (files.length === 0) return;

        // Route all files to Media Library
        this.mediaLibrary.addFiles(files);
    }

    handleMediaDrop(data, clientX, clientY) {
        // Capture state
        let stateBefore = null;
        try {
            stateBefore = this.historyManager.captureState();
        } catch (e) {
            console.error('Failed to capture state', e);
        }

        // Calculate frame size based on aspect ratio
        const baseSize = 300;
        const aspect = data.width / data.height;
        let width, height;

        if (aspect > 1) {
            width = baseSize;
            height = baseSize / aspect;
        } else {
            height = baseSize;
            width = baseSize * aspect;
        }

        // Convert screen coordinates to workspace coordinates
        const point = this.workspace.screenToWorld(clientX, clientY);

        // Center frame on mouse
        const x = point.x - width / 2;
        const y = point.y - height / 2;

        const frame = new Frame(x, y, width, height, data.objectURL, this);
        this.frames.push(frame);
        this.workspace.viewport.appendChild(frame.element);

        // Remove from Media Library
        if (data.id && this.mediaLibrary) {
            this.mediaLibrary.removeImage(data.id);
        }

        // Select the new frame
        this.selectFrame(frame);

        // Remove from library
        if (this.mediaLibrary) {
            this.mediaLibrary.removeImage(data.id);
        }

        // Push history
        if (stateBefore) {
            this.historyManager.pushExplicitState(stateBefore, 'add_frame');
        }
    }

    createSingleFrameFromFile(file, clientX, clientY, stateBefore) {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            // Create temp image to get dimensions
            const img = new Image();
            img.onload = () => {
                let worldPos;

                // If clientX/Y provided (drop), use them
                if (clientX !== undefined && clientY !== undefined) {
                    worldPos = this.workspace.screenToWorld(clientX, clientY);
                } else {
                    // Otherwise center in viewport
                    // We need frame size first
                    worldPos = { x: 100, y: 100 }; // Temporary default
                }

                // Calculate frame size based on image aspect ratio
                const maxSize = 400; // Maximum dimension
                const aspect = img.width / img.height;

                let frameWidth, frameHeight;
                if (aspect > 1) {
                    // Landscape
                    frameWidth = maxSize;
                    frameHeight = maxSize / aspect;
                } else {
                    // Portrait or square
                    frameHeight = maxSize;
                    frameWidth = maxSize * aspect;
                }

                // Recalculate center if no drop position
                if (clientX === undefined) {
                    // Center of viewport (approximate visible area)
                    // For now just put it at some offset
                    const viewportRect = this.workspace.viewport.getBoundingClientRect();
                    const containerRect = this.workspace.container.getBoundingClientRect();

                    // Simple center relative to current view
                    // This is hard without workspace state, let's just put it at 100,100 or center of page 1
                    worldPos = { x: 100, y: 100 };
                }

                const frame = new Frame(worldPos.x, worldPos.y, frameWidth, frameHeight, e.target.result, this);
                this.frames.push(frame);
                this.workspace.viewport.appendChild(frame.element);

                if (stateBefore) {
                    this.historyManager.pushExplicitState(stateBefore, 'add_image');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // initAddImage removed - handled by MediaLibrary

    createFramesFromFiles(files, stateBefore) {
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        // Auto-arrange in grid
        const gridCols = Math.ceil(Math.sqrt(imageFiles.length));
        const spacing = 50;
        const baseSize = 300;
        const centerX = 0;
        const centerY = 0;

        let currentIndex = 0;
        // OPTIMIZATION: Use DocumentFragment to batch DOM updates
        const fragment = document.createDocumentFragment();
        const newFrames = [];

        const processNextBatch = () => {
            // Process up to 5 images at a time to keep UI responsive but fast
            const batchSize = 5;
            const endIndex = Math.min(currentIndex + batchSize, imageFiles.length);

            let loadedCount = 0;
            const batchTotal = endIndex - currentIndex;

            for (let i = currentIndex; i < endIndex; i++) {
                const file = imageFiles[i];
                const objectURL = URL.createObjectURL(file);
                const img = new Image();

                img.onload = () => {
                    const aspect = img.width / img.height;
                    let frameWidth, frameHeight;

                    if (aspect > 1) {
                        frameWidth = baseSize;
                        frameHeight = baseSize / aspect;
                    } else {
                        frameHeight = baseSize;
                        frameWidth = baseSize * aspect;
                    }

                    const row = Math.floor(i / gridCols);
                    const col = i % gridCols;
                    const x = centerX + (col * (baseSize + spacing)) - (gridCols * (baseSize + spacing) / 2);
                    const y = centerY + (row * (baseSize + spacing));

                    const frame = new Frame(x, y, frameWidth, frameHeight, objectURL, this);
                    newFrames.push(frame);
                    fragment.appendChild(frame.element);

                    loadedCount++;
                    checkBatchComplete();
                };

                img.onerror = () => {
                    console.error('Failed to load image:', file.name);
                    URL.revokeObjectURL(objectURL);
                    loadedCount++;
                    checkBatchComplete();
                };

                img.src = objectURL;
            }

            const checkBatchComplete = () => {
                if (loadedCount === batchTotal) {
                    // Batch done
                    currentIndex += batchTotal;

                    // Append this batch to DOM in one go
                    if (fragment.children.length > 0) {
                        this.workspace.viewport.appendChild(fragment);
                        // Add to frames array
                        this.frames.push(...newFrames);
                        // Clear temp arrays for next batch
                        newFrames.length = 0;
                    }

                    if (currentIndex < imageFiles.length) {
                        // Schedule next batch
                        requestAnimationFrame(processNextBatch);
                    } else {
                        // All done
                        if (stateBefore) {
                            this.historyManager.pushExplicitState(stateBefore, 'add_images');
                        }
                    }
                }
            };
        };

        processNextBatch();
    }

    initFrameSelection() {
        // Click on workspace or page to deselect
        this.workspace.container.addEventListener('click', (e) => {
            if (e.target === this.workspace.container || e.target.classList.contains('page')) {
                this.deselectAllFrames();
            }
        });

        // Also handle clicks on viewport
        this.workspace.viewport.addEventListener('click', (e) => {
            if (e.target === this.workspace.viewport || e.target.classList.contains('page')) {
                this.deselectAllFrames();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                this.historyManager.undo();
            }

            // Redo: Ctrl+Shift+Z or Ctrl+Y
            if (((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey) ||
                ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
                e.preventDefault();
                this.historyManager.redo();
            }

            // Delete: Delete or Backspace (if frame selected)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = this.frames.find(f => f.state.isSelected);
                if (selected) {
                    this.pushState('delete_frame');
                    this.deleteFrame(selected);
                }
            }

            // Arrow keys: Nudge selected frame
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                const selected = this.frames.find(f => f.state.isSelected);
                if (selected) {
                    e.preventDefault();

                    // Capture state on first move of a sequence
                    if (!this.isNudging) {
                        this.nudgeStateBefore = this.historyManager.captureState();
                        this.isNudging = true;
                    }

                    const step = e.shiftKey ? 10 : 1;

                    if (e.key === 'ArrowLeft') selected.state.x -= step;
                    if (e.key === 'ArrowRight') selected.state.x += step;
                    if (e.key === 'ArrowUp') selected.state.y -= step;
                    if (e.key === 'ArrowDown') selected.state.y += step;

                    selected.updateTransform();
                }
            }
        });

        // Handle keyup to push history state after nudging is done
        document.addEventListener('keyup', (e) => {
            if (this.isNudging && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                // Only push if no other arrow keys are still pressed (simplified: just push)
                // Better: Debounce or wait? For now, pushing on keyup is acceptable UX.
                // But if user holds key, keyup happens only at end. That's perfect.
                // If user taps quickly, we might get multiple history entries.
                // Let's stick to simple keyup for now.

                if (this.nudgeStateBefore) {
                    this.historyManager.pushExplicitState(this.nudgeStateBefore, 'nudge_frame');
                    this.nudgeStateBefore = null;
                }
                this.isNudging = false;
            }
        });
    }

    pushState(actionName) {
        if (this.historyManager) {
            this.historyManager.pushState(actionName);
        }
    }

    restoreFrames(framesData) {
        // Recreate frames from data
        framesData.forEach(data => {
            // Pass null for image initially to avoid auto-load logic overwriting state
            const frame = new Frame(data.x, data.y, data.width, data.height, null, this);

            // Restore content state FIRST
            frame.state.contentX = data.contentX;
            frame.state.contentY = data.contentY;
            frame.state.contentScale = data.contentScale;

            // Then load image with preservation flag
            if (data.content) {
                frame.setImage(data.content, true);
            }

            frame.updateContentTransform();

            if (data.isSelected) {
                this.selectFrame(frame);
            }

            this.frames.push(frame);
            this.workspace.viewport.appendChild(frame.element);
        });
    }

    // OPTIMIZATION: O(1) Selection Logic
    selectFrame(frame) {
        // If already selected, do nothing
        if (this.selectedFrame === frame) return;

        // Deselect current if exists
        if (this.selectedFrame) {
            this.selectedFrame.deselect();
        }

        // Select new
        this.selectedFrame = frame;
        this.selectedFrame.select(); // Delegate to frame for visuals

        // Update UI
        this.propertiesPanel.setSelectedFrame(frame);
    }

    deselectAllFrames() {
        // OPTIMIZATION: Only deselect the active frame, don't iterate all
        if (this.selectedFrame) {
            this.selectedFrame.deselect();
            this.selectedFrame = null;
        }
        this.propertiesPanel.setSelectedFrame(null);
    }

    deleteFrame(frame) {
        const index = this.frames.indexOf(frame);
        if (index > -1) {
            this.frames.splice(index, 1);
            frame.destroy();
        }
    }

    initExport() {
        // Try to find button in media library first, fallback to toolbar if needed (though toolbar is being removed)
        const btn = document.getElementById('btn-export-lib') || document.getElementById('btn-export');
        if (!btn) {
            console.error('Export button not found!');
            return;
        }

        // Get modal elements
        const modal = document.getElementById('export-modal');
        const closeBtn = document.getElementById('btn-close-export-modal');
        const cancelBtn = document.getElementById('btn-cancel-export');
        const confirmBtn = document.getElementById('btn-confirm-export');
        const chooseFolderBtn = document.getElementById('btn-choose-folder');
        const prefixInput = document.getElementById('export-prefix');
        const pathInput = document.getElementById('export-path');

        // Store selected directory handle
        let selectedDirHandle = null;

        // Open modal on Export button click
        btn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            prefixInput.focus();
            prefixInput.select();
        });

        // Close modal handlers
        const closeModal = () => {
            modal.classList.add('hidden');
            selectedDirHandle = null;
            pathInput.value = 'Downloads';
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        // Close on click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Choose folder button
        chooseFolderBtn.addEventListener('click', async () => {
            if ('showDirectoryPicker' in window) {
                try {
                    const dirHandle = await window.showDirectoryPicker();

                    // Check if user selected Downloads folder (restricted)
                    if (dirHandle.name.toLowerCase() === 'downloads' ||
                        dirHandle.name.toLowerCase() === 'загрузки') {
                        // Silently treat as if user didn't select a folder
                        pathInput.value = 'Downloads';
                        selectedDirHandle = null;
                    } else {
                        selectedDirHandle = dirHandle;
                        pathInput.value = dirHandle.name;
                    }
                } catch (e) {
                    // User cancelled - do nothing
                    console.log('Folder selection cancelled');
                }
            } else {
                alert('Folder selection is not supported in your browser. Files will download to your default Downloads folder.');
            }
        });

        // Confirm export
        confirmBtn.addEventListener('click', async () => {
            const prefix = prefixInput.value.trim() || 'pages';

            try {
                const pages = this.pageManager.pages.map(p => {
                    return {
                        x: parseFloat(p.style.left),
                        y: parseFloat(p.style.top),
                        width: parseFloat(p.style.width),
                        height: parseFloat(p.style.height)
                    };
                });

                console.log('Exporting', pages.length, 'pages with', this.frames.length, 'frames');

                // Pass prefix to export
                const results = await Exporter.export(pages, this.frames, prefix);

                // Pass dirHandle to download (will be null if using Downloads)
                await Exporter.download(results, selectedDirHandle);

                console.log('Export complete');
                closeModal();
            } catch (error) {
                console.error('Export error:', error);
                alert('Export failed: ' + error.message);
            }
        });
    }

    initShortcutsModal() {
        const modal = document.getElementById('shortcuts-modal');
        const btn = document.getElementById('btn-help-lib') || document.getElementById('btn-shortcuts');
        const closeBtn = document.getElementById('btn-close-modal');

        if (!modal || !btn || !closeBtn) return;

        const toggleModal = () => {
            modal.classList.toggle('hidden');
        };

        btn.addEventListener('click', toggleModal);
        closeBtn.addEventListener('click', toggleModal);

        // Close on click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });

        // Close on Escape (already handled globally, but let's ensure it closes modal if open)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
    }
}
