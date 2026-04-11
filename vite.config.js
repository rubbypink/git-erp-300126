// vite.config.js
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

export default defineConfig({
  // Bối cảnh: Root là public/ để Vite tự động nhận diện index.html và các đường dẫn /src
  root: 'public',
  base: '/',

  // Trỏ Vite ra ngoài 1 cấp để đọc các biến môi trường (.env) nếu có
  envDir: '../',

  build: {
    // Xuất file build ra thư mục dist ở thư mục gốc (ngang hàng với public)
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      input: {
        // Đảm bảo cấu trúc Multi-page Application (MPA)
        main: resolve(__dirname, 'public/index.html'),
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

  publicDir: false, // Tắt publicDir mặc định vì chính thư mục root đã là public

  plugins: [
    viteStaticCopy({
      targets: [
        // Đảm bảo sao chép tĩnh các template HTML hoặc các file không được import trực tiếp qua JS
        { src: 'src/components/*.html', dest: 'src/components' },
        { src: 'src/accountant/*.*', dest: 'src/accountant' },
        { src: 'admin/css/*.css', dest: 'src/css' },
        // Lưu ý: Không cần copy js/css nếu bạn đã import nó trong các file JS chính, Vite sẽ tự bundle.
      ],
    }),
  ],

  resolve: {
    alias: {
      // TUYỆT ĐỐI KHÔNG dùng alias cho thư viện NPM (như dayjs, choices.js, sweetalert2).
      // Chỉ dùng alias để map cấu trúc thư mục nội bộ, sử dụng resolve(__dirname, ...) để đảm bảo chính xác tuyệt đối.
      '@': resolve(__dirname, 'public/src'),
      '@js': resolve(__dirname, 'public/src/js'),
      '@db': resolve(__dirname, 'public/src/js/modules/db'),
      '@md': resolve(__dirname, 'public/src/js/modules'),
      '@acc': resolve(__dirname, 'public/src/accountant'),
      '@components': resolve(__dirname, 'public/src/components'),
    },
  },

  server: {
    port: 3010,
    host: true,
    fs: {
      // CHÌA KHÓA: Cho phép Vite truy cập toàn bộ thư mục gốc dự án (chứa node_modules)
      // Không cần phải khai báo cụ thể node_modules hay public, chỉ cần __dirname (project root)
      allow: [resolve(__dirname)],
    },
    open: true,
  },

  // TỐI ƯU HÓA KHI LẬP TRÌNH (Bắt buộc với ERP có Firebase)
  // Giúp Vite gom nhóm các dependencies này lại trong 1 lần tải duy nhất lúc khởi động server
  optimizeDeps: {
    include: ['sweetalert2', 'dayjs', 'choices.js', 'firebase/app', 'firebase/firestore', 'firebase/auth', 'firebase/functions'],
  },
});
