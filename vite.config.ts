import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import * as path from "node:path";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        alias: {
            '@serbanghita-gamedev/assets/': path.join(__dirname,  '../gamedev/packages/assets/'),
            '@serbanghita-gamedev/bitmask/': path.join(__dirname,  '../gamedev/packages/bitmask/'),
            '@serbanghita-gamedev/component/': path.join(__dirname,  '../gamedev/packages/component/'),
            '@serbanghita-gamedev/ecs/': path.join(__dirname,  '../gamedev/packages/ecs/'),
            '@serbanghita-gamedev/input/': path.join(__dirname,  '../gamedev/packages/input/'),
            '@serbanghita-gamedev/renderer/': path.join(__dirname,  '../gamedev/packages/renderer/'),
            '@serbanghita-gamedev/matrix/': path.join(__dirname,  '../gamedev/packages/matrix/'),
            '@serbanghita-gamedev/tiled/': path.join(__dirname,  '../gamedev/packages/tiled/')
        }
    }
})