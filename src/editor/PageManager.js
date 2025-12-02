export class PageManager {
    constructor(viewport, app) {
        this.viewport = viewport;
        this.app = app;
        this.pages = [];
        this.pageSettings = []; // Array of overrides: [{ grid: {...} }, null, ...]
        this.settings = {
            width: 1080,
            height: 1350,
            count: 3,
            gap: 0,
            grid: {
                cols: 2,
                rows: 2,
                gap: 20,
                margin: 40,
                visible: true
            }
        };

        this.render();
    }

    updateSettings(newSettings) {
        if (this.app) this.app.pushState('update_project_settings');
        this.settings = { ...this.settings, ...newSettings };
        // OPTIMIZATION: Invalidate grid cache when settings change
        if (this.app && this.app.snapHelper) {
            this.app.snapHelper.invalidateCache();
        }
        this.render();
    }

    updatePageSettings(index, newSettings) {
        if (this.app) this.app.pushState('update_page_settings');
        if (!this.pageSettings[index]) this.pageSettings[index] = {};
        this.pageSettings[index] = { ...this.pageSettings[index], ...newSettings };
        // OPTIMIZATION: Invalidate grid cache when page settings change
        if (this.app && this.app.snapHelper) {
            this.app.snapHelper.invalidateCache();
        }
        this.render();
    }

    deletePage(index) {
        if (this.settings.count <= 1) return; // Don't delete last page

        if (this.app) {
            this.app.pushState('delete_page');

            const { gap } = this.settings;
            // Need to calculate exact position of this page
            // Since widths can vary, we need to iterate
            let pageLeft = -(this.getPageSettings(0).width / 2); // Start X
            for (let i = 0; i < index; i++) {
                pageLeft += this.getPageSettings(i).width + gap;
            }

            const pageRight = pageLeft + this.getPageSettings(index).width;
            const shiftAmount = this.getPageSettings(index).width + gap;

            const frames = this.app.frames;
            const framesToDelete = [];
            const framesToShift = [];

            frames.forEach(frame => {
                const cx = frame.state.x + frame.state.width / 2;
                if (cx >= pageLeft && cx < pageRight) {
                    framesToDelete.push(frame);
                } else if (cx >= pageRight) {
                    framesToShift.push(frame);
                }
            });

            framesToDelete.forEach(f => this.app.deleteFrame(f));
            framesToShift.forEach(f => {
                f.state.x -= shiftAmount;
                f.updateTransform();
            });
        }

        // Remove override for this page
        this.pageSettings.splice(index, 1);

        // Decrease count
        this.settings.count--;

        this.render();
    }

    reorderPages(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;

        this.app.pushState('reorder_pages');

        // 1. Capture frames for each page
        const framesByPage = [];
        const gap = this.settings.gap;
        let currentX = -(this.getPageSettings(0).width / 2);

        for (let i = 0; i < this.settings.count; i++) {
            const width = this.getPageSettings(i).width;
            const pageLeft = currentX;
            const pageRight = pageLeft + width;

            const pageFrames = this.app.frames.filter(frame => {
                const cx = frame.state.x + frame.state.width / 2;
                return cx >= pageLeft && cx < pageRight;
            });

            // Store frames with their LOCAL offset relative to page left
            framesByPage.push({
                frames: pageFrames,
                width: width,
                settings: this.pageSettings[i] // Store settings to move them too
            });

            // Store local offset for each frame
            pageFrames.forEach(f => {
                f._tempLocalX = f.state.x - pageLeft;
            });

            currentX += width + gap;
        }

        // 2. Reorder the array
        const movedPage = framesByPage.splice(fromIndex, 1)[0];
        framesByPage.splice(toIndex, 0, movedPage);

        // 3. Update pageSettings
        // We need to reconstruct pageSettings array based on the new order
        // Note: this.pageSettings might be sparse (contain undefined/null)
        // framesByPage[i].settings contains the override (or undefined)
        this.pageSettings = framesByPage.map(p => p.settings);

        // 4. Reposition frames
        currentX = -(framesByPage[0].width / 2); // Recalculate startX based on NEW first page width

        framesByPage.forEach(pageData => {
            const pageLeft = currentX;

            pageData.frames.forEach(f => {
                f.state.x = pageLeft + f._tempLocalX;
                delete f._tempLocalX; // Cleanup
                f.updateTransform();
            });

            currentX += pageData.width + gap;
        });

        this.render();
    }

    getPageSettings(index) {
        const globalGrid = this.settings.grid;
        const override = this.pageSettings[index] || {};
        const overrideGrid = override.grid || {};

        return {
            ...this.settings,
            ...override, // Width/Height overrides
            grid: { ...globalGrid, ...overrideGrid }
        };
    }

    render() {
        // Remove only page-related elements, preserve frames
        const pagesToRemove = this.viewport.querySelectorAll('.page, .page-divider, .grid-layer, .page-header');
        pagesToRemove.forEach(el => el.remove());
        this.pages = [];

        // Calculate positions cumulatively
        let currentX = 0;

        // First, calculate total width to center the whole strip? 
        // Or stick to "First page centered"?
        // Existing logic: startX = -(width/2). So Page 0 is centered at 0.
        // Let's keep Page 0 centered at 0.

        const page0Settings = this.getPageSettings(0);
        const startX = -(page0Settings.width / 2);

        currentX = startX;
        const startY = -this.settings.height / 2; // Vertical center based on global height? 
        // Or per-page height?
        // If pages have different heights, how do we align them? Top? Center? Bottom?
        // Usually Center.

        for (let i = 0; i < this.settings.count; i++) {
            const settings = this.getPageSettings(i);
            const { width, height } = settings;

            // Vertical center for this page
            const pageY = -(height / 2);

            const page = document.createElement('div');
            page.className = 'page';
            page.style.width = `${width}px`;
            page.style.height = `${height}px`;
            page.style.left = `${currentX}px`;
            page.style.top = `${pageY}px`;

            // Render Grid
            if (settings.grid.visible) {
                this.renderGrid(page, settings.grid, width, height);
            }

            // Render Header (Settings & Delete)
            this.renderPageHeader(page, i);

            this.viewport.appendChild(page);
            this.pages.push(page);

            // Add divider after each page except the last
            if (i < this.settings.count - 1) {
                const divider = document.createElement('div');
                divider.className = 'page-divider';
                divider.style.position = 'absolute';
                divider.style.left = `${currentX + width + (this.settings.gap / 2) - 1}px`; // Center of gap
                // Divider height? Match max height? Or global height?
                // Let's match global height for consistency or max of adjacent pages.
                // Global height is safe.
                divider.style.top = `${-this.settings.height / 2}px`;
                divider.style.width = '2px';
                divider.style.height = `${this.settings.height}px`;
                divider.style.background = 'linear-gradient(to bottom, transparent, #007acc 50%, transparent)';
                divider.style.pointerEvents = 'none';
                divider.style.zIndex = '50';
                this.viewport.appendChild(divider);
            }

            // Advance X
            currentX += width + this.settings.gap;
        }
    }

    renderPageHeader(page, index) {
        const header = document.createElement('div');
        header.className = 'page-header';
        header.style.position = 'absolute';
        header.style.top = '-80px'; // Moved up more for larger header
        header.style.left = '0';
        header.style.width = '100%';
        header.style.height = '60px'; // Doubled from 30px
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.padding = '0 20px'; // More padding
        header.style.boxSizing = 'border-box';
        header.style.background = 'rgba(30, 30, 30, 0.9)';
        header.style.borderRadius = '8px';
        header.style.color = 'white';
        header.style.fontSize = '24px'; // Doubled from 12px
        header.style.fontWeight = '600';
        header.style.pointerEvents = 'auto';
        header.style.zIndex = '1000';
        header.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
        header.style.cursor = 'grab';

        // Drag Logic
        header.onpointerdown = (e) => {
            if (e.target.tagName === 'BUTTON') return; // Don't drag if clicking buttons
            e.stopPropagation();
            e.preventDefault();

            const startX = e.clientX;
            const startY = e.clientY;

            // Create drag proxy
            const proxy = header.cloneNode(true);
            proxy.style.position = 'fixed';
            proxy.style.left = `${e.clientX - 20}px`;
            proxy.style.top = `${e.clientY - 20}px`;
            proxy.style.width = '200px'; // Fixed width for proxy
            proxy.style.opacity = '0.8';
            proxy.style.zIndex = '9999';
            proxy.style.pointerEvents = 'none';
            document.body.appendChild(proxy);

            // Create drop indicator
            const indicator = document.createElement('div');
            indicator.style.position = 'absolute';
            indicator.style.top = `${parseFloat(page.style.top) - 60}px`;
            indicator.style.height = `${parseFloat(page.style.height) + 80}px`;
            indicator.style.width = '4px';
            indicator.style.background = '#007acc';
            indicator.style.zIndex = '2000';
            indicator.style.display = 'none';
            this.viewport.appendChild(indicator);

            let dropIndex = index;

            const onMove = (ev) => {
                proxy.style.left = `${ev.clientX - 20}px`;
                proxy.style.top = `${ev.clientY - 20}px`;

                // Find drop target
                // We need to check mouse X against page centers
                // Convert mouse X to world X? No, pages are in viewport.
                // We can use screen coordinates of pages?
                // Or convert mouse to world.
                const worldPos = this.app.workspace.screenToWorld(ev.clientX, ev.clientY);
                const worldX = worldPos.x;

                // Iterate pages to find insertion point
                let bestDist = Infinity;
                let bestIndex = -1;

                // Check before first page
                // Check between pages
                // Check after last page

                // We can iterate through "gaps"
                // Gap i is before Page i. Gap count = count + 1?
                // Let's iterate through pages and check if we are closer to left or right edge?
                // Simpler: Check distance to "center of gap".

                let currentX = -(this.getPageSettings(0).width / 2);
                const gap = this.settings.gap;

                // Check index 0 (before first page)
                if (Math.abs(worldX - currentX) < bestDist) {
                    bestDist = Math.abs(worldX - currentX);
                    bestIndex = 0;
                }

                for (let i = 0; i < this.settings.count; i++) {
                    const w = this.getPageSettings(i).width;
                    const rightEdge = currentX + w + (gap / 2); // Center of gap after page i

                    if (Math.abs(worldX - rightEdge) < bestDist) {
                        bestDist = Math.abs(worldX - rightEdge);
                        bestIndex = i + 1;
                    }
                    currentX += w + gap;
                }

                dropIndex = bestIndex;

                // Update indicator position
                // We need to calculate X for dropIndex
                let indicatorX = -(this.getPageSettings(0).width / 2);
                for (let i = 0; i < dropIndex; i++) {
                    // If dropIndex is count, we need width of last page?
                    // Wait, if we drop at index i, we are before page i.
                    // But if i >= count, we are after last page.
                    // We need to be careful with widths because they vary.
                    // If we are calculating position for index i, we sum widths of 0..i-1.
                    // But if we reorder, the widths change!
                    // Visual indicator should be based on CURRENT layout.
                    // So if dropIndex is 1, it's after Page 0.
                    // X = Page0.x + Page0.width + gap/2
                }

                // Let's recalculate indicatorX based on current layout
                let x = -(this.getPageSettings(0).width / 2);
                for (let i = 0; i < this.settings.count; i++) {
                    if (i === dropIndex) {
                        break; // Found it
                    }
                    const w = this.getPageSettings(i).width;
                    x += w + gap;
                }
                // If dropIndex == count, loop finishes and x is correct (after last page)

                // Adjust for gap center?
                // x is currently at "start of page i" (or start of void if i=count).
                // If i > 0, x includes gap.
                // So x is exactly where the next page starts.
                // Indicator should be slightly left?
                // Gap is 0 by default? If gap is 0, line is between pages.
                // If gap > 0, line is at start of next page.
                // Let's center it in the gap if gap > 0.
                if (dropIndex > 0 && gap > 0) {
                    x -= gap / 2;
                }

                indicator.style.left = `${x - 2}px`; // Center 4px line
                indicator.style.display = 'block';
            };

            const onUp = () => {
                document.body.removeChild(proxy);
                indicator.remove();
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);

                // Perform reorder if changed
                // Note: dropIndex is insertion index.
                // If dragging index 1 to index 2 (after itself), no change?
                // If dragging 1 to 0: 1 becomes 0.
                // If dragging 1 to 2: 1 becomes 2? No, insert at 2 means after 1.
                // If dragging 1 to 3: 1 becomes 2.

                // Adjust dropIndex if dragging forward
                let finalToIndex = dropIndex;
                if (dropIndex > index) {
                    finalToIndex--; // Because removing index shifts subsequent indices
                }

                if (finalToIndex !== index) {
                    this.reorderPages(index, finalToIndex);
                }
            };

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        };

        const title = document.createElement('span');
        title.textContent = `Page ${index + 1}`;

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '20px'; // More gap

        // Settings Icon
        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = 'Page Settings';
        settingsBtn.style.background = 'none';
        settingsBtn.style.border = 'none';
        settingsBtn.style.cursor = 'pointer';
        settingsBtn.style.fontSize = '32px'; // Doubled from 16px
        settingsBtn.style.padding = '8px';
        settingsBtn.style.borderRadius = '6px';
        settingsBtn.style.transition = 'background 0.2s';
        settingsBtn.onmouseover = () => settingsBtn.style.background = 'rgba(255,255,255,0.15)';
        settingsBtn.onmouseout = () => settingsBtn.style.background = 'none';
        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.app && this.app.propertiesPanel) {
                const sidebar = document.getElementById('sidebar');
                sidebar.classList.add('visible');
                this.app.propertiesPanel.showPageSettings(index);
            }
        };

        // Delete Icon
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete Page';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '28px'; // Doubled from 14px
        deleteBtn.style.padding = '8px';
        deleteBtn.style.borderRadius = '6px';
        deleteBtn.style.transition = 'background 0.2s';
        deleteBtn.onmouseover = () => deleteBtn.style.background = 'rgba(255,100,100,0.2)';
        deleteBtn.onmouseout = () => deleteBtn.style.background = 'none';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete Page ${index + 1}?`)) {
                this.deletePage(index);
            }
        };

        controls.appendChild(settingsBtn);
        controls.appendChild(deleteBtn);

        header.appendChild(title);
        header.appendChild(controls);

        page.appendChild(header);
    }

    renderGrid(pageElement, gridSettings, width, height) {
        const { cols, rows, gap, margin } = gridSettings;
        // width/height passed as args now

        const gridContainer = document.createElement('div');
        gridContainer.className = 'grid-layer';
        gridContainer.style.position = 'absolute';
        gridContainer.style.top = '0';
        gridContainer.style.left = '0';
        gridContainer.style.width = '100%';
        gridContainer.style.height = '100%';
        gridContainer.style.pointerEvents = 'none';
        gridContainer.style.zIndex = '100';

        // Calculate cell size
        // Available space = Total - (Margins * 2) - (Gap * (Count - 1))
        const availWidth = width - (margin * 2) - (gap * (cols - 1));
        const availHeight = height - (margin * 2) - (gap * (rows - 1));

        const cellWidth = availWidth / cols;
        const cellHeight = availHeight / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.style.position = 'absolute';
                // Make grid more visible: use CSS variable for width to scale with zoom
                // Also increased opacity from 0.3 to 0.5 for better visibility
                cell.style.border = 'var(--grid-line-width, 1px) solid rgba(0, 0, 0, 0.5)';
                cell.style.boxSizing = 'border-box';

                const x = margin + (c * (cellWidth + gap));
                const y = margin + (r * (cellHeight + gap));

                cell.style.left = `${x}px`;
                cell.style.top = `${y}px`;
                cell.style.width = `${cellWidth}px`;
                cell.style.height = `${cellHeight}px`;

                gridContainer.appendChild(cell);
            }
        }

        pageElement.appendChild(gridContainer);
    }
}
