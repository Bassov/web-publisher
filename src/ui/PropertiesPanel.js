export class PropertiesPanel {
    constructor(containerId, app) {
        this.container = document.getElementById(containerId);
        this.app = app;
        this.mode = null; // 'page' or 'grid'
        this.selectedPageIndex = null;
    }

    showPageSettings(pageIndex = null) {
        this.mode = 'page';
        this.selectedPageIndex = pageIndex;
        this.render();
    }

    showGridSettings() {
        this.mode = 'grid';
        this.selectedPageIndex = null;
        this.render();
    }

    hide() {
        this.mode = null;
        this.selectedPageIndex = null;
        this.container.innerHTML = '';
    }

    render() {
        if (this.mode === 'page') {
            this.renderPageSettings();
        } else if (this.mode === 'grid') {
            this.renderGridSettings();
        } else {
            this.container.innerHTML = '';
        }
    }

    renderPageSettings() {
        const settings = this.selectedPageIndex !== null
            ? this.app.pageManager.getPageSettings(this.selectedPageIndex)
            : this.app.pageManager.settings;

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

        const title = this.selectedPageIndex !== null
            ? `Page ${this.selectedPageIndex + 1} Settings`
            : 'Page Settings';

        const includeGridOverrides = this.selectedPageIndex !== null;
        const grid = includeGridOverrides
            ? this.app.pageManager.getPageSettings(this.selectedPageIndex).grid
            : null;

        this.container.innerHTML = `
            <div class="panel-section">
                <h3>${title}</h3>
                
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

                ${this.selectedPageIndex === null ? `
                    <label style="margin-top: 20px;">Page Count</label>
                    <input type="number" id="page-count" value="${this.app.pageManager.settings.count}" min="1" max="10">
                    <button id="apply-page-settings" class="btn-primary">Apply</button>
                ` : ''}

                ${includeGridOverrides ? `
                    <h4 style="margin-top: 20px;">Grid Overrides</h4>
                    
                    <label>Columns</label>
                    <input type="number" id="page-grid-cols" value="${grid.cols}" min="1" max="10">
                    
                    <label>Rows</label>
                    <input type="number" id="page-grid-rows" value="${grid.rows}" min="1" max="10">
                    
                    <label>Gap (px)</label>
                    <input type="number" id="page-grid-gap" value="${grid.gap}" min="0" max="100">
                    
                    <label>Margin (px)</label>
                    <input type="number" id="page-grid-margin" value="${grid.margin}" min="0" max="200">
                ` : ''}
            </div>
        `;

        this.attachPageEventListeners();
    }

    renderGridSettings() {
        const grid = this.app.pageManager.settings.grid;

        this.container.innerHTML = `
            <div class="panel-section">
                <h3>Grid Settings</h3>
                
                <label>Columns</label>
                <input type="number" id="grid-cols" value="${grid.cols}" min="1" max="10">
                
                <label>Rows</label>
                <input type="number" id="grid-rows" value="${grid.rows}" min="1" max="10">
                
                <label>Gap (px)</label>
                <input type="number" id="grid-gap" value="${grid.gap}" min="0" max="100">
                
                <label>Margin (px)</label>
                <input type="number" id="grid-margin" value="${grid.margin}" min="0" max="200">
            </div>
        `;

        this.attachGridEventListeners();
    }

    attachPageEventListeners() {
        const sizeSelect = document.getElementById('page-size-select');
        const customDiv = document.getElementById('page-custom-size');
        const widthInput = document.getElementById('page-width');
        const heightInput = document.getElementById('page-height');

        const updateSize = (w, h) => {
            if (this.selectedPageIndex !== null) {
                this.app.pageManager.updatePageSettings(this.selectedPageIndex, {
                    width: parseInt(w),
                    height: parseInt(h)
                });
            } else {
                this.app.pageManager.updateSettings({
                    width: parseInt(w),
                    height: parseInt(h)
                });
            }
        };

        sizeSelect?.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDiv.style.display = 'block';
            } else {
                customDiv.style.display = 'none';
                const [w, h] = e.target.value.split(',');
                updateSize(w, h);
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

        // Grid overrides (only for page-specific settings)
        if (this.selectedPageIndex !== null) {
            const updateGrid = (key, value) => {
                const current = this.app.pageManager.getPageSettings(this.selectedPageIndex).grid;
                this.app.pageManager.updatePageSettings(this.selectedPageIndex, {
                    grid: { ...current, [key]: parseInt(value) }
                });
            };

            document.getElementById('page-grid-cols')?.addEventListener('change', (e) => updateGrid('cols', e.target.value));
            document.getElementById('page-grid-rows')?.addEventListener('change', (e) => updateGrid('rows', e.target.value));
            document.getElementById('page-grid-gap')?.addEventListener('change', (e) => updateGrid('gap', e.target.value));
            document.getElementById('page-grid-margin')?.addEventListener('change', (e) => updateGrid('margin', e.target.value));
        }

        // Apply button for project-wide settings
        document.getElementById('apply-page-settings')?.addEventListener('click', () => {
            const count = parseInt(document.getElementById('page-count').value);
            const sizeValue = sizeSelect.value;

            let width, height;
            if (sizeValue === 'custom') {
                width = parseInt(widthInput.value);
                height = parseInt(heightInput.value);
            } else {
                [width, height] = sizeValue.split(',').map(Number);
            }

            this.app.pushState('update_page_settings');
            this.app.pageManager.updateSettings({ width, height, count });
        });
    }

    attachGridEventListeners() {
        const gridInputs = ['grid-cols', 'grid-rows', 'grid-gap', 'grid-margin'];
        gridInputs.forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('input', () => this.updateGridSettings());
        });
    }

    updateGridSettings() {
        const settings = {
            visible: this.app.pageManager.settings.grid.visible,
            cols: parseInt(document.getElementById('grid-cols').value),
            rows: parseInt(document.getElementById('grid-rows').value),
            gap: parseInt(document.getElementById('grid-gap').value),
            margin: parseInt(document.getElementById('grid-margin').value)
        };

        this.app.pageManager.updateSettings({ grid: settings });
    }
}
