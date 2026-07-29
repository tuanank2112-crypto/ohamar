<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <Transition name="panel-slide">
    <div v-if="open" class="panel-backdrop" @click.self="$emit('close')">
      <aside class="panel">
        <header class="panel-head">
          <div class="head-left">
            <div class="head-accent" :style="{ background: accentColor }"></div>
            <div>
              <div class="head-eyebrow">Phòng ban</div>
              <h2 class="head-title">{{ localName || '...' }}</h2>
            </div>
          </div>
          <button class="panel-close" @click="$emit('close')">×</button>
        </header>

        <div class="panel-body">
          <!-- ── Info section ─────────────────────── -->
          <section class="section">
            <h3 class="section-title">Thông tin</h3>
            <label class="field-label">Tên phòng ban</label>
            <input v-model="localName" class="field-input" @blur="saveName" @keyup.enter="saveName" />
            <div v-if="parentName" class="parent-hint">
              <span class="hint-label">Thuộc:</span>
              <strong>{{ parentName }}</strong>
            </div>
          </section>

          <!-- ── Leader / Deputy ──────────────────── -->
          <section class="section">
            <h3 class="section-title">Bổ nhiệm</h3>

            <div class="role-block">
              <div class="role-head">
                <span class="role-tag role-leader"><CoolIcon name="Star" :size="14" /> Trưởng phòng</span>
                <button
                  v-if="localLeaderId"
                  class="btn-unassign"
                  :disabled="busy"
                  @click="unassignRole('leader', localLeaderId)"
                >
                  Bỏ chức vụ
                </button>
              </div>
              <select
                v-model="leaderPicker"
                class="field-input"
                :disabled="busy"
                @change="assignRole('leader', leaderPicker)"
              >
                <option value="">— Chưa bổ nhiệm —</option>
                <option v-for="u in allUsers" :key="u.id" :value="u.id">
                  {{ u.fullName }} ({{ u.email }})
                </option>
              </select>
            </div>

            <div class="role-block">
              <div class="role-head">
                <span class="role-tag role-deputy">🎖️ Phó phòng</span>
                <button
                  v-if="localDeputyId"
                  class="btn-unassign"
                  :disabled="busy"
                  @click="unassignRole('deputy', localDeputyId)"
                >
                  Bỏ chức vụ
                </button>
              </div>
              <select
                v-model="deputyPicker"
                class="field-input"
                :disabled="busy"
                @change="assignRole('deputy', deputyPicker)"
              >
                <option value="">— Chưa bổ nhiệm —</option>
                <option v-for="u in allUsers" :key="u.id" :value="u.id">
                  {{ u.fullName }} ({{ u.email }})
                </option>
              </select>
            </div>
          </section>

          <!-- ── Members list ─────────────────────── -->
          <section class="section">
            <div class="section-title-row">
              <h3 class="section-title">Nhân viên ({{ memberRows.length }})</h3>
              <button class="btn-add-member" :disabled="busy" @click="showAddMember = !showAddMember">
                {{ showAddMember ? '× Hủy thêm' : '+ Thêm nhân viên' }}
              </button>
            </div>

            <div v-if="showAddMember" class="add-member-row">
              <select v-model="newMemberId" class="field-input flex-grow">
                <option value="">— Chọn nhân viên cần thêm —</option>
                <option v-for="u in availableForAdd" :key="u.id" :value="u.id">
                  {{ u.fullName }} ({{ u.email }})
                </option>
              </select>
              <button class="btn-primary-sm" :disabled="!newMemberId || busy" @click="addMember">Thêm</button>
            </div>

            <ul v-if="memberRows.length" class="member-list">
              <li v-for="m in memberRows" :key="m.userId" class="member-row">
                <span class="member-avatar" :style="{ background: avatarColor(m.fullName) }">
                  {{ initials(m.fullName) }}
                </span>
                <div class="member-info">
                  <div class="member-name">{{ m.fullName }}</div>
                  <div class="member-email">{{ m.email }}</div>
                </div>
                <span class="member-role-tag" :class="`role-tag-${m.deptRole}`">
                  {{ roleLabel(m.deptRole) }}
                </span>
                <button v-if="m.deptRole === 'member'" class="btn-remove-member" :disabled="busy" @click="removeMember(m.userId)">×</button>
              </li>
            </ul>
            <div v-else class="empty-members">
              Chưa có nhân viên. Click "+ Thêm nhân viên" để bổ sung.
            </div>
          </section>

          <!-- ── Danger zone ─────────────────────── -->
          <section class="section section-danger">
            <h3 class="section-title danger-title">Vùng nguy hiểm</h3>
            <p class="danger-desc">
              Xóa phòng ban — chỉ được phép khi phòng đã rỗng (không còn nhân viên + không còn phòng con).
            </p>
            <button class="btn-danger" :disabled="busy" @click="confirmArchive"><CoolIcon name="Trash_Empty" :size="14" /> Xóa phòng ban</button>
          </section>
        </div>

        <p v-if="error" class="panel-error">{{ error }}</p>
      </aside>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRbacStore, type DepartmentNode, type RbacUser } from '@/stores/rbac';
import { api } from '@/api/index';
import { useConfirm } from '@/composables/use-confirm';

const { confirm } = useConfirm();

const props = defineProps<{
  open: boolean;
  node: DepartmentNode | null;
  parentName?: string | null;
  allUsers: RbacUser[];
}>();
const emit = defineEmits<{ close: []; archived: [] }>();

const store = useRbacStore();
const busy = ref(false);
const error = ref('');
const showAddMember = ref(false);
const newMemberId = ref('');

const localName = ref('');
const localLeaderId = ref<string | null>(null);
const localDeputyId = ref<string | null>(null);
const leaderPicker = ref('');
const deputyPicker = ref('');

const memberRows = ref<Array<{ userId: string; fullName: string; email: string; deptRole: 'leader' | 'deputy' | 'member' }>>([]);

const accentColor = computed(() => {
  const depth = props.node?.depth ?? 0;
  return ['#181d26', '#aa2d00', '#0a2e0e', '#d9a441', '#1b61c9'][Math.min(depth, 4)];
});

watch(() => [props.open, props.node?.id], async () => {
  if (!props.open || !props.node) return;
  localName.value = props.node.name;
  localLeaderId.value = props.node.leaderUserId;
  localDeputyId.value = props.node.deputyUserId;
  leaderPicker.value = props.node.leaderUserId ?? '';
  deputyPicker.value = props.node.deputyUserId ?? '';
  error.value = '';
  showAddMember.value = false;
  newMemberId.value = '';
  await loadMembers();
}, { immediate: true });

async function loadMembers() {
  if (!props.node) return;
  try {
    const { data } = await api.get('/rbac/users', { params: { departmentId: props.node.id } });
    memberRows.value = (data.users ?? [])
      .filter((u: any) => u.departmentMember?.departmentId === props.node!.id)
      .map((u: any) => ({
        userId: u.id,
        fullName: u.fullName || u.email,
        email: u.email,
        deptRole: u.departmentMember.deptRole,
      }));
  } catch (e) {
    console.warn('Load members failed', e);
    memberRows.value = [];
  }
}

const availableForAdd = computed(() => {
  const inDeptIds = new Set(memberRows.value.map((m) => m.userId));
  return props.allUsers.filter((u) => !inDeptIds.has(u.id) && !u.departmentMember);
});

async function saveName() {
  if (!props.node || !localName.value.trim() || localName.value === props.node.name) return;
  busy.value = true;
  try {
    await store.renameDepartment(props.node.id, localName.value.trim());
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi đổi tên';
    localName.value = props.node.name;
  } finally {
    busy.value = false;
  }
}

async function assignRole(role: 'leader' | 'deputy', userId: string) {
  if (!props.node) return;
  if (!userId) return;
  busy.value = true;
  error.value = '';
  try {
    await store.assignMember(props.node.id, userId, role);
    if (role === 'leader') localLeaderId.value = userId;
    else localDeputyId.value = userId;
    await loadMembers();
  } catch (e: any) {
    error.value = e?.response?.data?.error || `Lỗi gán ${role}`;
  } finally {
    busy.value = false;
  }
}

async function unassignRole(role: 'leader' | 'deputy', userId: string) {
  if (!props.node) return;
  // Chuyển role này sang 'member' (keep user in dept)
  busy.value = true;
  error.value = '';
  try {
    await store.assignMember(props.node.id, userId, 'member');
    if (role === 'leader') { localLeaderId.value = null; leaderPicker.value = ''; }
    else { localDeputyId.value = null; deputyPicker.value = ''; }
    await loadMembers();
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi bỏ chức vụ';
  } finally {
    busy.value = false;
  }
}

async function addMember() {
  if (!props.node || !newMemberId.value) return;
  busy.value = true;
  error.value = '';
  try {
    await store.assignMember(props.node.id, newMemberId.value, 'member');
    newMemberId.value = '';
    showAddMember.value = false;
    await loadMembers();
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi thêm nhân viên';
  } finally {
    busy.value = false;
  }
}

async function removeMember(userId: string) {
  if (!props.node) return;
  if (!(await confirm({ title: 'Xóa nhân viên này khỏi phòng ban?', tone: 'danger', confirmText: 'Xóa' }))) return;
  busy.value = true;
  try {
    await api.delete(`/departments/${props.node.id}/members/${userId}`);
    await loadMembers();
    await store.loadDepartments();
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi xóa nhân viên';
  } finally {
    busy.value = false;
  }
}

async function confirmArchive() {
  if (!props.node) return;
  if (!(await confirm({ title: `Xóa phòng "${props.node.name}"?`, message: 'Phải rỗng (không còn nhân viên + không còn phòng con).', tone: 'danger', confirmText: 'Xóa' }))) return;
  busy.value = true;
  try {
    await store.archiveDepartment(props.node.id);
    emit('archived');
    emit('close');
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Lỗi xóa';
  } finally {
    busy.value = false;
  }
}

function roleLabel(r: string) {
  return r === 'leader' ? '👑 Trưởng' : r === 'deputy' ? '🎖️ Phó' : '👤 Nhân viên';
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ['#aa2d00', '#0a2e0e', '#d9a441', '#1b61c9', '#7a2000', '#1a3866'];
  const h = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[h % colors.length];
}
</script>

<style>
/* Slide panel from right */
.panel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(24, 29, 38, 0.35);
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}
.panel {
  width: 460px;
  max-width: 92vw;
  height: 100vh;
  background: var(--mc-surface);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 30px rgba(24,29,38,0.18);
  font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
  color: var(--mc-ink);
  letter-spacing: -0.005em;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 18px;
  border-bottom: 1px solid var(--mc-line);
  flex-shrink: 0;
}
.head-left {
  display: flex;
  gap: 14px;
  align-items: center;
  min-width: 0;
}
.head-accent {
  width: 6px;
  height: 44px;
  border-radius: 4px;
}
.head-eyebrow {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--mc-muted);
  margin-bottom: 2px;
}
.head-title {
  font-size: 20px;
  font-weight: 500;
  margin: 0;
  color: var(--mc-ink);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.panel-close {
  background: none;
  border: 0;
  font-size: 26px;
  color: var(--mc-muted);
  cursor: pointer;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  line-height: 1;
}
.panel-close:hover { background: var(--mc-surface-alt); color: var(--mc-ink); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.section {
  margin-bottom: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid #f0f1f3;
}
.section:last-child { border-bottom: 0; }
.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--mc-text);
  margin: 0 0 12px;
}
.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-title-row .section-title { margin: 0; }

.field-label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--mc-text);
  margin-bottom: 6px;
}
.field-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--mc-line);
  border-radius: 6px;
  font-size: 13px;
  color: var(--mc-ink);
  background: var(--mc-surface);
  font-family: inherit;
}
.field-input:focus {
  outline: none;
  border-color: var(--mc-ink);
  box-shadow: 0 0 0 3px rgba(24,29,38,0.08);
}
.field-input:disabled { background: var(--mc-surface-alt); opacity: 0.7; }

.parent-hint {
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(251,191,36,.14);
  border-radius: 6px;
  border-left: 3px solid #d9a441;
  font-size: 12px;
  color: var(--mc-text);
}
.hint-label { font-weight: 500; margin-right: 6px; }

/* Role block */
.role-block { margin-bottom: 16px; }
.role-block:last-child { margin-bottom: 0; }
.role-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.role-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 9999px;
}
.role-leader { background: rgba(251,191,36,.14); color: var(--mc-warning); }
.role-deputy { background: rgba(52,211,153,.14); color: var(--mc-success); }
.btn-unassign {
  background: none;
  border: 0;
  font-size: 11px;
  color: var(--mc-danger);
  cursor: pointer;
  font-weight: 500;
}
.btn-unassign:hover { text-decoration: underline; }
.btn-unassign:disabled { opacity: 0.4; cursor: not-allowed; }

/* Members */
.btn-add-member {
  background: var(--mc-surface);
  border: 1px dashed #9297a0;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  color: var(--mc-text);
}
.btn-add-member:hover { background: var(--mc-surface-alt); border-color: var(--mc-ink); color: var(--mc-ink); }
.btn-add-member:disabled { opacity: 0.4; cursor: not-allowed; }

.add-member-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background: var(--mc-surface-alt);
  border-radius: 8px;
  border: 1px solid var(--mc-line);
}
.flex-grow { flex: 1; }
.btn-primary-sm {
  background: #181d26;
  color: white;
  border: 0;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.btn-primary-sm:hover { background: #0d1218; }
.btn-primary-sm:disabled { opacity: 0.4; cursor: not-allowed; }

.member-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid var(--mc-line);
  border-radius: 8px;
  overflow: hidden;
}
.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--mc-surface);
  border-bottom: 1px solid #f0f1f3;
}
.member-row:last-child { border-bottom: 0; }
.member-row:hover { background: var(--mc-surface-alt); }
.member-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.member-info { flex: 1; min-width: 0; }
.member-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--mc-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.member-email {
  font-size: 11px;
  color: var(--mc-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.member-role-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 9999px;
  background: var(--mc-surface-alt);
  color: var(--mc-text);
  flex-shrink: 0;
}
.role-tag-leader { background: rgba(251,191,36,.14); color: var(--mc-warning); }
.role-tag-deputy { background: rgba(52,211,153,.14); color: var(--mc-success); }
.role-tag-member { background: var(--mc-surface-alt); color: var(--mc-text); }
.btn-remove-member {
  background: var(--mc-surface);
  border: 1px solid var(--mc-line);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--mc-danger);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}
.btn-remove-member:hover { background: rgba(248,113,113,.14); border-color: var(--mc-danger); }
.empty-members {
  padding: 24px 16px;
  text-align: center;
  color: var(--mc-muted);
  font-size: 12px;
  border: 1px dashed var(--mc-line);
  border-radius: 8px;
  background: var(--mc-surface-alt);
}

/* Danger */
.section-danger {
  background: rgba(248,113,113,.14);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid rgba(170,45,0,0.2);
  margin-top: 8px;
}
.section-danger .section-title { color: var(--mc-danger); }
.danger-title { margin: 0 0 8px; }
.danger-desc {
  font-size: 12px;
  color: var(--mc-text);
  margin: 0 0 12px;
  line-height: 1.45;
}
.btn-danger {
  background: var(--mc-surface);
  border: 1px solid #aa2d00;
  color: var(--mc-danger);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.btn-danger:hover { background: #aa2d00; color: white; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.panel-error {
  margin: 12px 24px;
  padding: 10px 12px;
  background: rgba(248,113,113,.14);
  color: var(--mc-danger);
  border-radius: 6px;
  font-size: 12px;
}

/* Transitions */
.panel-slide-enter-active, .panel-slide-leave-active { transition: opacity 0.2s; }
.panel-slide-enter-from, .panel-slide-leave-to { opacity: 0; }
.panel-slide-enter-active .panel,
.panel-slide-leave-active .panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.panel-slide-enter-from .panel { transform: translateX(100%); }
.panel-slide-leave-to .panel { transform: translateX(100%); }
</style>
