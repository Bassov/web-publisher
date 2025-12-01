export class SnapHelper {
    constructor(pageManager) {
        this.pageManager = pageManager;
        this.enabled = true;
        this.threshold = 10; // Pixels in screen space

        // OPTIMIZATION: Cache for grid lines
        this.gridCache = null;
        this.cacheVersion = 0;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setThreshold(threshold) {
        this.threshold = threshold;
    }

    /**
     * Calculate snap position for a point
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} scale - Current viewport scale
     * @returns {{x: number, y: number, snapped: boolean}}
     */
    snapPoint(x, y, scale) {
        if (!this.enabled) {
            return { x, y, snapped: false };
        }

        const { xLines, yLines } = this.getGridLines();
        const thresholdWorld = this.threshold / scale;

        // Find nearest X line
        let nearestX = x;
        let minDistX = Infinity;
        for (const lineX of xLines) {
            const dist = Math.abs(x - lineX);
            if (dist < minDistX && dist < thresholdWorld) {
                minDistX = dist;
                nearestX = lineX;
            }
        }

        // Find nearest Y line
        let nearestY = y;
        let minDistY = Infinity;
        for (const lineY of yLines) {
            const dist = Math.abs(y - lineY);
            if (dist < minDistY && dist < thresholdWorld) {
                minDistY = dist;
                nearestY = lineY;
            }
        }

        return {
            x: nearestX,
            y: nearestY,
            snapped: (nearestX !== x || nearestY !== y)
        };
    }

    /**
     * OPTIMIZATION: Invalidate grid cache when page settings change
     */
    invalidateCache() {
        this.cacheVersion++;
        this.gridCache = null;
    }

    /**
     * Get all vertical (X) and horizontal (Y) grid lines
     * OPTIMIZATION: Cached to avoid recalculation during mousemove
     */
    getGridLines() {
        // Return cached result if available
        if (this.gridCache !== null) {
            return this.gridCache;
        }

        const xLines = new Set();
        const yLines = new Set();

        const globalSettings = this.pageManager.settings;
        // We need to iterate pages and get their specific settings

        this.pageManager.pages.forEach((page, index) => {
            const pageSettings = this.pageManager.getPageSettings(index);
            const { cols, rows, gap, margin } = pageSettings.grid;

            const pageX = parseFloat(page.style.left);
            const pageY = parseFloat(page.style.top);
            const pageWidth = pageSettings.width;
            const pageHeight = pageSettings.height;

            // Available space for grid
            const availWidth = pageWidth - (margin * 2) - (gap * (cols - 1));
            const availHeight = pageHeight - (margin * 2) - (gap * (rows - 1));

            const cellWidth = availWidth / cols;
            const cellHeight = availHeight / rows;

            // Vertical lines (X coordinates)
            // Page left edge
            xLines.add(pageX);

            // All cell boundaries (left AND right edge of each cell)
            for (let c = 0; c < cols; c++) {
                const cellLeft = pageX + margin + (c * (cellWidth + gap));
                const cellRight = cellLeft + cellWidth;
                xLines.add(cellLeft);   // Left edge of cell
                xLines.add(cellRight);  // Right edge of cell
            }

            // Page right edge
            xLines.add(pageX + pageWidth);

            // Horizontal lines (Y coordinates)
            // Page top edge
            yLines.add(pageY);

            // All cell boundaries (top AND bottom edge of each cell)
            for (let r = 0; r < rows; r++) {
                const cellTop = pageY + margin + (r * (cellHeight + gap));
                const cellBottom = cellTop + cellHeight;
                yLines.add(cellTop);    // Top edge of cell
                yLines.add(cellBottom); // Bottom edge of cell
            }

            // Page bottom edge
            yLines.add(pageY + pageHeight);
        });

        const result = {
            xLines: Array.from(xLines).sort((a, b) => a - b),
            yLines: Array.from(yLines).sort((a, b) => a - b)
        };

        // Cache the result
        this.gridCache = result;

        return result;
    }

    /**
     * Snap a rectangle (frame) to grid
     */
    snapRect(x, y, width, height, scale) {
        if (!this.enabled) {
            return { x, y, width, height, snapped: false };
        }

        // Snap top-left corner
        const topLeft = this.snapPoint(x, y, scale);

        // Snap bottom-right corner
        const bottomRight = this.snapPoint(x + width, y + height, scale);

        return {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
            snapped: topLeft.snapped || bottomRight.snapped
        };
    }
}
