import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        include: ['src/**/__tests__/**/*.test.ts'],
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__mocks__/webgl.ts'],
        coverage: {
            provider: 'istanbul',
            reporter: ['text']
        }
    }
})
