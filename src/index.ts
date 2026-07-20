export { Whiteboard } from "./Whiteboard";

import { Whiteboard } from "./Whiteboard";
// Expose for browser usage without a bundler
if (typeof window !== 'undefined') {
  (window as any).Whiteboard = Whiteboard;
}

