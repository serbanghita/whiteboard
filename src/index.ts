export { Whiteboard } from "./Whiteboard";
export { MultiplayerPlugin, MultiplayerConfig } from "./multiplayer/MultiplayerPlugin";

import { Whiteboard } from "./Whiteboard";
import { MultiplayerPlugin } from "./multiplayer/MultiplayerPlugin";

// Expose for browser usage without a bundler
if (typeof window !== 'undefined') {
  (window as any).Whiteboard = Whiteboard;
  (window as any).MultiplayerPlugin = MultiplayerPlugin;
}
