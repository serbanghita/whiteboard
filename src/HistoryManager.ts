export type Action = 
  | { type: 'CREATE', entityId: string, componentData: any, version: number }
  | { type: 'UPDATE', entityId: string, before: any, after: any, version: number }
  | { type: 'DELETE', entityId: string, componentData: any, version: number };

const MAX_HISTORY = 100;

export class HistoryManager {
  private undoStack: Action[][] = [];
  private redoStack: Action[][] = [];
  private onStateChange: () => void;
  // External callbacks to apply changes
  private applyUndoAction: (action: Action) => void;
  private applyRedoAction: (action: Action) => void;
  // A check function to prevent undoing if version drifted (Multiplayer Paradox Defense)
  private checkVersion: (entityId: string, expectedVersion: number) => boolean;

  constructor(
    onStateChange: () => void,
    applyUndoAction: (action: Action) => void,
    applyRedoAction: (action: Action) => void,
    checkVersion: (entityId: string, expectedVersion: number) => boolean
  ) {
    this.onStateChange = onStateChange;
    this.applyUndoAction = applyUndoAction;
    this.applyRedoAction = applyRedoAction;
    this.checkVersion = checkVersion;
  }

  public pushActions(actions: Action[]): void {
    if (actions.length === 0) return;
    this.undoStack.push(actions);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.onStateChange();
  }

  public undo(): void {
    if (this.undoStack.length === 0) return;
    const actions = this.undoStack.pop()!;
    
    // Check Version-Aware constraints (Multiplayer Paradox Defense)
    // If any action cannot be applied due to version mismatch or locked state, abort the entire transaction
    const canUndo = actions.every(action => this.checkVersion(action.entityId, action.version));
    
    if (!canUndo) {
      console.warn("Undo aborted due to multiplayer version drift or shape locked state.");
      this.redoStack = []; // Invalidate redo
      this.onStateChange();
      return;
    }

    // Apply in reverse order
    for (let i = actions.length - 1; i >= 0; i--) {
      this.applyUndoAction(actions[i]);
    }

    this.redoStack.push(actions);
    this.onStateChange();
  }

  public redo(): void {
    if (this.redoStack.length === 0) return;
    const actions = this.redoStack.pop()!;
    
    // In redo, we check if the entity is currently at the version prior to the redo
    // The expected version is the version after the original action
    // But applying redo means we assume the version is now `version - 1` ?
    // Let's simplify: check if it's currently at version (for UPDATE it should be version - 1, for CREATE it shouldn't exist)
    // The checkVersion callback will handle the logic for undo/redo version matching.
    const canRedo = actions.every(action => {
      if (action.type === 'CREATE') {
        return this.checkVersion(action.entityId, 0); // expects not to exist
      } else if (action.type === 'DELETE') {
        return this.checkVersion(action.entityId, action.version);
      } else {
        return this.checkVersion(action.entityId, action.version); // actually if it was undone, its version is now action.version. Wait, if it was updated from v1 to v2, undo made it v1. Redo expects it to be v1. The action version is v1.
      }
    });

    if (!canRedo) {
      console.warn("Redo aborted due to multiplayer version drift or shape locked state.");
      this.onStateChange();
      return;
    }

    for (const action of actions) {
      this.applyRedoAction(action);
    }

    this.undoStack.push(actions);
    this.onStateChange();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
