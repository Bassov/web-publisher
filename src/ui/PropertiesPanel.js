export class PropertiesPanel {
    constructor(containerId, app) {
        this.container = document.getElementById(containerId);
        this.app = app;
        this.selectedFrame = null;
        this.selectedPageIndex = null;

        this.render();
    }

    setSelectedFrame(frame) {
        this.selectedFrame = frame;
        this.selectedPageIndex = null;
        this.render();
    }

    selectPage(index) {
        this.selectedFrame = null;
        this.selectedPageIndex = index;
        this.render();
    }

    render() {
        if (this.selectedFrame) {
            this.renderFrameProperties();
        } else if (this.selectedPageIndex !== null) {
            this.renderPageSettings();
        } else {
            this.renderProjectSettings();
        }
    }

    renderProjectSettings() {
        this.container.innerHTML = `
            <div class="panel-section">
                <h3>Project Settings</h3>
                
                <h4>Page Size</h4>
                <select id="page-size-select">
                    <option value="1080,1350">4:5 Portrait</option>
                    <option value="1080,1440">3:4 Portrait</option>
                    <option value="1080,1080">1:1 Square</option>
                    <option value="1080,1920">9:16 Story</option>
                    <option value="1080,810">4:3 Landscape</option>
                    <option value="1080,607">16:9 Landscape</option>
                    <option value="1080,540">2:1 Panoramic</option>
                    <option value="custom">Custom</option>
                </select>
                
                <div id="custom-size" style="display: none;">
                    <label>Width (px)</label>
                    <input type="number" id="page-width" value="1080" min="100" max="4000">
                    <label>Height (px)</label>
                    <input type="number" id="page-height" value="1350" min="100" max="4000">
                </div>
                
                <label>Page Count</label>
                <input type="number" id="page-count" value="${this.app.pageManager.settings.count}" min="1" max="10">
                
                <button id="apply-project-settings" class="btn-primary">Apply</button>
            </div>
            
            <div class="panel-section">
                <h3>Grid Settings</h3>
                
                <label>Columns</label>
                <input type="number" id="grid-cols" value="${this.app.pageManager.settings.grid.cols}" min="1" max="10">
                
                <label>Rows</label>
                <input type="number" id="grid-rows" value="${this.app.pageManager.settings.grid.rows}" min="1" max="10">
                
                <label>Gap (px)</label>
                <input type="number" id="grid-gap" value="${this.app.pageManager.settings.grid.gap}" min="0" max="100">
                
                <label>Margin (px)</label>
                <input type="number" id="grid-margin" value="${this.app.pageManager.settings.grid.margin}" min="0" max="200">
                
            </div>
        `;

        this.attachEventListeners();
    }

    renderFrameProperties() {
        const f = this.selectedFrame.state;
        this.container.innerHTML = `
            <div class="panel-section">
                <h3>Frame Properties</h3>
                
                <label>Width</label>
                <input type="number" id="frame-width" value="${Math.round(f.width)}" min="10" step="1">
                
                <label>Height</label>
                <input type="number" id="frame-height" value="${Math.round(f.height)}" min="10" step="1">
                
                <button id="delete-frame" class="btn-danger">Delete Frame</button>
                <button id="deselect-frame" class="btn-secondary">Back</button>
            </div>
        `;

        this.attachFrameEventListeners();
    }

    attachEventListeners() {
        // Page size dropdown
        const sizeSelect = document.getElementById('page-size-select');
        const customDiv = document.getElementById('custom-size');

        sizeSelect?.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDiv.style.display = 'block';
            } else {
                customDiv.style.display = 'none';
                const [w, h] = e.target.value.split(',');
                this.app.pageManager.updateSettings({ width: parseInt(w), height: parseInt(h) });
            }
        });

        // Apply project settings
        document.getElementById('apply-project-settings')?.addEventListener('click', () => {
            const count = parseInt(document.getElementById('page-count').value);
            const sizeValue = sizeSelect.value;

            let width, height;
            if (sizeValue === 'custom') {
                width = parseInt(document.getElementById('page-width').value);
                height = parseInt(document.getElementById('page-height').value);
            } else {
                [width, height] = sizeValue.split(',').map(Number);
            }

            this.app.pushState('update_project_settings');
            this.app.pageManager.updateSettings({ width, height, count });
        });

        // Grid settings - live update
        const gridInputs = ['grid-cols', 'grid-rows', 'grid-gap', 'grid-margin'];
        gridInputs.forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('input', () => this.updateGridSettings());
        });
    }

    renderPageSettings() {
        const settings = this.app.pageManager.getPageSettings(this.selectedPageIndex);
        const grid = settings.grid;
        const { width, height } = settings;

        // Determine current preset
        let currentPreset = 'custom';
        if (width === 1080 && height === 1350) currentPreset = '1080,1350';
        else if (width === 1080 && height === 1440) currentPreset = '1080,1440';
        else if (width === 1080 && height === 1080) currentPreset = '1080,1080';
        else if (width === 1080 && height === 1920) currentPreset = '1080,1920';
        else if (width === 1080 && height === 810) currentPreset = '1080,810';
        else if (width === 1080 && height === 607) currentPreset = '1080,607';
        else if (width === 1080 && height === 540) currentPreset = '1080,540';

        this.container.innerHTML = `
            <div class="panel-section">
                <h3>Page ${this.selectedPageIndex + 1} Settings</h3>
                
                <div class="panel-row">
                    <button id="back-to-project" class="btn-secondary" style="width: 100%; margin-bottom: 15px;">← Back to Project</button>
                </div>

                <h4>Page Size</h4>
                <select id="page-size-select">
                    <option value="1080,1350" ${currentPreset === '1080,1350' ? 'selected' : ''}>4:5 Portrait</option>
                    <option value="1080,1440" ${currentPreset === '1080,1440' ? 'selected' : ''}>3:4 Portrait</option>
                    <option value="1080,1080" ${currentPreset === '1080,1080' ? 'selected' : ''}>1:1 Square</option>
                    <option value="1080,1920" ${currentPreset === '1080,1920' ? 'selected' : ''}>9:16 Story</option>
                    <option value="1080,810" ${currentPreset === '1080,810' ? 'selected' : ''}>4:3 Landscape</option>
                    <option value="1080,607" ${currentPreset === '1080,607' ? 'selected' : ''}>16:9 Landscape</option>
                    <option value="1080,540" ${currentPreset === '1080,540' ? 'selected' : ''}>2:1 Panoramic</option>
                    <option value="custom" ${currentPreset === 'custom' ? 'selected' : ''}>Custom</option>
                </select>
                
                <div id="page-custom-size" style="display: ${currentPreset === 'custom' ? 'block' : 'none'}; margin-top: 10px;">
                    <label>Width (px)</label>
                    <input type="number" id="page-width" value="${width}" min="100" max="4000">
                    <label>Height (px)</label>
                    <input type="number" id="page-height" value="${height}" min="100" max="4000">
                </div>

                <h4 style="margin-top: 20px;">Grid Overrides</h4>
                
                <label>Columns</label>
                <input type="number" id="page-grid-cols" value="${grid.cols}" min="1" max="10">
                
                <label>Rows</label>
                <input type="number" id="page-grid-rows" value="${grid.rows}" min="1" max="10">
                
                <label>Gap (px)</label>
                <input type="number" id="page-grid-gap" value="${grid.gap}" min="0" max="100">
                
                <label>Margin (px)</label>
                <input type="number" id="page-grid-margin" value="${grid.margin}" min="0" max="200">
                
                <button id="reset-page-settings" class="btn-danger" style="margin-top: 20px;">Reset to Defaults</button>
            </div>
        `;

        this.attachPageEventListeners();
    }

    attachPageEventListeners() {
        const updateGrid = (key, value) => {
            const current = this.app.pageManager.getPageSettings(this.selectedPageIndex).grid;
            this.app.pageManager.updatePageSettings(this.selectedPageIndex, {
                grid: { ...current, [key]: parseInt(value) }
            });
        };

        const updateSize = (w, h) => {
            this.app.pageManager.updatePageSettings(this.selectedPageIndex, {
                width: parseInt(w),
                height: parseInt(h)
            });
        };

        // Page Size
        const sizeSelect = document.getElementById('page-size-select');
        const customDiv = document.getElementById('page-custom-size');
        const widthInput = document.getElementById('page-width');
        const heightInput = document.getElementById('page-height');

        sizeSelect?.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDiv.style.display = 'block';
            } else {
                customDiv.style.display = 'none';
                const [w, h] = e.target.value.split(',');
                updateSize(w, h);
                // Update inputs just in case
                widthInput.value = w;
                heightInput.value = h;
            }
        });

        widthInput?.addEventListener('change', (e) => {
            sizeSelect.value = 'custom';
            updateSize(e.target.value, heightInput.value);
        });

        heightInput?.addEventListener('change', (e) => {
            sizeSelect.value = 'custom';
            updateSize(widthInput.value, e.target.value);
        });

        // Grid
        document.getElementById('page-grid-cols')?.addEventListener('change', (e) => updateGrid('cols', e.target.value));
        document.getElementById('page-grid-rows')?.addEventListener('change', (e) => updateGrid('rows', e.target.value));
        document.getElementById('page-grid-gap')?.addEventListener('change', (e) => updateGrid('gap', e.target.value));
        document.getElementById('page-grid-margin')?.addEventListener('change', (e) => updateGrid('margin', e.target.value));

        document.getElementById('back-to-project')?.addEventListener('click', () => {
            this.selectedPageIndex = null;
            this.render();
        });

        document.getElementById('reset-page-settings')?.addEventListener('click', () => {
            // Reset to global defaults
            // We can just set override to null
            this.app.pageManager.pageSettings[this.selectedPageIndex] = null;
            this.app.pageManager.render();
            this.render();
        });
    }

    attachFrameEventListeners() {
        // Frame property inputs
        const inputs = ['frame-width', 'frame-height'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            // Use 'change' for history to avoid spamming states while typing/sliding
            el.addEventListener('change', (e) => {
                this.app.pushState('update_frame_prop');
                const prop = id.replace('frame-', '');
                this.selectedFrame.state[prop] = parseFloat(e.target.value);
                this.selectedFrame.updateTransform();
            });

            // Keep 'input' for live preview
            el.addEventListener('input', (e) => {
                const prop = id.replace('frame-', '');
                this.selectedFrame.state[prop] = parseFloat(e.target.value);
                this.selectedFrame.updateTransform();
            });
        });

        // Delete button
        document.getElementById('delete-frame')?.addEventListener('click', () => {
            this.app.pushState('delete_frame');
            this.app.deleteFrame(this.selectedFrame);
            this.selectedFrame = null;
            this.render();
        });

        // Deselect button
        document.getElementById('deselect-frame')?.addEventListener('click', () => {
            this.selectedFrame.deselect();
            this.selectedFrame = null;
            this.render();
        });
    }

    updateGridSettings() {
        const settings = {
            visible: this.app.pageManager.settings.grid.visible, // Preserve existing value
            cols: parseInt(document.getElementById('grid-cols').value),
            rows: parseInt(document.getElementById('grid-rows').value),
            gap: parseInt(document.getElementById('grid-gap').value),
            margin: parseInt(document.getElementById('grid-margin').value)
        };

        this.app.pageManager.updateSettings({ grid: settings });
    }
}
