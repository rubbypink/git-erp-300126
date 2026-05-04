/**
 * =========================================================================
 * 9TRIP ERP — AI MARKETING MODULE (Class-based)
 * Dashboard duyệt nội dung từ Content Queue qua Matrix Input
 * =========================================================================
 */

const AI_FUNCTIONS_BASE = 'asia-southeast1';

class AiMarketingModule {
    static autoInit = false;
    static Config = {
        queueCollection: 'ai_content_queue',
        pageSize: 20,
    };

    static State = {
        items: [],
        filteredItems: [],
        currentFilter: { status: 'pending_review', format: '' },
        stats: { pending_review: 0, approved: 0, rejected: 0, revision: 0 },
        selectedId: null,
        isInitialized: false,
        isLoading: false,
        currentTaskId: null,
    };

    static async init() {
        if (this.State.isInitialized) return;
        try {
            L._('AiMarketing: Khởi tạo...');
            await this.renderTemplate();
            this.bindEvents();
            await this.loadQueue();
            this.State.isInitialized = true;
            L._('AiMarketing: Khởi tạo xong ✅');
        } catch (e) {
            L.log('AiMarketing.init Error:', e);
        }
    }

    // ═══ RENDER TEMPLATE ══════════════════════════════════════════════════
    static async renderTemplate() {
        const container = getE('ai-marketing-container');
        if (!container) {
            console.warn('[AiMarketing] Không tìm thấy container #ai-marketing-container');
            return;
        }
        if (A.UI && A.UI.HELP && A.UI.HELP.loadHtmlFile) {
            const html = await A.UI.HELP.loadHtmlFile('./src/components/tpl_ai_marketing.html');
            if (html) {
                container.innerHTML = '';
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const template = temp.querySelector('#tmpl-ai-marketing');
                if (template) {
                    container.appendChild(template.content.cloneNode(true));
                } else {
                    container.innerHTML = html;
                }
            }
        }
    }

    // ═══ BIND EVENTS ══════════════════════════════════════════════════════
    static bindEvents() {
        const self = this;

        A.Event.on('#ai-queue-refresh', 'click', () => self.loadQueue(), true);

        A.Event.on('#ai-queue-filter-status', 'change', (e) => {
            self.State.currentFilter.status = e.target.value;
            self.applyFilters();
        }, true);

        A.Event.on('#ai-queue-filter-format', 'change', (e) => {
            self.State.currentFilter.format = e.target.value;
            self.applyFilters();
        }, true);

        A.Event.on('#ai-btn-approve', 'click', () => self.reviewContent('approved'), true);
        A.Event.on('#ai-btn-revision', 'click', () => self.reviewContent('revision'), true);
        A.Event.on('#ai-btn-reject', 'click', () => self.reviewContent('rejected'), true);

        A.Event.on('#ai-btn-run-pipeline', 'click', () => {
            const modal = new bootstrap.Modal(getE('aiPipelineModal'));
            modal.show();
        }, true);

        A.Event.on('#ai-pipeline-source', 'change', (e) => {
            const urlGroup = getE('ai-pipeline-url-group');
            if (urlGroup) urlGroup.style.display = e.target.value === 'rss' ? '' : 'none';
        }, true);

        A.Event.on('#ai-btn-start-pipeline', 'click', () => self.runPipeline(), true);

        A.Event.on('#ai-btn-load-progress', 'click', () => self.loadPipelineProgress(), true);
    }

    // ═══ LOAD QUEUE — Gọi Callable Function ══════════════════════════════
    static async loadQueue() {
        if (this.State.isLoading) return;
        this.State.isLoading = true;
        this.showLoading(true);

        try {
            const loadAll = {};
            const statuses = ['pending_review', 'approved', 'rejected', 'revision'];

            for (const status of statuses) {
                try {
                    const result = await A.DB.callFunction('getContentQueue', { status, limit: 50 }, AI_FUNCTIONS_BASE);
                    if (result.data?.success || result?.success) {
                        loadAll[status] = result.data.items || result.items || [];
                    } else {
                        loadAll[status] = [];
                    }
                } catch (err) {
                    console.warn(`[AiMarketing] Lỗi tải queue ${status}:`, err.message);
                    loadAll[status] = [];
                }
            }

            this.State.items = [
                ...(loadAll.pending_review || []),
                ...(loadAll.approved || []),
                ...(loadAll.rejected || []),
                ...(loadAll.revision || []),
            ];

            this.State.stats = {
                pending_review: (loadAll.pending_review || []).length,
                approved: (loadAll.approved || []).length,
                rejected: (loadAll.rejected || []).length,
                revision: (loadAll.revision || []).length,
            };

            this.updateStats();
            this.applyFilters();
        } catch (error) {
            L.log('[AiMarketing] loadQueue Error:', error);
            Swal.fire({ icon: 'error', title: 'Lỗi tải dữ liệu', text: error.message, timer: 3000 });
        } finally {
            this.State.isLoading = false;
            this.showLoading(false);
        }
    }

    // ═══ APPLY FILTERS ═════════════════════════════════════════════════════
    static applyFilters() {
        let items = [...this.State.items];
        const { status, format } = this.State.currentFilter;

        if (status) {
            items = items.filter((i) => i.status === status);
        }
        if (format) {
            items = items.filter((i) => i.writerContent?.format === format);
        }

        this.State.filteredItems = items;
        this.renderQueue();
    }

    // ═══ RENDER QUEUE — Bất đồng bộ, chunk rendering ═══════════════════════
    static renderQueue() {
        const listEl = getE('ai-queue-list');
        const emptyEl = getE('ai-queue-empty');
        const countEl = getE('ai-queue-count');

        if (!listEl) return;

        const items = this.State.filteredItems;
        if (countEl) countEl.textContent = items.length;

        if (items.length === 0) {
            listEl.classList.add('d-none');
            if (emptyEl) emptyEl.classList.remove('d-none');
            return;
        }

        if (emptyEl) emptyEl.classList.add('d-none');
        listEl.classList.remove('d-none');

        this.renderChunked(listEl, items, 5);
    }

    static renderChunked(container, items, chunkSize) {
        container.innerHTML = '';
        let idx = 0;

        const renderNext = () => {
            const end = Math.min(idx + chunkSize, items.length);
            const fragment = document.createDocumentFragment();

            for (; idx < end; idx++) {
                const card = this.createCard(items[idx]);
                fragment.appendChild(card);
            }

            container.appendChild(fragment);

            if (idx < items.length) {
                requestAnimationFrame(renderNext);
            }
        };

        requestAnimationFrame(renderNext);
    }

    // ═══ CREATE CARD — 4 cột Mobile First ═════════════════════════════════
    static createCard(item) {
        const wc = item.writerContent || {};
        const va = item.visualAnalysis || {};
        const statusBadge = this.getStatusBadge(item.status);
        const formatBadge = this.getFormatBadge(wc.format);
        const timeAgo = this.getTimeAgo(item.created_at);

        const div = document.createElement('div');
        div.className = 'card m-2 shadow-sm border-0';
        div.dataset.id = item.id;
        div.style.borderLeft = `4px solid ${statusBadge.color}`;

        div.innerHTML = `
            <div class="card-body p-2 p-md-3" style="cursor: pointer;" onclick="AiMarketingModule.openDetail('${item.id}')">
                <div class="row g-2 align-items-start">
                    <!-- Cột 1: Nội dung -->
                    <div class="col-12 col-md-5">
                        <div class="fw-bold text-truncate" style="font-size: 0.95rem;">${this.escHtml(wc.title || 'Không tiêu đề')}</div>
                        <div class="text-muted small text-truncate mt-1" style="max-height: 3em; overflow: hidden;">
                            ${this.escHtml((wc.content || '').slice(0, 150))}...
                        </div>
                        ${wc.cta ? `<div class="small mt-1"><span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25"><i class="fa-solid fa-bullhorn me-1"></i>${this.escHtml(wc.cta.slice(0, 60))}</span></div>` : ''}
                    </div>

                    <!-- Cột 2: Media preview -->
                    <div class="col-6 col-md-3">
                        ${this.renderMediaPreview(item.suggestions || [], va)}
                    </div>

                    <!-- Cột 3: Điểm số Matrix -->
                    <div class="col-6 col-md-2 text-center">
                        ${this.renderMatrixScore(item)}
                        <div class="text-muted mt-1" style="font-size: 10px;">${timeAgo}</div>
                    </div>

                    <!-- Cột 4: Nút Duyệt/Sửa -->
                    <div class="col-12 col-md-2 d-flex flex-column gap-1">
                        <button class="btn btn-success btn-sm w-100" onclick="event.stopPropagation(); AiMarketingModule.quickReview('${item.id}', 'approved')">
                            <i class="fa-solid fa-check me-1"></i>Duyệt
                        </button>
                        <button class="btn btn-outline-warning btn-sm w-100" onclick="event.stopPropagation(); AiMarketingModule.quickReview('${item.id}', 'revision')">
                            <i class="fa-solid fa-pen me-1"></i>Sửa
                        </button>
                        <button class="btn btn-outline-danger btn-sm w-100" onclick="event.stopPropagation(); AiMarketingModule.quickReview('${item.id}', 'rejected')">
                            <i class="fa-solid fa-xmark me-1"></i>Từ chối
                        </button>
                    </div>
                </div>
            </div>
        `;

        return div;
    }

    // ═══ RENDER HELPERS ════════════════════════════════════════════════════
    static getStatusBadge(status) {
        const map = {
            pending_review: { label: 'Chờ duyệt', color: '#ffc107', bg: 'bg-warning bg-opacity-10 text-warning border-warning' },
            approved: { label: 'Đã duyệt', color: '#28a745', bg: 'bg-success bg-opacity-10 text-success border-success' },
            rejected: { label: 'Từ chối', color: '#dc3545', bg: 'bg-danger bg-opacity-10 text-danger border-danger' },
            revision: { label: 'Sửa lại', color: '#17a2b8', bg: 'bg-info bg-opacity-10 text-info border-info' },
        };
        return map[status] || map.pending_review;
    }

    static getFormatBadge(format) {
        const map = {
            social_post: { label: 'Social', icon: 'fa-brands fa-facebook', color: '#1877f2' },
            blog_post: { label: 'Blog', icon: 'fa-solid fa-blog', color: '#6f42c1' },
            short_caption: { label: 'Caption', icon: 'fa-solid fa-quote-left', color: '#fd7e14' },
            news_summary: { label: 'News', icon: 'fa-solid fa-newspaper', color: '#20c997' },
        };
        return map[format] || map.social_post;
    }

    static renderMediaPreview(suggestions, visualAnalysis) {
        if (!suggestions || suggestions.length === 0) {
            return `<div class="text-muted small text-center"><i class="fa-solid fa-image fa-2x mb-1" style="opacity: 0.3;"></i><div>Chưa có đề xuất</div></div>`;
        }
        const first = suggestions[0];
        const formatIcons = { '1:1': 'fa-square', '9:16': 'fa-mobile-screen', '16:9': 'fa-display', '4:5': 'fa-tablet-screen-button' };
        const icon = formatIcons[first.format] || 'fa-image';
        return `
            <div class="border rounded p-1 small" style="background: #f8f9fa;">
                <div class="d-flex align-items-center gap-1 mb-1">
                    <i class="fa-solid ${icon} text-muted"></i>
                    <span class="fw-bold" style="font-size: 10px;">${this.escHtml(first.format || '—')}</span>
                </div>
                <div style="font-size: 11px; max-height: 2.5em; overflow: hidden;">${this.escHtml(first.sceneDescription || '').slice(0, 80)}</div>
                <div class="d-flex gap-1 mt-1 flex-wrap">
                    ${(first.dominantColors || []).map((c) => `<span class="badge" style="background: ${c}; font-size: 9px; color: white;">${c}</span>`).join('')}
                </div>
                <div class="text-muted mt-1" style="font-size: 10px;"><i class="fa-solid fa-heart-pulse me-1"></i>${this.escHtml(first.emotionKey || visualAnalysis.mood || '—')}</div>
            </div>
        `;
    }

    static renderMatrixScore(item) {
        const review = item.review || {};
        const matrixScore = review.matrixScore || null;
        const phuQuocScore = item.phuQuocRelevance || null;

        if (matrixScore) {
            const total = matrixScore.total || 0;
            const maxScore = matrixScore.max || 10;
            const pct = Math.round((total / maxScore) * 100);
            const cls = pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger';
            return `
                <div class="position-relative" style="width: 48px; height: 48px; margin: 0 auto;">
                    <svg viewBox="0 0 36 36" style="width: 48px; height: 48px; transform: rotate(-90deg);">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e9ecef" stroke-width="3"/>
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${pct >= 80 ? '#28a745' : pct >= 50 ? '#ffc107' : '#dc3545'}" stroke-width="3" stroke-dasharray="${pct}, 100"/>
                    </svg>
                    <div class="position-absolute top-50 start-50 translate-middle fw-bold" style="font-size: 14px;">${total}</div>
                </div>
            `;
        }

        if (phuQuocScore !== null && phuQuocScore !== undefined) {
            const pct = Math.round((phuQuocScore / 10) * 100);
            const color = pct >= 80 ? '#28a745' : pct >= 50 ? '#ffc107' : '#dc3545';
            return `
                <div class="fw-bold" style="font-size: 1.5rem; color: ${color};">${phuQuocScore}/10</div>
                <div class="text-muted" style="font-size: 10px;">PQ Relevance</div>
            `;
        }

        return `<div class="text-muted"><i class="fa-solid fa-circle-question fa-lg" style="opacity: 0.3;"></i></div>`;
    }

    static getTimeAgo(timestamp) {
        if (!timestamp) return '';
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Vừa xong';
        if (diffMin < 60) return `${diffMin} phút trước`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return `${diffH} giờ trước`;
        const diffD = Math.floor(diffH / 24);
        return `${diffD} ngày trước`;
    }

    static escHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ═══ UPDATE STATS ════════════════════════════════════════════════════
    static updateStats() {
        const s = this.State.stats;
        setVal('ai-stat-pending', s.pending_review);
        setVal('ai-stat-approved', s.approved);
        setVal('ai-stat-rejected', s.rejected);
        setVal('ai-stat-revision', s.revision);
    }

    // ═══ OPEN DETAIL MODAL ═════════════════════════════════════════════════
    static openDetail(itemId) {
        const item = this.State.items.find((i) => i.id === itemId);
        if (!item) return;

        this.State.selectedId = itemId;
        const body = getE('ai-detail-body');
        if (!body) return;

        const wc = item.writerContent || {};
        const va = item.visualAnalysis || {};
        const suggestions = item.suggestions || [];
        const logoSpec = item.logoSpec || {};
        const statusBadge = this.getStatusBadge(item.status);

        body.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <span class="badge ${statusBadge.bg} border">${statusBadge.label}</span>
                <small class="text-muted">${this.getTimeAgo(item.created_at)}</small>
            </div>

            <!-- Nội dung Writer -->
            <div class="mb-3">
                <h6 class="fw-bold text-primary mb-1"><i class="fa-solid fa-file-lines me-1"></i>${this.escHtml(wc.title || 'Không tiêu đề')}</h6>
                <div class="small text-muted mb-2">Format: <span class="badge bg-secondary">${wc.format || 'N/A'}</span></div>
                <div class="border rounded p-2 mb-2" style="background: #f8f9fa; white-space: pre-wrap; max-height: 200px; overflow-y: auto; font-size: 0.9rem;">${this.escHtml(wc.content || '')}</div>
                ${wc.cta ? `<div class="small"><span class="fw-bold">CTA:</span> <span class="badge bg-info bg-opacity-10 text-info">${this.escHtml(wc.cta)}</span></div>` : ''}
                ${wc.hashtags?.length ? `<div class="small mt-1">${wc.hashtags.map((h) => `<span class="badge bg-light text-dark me-1">#${this.escHtml(h)}</span>`).join('')}</div>` : ''}
            </div>

            <!-- Visual Analysis -->
            <div class="mb-3">
                <h6 class="fw-bold" style="color: #6f42c1;"><i class="fa-solid fa-eye me-1"></i>Phân tích Visual</h6>
                <div class="row g-2">
                    <div class="col-4"><div class="border rounded p-1 text-center"><div class="text-muted small">Chủ đề</div><div class="fw-bold small">${this.escHtml(va.topic || '—')}</div></div></div>
                    <div class="col-4"><div class="border rounded p-1 text-center"><div class="text-muted small">Tâm trạng</div><div class="fw-bold small">${this.escHtml(va.mood || '—')}</div></div></div>
                    <div class="col-4"><div class="border rounded p-1 text-center"><div class="text-muted small">Yếu tố</div><div class="fw-bold small" style="font-size: 11px;">${(va.keyElements || []).slice(0, 3).map(this.escHtml).join(', ') || '—'}</div></div></div>
                </div>
            </div>

            <!-- Media Suggestions -->
            ${suggestions.length > 0 ? `
            <div class="mb-3">
                <h6 class="fw-bold" style="color: #6f42c1;"><i class="fa-solid fa-images me-1"></i>Đề xuất Media (${suggestions.length})</h6>
                <div class="row g-2">
                    ${suggestions.map((s, idx) => `
                    <div class="col-6 col-md-3">
                        <div class="border rounded p-2 h-100" style="background: #f8f9fa;">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge bg-dark bg-opacity-75">${this.escHtml(s.format)}</span>
                                <small class="text-muted">${s.mediaSource || ''}</small>
                            </div>
                            <div class="small fw-bold mb-1" style="max-height: 3em; overflow: hidden;">${this.escHtml(s.sceneDescription || '').slice(0, 80)}</div>
                            <div class="d-flex gap-1 mb-1">${(s.dominantColors || []).map((c) => `<span style="width:12px;height:12px;border-radius:2px;background:${c};display:inline-block;"></span>`).join('')}</div>
                            <div class="text-muted" style="font-size: 10px;"><i class="fa-solid fa-heart-pulse me-1"></i>${this.escHtml(s.emotionKey || '')}</div>
                            ${s.textOverlay ? `<div class="text-muted" style="font-size: 10px;"><i class="fa-solid fa-font me-1"></i>"${this.escHtml(s.textOverlay.headline || '').slice(0, 30)}" → ${s.textOverlay.position || ''}</div>` : ''}
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Logo Spec -->
            <div class="mb-3">
                <h6 class="fw-bold text-secondary"><i class="fa-solid fa-stamp me-1"></i>Logo 9Trip</h6>
                <div class="small">
                    Vị trí: <span class="badge bg-secondary">${this.escHtml(logoSpec.position || 'bottom_right')}</span>
                    | Opacity: ${logoSpec.opacity || '0.85'}
                    | Max width: ${logoSpec.maxWidthPercent || '18'}%
                </div>
            </div>

            <!-- Platforms -->
            ${(item.platformOptimized || []).length > 0 ? `
            <div class="mb-3">
                <h6 class="fw-bold text-secondary"><i class="fa-solid fa-share-nodes me-1"></i>Nền tảng tối ưu</h6>
                <div>${(item.platformOptimized || []).map((p) => `<span class="badge bg-primary bg-opacity-10 text-primary me-1">${this.escHtml(p)}</span>`).join('')}</div>
            </div>
            ` : ''}
        `;

        const modal = new bootstrap.Modal(getE('aiDetailModal'));
        modal.show();
    }

    // ═══ QUICK REVIEW — Nút nhanh trên card ═══════════════════════════════
    static async quickReview(contentId, status) {
        const result = await Swal.fire({
            title: this.getReviewTitle(status),
            text: `Bạn có chắc muốn chuyển bài viết này sang "${this.getStatusBadge(status).label}"?`,
            icon: status === 'approved' ? 'success' : status === 'rejected' ? 'warning' : 'question',
            showCancelButton: true,
            confirmButtonText: 'Xác nhận',
            cancelButtonText: 'Huỷ',
            confirmButtonColor: status === 'approved' ? '#28a745' : status === 'rejected' ? '#dc3545' : '#ffc107',
        });

        if (!result.isConfirmed) return;

        try {
            const result = await A.DB.callFunction('reviewContent', { contentId, status }, AI_FUNCTIONS_BASE);

            if (result.data?.success || result?.success) {
                Swal.fire({ icon: 'success', title: 'Đã cập nhật!', timer: 1500, showConfirmButton: false });
                await this.loadQueue();
            } else {
                throw new Error(result.data?.message || 'Lỗi không xác định');
            }
        } catch (error) {
            console.error('[AiMarketing] quickReview error:', error);
            Swal.fire({ icon: 'error', title: 'Lỗi', text: error.message, timer: 3000 });
        }
    }

    // ═══ REVIEW CONTENT — Từ modal detail ════════════════════════════════
    static async reviewContent(status) {
        if (!this.State.selectedId) return;
        await this.quickReview(this.State.selectedId, status);

        const modal = bootstrap.Modal.getInstance(getE('aiDetailModal'));
        if (modal) modal.hide();
    }

    static getReviewTitle(status) {
        const map = {
            approved: 'Duyệt bài viết',
            rejected: 'Từ chối bài viết',
            revision: 'Yêu cầu sửa lại',
        };
        return map[status] || 'Cập nhật trạng thái';
    }

    // ═══ PARSE KEYWORDS ══════════════════════════════════════════════════
    static parseKeywords(raw) {
        if (!raw || !raw.trim()) return [];
        const s = raw.trim();

        if (s.startsWith('[')) {
            try {
                const arr = JSON.parse(s);
                if (Array.isArray(arr)) return arr.map(k => k.trim()).filter(Boolean);
            } catch (e) { /* fall through */ }
            const py = s.match(/'([^']*?)'/g);
            if (py && py.length) return py.map(k => k.replace(/'/g, '').trim()).filter(Boolean);
        }

        if (s.includes(',')) return s.split(',').map(k => k.trim()).filter(Boolean);
        if (s.includes('\n')) return s.split('\n').map(k => k.trim()).filter(Boolean);

        return [s];
    }

    // ═══ UPDATE PIPELINE STEPS UI ════════════════════════════════════════
    static updatePipelineSteps(steps, results) {
        const stepMap = {
            researcher: { el: 'ai-pipe-researcher', countEl: 'ai-pipe-researcher-count' },
            scoring: { el: 'ai-pipe-scoring', countEl: 'ai-pipe-scoring-count' },
            filter_dedup: { el: 'ai-pipe-filter', countEl: 'ai-pipe-filter-count' },
            enrichment: { el: 'ai-pipe-enrichment', countEl: 'ai-pipe-enrichment-count' },
            planner: { el: 'ai-pipe-planner', countEl: 'ai-pipe-planner-count' },
            writer: { el: 'ai-pipe-writer', countEl: 'ai-pipe-writer-count' },
            media_master: { el: 'ai-pipe-media', countEl: 'ai-pipe-media-count' },
            publish: { el: 'ai-pipe-publisher', countEl: 'ai-pipe-publisher-count' },
        };

        // Cập nhật từng step dựa trên steps array từ pipeline result
        if (steps && steps.length) {
            for (const step of steps) {
                const map = stepMap[step.name];
                if (!map) continue;
                const el = getE(map.el);
                const countEl = getE(map.countEl);
                if (!el) continue;

                el.classList.remove('border-warning', 'border-info', 'border-success', 'border-danger', 'opacity-50');
                if (step.status === 'completed') {
                    el.classList.add('border-success');
                    el.style.background = '#d4edda';
                    if (countEl) countEl.textContent = `✅ ${step.duration ? (step.duration / 1000).toFixed(1) + 's' : 'done'}`;
                } else if (step.status === 'failed') {
                    el.classList.add('border-danger');
                    el.style.background = '#f8d7da';
                    if (countEl) countEl.textContent = '❌ ' + (step.error?.slice(0, 30) || 'fail');
                } else if (step.status === 'running') {
                    el.classList.add('border-info');
                    el.style.background = '#d1ecf1';
                    if (countEl) countEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                } else {
                    el.classList.add('opacity-50');
                    if (countEl) countEl.textContent = '⏳...';
                }
            }
        }

        // Cập nhật count với results nếu có
        if (results) {
            const resultMap = {
                'ai-pipe-researcher-count': results.totalResearched,
                'ai-pipe-media-count': results.mediaQueued || results.written,
            };
            for (const [id, val] of Object.entries(resultMap)) {
                const el = getE(id);
                if (el && val !== undefined) el.textContent = val;
            }
        }
    }

    // ═══ RUN FULL PIPELINE — Research → Write → Media → Publish ══════
    static async runPipeline() {
        const source = getVal('ai-pipeline-source');
        const url = getVal('ai-pipeline-url');
        const keywordsRaw = getVal('ai-pipeline-keywords');
        const maxItems = parseInt(getVal('ai-pipeline-maxitems')) || 5;
        const hoursBack = parseInt(getVal('ai-pipeline-hours')) || 24;
        const enableFacebook = getE('ai-pipeline-facebook')?.checked || false;

        const payload = { source, maxItems, hoursBack, enableFacebookGroupSearch: enableFacebook };
        if (source === 'rss' && url) payload.url = url;
        const keywords = AiMarketingModule.parseKeywords(keywordsRaw);
        if (keywords.length) payload.keywords = keywords;

        // Reset step UI về trạng thái chờ
        const stepIds = ['ai-pipe-researcher', 'ai-pipe-writer', 'ai-pipe-media', 'ai-pipe-publisher'];
        for (const id of stepIds) {
            const el = getE(id);
            if (el) {
                el.classList.remove('border-success', 'border-danger', 'opacity-50');
                el.style.background = '';
            }
        }
        const countIds = ['ai-pipe-researcher-count', 'ai-pipe-writer-count', 'ai-pipe-media-count', 'ai-pipe-publisher-count'];
        for (const id of countIds) {
            const el = getE(id);
            if (el) el.textContent = '⏳...';
        }

        // Close config modal, open progress modal
        bootstrap.Modal.getInstance(getE('aiPipelineModal'))?.hide();
        const progressModal = new bootstrap.Modal(getE('aiProgressModal'));
        progressModal.show();

        // Hiển thị step đầu tiên
        this.updateProgressStatus('⏳ Researcher đang thu thập dữ liệu...', 10);
        this.markProgressStep('researcher');

        try {
            const result = await A.DB.callFunction('runPipeline', payload, AI_FUNCTIONS_BASE);

            progressModal.hide();

            if (result.data?.success || result?.success) {
                const data = result.data || result;
                const pipelineData = data.data || {};
                const taskId = data.taskId;

                // Lưu taskId để có thể load progress sau
                if (taskId) this.State.currentTaskId = taskId;

                // Đánh dấu hoàn tất trên progress modal trước khi đóng
                this.updateProgressStatus('✅ Pipeline hoàn tất!', 100);
                this.markProgressStep('publish');

                // Cập nhật step UI với kết quả thực tế
                this.updatePipelineSteps(pipelineData.steps, pipelineData.results);

                let msg = `✅ Pipeline hoàn tất!\n\n`;
                msg += `📰 Researcher: ${pipelineData.results?.totalResearched || 0} items\n`;
                msg += `✍️ Writer: ${pipelineData.results?.written || 0} bài viết\n`;
                msg += `🖼️ MediaMaster: ${pipelineData.results?.mediaQueued || 0} media\n`;
                if (data.publishCount) msg += `📤 Publisher: ${data.publishCount} bài đã đăng\n`;

                Swal.fire({
                    icon: 'success',
                    title: 'Pipeline thành công!',
                    text: msg,
                    confirmButtonText: 'OK',
                });
                await this.loadQueue();
            } else {
                throw new Error(result.data?.error || result.error || result.data?.message || result.message || 'Pipeline trả về kết quả thất bại');
            }
        } catch (error) {
            progressModal.hide();
            console.error('[AiMarketing] Pipeline error:', error);

            // Đánh dấu step bị lỗi
            const researcherEl = getE('ai-pipe-researcher');
            if (researcherEl) {
                researcherEl.classList.add('border-danger');
                researcherEl.style.background = '#f8d7da';
            }
            const researcherCount = getE('ai-pipe-researcher-count');
            if (researcherCount) researcherCount.textContent = '❌ error';

            Swal.fire({
                icon: 'error',
                title: 'Pipeline thất bại',
                text: error.message,
                confirmButtonText: 'Đóng',
            });
        }
    }

    // ═══ PROGRESS MODAL HELPERS ══════════════════════════════════════════
    static updateProgressStatus(text, percent) {
        const statusEl = getE('ai-progress-status');
        const barEl = getE('ai-progress-bar');
        if (statusEl) statusEl.textContent = text;
        if (barEl) barEl.style.width = (percent || 5) + '%';
    }

    static markProgressStep(activeStep) {
        const steps = ['researcher', 'writer', 'media', 'publish'];
        for (const step of steps) {
            const el = getE('ai-ps-' + step);
            if (!el) continue;
            const inner = el.querySelector('.border');
            if (!inner) continue;
            if (step === activeStep) {
                inner.classList.remove('opacity-50');
                inner.classList.add('border-primary');
                inner.style.background = step === 'researcher' ? '#fff3cd' : step === 'writer' ? '#d1ecf1' : step === 'media' ? '#e8daef' : '#d4edda';
            } else {
                const idx = steps.indexOf(step);
                const activeIdx = steps.indexOf(activeStep);
                if (idx < activeIdx) {
                    inner.classList.remove('opacity-50');
                    inner.style.background = '#d4edda';
                    inner.style.borderColor = '#28a745';
                } else {
                    inner.classList.add('opacity-50');
                }
            }
        }
    }

    // ═══ LOAD PIPELINE PROGRESS — Đọc từ Firestore ═════════════════════
    static async loadPipelineProgress() {
        const taskId = this.State.currentTaskId;
        if (!taskId) {
            Swal.fire({
                icon: 'info',
                title: 'Chưa có pipeline',
                text: 'Bạn chưa chạy pipeline nào trong phiên này. Hãy khởi chạy Research & Publish trước.',
                confirmButtonText: 'OK',
            });
            return;
        }

        try {
            const doc = await A.DB.db.collection('ai_pipeline_tasks').doc(taskId).get();
            if (!doc.exists) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Không tìm thấy',
                    text: `Pipeline #${taskId.slice(0, 12)}... không tồn tại trong Firestore.`,
                    confirmButtonText: 'OK',
                });
                return;
            }

            const data = doc.data();

            // Cập nhật step UI
            if (data.result?.steps) {
                this.updatePipelineSteps(data.result.steps, data.result.results);
            }

            // Hiển thị trạng thái
            const status = data.status || 'unknown';
            const statusMap = {
                processing: { icon: '⏳', label: 'Đang xử lý...', cls: 'info' },
                completed: { icon: '✅', label: 'Hoàn tất', cls: 'success' },
                partial: { icon: '⚠️', label: 'Hoàn tất một phần', cls: 'warning' },
                failed: { icon: '❌', label: 'Thất bại', cls: 'error' },
            };
            const s = statusMap[status] || { icon: '❓', label: status, cls: 'secondary' };

            const errorMsg = data.error || data.result?.error || '';
            let html = `<div class="text-center mb-2"><span class="badge bg-${s.cls} fs-6">${s.icon} ${s.label}</span></div>`;
            html += `<div class="small text-muted mb-2">Task ID: <code>${taskId}</code></div>`;

            if (data.result?.results) {
                const r = data.result.results;
                html += `<div class="border rounded p-2 mb-2" style="background:#f8f9fa;">`;
                html += `<div class="small d-flex justify-content-between"><span>📰 Researcher</span><span class="fw-bold">${r.totalResearched || 0}</span></div>`;
                html += `<div class="small d-flex justify-content-between"><span>⭐ Scored</span><span class="fw-bold">${r.scored || 0}</span></div>`;
                html += `<div class="small d-flex justify-content-between"><span>🔍 Kept</span><span class="fw-bold">${r.kept || 0}</span></div>`;
                html += `<div class="small d-flex justify-content-between"><span>📝 Enriched</span><span class="fw-bold">${r.enriched || 0}</span></div>`;
                html += `<div class="small d-flex justify-content-between"><span>✍️ Written</span><span class="fw-bold">${r.written || 0}</span></div>`;
                html += `<div class="small d-flex justify-content-between"><span>🖼️ Media</span><span class="fw-bold">${r.mediaQueued || 0}</span></div>`;
                html += `</div>`;
            }

            if (errorMsg) {
                html += `<div class="alert alert-danger py-1 px-2 small mb-0">${errorMsg}</div>`;
            }

            // Show step durations
            if (data.result?.steps) {
                html += `<div class="mt-2 small"><span class="fw-bold">Các bước:</span></div>`;
                for (const step of data.result.steps) {
                    const icon = step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : step.status === 'running' ? '⏳' : '⏸️';
                    const duration = step.duration ? ` (${(step.duration / 1000).toFixed(1)}s)` : '';
                    html += `<div class="small d-flex justify-content-between px-2"><span>${icon} ${step.name}</span><span>${duration}</span></div>`;
                }
            }

            Swal.fire({
                icon: s.cls === 'success' ? 'success' : s.cls === 'error' ? 'error' : 'info',
                title: `Pipeline ${s.label}`,
                html,
                confirmButtonText: 'OK',
                width: 480,
            });
        } catch (error) {
            console.error('[AiMarketing] loadPipelineProgress error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Lỗi tải tiến trình',
                text: error.message,
                confirmButtonText: 'Đóng',
            });
        }
    }

    // ═══ LOADING STATE ════════════════════════════════════════════════════
    static showLoading(show) {
        const loadingEl = getE('ai-queue-loading');
        const listEl = getE('ai-queue-list');
        if (!loadingEl) return;

        if (show) {
            loadingEl.classList.remove('d-none');
            if (listEl) listEl.classList.add('d-none');
        } else {
            loadingEl.classList.add('d-none');
        }
    }

    static destroy() {
        this.State.isInitialized = false;
        this.State.items = [];
        this.State.filteredItems = [];
        this.State.currentTaskId = null;
    }
}

window.AiMarketingModule = AiMarketingModule;
export default AiMarketingModule;
