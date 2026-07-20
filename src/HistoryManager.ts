// Cap on undo depth: the oldest state is dropped once exceeded.
const MAX_HISTORY = 100;

/**
 * Stack-based undo/redo over opaque state snapshots (JSON strings from
 * Whiteboard.saveShapes). Pure data structure - no ECS/DOM knowledge.
 *
 * `currentState` always mirrors the live board, so pushState dedupes by
 * string equality: callers may push on every candidate action (e.g. every
 * mouse release) and no-op releases won't pollute the history. This relies
 * on the serialization being deterministic and roundtrip-stable.
 */
export class HistoryManager {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private currentState: string;
  private onStateChange: () => void;

  constructor(initialState: string, onStateChange: () => void) {
    this.currentState = initialState;
    this.onStateChange = onStateChange;
  }

  public pushState(state: string): void {
    if (this.currentState === state) return;
    this.undoStack.push(this.currentState);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.currentState = state;
    this.redoStack = [];
    this.onStateChange();
  }

  public undo(): string | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(this.currentState);
    this.currentState = this.undoStack.pop()!;
    this.onStateChange();
    return this.currentState;
  }

  public redo(): string | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(this.currentState);
    this.currentState = this.redoStack.pop()!;
    this.onStateChange();
    return this.currentState;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
