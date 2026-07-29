// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ZaloCRM is free software under the GNU Affero General Public License v3.0 (see LICENSE).
// Commercial (dual) licensing available: locnt@locnguyendata.com
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index';
import { vuetify } from './plugins/vuetify';
import './assets/main.css';
import './assets/rbac-page.css';
import './assets/report-kit.css'; // Module Báo cáo — design system scoped .rpt-scope (2026-06-17)
import './assets/monarch.css';
import './assets/coolicons/coolicons.css';
import { CoolIcon } from './icons/coolicons';

const app = createApp(App);
app.component('CoolIcon', CoolIcon);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.mount('#app');

// TODO: Re-enable PWA when vite-plugin-pwa supports vite 8
// if ('serviceWorker' in navigator) {
//   import('virtual:pwa-register').then(({ registerSW }) => {
//     registerSW({ immediate: true });
//   });
// }
