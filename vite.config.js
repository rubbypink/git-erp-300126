// vite.config.js
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path'; // Thêm dòng này để dùng được __dirname

export default defineConfig({
  // Root là public/ - nơi chứa index.html
  root: 'public',
  base: '/',

  build: {
    // Output ra dist/ ở project root
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
        // THÊM Ở ĐÂY: Entry point riêng cho Admin
        admin: resolve(__dirname, 'public/admin/index.html'),
      },
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

  publicDir: false,

  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/components', dest: 'src' },
        { src: 'src/js', dest: 'src' },
        { src: 'src/css', dest: 'src' },
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
