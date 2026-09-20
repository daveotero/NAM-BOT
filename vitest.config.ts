import { trainingReportPlugin } from './build/training-report-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [trainingReportPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
