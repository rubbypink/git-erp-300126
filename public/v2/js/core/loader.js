/**
 * COMPONENT LOADER V2
 * Responsible for fetching HTML fragments and caching them.
 */

const ComponentLoader = {
    cache: {},

    /**
     * Tải và trả về nội dung HTML dạng text
     */
    load: async function(path) {
        if (this.cache[path]) return this.cache[path];

        try {
            console.log(`📥 Loading component: ${path}`);
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            
            this.cache[path] = html;
            return html;
        } catch (error) {
            console.error("Loader Error:", error);
            return `<div class="alert alert-danger">Lỗi tải component: ${path}</div>`;
        }
    },

    /**
     * Inject HTML vào DOM
     * @param {string} targetId - ID của thẻ cha
     * @param {string} path - Đường dẫn file HTML
     * @param {string} mode - 'replace' | 'append'
     */
    render: async function(targetId, path, mode = 'replace') {
        const html = await this.load(path);
        const container = document.getElementById(targetId);
        
        if (!container) {
            console.warn(`Target container #${targetId} not found.`);
            return;
        }

        // Parse HTML string thành DOM nodes để script bên trong (nếu có) chạy được
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Lấy nội dung body (bỏ qua head)
        const content = doc.body; 

        // Xử lý script tag (vì insert innerHTML thường không chạy script)
        // Chúng ta sẽ extract script ra và chạy tay nếu cần, nhưng tốt nhất 
        // là HTML component không nên chứa script logic.
        
        if (mode === 'replace') container.innerHTML = html;
        else container.insertAdjacentHTML('beforeend', html);
    }
};

window.ComponentLoader = ComponentLoader;