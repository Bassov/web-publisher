# Web Publisher - Technical Documentation

## Overview
Lightweight offline PWA for creating Instagram carousel layouts. Vanilla JS, frame-based image editor with professional cropping tools. Export to high-quality JPEG pages.

## Core Architecture

### Component Structure
```
App (src/editor/App.js) - Main controller, state management
├── Workspace (src/editor/Workspace.js) - Infinite canvas, zoom/pan
│   └── Viewport - Transformed container for pages/frames
├── PageManager (src/editor/PageManager.js) - Multi-page layout, grid rendering
├── Frame (src/editor/Frame.js) - Individual image frame with crop/pan/zoom
├── PropertiesPanel (src/ui/PropertiesPanel.js) - Context-sensitive settings UI
├── MediaLibrary (src/ui/MediaLibrary.js) - Bottom panel with image thumbnails
└── Utils
    ├── Exporter (src/utils/Exporter.js) - Canvas-based page rendering
    ├── SnapHelper (src/utils/SnapHelper.js) - Grid snapping calculations
    └── HistoryManager (src/utils/HistoryManager.js) - Undo/redo stack
```

### Key Files
- `index.html` - Entry point, PWA structure
- `src/app.js` - App initialization
- `src/editor/App.js` - Main application controller (~500 LOC)
- `src/editor/Frame.js` - Frame logic (~1000 LOC)
- `sw.js` - Service Worker for offline caching
- `manifest.json` - PWA configuration

## Features Implementation

### 1. Multi-Page System
**PageManager** renders horizontal page strip with:
- **Per-page dimensions**: Each page can have custom width/height
- **Cumulative positioning**: Pages positioned left-to-right with configurable gap
- **Page headers**: Draggable headers (60px tall, 24px font) with settings/delete icons (32px/28px)
- **Page reordering**: Drag header to reorder pages with visual drop indicator
- **Vertical dividers**: Gradient lines between pages for visual separation

**Aspect ratio presets**:
```javascript
"4:5 Portrait" (1080×1350)     // Instagram feed
"3:4 Portrait" (1080×1440)     // Traditional portrait
"1:1 Square" (1080×1080)       // Instagram square
"9:16 Story" (1080×1920)       // Stories/Reels
"4:3 Landscape" (1080×810)     // Standard landscape
"16:9 Landscape" (1080×607)    // Widescreen
"2:1 Panoramic" (1080×540)     // Panorama
```

### 2. Frame System
**Frame** class manages image containers with two distinct modes:

**Frame Mode (default)**:
- Drag frame to move (pointer capture)
- Resize via 8 corner/edge handles (16px, blue)
- Snaps to grid if enabled (threshold: 10px screen space)
- Selection outline: 2px blue border with handles

**Content-Edit Mode (double-click)**:
- Yellow 2px dashed border indicator
- Drag to pan image inside frame
- Scroll to zoom image (contentScale)
- Resize handles on content overlay (16px, yellow)
- Snap content to frame edges
- ESC to exit mode

**State**:
```javascript
{
  x, y, width, height,           // Frame position/size (world coords)
  contentX, contentY,            // Image pan offset
  contentScale,                  // Image zoom (1.0 = natural size)
  isSelected, mode               // Selection/mode flags
}
```

### 3. Grid & Snapping
**SnapHelper** provides grid-based snapping:
- Calculates grid lines from page settings (cols, rows, gap, margin)
- Snaps all 4 corners of frame to nearest grid line
- Threshold: 10px in screen space
- Applies to move/resize/content-edit operations
- Per-page grid support (different dimensions per page)

**Grid rendering**: Blue dashed lines at calculated positions, rendered per-page.

### 4. Media Library
**MediaLibrary** component (bottom panel, full-width):
- Horizontal scrolling thumbnail grid
- Background processing with Web Worker (`src/workers/thumbnail.worker.js`)
- 100×100px thumbnails generated asynchronously
- Queue-based loading (max 3 concurrent)
- Drag-and-drop to canvas creates frame at drop position
- Visual drag preview with drop indicator

**Image swapping**:
- Drag library image onto existing frame → swaps image and auto-fits
- Drag frame to library → returns photo to library at cursor position
- Dynamic placeholder shows insertion point while dragging
- Auto-scroll to show restored/swapped image with highlight animation

### 5. Undo/Redo System
**HistoryManager** manages state snapshots:
- Captures frame positions, sizes, content transforms
- Stores global settings and per-page settings
- Stack size: 50 states
- Shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z (redo)
- Locked during restore to prevent circular updates
- Explicit state capture for complex operations (e.g., page reorder)

**Tracked actions**: frame move/resize/delete, content pan/zoom, settings changes, page reorder, image swap.

### 6. Export System
**Exporter** renders pages to canvas for download:
- Creates off-screen canvas per page (exact page dimensions)
- Iterates frames, clips to page bounds
- Draws images with transforms (pan/zoom)
- Outputs JPEG blobs (quality: 0.95)

**Features**:
- **File System Access API**: Direct saving to user-selected folders (Chrome/Edge)
- **Smart Fallback**: Standard download for unsupported browsers or restricted folders (Downloads)
- **Custom Filename Prefix**: User-defined naming (e.g., "my_trip_1.jpg")
- **Custom Export Modal**: Modern UI for configuring export options

**Multi-page frames**: Frames spanning pages render on each page they intersect.

### 7. Workspace Navigation
**Workspace** handles viewport transform:
- **Pan**: Middle-mouse drag or Ctrl+drag
- **Zoom**: Mouse wheel (0.05 increment, 0.1-5.0 range)
- **Coordinate conversion**: `screenToWorld(clientX, clientY)` and inverse
- Transform applied via CSS: `transform: translate(x, y) scale(zoom)`

## Interaction Patterns

### Frame Lifecycle
1. **Creation**:
   - Drag from MediaLibrary → drop on canvas
   - Calculates frame size from image aspect (max 300px)
   - Centers image with cover-fit scaling
   - Auto-selects new frame

2. **Selection**:
   - Click frame → select (blue outline, show handles)
   - Click workspace/page → deselect all
   - Shows properties in PropertiesPanel

3. **Editing**:
   - Drag frame → update x,y (with snap)
   - Drag handles → update width,height (with snap)
   - Double-click → content-edit mode
   - Arrow keys → nudge 1px (Shift+Arrow: 10px)

4. **Deletion**:
   - Delete key or Delete button in PropertiesPanel
   - Drag frame to MediaLibrary → deletes frame, restores image

### Drag-and-Drop Details

**Library to Canvas**:
```javascript
// MediaLibrary sets dataTransfer
e.dataTransfer.setData('application/media-library', JSON.stringify({
  id, objectURL, width, height
}));

// App handles drop
workspace.addEventListener('drop', (e) => {
  const data = JSON.parse(e.dataTransfer.getData('application/media-library'));
  const worldPos = workspace.screenToWorld(e.clientX, e.clientY);
  createFrame(worldPos.x, worldPos.y, data.objectURL);
});
```

**Frame to Library** (Frame.js `startDrag` method):
1. Track pointer position in `onMove`
2. Check intersection with `#media-library` element
3. Show preview placeholder at insertion point (via cursor X position)
4. On drop: call `mediaLibrary.restoreImageAt(src, insertBefore, imgElement)`
5. Canvas fallback: if URL fetch fails, extract from HTMLImageElement

**Library Image Swap** (Frame.js `handleDrop` method):
1. Frame accepts drop from library
2. Resets contentX/Y to 0, calculates new contentScale (cover-fit)
3. Calls `mediaLibrary.swapImage(id, oldSrc, oldImgElement)`
4. SwapImage replaces library item at same array/DOM position

### Visual Feedback

**Drag-over states**:
- **Library drop zone**: Green border, "↩️ Return to Library" overlay
- **Frame swap zone**: Green dashed border, "⬇️ Swap" overlay
- **Library placeholder**: Pulsing green 📸 icon at insertion point

**Restored image highlight**: Blue pulse animation (2s)

**Page drag indicator**: Blue 4px vertical line showing drop position

## State Management

### App State
```javascript
{
  frames: [Frame instances],
  pageManager: {
    settings: { width, height, count, gap, grid },
    pageSettings: [{ width, height, grid }, ...]  // Per-page overrides
  },
  historyManager: { undoStack, redoStack },
  mediaLibrary: { images: [{ id, objectURL, file, thumbnail }] }
}
```

### Persistence
- **Not implemented yet**: localStorage/IndexedDB support planned
- **Current**: State exists only in memory

## Performance Optimizations

### Media Library
- **Web Worker thumbnails**: Off-main-thread processing via `thumbnail.worker.js`
- **Sequential loading**: Max 3 concurrent to avoid browser limits
- **On-demand processing**: Images added to queue, processed asynchronously
- **Canvas offscreen rendering**: Thumbnails generated on worker canvas

### Frame Rendering
- **CSS transforms**: GPU-accelerated via `transform: translate() scale()`
- **Pointer capture**: Direct events during drag (no event bubbling)
- **Visual states**: CSS classes instead of inline styles
- **Interaction Optimization**:
  - Cached scale calculation to prevent layout thrashing (`getComputedStyle`)
  - `will-change: transform` hints for browser compositing
- **State Serialization**: Optimized shallow copying in `HistoryManager` to eliminate input lag

## UI Architecture

### Adaptive Layouts
- **Dynamic Sidebar**: Height adapts to content with min/max constraints
- **Smart Viewport**: `fitToPages` logic accounts for UI panels (offsets center) and coordinate systems
- **Responsive Panels**: Glassmorphism effects with backdrop-filter

### Custom Modals
- **Architecture**: HTML/CSS overlay system (no native `alert`/`prompt`)
- **Components**: Export Dialog, Delete Confirmation
- **Features**: Focus management, click-outside-to-close, keyboard accessibility

## Code Patterns

### Coordinate Systems
- **Screen space**: Client coordinates from mouse/touch events
- **World space**: Canvas coordinates (absolute, pre-transform)
- **Page space**: Relative to page origin (export coordinates)

Convert: `Workspace.screenToWorld(clientX, clientY)` → `{x, y}`

### Event Handling
```javascript
// Frame drag pattern
element.addEventListener('pointerdown', (e) => {
  element.setPointerCapture(e.pointerId);
  const onMove = (ev) => { /* update position */ };
  const onUp = (ev) => {
    element.releasePointerCapture(ev.pointerId);
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerup', onUp);
  };
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
});
```

### Snapping Logic
```javascript
// Check all 4 corners against grid lines
const corners = [
  {x: newX, y: newY},  // top-left
  {x: newX + width, y: newY},  // top-right
  {x: newX, y: newY + height},  // bottom-left
  {x: newX + width, y: newY + height}  // bottom-right
];
// Find best snap for X and Y independently
// Apply snap delta to newX/newY
```

## CSS Architecture

### Layout
- **Flexbox**: Main app layout (toolbar, workspace, sidebar)
- **Absolute positioning**: Pages, frames, overlays
- **CSS Grid**: MediaLibrary thumbnail grid

### Custom Properties
```css
--primary: #007acc;
--bg-dark: #1e1e1e;
--text-light: #ffffff;
```

### Key Classes
- `.frame` - Frame container
- `.frame.selected` - Selected state (blue outline)
- `.frame.content-edit` - Edit mode (yellow border)
- `.handle` - Resize handle (16px)
- `.media-item` - Library thumbnail
- `.drag-over-delete` - Library drop zone highlight
- `.drag-over-swap` - Frame swap zone highlight

## Browser Compatibility

**Target**: Modern browsers (Chrome 90+, Firefox 88+, Safari 14+)

**Features used**:
- ES6+ (classes, arrow functions, async/await)
- CSS Grid, Flexbox
- Pointer Events API
- Canvas 2D API
- Web Workers
- Drag and Drop API

- File API
- File System Access API (Optional, for direct saving)

**Not used**: No polyfills, transpilers, or legacy browser support.

## Development Workflow

### File Structure
```
/
├── index.html
├── styles.css
├── manifest.json
├── sw.js
└── src/
    ├── app.js
    ├── editor/
    │   ├── App.js
    │   ├── Workspace.js
    │   ├── PageManager.js
    │   └── Frame.js
    ├── ui/
    │   ├── PropertiesPanel.js
    │   └── MediaLibrary.js
    ├── utils/
    │   ├── Exporter.js
    │   ├── SnapHelper.js
    │   └── HistoryManager.js
    └── workers/
        └── thumbnail.worker.js
```

### Testing Approach
- Manual testing in browser
- No automated tests currently
- Focus on Chrome DevTools for debugging

## Deployment

### Build
No build step required. Static files can be served directly.

### Hosting
Any static host works:
- **GitHub Pages**: Simple, free
- **Netlify/Vercel**: CDN, auto-deploy
- **Cloudflare Pages**: Fast, global

### PWA Installation
1. Serve over HTTPS
2. Register service worker (`sw.js`)
3. Browser shows "Install App" prompt
4. Works offline after first load

## Known Limitations

1. **No persistence**: Refresh loses all work
2. **No image compression**: Large files may cause memory issues
3. **No cloud sync**: Local only
4. **JPEG export only**: No PNG/WebP support
5. **No text/shapes**: Images only

## Future Enhancements

- localStorage/IndexedDB persistence
- Project templates
- PNG export with transparency
- Direct Instagram API integration
- Cloud backup
- Collaborative editing
