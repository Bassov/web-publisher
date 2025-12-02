export class Exporter {
    static async export(pages, frames, prefix = 'page') {
        const results = [];

        for (let i = 0; i < pages.length; i++) {
            // ... (canvas creation logic remains same) ...
            const page = pages[i];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set canvas size to page size
            canvas.width = page.width;
            canvas.height = page.height;

            // White background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw frames that intersect this page
            for (const frame of frames) {
                const state = frame.state;

                // Calculate relative position to page
                const relX = state.x - page.x;
                const relY = state.y - page.y;

                // Check if frame intersects this page
                if (relX + state.width < 0 || relX > page.width ||
                    relY + state.height < 0 || relY > page.height) {
                    continue;
                }

                // Get the image element
                const img = frame.content;

                // Skip if no image or not loaded
                if (!img || !img.complete || !img.naturalWidth) {
                    console.warn('Image not loaded for frame', state);
                    continue;
                }

                ctx.save();

                // Clip to frame boundaries (relative to page)
                ctx.beginPath();
                ctx.rect(relX, relY, state.width, state.height);
                ctx.clip();

                // Move to frame origin
                ctx.translate(relX, relY);

                // Apply content transform (pan and scale)
                ctx.translate(state.contentX, state.contentY);
                ctx.scale(state.contentScale, state.contentScale);

                // Draw the image
                ctx.drawImage(img, 0, 0);

                ctx.restore();
            }

            // Convert canvas to blob
            const blob = await new Promise(resolve =>
                canvas.toBlob(resolve, 'image/jpeg', 0.95)
            );

            results.push({
                blob: blob,
                name: `${prefix}_${i + 1}.jpg`
            });
        }

        return results;
    }

    static async download(results, dirHandle = null) {
        if (dirHandle) {
            // Use File System Access API
            for (const result of results) {
                try {
                    const fileHandle = await dirHandle.getFileHandle(result.name, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(result.blob);
                    await writable.close();
                } catch (err) {
                    console.error('Failed to save file:', result.name, err);
                }
            }
        } else {
            // Fallback to classic download
            results.forEach(result => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(result.blob);
                a.download = result.name;
                a.click();

                // Clean up after a short delay
                setTimeout(() => URL.revokeObjectURL(a.href), 100);
            });
        }
    }
}
