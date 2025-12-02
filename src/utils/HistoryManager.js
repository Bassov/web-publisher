export class HistoryManager {
    constructor(app, limit = 50) {
        this.app = app;
        this.limit = limit;
        this.undoStack = [];
        this.redoStack = [];
        this.isLocked = false;
    }

    /**
     * Capture current state and push to undo stack
     * @param {string} actionName - Description of the action
     */
    pushState(actionName = 'action') {
        if (this.isLocked) return;
        const state = this.serializeState();
        this.pushExplicitState(state, actionName);
    }

    /**
     * Push a specific state object to the undo stack
     * Use this when you captured state BEFORE an action
     */
    pushExplicitState(state, actionName = 'action') {
        if (this.isLocked) return;

        this.undoStack.push({
            name: actionName,
            state: state,
            timestamp: Date.now()
        });

        // Enforce limit
        if (this.undoStack.length > this.limit) {
            this.undoStack.shift();
        }

        // Clear redo stack on new action
        this.redoStack = [];

        console.log(`History: Pushed state '${actionName}'. Undo stack: ${this.undoStack.length}`);
    }

    captureState() {
        return this.serializeState();
    }

    undo() {
        if (this.undoStack.length === 0) {
            console.log('History: Undo stack empty');
            return;
        }

        // Save current state to redo stack before undoing
        const currentState = this.serializeState();
        this.redoStack.push({
            name: 'current',
            state: currentState,
            timestamp: Date.now()
        });

        const previousAction = this.undoStack.pop();
        console.log(`History: Undoing '${previousAction.name}'`);
        this.restoreState(previousAction.state);

        console.log(`History: Undid '${previousAction.name}'. Undo stack: ${this.undoStack.length}, Redo stack: ${this.redoStack.length}`);
    }

    redo() {
        if (this.redoStack.length === 0) {
            console.log('History: Redo stack empty');
            return;
        }

        // Save current state to undo stack before redoing
        const currentState = this.serializeState();
        this.undoStack.push({
            name: 'before_redo',
            state: currentState,
            timestamp: Date.now()
        });

        const nextAction = this.redoStack.pop();
        console.log(`History: Redoing '${nextAction.name}'`);
        this.restoreState(nextAction.state);

        console.log(`History: Redid '${nextAction.name}'. Undo stack: ${this.undoStack.length}, Redo stack: ${this.redoStack.length}`);
    }

    serializeState() {
        // Serialize Frames
        const frames = this.app.frames.map(frame => {
            return {
                id: frame.id, // Assuming frames might need IDs, but for now index/order matters or we recreate them
                x: frame.state.x,
                y: frame.state.y,
                width: frame.state.width,
                height: frame.state.height,
                content: frame.content.src, // Data URL
                contentX: frame.state.contentX,
                contentY: frame.state.contentY,
                contentScale: frame.state.contentScale,
                isSelected: frame.isSelected
            };
        });

        // Serialize Page Settings
        // OPTIMIZATION: Use shallow copy instead of JSON.parse/stringify for performance
        const settings = { ...this.app.pageManager.settings };
        // Deep copy pageSettings array of objects
        const pageSettings = this.app.pageManager.pageSettings.map(p => ({ ...p }));

        return {
            frames,
            settings,
            pageSettings
        };
    }

    restoreState(state) {
        this.isLocked = true; // Prevent pushing state while restoring

        try {
            // Restore Page Settings
            this.app.pageManager.settings = state.settings;
            this.app.pageManager.pageSettings = state.pageSettings || [];
            this.app.pageManager.render();

            // Restore Frames
            // Simplest approach: Clear all and recreate
            // A better approach would be to diff, but for MVP full restore is safer

            // 1. Clear existing frames
            this.app.deselectAllFrames();
            this.app.frames.forEach(frame => {
                if (frame.element.parentNode) {
                    frame.element.parentNode.removeChild(frame.element);
                }
                frame.destroy(); // Clean up listeners
            });
            this.app.frames = [];

            // 2. Recreate frames
            // We need to import Frame class or use App's method if available, 
            // but App usually creates Frame. Let's assume we can use App's context to create frames.
            // Since we are in HistoryManager, we might need to rely on App to recreate frames or import Frame.
            // Let's rely on App having a method or import Frame here. 
            // Ideally HistoryManager shouldn't know about Frame class details, but for simplicity let's assume we can recreate.

            // We need to use the Frame class. Since we can't easily import it if it's circular, 
            // let's ask App to restore frames.
            this.app.restoreFrames(state.frames);

        } catch (e) {
            console.error('History: Failed to restore state', e);
        } finally {
            this.isLocked = false;
        }
    }
}
