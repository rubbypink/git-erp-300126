import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  // Root là public/ - nơi chứa index.html
  root: 'public',
  base: '/',

  build: {
    // Output ra dist/ ở project root
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,

    rollupOptions: {
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (/\.css$/.test(name)) return 'assets/css/[name]-[hash][extname]';
          if (/\.(png|jpg|jpeg|gif|svg|ico|webp)$/.test(name)) return 'assets/images/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },

  // Tắt publicDir mặc định vì root đã là public/
  publicDir: false,

  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/components', dest: 'src' },

        // SỬA Ở ĐÂY: Copy toàn bộ thư mục js (Bao gồm cả modules)
        // Vì hệ thống đang dùng load script động, bắt buộc phải copy nguyên trạng
        { src: 'src/js', dest: 'src' },

        { src: 'src/css', dest: 'src' },

        // SỬA Ở ĐÂY: Chỉ định rõ dest là '.' để giữ nguyên cấu trúc thư mục accountant/
        { src: 'accountant', dest: '.' },

        { src: 'src/images', dest: 'src' },
      ],
    }),
  ],

  server: {
    port: 3000,
    open: false,
    cors: true,
  },

  resolve: {
    alias: {
      '@': '/src',
      '@js': '/src/js',
      '@components': '/src/components',
    },
  },
});
