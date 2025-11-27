// Thumbnail generation worker

self.onmessage = async (e) => {
    const { file, id, size = 100 } = e.data;

    try {
        // Create bitmap from file - this is highly optimized and runs off main thread
        const bitmap = await createImageBitmap(file);

        // Calculate dimensions
        const aspect = bitmap.width / bitmap.height;
        // Calculate dimensions - fixed height of 100px (or size), variable width
        const thumbHeight = size;
        const thumbWidth = size * aspect;

        // Use OffscreenCanvas for drawing
        const canvas = new OffscreenCanvas(thumbWidth, thumbHeight);
        const ctx = canvas.getContext('2d');

        // Draw image directly (no background needed as we fit exactly)
        ctx.drawImage(bitmap, 0, 0, thumbWidth, thumbHeight);

        // Convert to Blob
        const blob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: 0.7
        });

        // Send back result
        self.postMessage({
            id,
            success: true,
            blob,
            width: bitmap.width,
            height: bitmap.height
        });

        // Cleanup
        bitmap.close();

    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: error.message
        });
    }
};
