export type WhiteboardEvent = 
  | { type: 'shapeInteractionStarted', entityId: string }
  | { type: 'shapeInteractionEnded', entityId: string }
  | { type: 'shapeUpdated', entityId: string, data: any }
  | { type: 'shapeCreated', entityId: string, data: any }
  | { type: 'shapeDeleted', entityId: string }
  | { type: 'boardCleared' }
  | { type: 'boardMetadataUpdated', data: any }
  | { type: 'sync', entityId: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number };

export class EventEmitter {
  private listeners: Set<(event: WhiteboardEvent) => void> = new Set();
  // Refcounted so nested pauses compose: a remote apply's pause/resume pair
  // inside a read-only (paused) period must not un-pause the emitter.
  private depth: number = 0;

  // Read-only view for tests: a leaked pause (depth stuck > 0) silently kills
  // all outbound multiplayer traffic, so regressions must be assertable.
  public get pauseDepth(): number {
    return this.depth;
  }

  public on(listener: (event: WhiteboardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(event: WhiteboardEvent): void {
    if (this.depth > 0) return;
    
    // 3. Local Singleton Blocklist
    if (
      event.type !== 'boardCleared' && 
      event.type !== 'boardMetadataUpdated' &&
      'entityId' in event
    ) {
      const ignored = ['camera', 'cursor', 'tool', 'selection', 'default-layer'];
      if (ignored.includes(event.entityId)) return;
    }

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public pause(): void {
    this.depth++;
  }

  public resume(): void {
    this.depth = Math.max(0, this.depth - 1);
  }
}
