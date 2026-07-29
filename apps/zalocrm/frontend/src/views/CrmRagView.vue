<template>
  <div class="airtable-scope dh-v4 rag-page">
    <div class="at-roletabs">
      <button class="at-roletab" :class="{ 'is-active': tab === 'catalog' }" @click="tab = 'catalog'">Danh mục</button>
      <button class="at-roletab" :class="{ 'is-active': tab === 'knowledge' }" @click="tab = 'knowledge'">Kho tri thức</button>
      <button class="at-roletab" :class="{ 'is-active': tab === 'orders' }" @click="tab = 'orders'">Đơn hàng</button>
      <button class="at-roletab" :class="{ 'is-active': tab === 'policy' }" @click="tab = 'policy'">Chính sách AI</button>
      <div class="at-roletabs__spacer"></div>
      <button class="at-roletabs__scope" :disabled="loading" @click="reload">Làm mới</button>
    </div>

    <div class="at-dash-body">
      <section class="dh-section-layout rag-shell">
        <header class="at-greet rag-hero">
          <div>
            <div class="at-greet__h">Sản phẩm, tri thức & AI</div>
            <div class="at-greet__s">Quản lý danh mục, nguồn tri thức, import đơn hàng và kiểm soát RAG auto-reply.</div>
          </div>
          <div class="rag-hero__actions">
            <button class="at-btn at-btn--secondary at-btn--sm" @click="tab = 'knowledge'">Nạp tri thức</button>
            <button class="at-btn at-btn--primary at-btn--sm" @click="catalogDialog = true">Thêm sản phẩm</button>
          </div>
        </header>

        <div class="at-kpi-grid rag-kpis">
          <div class="at-kpi-tile"><div class="at-kpi-label">Sản phẩm</div><div class="at-kpi-value">{{ catalog.length }}</div><div class="at-kpi-sub">Danh mục đang quản lý</div></div>
          <div class="at-kpi-tile"><div class="at-kpi-label">Tài liệu</div><div class="at-kpi-value">{{ documents.length }}</div><div class="at-kpi-sub">{{ approvedDocuments }} đã duyệt</div></div>
          <div class="at-kpi-tile"><div class="at-kpi-label">Chunks</div><div class="at-kpi-value">{{ totalChunks }}</div><div class="at-kpi-sub">Nguồn RAG đã index</div></div>
          <div class="at-kpi-tile"><div class="at-kpi-label">Auto hôm nay</div><div class="at-kpi-value">{{ metrics?.decisions?.auto_send || 0 }}</div><div class="at-kpi-sub">Tin AI đã gửi</div></div>
          <div class="at-kpi-tile"><div class="at-kpi-label">Handoff</div><div class="at-kpi-value">{{ metrics?.decisions?.handoff || 0 }}</div><div class="at-kpi-sub">Cần người xử lý</div></div>
          <div class="at-kpi-tile"><div class="at-kpi-label">Queue lag</div><div class="at-kpi-value">{{ queueLag }}</div><div class="at-kpi-sub">Việc RAG chờ</div></div>
        </div>

        <section v-show="tab === 'catalog'" class="rag-tab">
          <div class="at-card">
            <div class="at-card__head">
              <div class="at-card__title">Danh mục sản phẩm/dịch vụ</div>
              <button class="at-btn at-btn--primary at-btn--xs" @click="catalogDialog = true">Thêm</button>
            </div>
            <div class="rag-table-wrap">
              <v-data-table class="rag-table" :headers="catalogHeaders" :items="catalog" :loading="loading" item-value="id">
                <template #item.price="{ item }">{{ money(item.price, item.currency) }}</template>
                <template #item.resources="{ item }"><span class="resource-count">{{ item._count?.knowledgeDocuments || 0 }}</span></template>
                <template #item.image="{ item }">
                  <img v-if="imageUrl(item)" class="product-thumb" :src="imageUrl(item)" :alt="item.name" />
                  <span v-else class="hint">—</span>
                </template>
                <template #item.status="{ item }"><v-chip size="small" :color="item.status === 'active' ? 'success' : 'default'">{{ item.status }}</v-chip></template>
              </v-data-table>
            </div>
          </div>
        </section>

        <section v-show="tab === 'knowledge'" class="rag-tab">
          <div class="rag-knowledge-grid">
            <div class="at-card rag-form-card">
              <div class="at-card__head"><div class="at-card__title">Nạp tài liệu</div></div>
              <div class="rag-card-body">
                <v-text-field v-model="docForm.title" label="Tiêu đề" />
                <v-select v-model="docForm.catalogItemId" :items="catalog" item-title="name" item-value="id" label="Sản phẩm liên quan" clearable />
                <v-textarea v-model="docForm.text" label="Nội dung nhập tay" rows="5" />
                <div class="rag-actions">
                  <button class="at-btn at-btn--primary at-btn--sm" :disabled="saving" @click="createDocument">Nạp nội dung</button>
                  <v-file-input v-model="knowledgeFile" label="PDF, DOCX, XLSX, CSV hoặc TXT" accept=".pdf,.docx,.xlsx,.csv,.txt" density="compact" hide-details />
                  <button class="at-btn at-btn--secondary at-btn--sm" :disabled="!knowledgeFile || saving" @click="uploadDocument">Tải file lên</button>
                </div>
              </div>
            </div>

            <div class="at-card rag-test-card">
              <div class="at-card__head"><div class="at-card__title">Test truy hồi</div></div>
              <div class="rag-card-body">
                <v-textarea v-model="searchQuery" label="Câu hỏi thử" rows="5" />
                <button class="at-btn at-btn--secondary at-btn--sm" :disabled="searching" @click="testSearch">Tìm nguồn</button>
                <div class="rag-results">
                  <div v-for="chunk in searchResults" :key="chunk.id" class="result"><b>{{ percent(chunk.similarity) }} · {{ chunk.title }}</b><p>{{ chunk.content }}</p></div>
                </div>
              </div>
            </div>

            <div class="at-card rag-obsidian-card">
              <div class="at-card__head"><div class="at-card__title">Obsidian</div></div>
              <div class="rag-card-body">
                <div class="obsidian-status">
                  <div><span>Trạng thái</span><b>{{ obsidianStatus?.enabled ? 'Đã bật' : 'Chưa bật' }}</b></div>
                  <div><span>File đã duyệt</span><b>{{ obsidianStatus?.markdownFiles ?? 0 }}</b></div>
                </div>
                <div class="obsidian-path">{{ obsidianStatus?.vaultPath || 'Chưa cấu hình vault' }}</div>
                <button class="at-btn at-btn--primary at-btn--sm" :disabled="obsidianSyncing || !obsidianStatus?.enabled" @click="syncObsidian">
                  {{ obsidianSyncing ? 'Đang sync...' : 'Sync Obsidian' }}
                </button>
                <v-alert v-if="obsidianSyncResult" type="success" variant="tonal" density="compact">
                  Đã quét {{ obsidianSyncResult.scanned }} file · nhập mới {{ obsidianSyncResult.imported }} · trùng {{ obsidianSyncResult.duplicates }} · bỏ qua {{ obsidianSyncResult.skipped?.length || 0 }}
                </v-alert>
              </div>
            </div>

            <div class="at-card rag-doc-card">
              <div class="at-card__head">
                <div class="at-card__title">Tài liệu</div>
                <v-select v-model="documentFilter" :items="documentFilterOptions" density="compact" hide-details item-title="label" item-value="value" variant="outlined" />
              </div>
              <div class="rag-table-wrap">
                <v-data-table class="rag-table" :headers="documentHeaders" :items="filteredDocuments" :loading="loading">
                  <template #item.catalogItem="{ item }">{{ item.catalogItem?.name || '—' }}</template>
                  <template #item.sourceType="{ item }">{{ sourceLabel(item.sourceType) }}</template>
                  <template #item.status="{ item }"><v-chip size="small" :color="statusColor(item.status)" :title="item.errorMessage || item.status">{{ item.status }}</v-chip></template>
                  <template #item.errorMessage="{ item }"><span class="err-text" :title="item.errorMessage">{{ item.errorMessage || '—' }}</span></template>
                  <template #item.actions="{ item }"><v-btn v-if="item.status === 'ready'" size="small" variant="text" @click="approve(item.id)">Duyệt</v-btn><v-btn v-if="item.status !== 'archived'" size="small" variant="text" @click="reindex(item.id)">Index lại</v-btn><v-btn v-if="item.status !== 'archived'" size="small" color="error" variant="text" @click="archive(item.id)">Xóa</v-btn><span v-else class="hint">Đã xóa</span></template>
                </v-data-table>
              </div>
            </div>
          </div>
        </section>

        <section v-show="tab === 'orders'" class="rag-tab rag-orders-grid">
          <div class="at-card">
            <div class="at-card__head"><div class="at-card__title">Import CSV/XLSX</div></div>
            <div class="rag-card-body">
              <p class="hint">Tên cột chuẩn: externalId, customerPhone, customerZaloUid, status, orderedAt, currency, sku, itemName, quantity, unitPrice, total.</p>
              <v-file-input v-model="orderFile" accept=".csv,.xlsx" label="File đơn hàng" />
              <v-textarea v-model="mappingText" label="Mapping JSON (để {} nếu tên cột đã chuẩn)" rows="4" />
              <button class="at-btn at-btn--primary at-btn--sm" :disabled="!orderFile || saving" @click="previewOrders">Kiểm tra dữ liệu</button>
              <v-alert v-if="orderPreview" class="mt-3" :type="orderPreview.failedRows ? 'warning' : 'success'">{{ orderPreview.totalRows }} dòng · {{ orderPreview.failedRows }} lỗi <v-btn v-if="orderPreview.failedRows" class="ml-3" size="small" variant="text" @click="downloadOrderErrors">Tải lỗi CSV</v-btn><v-btn v-if="orderPreview.status === 'preview'" class="ml-3" size="small" @click="commitOrders">Ghi đơn hàng</v-btn></v-alert>
            </div>
          </div>
          <div class="at-card">
            <div class="at-card__head"><div class="at-card__title">Lịch sử import</div></div>
            <div class="rag-table-wrap"><v-data-table class="rag-table" :headers="batchHeaders" :items="batches" :loading="loading"><template #item.status="{ item }"><v-chip size="small" :color="statusColor(item.status)">{{ item.status }}</v-chip></template></v-data-table></div>
          </div>
        </section>

        <section v-show="tab === 'policy'" class="rag-tab rag-policy-grid">
          <div class="at-card">
            <div class="at-card__head"><div class="at-card__title">Sức khỏe RAG hôm nay</div></div>
            <div class="metric-grid" v-if="metrics">
              <div><span>Auto hôm nay</span><b>{{ metrics.decisions?.auto_send || 0 }}</b></div><div><span>Handoff</span><b>{{ metrics.decisions?.handoff || 0 }}</b></div><div><span>Unsafe block</span><b>{{ metrics.unsafeBlocked }}</b></div><div><span>Nick suspended</span><b>{{ metrics.suspendedAccounts }}</b></div><div><span>Queue lag</span><b>{{ queueLag }}</b></div><div><span>Vertex latency</span><b>{{ metrics.averageLatencyMs }} ms</b></div>
            </div>
          </div>
          <div class="at-card">
            <div class="at-card__head"><div class="at-card__title">Policy RAG cấp tổ chức</div></div>
            <div class="rag-card-body">
              <v-alert type="warning" variant="tonal">Kill switch phải giữ bật cho tới khi benchmark ≥200 câu, pháp lý và chi phí được duyệt.</v-alert>
              <v-switch v-model="ragConfig.ragEnabled" label="Bật pipeline RAG" color="primary" />
              <v-switch v-model="ragConfig.ragKillSwitch" label="Kill switch (không cho auto-send)" color="error" />
              <v-slider v-model="ragConfig.ragSimilarityThreshold" label="Ngưỡng similarity" :min="0" :max="1" :step="0.01" thumb-label />
              <div class="rag-policy-fields">
                <v-text-field v-model.number="ragConfig.ragTopK" type="number" label="Top K" />
                <v-text-field v-model.number="ragConfig.ragAutoDailyBudget" type="number" label="Ngân sách auto-send/ngày" />
              </div>
              <v-textarea
                v-model="autoReplyStyle"
                label="Cách AI nói chuyện với khách"
                rows="7"
                hint="Ví dụ: xưng em, gọi khách anh/chị, trả lời ngắn gọn, thân thiện, luôn hỏi thêm nhu cầu ở cuối."
                persistent-hint
              />
              <button class="at-btn at-btn--primary at-btn--sm" :disabled="saving" @click="savePolicy">Lưu chính sách</button>
            </div>
          </div>
        </section>
      </section>
    </div>
  </div>

  <v-dialog v-model="catalogDialog" max-width="560"><v-card><v-card-title>Thêm sản phẩm/dịch vụ</v-card-title><v-card-text>
    <v-text-field v-model="catalogForm.sku" label="SKU"/><v-text-field v-model="catalogForm.name" label="Tên"/><v-textarea v-model="catalogForm.description" label="Mô tả"/><v-text-field v-model.number="catalogForm.price" type="number" label="Giá tham khảo"/><v-text-field v-model="catalogForm.imageUrl" label="URL ảnh sản phẩm"/>
  </v-card-text><v-card-actions><v-spacer/><v-btn variant="text" @click="catalogDialog=false">Huỷ</v-btn><v-btn :loading="saving" @click="saveCatalog">Lưu</v-btn></v-card-actions></v-card></v-dialog>
</template>

<script setup lang="ts">
import '@/assets/atlas-v2-dashboard.css';
import '@/assets/dashboard.css';
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';

const toast = useToast();
const { confirm } = useConfirm();
const tab = ref('catalog'), loading = ref(false), saving = ref(false), searching = ref(false);
const obsidianSyncing = ref(false);
const catalog = ref<any[]>([]), documents = ref<any[]>([]), batches = ref<any[]>([]), searchResults = ref<any[]>([]);
const metrics = ref<any>(null);
const obsidianStatus = ref<any>(null), obsidianSyncResult = ref<any>(null);
const catalogDialog = ref(false), knowledgeFile = ref<File[] | File | null>(null), orderFile = ref<File[] | File | null>(null);
const searchQuery = ref(''), mappingText = ref('{}'), orderPreview = ref<any>(null);
const catalogForm = ref({ sku: '', name: '', description: '', price: null as number | null, imageUrl: '' });
const docForm = ref({ title: '', text: '', catalogItemId: null as string | null });
const ragConfig = ref({ ragEnabled: true, ragKillSwitch: false, ragSimilarityThreshold: 0.78, ragTopK: 5, ragAutoDailyBudget: 500 });
const autoReplyStyle = ref('');
const documentFilter = ref<'active' | 'archived' | 'all'>('active');
const documentFilterOptions = [
  { label: 'Đang dùng', value: 'active' },
  { label: 'Đã xóa', value: 'archived' },
  { label: 'Tất cả', value: 'all' },
];
const catalogHeaders = [
  { title: 'SKU', key: 'sku' },
  { title: 'Tên sản phẩm', key: 'name' },
  { title: 'Giá', key: 'price' },
  { title: 'Tài Nguyên', key: 'resources', sortable: false },
  { title: 'Ảnh sản phẩm', key: 'image', sortable: false },
  { title: 'Trạng thái', key: 'status' },
];
const documentHeaders = [
  { title: 'Tiêu đề', key: 'title' },
  { title: 'Sản phẩm', key: 'catalogItem' },
  { title: 'Nguồn', key: 'sourceType' },
  { title: 'Chunks', key: '_count.chunks' },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Lỗi', key: 'errorMessage', sortable: false },
  { title: 'Thao tác', key: 'actions', sortable: false },
];
const batchHeaders = [{title:'File',key:'fileName'},{title:'Tổng dòng',key:'totalRows'},{title:'Mới',key:'importedRows'},{title:'Cập nhật',key:'updatedRows'},{title:'Lỗi',key:'failedRows'},{title:'Trạng thái',key:'status'}];

function selected(value: File[] | File | null) { return Array.isArray(value) ? value[0] : value; }
function money(value: unknown, currency='VND') { return value == null ? '—' : new Intl.NumberFormat('vi-VN',{style:'currency',currency}).format(Number(value)); }
function percent(value: number) { return `${(Number(value)*100).toFixed(1)}%`; }
function statusColor(status: string) { return ['approved','completed','active'].includes(status)?'success':status==='failed'?'error':status==='ready'?'info':'default'; }
function imageUrl(item: any) { return item?.metadata?.imageUrl || item?.metadata?.productImage || item?.metadata?.image || ''; }
function sourceLabel(value: string) { return ({ manual: 'Nhập tay', upload: 'File tải lên', obsidian_markdown: 'Obsidian' } as Record<string, string>)[value] || value || '—'; }
function fail(error: any) { toast.error(error?.response?.data?.error || error?.message || 'Có lỗi xảy ra'); }
const filteredDocuments = computed(() => documents.value.filter((doc:any) => documentFilter.value === 'all' || (documentFilter.value === 'archived' ? doc.status === 'archived' : doc.status !== 'archived')));
const approvedDocuments = computed(() => documents.value.filter((doc:any) => doc.status === 'approved').length);
const totalChunks = computed(() => documents.value.reduce((sum, doc:any) => sum + Number(doc._count?.chunks || 0), 0));
const queueLag = computed(() => Number(metrics.value?.queue?.waiting || 0) + Number(metrics.value?.queue?.delayed || 0));
async function reload() { loading.value=true; try { const [c,d,b,p,m,a,o]=await Promise.all([api.get('/catalog'),api.get('/knowledge/documents'),api.get('/orders/imports'),api.get('/ai/rag/config'),api.get('/ai/rag/metrics'),api.get('/ai/assistant-config'),api.get('/obsidian/status')]); catalog.value=c.data.items; documents.value=d.data; batches.value=b.data; Object.assign(ragConfig.value,p.data); metrics.value=m.data; autoReplyStyle.value=a.data.aiAssistantPromptTemplateRaw || ''; obsidianStatus.value=o.data; } catch(e){fail(e)} finally{loading.value=false} }
async function saveCatalog(){const { imageUrl, ...body }=catalogForm.value;saving.value=true;try{await api.post('/catalog',{...body,metadata:imageUrl.trim()?{imageUrl:imageUrl.trim()}:undefined});catalogDialog.value=false;catalogForm.value={sku:'',name:'',description:'',price:null,imageUrl:''};await reload()}catch(e){fail(e)}finally{saving.value=false}}
async function createDocument(){saving.value=true;try{await api.post('/knowledge/documents',docForm.value);docForm.value={title:'',text:'',catalogItemId:null};await reload()}catch(e){fail(e)}finally{saving.value=false}}
async function uploadDocument(){const file=selected(knowledgeFile.value);if(!file)return;const form=new FormData();form.append('file',file);form.append('title',docForm.value.title||file.name);if(docForm.value.catalogItemId)form.append('catalogItemId',docForm.value.catalogItemId);saving.value=true;try{await api.post('/knowledge/documents/upload',form);knowledgeFile.value=null;await reload()}catch(e){fail(e)}finally{saving.value=false}}
async function approve(id:string){try{await api.post(`/knowledge/documents/${id}/approve`);await reload()}catch(e){fail(e)}}
async function archive(id:string){if(!(await confirm({title:'Xóa tài liệu khỏi kho tri thức?',message:'Lịch sử AI cũ vẫn được giữ.',tone:'danger',confirmText:'Xóa tài liệu'})))return;try{await api.post(`/knowledge/documents/${id}/archive`);await reload()}catch(e){fail(e)}}
async function reindex(id:string){try{await api.post(`/knowledge/documents/${id}/re-index`);await reload()}catch(e){fail(e)}}
async function testSearch(){if(!searchQuery.value.trim())return;searching.value=true;try{searchResults.value=(await api.post('/knowledge/search-test',{query:searchQuery.value})).data.chunks}catch(e){fail(e)}finally{searching.value=false}}
async function syncObsidian(){obsidianSyncing.value=true;try{obsidianSyncResult.value=(await api.post('/obsidian/sync',{dryRun:false})).data;toast.success('Đã sync Obsidian vào kho tri thức');await reload()}catch(e){fail(e)}finally{obsidianSyncing.value=false}}
async function previewOrders(){const file=selected(orderFile.value);if(!file)return;let mapping;try{mapping=JSON.parse(mappingText.value)}catch{return toast.error('Mapping JSON không hợp lệ')}const form=new FormData();form.append('file',file);form.append('mapping',JSON.stringify(mapping));saving.value=true;try{orderPreview.value=(await api.post('/orders/imports/preview',form)).data.batch;await reload()}catch(e){fail(e)}finally{saving.value=false}}
async function commitOrders(){if(!orderPreview.value)return;saving.value=true;try{orderPreview.value=(await api.post(`/orders/imports/${orderPreview.value.id}/commit`)).data;await reload()}catch(e){fail(e)}finally{saving.value=false}}
async function downloadOrderErrors(){if(!orderPreview.value)return;try{const response=await api.get(`/orders/imports/${orderPreview.value.id}/errors?format=csv`,{responseType:'blob'});const url=URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download=`order-errors-${orderPreview.value.id}.csv`;link.click();URL.revokeObjectURL(url)}catch(e){fail(e)}}
async function savePolicy(){saving.value=true;try{await Promise.all([api.patch('/ai/rag/config',ragConfig.value),api.put('/ai/assistant-config',{aiAssistantPromptTemplate:autoReplyStyle.value})]);toast.success('Đã lưu chính sách RAG')}catch(e){fail(e)}finally{saving.value=false}}
onMounted(reload);
</script>

<style scoped>
.rag-page {
  min-height: calc(100vh - var(--mc-topbar-h));
  max-width: none;
}

.rag-shell {
  gap: 14px;
}

.rag-hero {
  margin: 0;
}

.rag-hero__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  justify-self: end;
  width: min(420px, 100%);
}

.rag-hero__actions .at-btn {
  min-height: 52px;
  justify-content: center;
}

.rag-kpis {
  margin: 0;
}

.rag-tab {
  min-width: 0;
}

.rag-knowledge-grid {
  display: grid;
  grid-template-columns: minmax(320px, .9fr) minmax(300px, .75fr) minmax(520px, 1.45fr);
  gap: 14px;
  align-items: start;
}

.rag-orders-grid,
.rag-policy-grid {
  display: grid;
  grid-template-columns: minmax(340px, .8fr) minmax(0, 1.2fr);
  gap: 14px;
  align-items: start;
}

.rag-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.rag-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.rag-table-wrap {
  min-width: 0;
  overflow-x: auto;
}

.rag-table {
  min-width: 900px;
}

.rag-doc-card .rag-table {
  min-width: 980px;
}

.rag-test-card .rag-results {
  max-height: 420px;
  overflow-y: auto;
}

.obsidian-status {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.obsidian-status div {
  padding: 10px;
  border: 1px solid var(--at-hairline);
  border-radius: 8px;
  background: var(--at-surface-soft);
}

.obsidian-status span,
.obsidian-path {
  color: var(--at-hint);
  font-size: 12px;
}

.obsidian-status b {
  display: block;
  margin-top: 3px;
  color: var(--at-ink);
}

.obsidian-path {
  overflow-wrap: anywhere;
}

.resource-count {
  font-weight: 700;
  color: var(--at-ink);
}

.product-thumb {
  width: 64px;
  height: 48px;
  border: 1px solid var(--at-hairline);
  border-radius: 8px;
  background: var(--at-surface-soft);
  object-fit: cover;
}

.hint {
  color: var(--at-hint);
}

.result {
  padding: 12px 0;
  border-bottom: 1px solid var(--at-hairline);
}

.result b {
  color: var(--at-ink);
  font-size: 12.5px;
}

.result p {
  margin: 6px 0 0;
  color: var(--at-body);
  white-space: pre-wrap;
}

.err-text {
  display: inline-block;
  max-width: 220px;
  overflow: hidden;
  color: var(--mc-danger);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
}

.metric-grid div {
  display: flex;
  min-height: 82px;
  flex-direction: column;
  justify-content: center;
  padding: 12px;
  border: 1px solid var(--at-hairline);
  border-radius: 10px;
  background: var(--at-surface-soft);
}

.metric-grid span {
  color: var(--at-hint);
  font-size: 11.5px;
}

.metric-grid b {
  margin-top: 4px;
  color: var(--mc-success);
  font-size: 22px;
}

.rag-policy-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

:deep(.v-data-table) {
  background: transparent;
  color: var(--at-body);
}

:deep(.v-data-table thead th) {
  color: var(--at-hint);
  background: var(--at-surface-soft);
}

:deep(.v-data-table tbody tr:hover) {
  background: var(--at-surface-soft);
}

:deep(.v-field) {
  border-radius: 8px;
}

@media (max-width: 1360px) {
  .rag-knowledge-grid,
  .rag-orders-grid,
  .rag-policy-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .rag-hero,
  .rag-hero__actions,
  .rag-policy-fields {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
