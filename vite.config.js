import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

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
          const name = assetInfo.name || ''
          if (/\.css$/.test(name)) return 'assets/css/[name]-[hash][extname]'
          if (/\.(png|jpg|jpeg|gif|svg|ico|webp)$/.test(name))
            return 'assets/images/[name]-[hash][extname]'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },

  // Tắt publicDir mặc định vì root đã là public/
  publicDir: false,

  plugins: [
    viteStaticCopy({
      targets: [
        // Service Worker - phải ở root domain, không được bundle
        { src: 'firebase-messaging-sw.js', dest: '.' },

        // HTML Templates - load động bởi renderer.js
        { src: 'src/components', dest: 'src' },

        // Chỉ copy các file .js trực tiếp, KHÔNG copy thư mục con modules/
        { src: 'src/js/*.js', dest: 'src/js' },
    
        // Common components (nếu vẫn là classic scripts)
        { src: 'src/js/common', dest: 'src/js' },

        // CSS files - copy (main.css linked từ HTML sẽ được Vite process)
        { src: 'src/css', dest: 'src' },

        // Accountant module (CSS + JS riêng)
        { src: 'accountant', dest: '.' },

        // Images
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
})