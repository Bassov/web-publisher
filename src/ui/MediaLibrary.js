export class MediaLibrary {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.images = []; // Array of {id, file, objectURL, width, height, thumbnail}
        this.currentId = 0;
        this.isLoading = false;
        this.loadQueue = [];

        this.init();
    }

    init() {
        // Create UI structure
        this.container.innerHTML = `
            <div class="media-library-header">
                <div class="media-library-actions left">
                    <button id="btn-upload" class="btn-primary small">Upload</button>
                    <button id="btn-clear-library" class="btn-text">Clear All</button>
                    <span class="image-count" style="margin-left: 8px; border-left: 1px solid #333; padding-left: 8px;">0 images</span>
                    <input type="file" id="media-upload-input" multiple accept="image/*" style="display: none;">
                </div>
                <div class="media-library-actions right">
                    <button id="btn-export-lib" class="btn-text">Export</button>
                    <button id="btn-help-lib" class="btn-icon" title="Shortcuts">?</button>
                    <button id="btn-toggle-media" class="btn-icon" title="Toggle Media Library">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="media-library-grid" id="media-grid"></div>
        `;

        this.grid = document.getElementById('media-grid');
        this.countEl = this.container.querySelector('.image-count');
        this.fileInput = document.getElementById('media-upload-input');

        // Initialize Worker
        this.worker = new Worker('src/workers/thumbnail.worker.js');
        this.worker.onmessage = (e) => this.handleWorkerMessage(e);

        // Queue management
        this.loadQueue = [];
        this.activeRequests = 0;
        this.MAX_CONCURRENT = 2; // Process 2 images at a time to ensure responsiveness

        // Event listeners
        document.getElementById('btn-clear-library').addEventListener('click', () => this.clearAll());

        document.getElementById('btn-upload').addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.addFiles(e.target.files);
                this.fileInput.value = '';
            }
        });

        // Media Library toggle (collapse/expand itself)
        const toggleMediaBtn = document.getElementById('btn-toggle-media');
        toggleMediaBtn.addEventListener('click', () => {
            const container = this.container;
            const isCollapsed = container.classList.toggle('collapsed');
            toggleMediaBtn.classList.toggle('rotated', isCollapsed);
            // Add body class for CSS targeting
            document.body.classList.toggle('media-library-collapsed', isCollapsed);
        });

        // Horizontal scroll with mouse wheel
        this.grid.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.grid.scrollLeft += e.deltaY;
            }
        });
    }

    addFiles(files) {
        console.log('addFiles called with', files.length, 'files');
        const imageFiles = Array.from(files).filter(f => {
            console.log('Checking file:', f.name, f.type);
            return f.type.startsWith('image/');
        });
        console.log('Filtered image files:', imageFiles.length);

        imageFiles.forEach(file => {
            const id = this.currentId++;
            const objectURL = URL.createObjectURL(file);

            // Store initial data
            const imageData = {
                id,
                file,
                objectURL,
                status: 'queued'
            };

            this.images.push(imageData);
            this.renderPlaceholder(imageData);
            this.updateCount();

            // Add to queue
            this.loadQueue.push(imageData);
            this.processQueue();
        });
    }

    async restoreImage(src, imgElement = null) {
        console.log('Restoring image:', src);
        // Check if image already exists
        const existingImg = this.images.find(img => img.objectURL === src);
        if (existingImg) {
            console.log('Image already exists in library');
            const item = this.grid.querySelector(`.media-item[data-id="${existingImg.id}"]`);
            if (item) {
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                item.classList.add('highlight-restored');
                setTimeout(() => item.classList.remove('highlight-restored'), 2000);
            }
            return;
        }

        // Helper to add blob
        const addBlob = (blob) => {
            console.log('Adding blob:', blob.type, blob.size);
            const type = blob.type || 'image/jpeg';
            const ext = type.split('/')[1] || 'jpg';
            const file = new File([blob], `restored-image.${ext}`, { type: type });
            this.addFiles([file]);
        };

        // 1. Try fetching the URL (works for Data URLs and valid Blob URLs)
        try {
            console.log('Fetching blob...');
            const response = await fetch(src);
            if (!response.ok) throw new Error('Fetch failed');
            const blob = await response.blob();
            addBlob(blob);
            return;
        } catch (e) {
            console.warn('Fetch failed, trying canvas fallback:', e);
        }

        // 2. Fallback: Draw Image Element to Canvas (works if URL is revoked but image is visible)
        if (imgElement) {
            try {
                console.log('Attempting canvas fallback...');
                const canvas = document.createElement('canvas');
                canvas.width = imgElement.naturalWidth;
                canvas.height = imgElement.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgElement, 0, 0);

                canvas.toBlob(blob => {
                    if (blob) {
                        console.log('Canvas blob created');
                        addBlob(blob);
                    } else {
                        console.error('Canvas toBlob failed');
                    }
                }, 'image/png'); // Default to PNG to preserve quality/transparency
            } catch (e2) {
                console.error('Canvas fallback failed:', e2);
            }
        } else {
            console.error('No image element provided for fallback');
        }
    }

    async restoreImageAt(src, insertBefore = null, imgElement = null) {
        console.log('Restoring image at position:', src, insertBefore);

        // Check if image already exists
        const existingImg = this.images.find(img => img.objectURL === src);
        if (existingImg) {
            console.log('Image already exists in library');
            const item = this.grid.querySelector(`.media-item[data-id="${existingImg.id}"]`);
            if (item) {
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                item.classList.add('highlight-restored');
                setTimeout(() => item.classList.remove('highlight-restored'), 2000);
            }
            return;
        }

        // Helper to add blob at position
        const addBlobAt = (blob) => {
            console.log('Adding blob at position:', blob.type, blob.size);
            const type = blob.type || 'image/jpeg';
            const ext = type.split('/')[1] || 'jpg';
            const file = new File([blob], `restored-image.${ext}`, { type: type });

            const id = this.currentId++;
            const objectURL = URL.createObjectURL(file);

            const imageData = {
                id,
                file,
                objectURL,
                status: 'queued'
            };

            // Calculate array index based on DOM position
            let arrayIndex = this.images.length; // Default to end
            if (insertBefore) {
                // Find the data-id of insertBefore element
                const beforeId = insertBefore.dataset ? parseInt(insertBefore.dataset.id) : null;
                if (beforeId !== null) {
                    const beforeIndex = this.images.findIndex(img => img.id === beforeId);
                    if (beforeIndex !== -1) {
                        arrayIndex = beforeIndex;
                    }
                }
            }

            // Insert into array at position
            this.images.splice(arrayIndex, 0, imageData);
            this.updateCount();

            // Create placeholder
            const item = document.createElement('div');
            item.className = 'media-item loading';
            item.dataset.id = id;
            item.innerHTML = `<div class="media-placeholder"></div>`;

            // Insert into DOM at position
            if (insertBefore && insertBefore.parentNode === this.grid) {
                this.grid.insertBefore(item, insertBefore);
            } else {
                this.grid.appendChild(item);
            }

            // Add to processing queue
            this.loadQueue.push(imageData);
            this.processQueue();

            // Highlight when ready
            setTimeout(() => {
                const newItem = this.grid.querySelector(`.media-item[data-id="${id}"]`);
                if (newItem) {
                    newItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    newItem.classList.add('highlight-restored');
                    setTimeout(() => newItem.classList.remove('highlight-restored'), 2000);
                }
            }, 100);
        };

        // Try fetching the URL first
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error('Fetch failed');
            const blob = await response.blob();
            addBlobAt(blob);
            return;
        } catch (e) {
            console.warn('Fetch failed, trying canvas fallback:', e);
        }

        // Fallback: Use canvas
        if (imgElement) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = imgElement.naturalWidth;
                canvas.height = imgElement.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgElement, 0, 0);

                canvas.toBlob(blob => {
                    if (blob) {
                        addBlobAt(blob);
                    } else {
                        console.error('Canvas toBlob failed');
                    }
                }, 'image/png');
            } catch (e2) {
                console.error('Canvas fallback failed:', e2);
            }
        }
    }

    async swapImage(libraryImageId, newImageSrc, newImageElement = null) {
        console.log('Swapping library image:', libraryImageId, 'with:', newImageSrc);

        const index = this.images.findIndex(img => img.id === libraryImageId);
        if (index === -1) {
            console.error('Library image not found for swap:', libraryImageId);
            return;
        }

        // Helper to process blob and replace at index
        const replaceWithBlob = async (blob) => {
            console.log('Replacing with blob:', blob.type, blob.size);
            const type = blob.type || 'image/jpeg';
            const ext = type.split('/')[1] || 'jpg';
            const file = new File([blob], `swapped-image.${ext}`, { type: type });

            // Get the DOM element for this image and its position
            const oldItem = this.grid.querySelector(`.media-item[data-id="${libraryImageId}"]`);
            const nextSibling = oldItem ? oldItem.nextSibling : null;

            // Create new image data
            const id = libraryImageId; // Keep same ID
            const objectURL = URL.createObjectURL(file);

            const imageData = {
                id,
                file,
                objectURL,
                status: 'queued'
            };

            // Replace in array
            this.images[index] = imageData;

            // Remove old DOM element
            if (oldItem) {
                oldItem.remove();
            }

            // Create new placeholder
            const item = document.createElement('div');
            item.className = 'media-item loading';
            item.dataset.id = imageData.id;
            item.innerHTML = `<div class="media-placeholder"></div>`;

            // Insert at the same position
            if (nextSibling) {
                this.grid.insertBefore(item, nextSibling);
            } else {
                this.grid.appendChild(item);
            }

            // Add to queue for processing
            this.loadQueue.push(imageData);
            this.processQueue();

            // Highlight the swapped image
            setTimeout(() => {
                const newItem = this.grid.querySelector(`.media-item[data-id="${id}"]`);
                if (newItem) {
                    newItem.classList.add('highlight-restored');
                    setTimeout(() => newItem.classList.remove('highlight-restored'), 2000);
                }
            }, 100);
        };

        // Try fetching the URL first
        try {
            const response = await fetch(newImageSrc);
            if (!response.ok) throw new Error('Fetch failed');
            const blob = await response.blob();
            await replaceWithBlob(blob);
            return;
        } catch (e) {
            console.warn('Fetch failed for swap, trying canvas fallback:', e);
        }

        // Fallback: Use canvas
        if (newImageElement) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = newImageElement.naturalWidth;
                canvas.height = newImageElement.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(newImageElement, 0, 0);

                canvas.toBlob(async (blob) => {
                    if (blob) {
                        await replaceWithBlob(blob);
                    } else {
                        console.error('Canvas toBlob failed for swap');
                    }
                }, 'image/png');
            } catch (e2) {
                console.error('Canvas fallback failed for swap:', e2);
            }
        }
    }

    processQueue() {
        if (this.loadQueue.length === 0) return;

        while (this.activeRequests < this.MAX_CONCURRENT && this.loadQueue.length > 0) {
            const task = this.loadQueue.shift();
            this.activeRequests++;
            this.worker.postMessage(task);

            // Update status visually if needed (optional)
            // const item = this.grid.querySelector(`.media-item[data-id="${task.id}"]`);
            // if (item) item.classList.add('processing');
        }
    }

    handleWorkerMessage(e) {
        this.activeRequests--;

        const { id, success, blob, width, height, error } = e.data;
        const imageIndex = this.images.findIndex(img => img.id === id);

        if (imageIndex !== -1) {
            if (success) {
                const thumbnailURL = URL.createObjectURL(blob);

                // Update image data
                this.images[imageIndex] = {
                    ...this.images[imageIndex],
                    width,
                    height,
                    thumbnail: thumbnailURL,
                    status: 'ready'
                };

                // Update UI
                this.updateThumbnail(this.images[imageIndex]);
            } else {
                console.error('Worker failed to process image:', error);
                // Remove failed image
                this.images.splice(imageIndex, 1);
                const el = this.grid.querySelector(`.media-item[data-id="${id}"]`);
                if (el) el.remove();
                this.updateCount();
            }
        }

        // Process next items in queue
        this.processQueue();
    }

    renderPlaceholder(imageData) {
        const item = document.createElement('div');
        item.className = 'media-item loading';
        item.dataset.id = imageData.id;

        item.innerHTML = `
            <div class="media-placeholder"></div>
        `;

        this.grid.appendChild(item);
    }

    updateThumbnail(imageData) {
        const item = this.grid.querySelector(`.media-item[data-id="${imageData.id}"]`);
        if (!item) return;

        item.classList.remove('loading');
        item.draggable = true;

        item.innerHTML = `
            <img src="${imageData.thumbnail}" alt="${imageData.file.name}" title="${imageData.file.name}">
        `;

        // Drag events
        item.addEventListener('dragstart', (e) => this.handleDragStart(e, imageData));
        item.addEventListener('dragend', (e) => this.handleDragEnd(e));
    }

    renderThumbnail(imageData) {
        const item = document.createElement('div');
        item.className = 'media-item';
        item.dataset.id = imageData.id;
        item.draggable = true;

        item.innerHTML = `
            <img src="${imageData.thumbnail}" alt="${imageData.file.name}">
            <div class="media-item-info">
                <span class="media-filename">${this.truncate(imageData.file.name, 15)}</span>
                <span class="media-dimensions">${imageData.width} × ${imageData.height}</span>
            </div>
        `;

        // Drag events
        item.addEventListener('dragstart', (e) => this.handleDragStart(e, imageData));
        item.addEventListener('dragend', (e) => this.handleDragEnd(e));

        this.grid.appendChild(item);
    }

    handleDragStart(e, imageData) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/media-library', JSON.stringify({
            id: imageData.id,
            objectURL: imageData.objectURL,
            width: imageData.width,
            height: imageData.height
        }));

        // Create drag image
        const dragImg = document.createElement('div');
        dragImg.style.width = '80px';
        dragImg.style.height = '80px';
        dragImg.style.backgroundImage = `url(${imageData.thumbnail})`;
        dragImg.style.backgroundSize = 'contain';
        dragImg.style.backgroundRepeat = 'no-repeat';
        dragImg.style.backgroundPosition = 'center';
        dragImg.style.opacity = '0.8';
        document.body.appendChild(dragImg);
        e.dataTransfer.setDragImage(dragImg, 40, 40);
        setTimeout(() => dragImg.remove(), 0);

        e.target.classList.add('dragging');
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
    }

    updateCount() {
        this.countEl.textContent = `${this.images.length} image${this.images.length !== 1 ? 's' : ''}`;
    }

    clearAll() {
        if (this.images.length === 0) return;

        if (confirm('Clear all images from library?')) {
            // Revoke object URLs
            this.images.forEach(img => {
                URL.revokeObjectURL(img.objectURL);
                if (img.thumbnail) URL.revokeObjectURL(img.thumbnail);
            });

            this.images = [];
            this.grid.innerHTML = '';
            this.loadQueue = [];
            this.updateCount();
        }
    }

    removeImage(id) {
        const index = this.images.findIndex(img => img.id === id);
        if (index === -1) return;

        const img = this.images[index];

        // Revoke thumbnail URL (keep objectURL as it's now used by the frame)
        if (img.thumbnail) URL.revokeObjectURL(img.thumbnail);

        // Remove from DOM
        const el = this.grid.querySelector(`.media-item[data-id="${id}"]`);
        if (el) el.remove();

        // Remove from array
        this.images.splice(index, 1);
        this.updateCount();
    }

    truncate(str, maxLen) {
        if (str.length <= maxLen) return str;
        return str.substring(0, maxLen - 3) + '...';
    }

    getImage(id) {
        return this.images.find(img => img.id === id);
    }
}
