// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Shared composable for picking which Zalo account to operate on.
 * Used by Groups, Friends, and other account-scoped views.
 */
import { ref, onMounted } from 'vue';
import { useZaloAccounts } from './use-zalo-accounts';

export function useSelectedAccount() {
  const { accounts, fetchAccounts, loading } = useZaloAccounts();
  const selectedAccountId = ref(localStorage.getItem('selected-zalo-account') || '');

  function selectAccount(id: string) {
    selectedAccountId.value = id;
    localStorage.setItem('selected-zalo-account', id);
  }

  onMounted(async () => {
    await fetchAccounts();
    // Local storage có thể trỏ tới nick đã bị xoá/không còn quyền truy cập.
    // Khi đó chọn lại nick hợp lệ; nếu chưa từng chọn thì ưu tiên trạng thái live.
    const selectedStillExists = accounts.value.some((a) => a.id === selectedAccountId.value);
    if ((!selectedAccountId.value || !selectedStillExists) && accounts.value.length > 0) {
      const connected = accounts.value.find((a) =>
        String(a.liveStatus ?? a.status).toLowerCase() === 'connected',
      );
      selectAccount((connected ?? accounts.value[0]).id);
    } else if (!accounts.value.length && selectedAccountId.value) {
      selectedAccountId.value = '';
      localStorage.removeItem('selected-zalo-account');
    }
  });

  return { accounts, selectedAccountId, selectAccount, loading };
}
