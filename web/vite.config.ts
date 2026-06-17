import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // @sdd-telemetry/api 是 CJS 产物，且部分常量经两级 __exportStar 再导出
  // （index → profile-config → profile-types）。Vite 按裸文件即时转换 CJS 时
  // 只跟一级 re-export，会丢掉深层命名导出（如 DEFAULT_PROFILE_ERROR_RULES）。
  // 显式纳入 optimizeDeps 让 esbuild 预打包，把多级 re-export 摊平成真实命名导出。
  optimizeDeps: { include: ['@sdd-telemetry/api'] },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4318',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4173 },
});
