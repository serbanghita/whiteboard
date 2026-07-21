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
    
    // Version-aware constraints (multiplayer paradox defense): abort the
    // whole transaction if any entity drifted (a peer changed it) or is
    // locked. Expectations are per action type - undoing a DELETE expects
    // the entity to be ABSENT (checkVersion's expected-version 0), while
    // CREATE/UPDATE undos expect it present at the recorded version.
    const canUndo = actions.every(action => {
      if (action.type === 'DELETE') {
        return this.checkVersion(action.entityId, 0);
      }
      return this.checkVersion(action.entityId, action.version);
    });
    
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
    
    // Mirror image of the undo expectations: redoing a CREATE expects the
    // entity ABSENT (its undo removed it); DELETE/UPDATE redos expect it
    // present at the recorded version. Version-less local boards satisfy
    // every present-check, so single-player behavior is never blocked.
    const canRedo = actions.every(action => {
      if (action.type === 'CREATE') {
        return this.checkVersion(action.entityId, 0);
      }
      return this.checkVersion(action.entityId, action.version);
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
