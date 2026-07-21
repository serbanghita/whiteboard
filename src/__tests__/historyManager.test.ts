import { describe, it, expect, vi } from "vitest";
import { HistoryManager, Action } from "../HistoryManager";

// Test harness: a tiny fake "board" of entityId -> version. applyUndo /
// applyRedo record the applied actions; checkVersion mimics Whiteboard's
// semantics (absent entity satisfies expectedVersion 0; version-less
// entities satisfy any present-check).
function harness(opts?: { versions?: Map<string, number | null> }) {
  const board = opts?.versions ?? new Map<string, number | null>();
  const undone: Action[] = [];
  const redone: Action[] = [];
  const onChange = vi.fn();
  const h = new HistoryManager(
    onChange,
    (a) => undone.push(a),
    (a) => redone.push(a),
    (entityId, expectedVersion) => {
      if (!board.has(entityId)) return expectedVersion === 0;
      const v = board.get(entityId);
      if (v === null) return expectedVersion !== 0; // version-less: any present-check passes
      return v === expectedVersion;
    },
  );
  return { h, board, undone, redone, onChange };
}

const create = (id: string): Action => ({ type: 'CREATE', entityId: id, componentData: { id }, version: 1 });
const update = (id: string, v = 1): Action => ({ type: 'UPDATE', entityId: id, before: { id, s: 'a' }, after: { id, s: 'b' }, version: v });
const del = (id: string): Action => ({ type: 'DELETE', entityId: id, componentData: { id }, version: 1 });

describe("HistoryManager", () => {
  it("starts with nothing to undo or redo", () => {
    const { h, onChange } = harness();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    h.undo();
    h.redo();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("an empty action list is a no-op (no-op releases pollute nothing)", () => {
    const { h, onChange } = harness();
    h.pushActions([]);
    expect(h.canUndo()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pushActions enables undo; undo applies the reverse actions in reverse order", () => {
    const { h, board, undone } = harness();
    board.set('r1', null);
    board.set('r2', null);
    h.pushActions([update('r1'), update('r2')]);
    expect(h.canUndo()).toBe(true);

    h.undo();
    expect(undone.map(a => a.entityId)).toEqual(['r2', 'r1']); // reverse order
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
  });

  it("redo re-applies the undone transaction in forward order", () => {
    const { h, board, redone } = harness();
    board.set('r1', null);
    board.set('r2', null);
    h.pushActions([update('r1'), update('r2')]);
    h.undo();
    h.redo();
    expect(redone.map(a => a.entityId)).toEqual(['r1', 'r2']);
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });

  it("undoing a DELETE expects the entity to be absent", () => {
    const { h, board, undone } = harness();
    // Entity was deleted: it is NOT on the board anymore.
    h.pushActions([del('r1')]);
    h.undo();
    expect(undone).toHaveLength(1);
    expect(h.canRedo()).toBe(true);
    void board;
  });

  it("aborts the whole transaction and clears redo when a version drifted", () => {
    const { h, board, undone } = harness();
    board.set('r1', null);
    board.set('r2', 7); // a peer bumped r2 to version 7; the action expects 1
    h.pushActions([update('r1'), update('r2', 1)]);

    h.undo();
    expect(undone).toHaveLength(0); // nothing applied
    expect(h.canRedo()).toBe(false); // redo invalidated
  });

  it("blocks redoing a CREATE when the entity already exists", () => {
    const { h, board, redone } = harness();
    h.pushActions([create('r1')]);
    board.delete('r1'); // undo removed it
    h.undo();
    board.set('r1', null); // a peer recreated it meanwhile
    h.redo();
    expect(redone).toHaveLength(0);
  });

  it("clears the redo stack on a new action", () => {
    const { h, board } = harness();
    board.set('r1', null);
    h.pushActions([update('r1')]);
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.pushActions([update('r1')]);
    expect(h.canRedo()).toBe(false);
  });

  it("notifies onStateChange for pushes, undos and redos", () => {
    const { h, board, onChange } = harness();
    board.set('r1', null);
    h.pushActions([update('r1')]);
    h.undo();
    h.redo();
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("caps undo depth at 100 transactions, dropping the oldest", () => {
    const { h, board } = harness();
    board.set('r1', null);
    for (let i = 1; i <= 150; i++) {
      h.pushActions([update('r1', 1)]);
    }
    let steps = 0;
    while (h.canUndo()) {
      h.undo();
      steps++;
    }
    expect(steps).toBe(100);
  });
});
