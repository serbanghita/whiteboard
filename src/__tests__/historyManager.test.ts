import { describe, it, expect, vi } from "vitest";
import { HistoryManager } from "../HistoryManager";

describe("HistoryManager", () => {
  it("starts with nothing to undo or redo", () => {
    const h = new HistoryManager("a", () => {});
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("pushState enables undo and undo returns the prior state", () => {
    const h = new HistoryManager("a", () => {});
    h.pushState("b");
    expect(h.canUndo()).toBe(true);
    expect(h.undo()).toBe("a");
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
  });

  it("redo returns the undone state", () => {
    const h = new HistoryManager("a", () => {});
    h.pushState("b");
    h.undo();
    expect(h.redo()).toBe("b");
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });

  it("dedupes identical consecutive states", () => {
    const onChange = vi.fn();
    const h = new HistoryManager("a", onChange);
    h.pushState("a");
    expect(h.canUndo()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the redo stack on a new action", () => {
    const h = new HistoryManager("a", () => {});
    h.pushState("b");
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.pushState("c");
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe("a");
  });

  it("walks a multi-step history in both directions", () => {
    const h = new HistoryManager("a", () => {});
    h.pushState("b");
    h.pushState("c");
    expect(h.undo()).toBe("b");
    expect(h.undo()).toBe("a");
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe("b");
    expect(h.redo()).toBe("c");
    expect(h.redo()).toBeNull();
  });

  it("notifies onStateChange for pushes, undos and redos", () => {
    const onChange = vi.fn();
    const h = new HistoryManager("a", onChange);
    h.pushState("b");
    h.undo();
    h.redo();
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("caps undo depth at 100, dropping the oldest state", () => {
    const h = new HistoryManager("s0", () => {});
    for (let i = 1; i <= 150; i++) {
      h.pushState(`s${i}`);
    }
    let last: string | null = null;
    let steps = 0;
    while (h.canUndo()) {
      last = h.undo();
      steps++;
    }
    expect(steps).toBe(100);
    expect(last).toBe("s50");
  });
});
