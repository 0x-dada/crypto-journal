/* Crypto Journal — shared storage & helpers
   VERSION: 2.1
   IndexedDB-backed, with one-time migration from the old localStorage demo. */
(function (global) {
  'use strict';

   const DB_NAME = 'cryptoJournal';
   const DB_VER = 2;
   const STORE = 'trades';
   const NOTES_STORE = 'notes';

    // ---------- GitHub API sync ----------
    const GH_REPO = '0x-dada/crypto-journal';
    const GH_DATA_URL = 'https://api.github.com/repos/' + GH_REPO + '/contents/data.json';
    const GH_NOTES_URL = 'https://api.github.com/repos/' + GH_REPO + '/contents/notes.json';

    function getGhToken() { return localStorage.getItem('gh_token'); }

    async function ghFetch(url) {
      const tok = getGhToken();
      const r = await fetch(url, { headers: { 'Authorization': 'token ' + tok, 'Accept': 'application/vnd.github.v3+json' } });
      if (!r.ok) throw new Error('GH ' + r.status);
      return r.json();
    }

    async function ghPush(url, content) {
      const tok = getGhToken();
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': 'token ' + tok, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({ message: 'sync via crypto-journal', content: b64 })
      });
      if (!r.ok) throw new Error('GH push ' + r.status);
      return r.json();
    }

    async function fetchGitHubData() {
      if (!getGhToken()) return null;
      try { const j = await ghFetch(GH_DATA_URL); const d = JSON.parse(atob(j.content)); if (Array.isArray(d) && d.length > 0) return d; } catch(e) {}
      return null;
    }

    async function pushToGitHub() {
      const local = await idbGetAll();
      await ghPush(GH_DATA_URL, local);
    }

    async function pushNotesToGitHub() {
      const notes = await idbNoteGetAll();
      await ghPush(GH_NOTES_URL, notes);
    }

  function servedByHttp() {
    return /^https?:$/.test(location.protocol);
  }

  async function apiReq(path, method, body) {
    const base = _syncBase && !servedByHttp() ? _syncBase : location.origin;
    const r = await fetch(base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function detectSync() {
    const cfg = localStorage.getItem(SYNC_KEY);
    if (servedByHttp()) {
      // Quick check: only try if explicitly configured
      if (cfg) {
        const b = cfg.replace(/\/+$/, '');
        try {
          const j = await (await fetch(b + '/api/trades', {signal: AbortSignal.timeout(2000)})).json();
          if (Array.isArray(j.trades)) { _syncBase = b; return; }
        } catch (e) { /* server offline */ }
      }
      return;
    }
    if (cfg) {
      const b = cfg.replace(/\/+$/, '');
      try {
        const j = await (await fetch(b + '/api/trades')).json();
        if (Array.isArray(j.trades)) { _syncBase = b; }
      } catch (e) { /* server offline, stay local */ }
    }
  }

  function syncState() {
    return { mode: _syncBase ? 'server' : 'local', base: _syncBase, servedByHttp: servedByHttp() };
  }

  async function syncConnect(base) {
    const b = String(base || '').trim().replace(/\/+$/, '');
    if (!b) throw new Error('地址为空');
    const j = await (await fetch(b + '/api/trades')).json();
    if (!Array.isArray(j.trades)) throw new Error('该地址未提供数据服务');
    localStorage.setItem(SYNC_KEY, b);
    _syncBase = b;
    return j.trades.length;
  }

  async function syncDisconnect() {
    localStorage.removeItem(SYNC_KEY);
    _syncBase = null;
  }

  async function pushLocalToServer() {
    if (!_syncBase) throw new Error('请先连接服务器');
    const local = await idbGetAll();
    let added = 0;
    for (const t of local) {
      const j = await apiReq('/api/trades', 'POST', t);
      added += j.added || 0;
    }
    return { pushed: local.length, added };
  }

  // ---------- IndexedDB ----------
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(storeName, mode, fn) {
    return openDB().then((db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        let result;
        fn(store).onsuccess = (e) => { result = e.target.result; };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
        t.oncomplete = () => resolve(result);
      })
    );
  }

  async function idbPut(trade) {
    const storeKey = await tx(STORE, 'readwrite', (s) => s.put(trade));
    return storeKey;
  }
  async function idbDelete(id) {
    await tx(STORE, 'readwrite', (s) => s.delete(id));
  }
  async function idbClear() {
    await tx(STORE, 'readwrite', (s) => s.clear());
  }
  async function idbGetAll() {
    return new Promise((resolve, reject) => {
      openDB().then((db) => {
        const t = db.transaction(STORE, 'readonly');
        const req = t.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }).catch(reject);
    });
  }
  async function idbCount() {
    return new Promise((resolve, reject) => {
      openDB().then((db) => {
        const t = db.transaction(STORE, 'readonly');
        const req = t.objectStore(STORE).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(reject);
    });
  }

  // ---------- Migration from localStorage demo ----------
  async function migrateLegacy() {
    try {
      const raw = localStorage.getItem('cryptoTrades');
      if (!raw) return 0;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return 0;
      let migrated = 0;
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        if (!item.id) item.id = item.createdAt || ('legacy-' + Date.now() + '-' + (Math.random() * 1e6 | 0));
        await idbPut(item);
        migrated++;
      }
      localStorage.removeItem('cryptoTrades');
      return migrated;
    } catch (e) {
      console.warn('Migrate failed', e);
      return 0;
    }
  }

  // ---------- CRUD ----------
   async function getAllTrades() {
     if (_syncBase) {
       try {
         const j = await apiReq('/api/trades', 'GET');
         const list = Array.isArray(j.trades) ? j.trades : [];
         list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
         return list;
       } catch (e) { /* server offline -> fallthrough to local */ }
     }
     let list = await idbGetAll();
     if (list.length === 0) {
       const ghData = await fetchGitHubData();
       if (ghData && ghData.length > 0) {
         list = ghData;
       } else {
         try {
           const j = await fetch('/data.json').then(r => r.json());
           if (Array.isArray(j)) { list = j; }
         } catch (e) { /* use empty */ }
       }
     }
     list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
     return list;
   }

   async function saveTrade(trade) {
     if (!trade.id) trade.id = (trade.createdAt || new Date().toISOString());
     await idbPut(trade);
     try { await pushToGitHub(); } catch (e) { /* push failed, data safe in IndexedDB */ }
     return trade;
   }

   async function deleteTrade(id) {
     await idbDelete(id);
     try { await pushToGitHub(); } catch (e) { /* push failed */ }
   }

   async function wipeAll() {
     await idbClear();
     try { await pushToGitHub(); } catch (e) { /* push failed */ }
   }

  // ---------- Notes CRUD ----------
  async function idbNotePut(note) {
    await tx(NOTES_STORE, 'readwrite', (s) => s.put(note));
  }
  async function idbNoteDelete(id) {
    await tx(NOTES_STORE, 'readwrite', (s) => s.delete(id));
  }
  async function idbNoteGetAll() {
    return new Promise((resolve, reject) => {
      openDB().then((db) => {
        const t = db.transaction(NOTES_STORE, 'readonly');
        const req = t.objectStore(NOTES_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }).catch(reject);
    });
  }

   async function getAllNotes() {
     if (_syncBase) {
       try {
         const j = await apiReq('/api/notes', 'GET');
         const list = Array.isArray(j.notes) ? j.notes : [];
         list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
         return list;
       } catch (e) { /* fallthrough to local */ }
     }
     const list = await idbNoteGetAll();
     if (list.length === 0) {
       try {
         const gh = await ghFetch(GH_NOTES_URL);
         if (gh && gh.content) {
           const parsed = JSON.parse(atob(gh.content));
           if (Array.isArray(parsed)) return parsed;
         }
       } catch (e) { /* use local */ }
     }
     list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
     return list;
   }

   async function saveNote(note) {
     if (!note.id) note.id = (note.createdAt || new Date().toISOString());
     await idbNotePut(note);
     try { await pushNotesToGitHub(); } catch (e) { /* push failed */ }
     return note;
   }

   async function deleteNote(id) {
     await idbNoteDelete(id);
     try { await pushNotesToGitHub(); } catch (e) { /* push failed */ }
   }

  // ---------- PnL ----------
  function toNum(v) {
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  function tradePnL(t) {
    const entry = toNum(t.entryPrice);
    const exit = toNum(t.exitPrice);
    if (entry == null || exit == null || entry === 0) return null;
    const dir = t.direction === 'short' ? -1 : 1;
    const lev = t.marketType === 'futures' ? (toNum(t.leverage) || 1) : 1;
    const returnPct = (exit / entry - 1) * dir * lev * 100;
    const invested = toNum(t.marginAmount) ||
      (toNum(t.capital) != null && toNum(t.positionSize) != null
        ? toNum(t.capital) * toNum(t.positionSize) / 100
        : null);
    const pnlUsdt = invested != null ? invested * returnPct / 100 : null;
    return { returnPct, pnlUsdt, invested, direction: t.direction };
  }

  // ---------- Labels / formatting ----------
  const TF_MAP = { scalp: 'Scalp', intraday: '日内', swing: '波段', position: '中长线' };
  const RESULT_MAP = { win: '盈利', loss: '亏损', breakeven: '持平', open: '持仓' };
  const EMOJI_MAP = { '1': '😰', '2': '😟', '3': '😐', '4': '🙂', '5': '😌' };

  function fmtNum(v, dp) {
    const n = toNum(v);
    if (n == null) return '—';
    const d = dp == null ? (Math.abs(n) >= 1 ? 2 : 4) : dp;
    return n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }

  function fmtUsdt(v, dp) {
    const n = toNum(v);
    if (n == null) return '—';
    const sign = n > 0 ? '+' : '';
    const d = dp == null ? 2 : dp;
    return sign + n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }) + ' USDT';
  }

  function fmtPct(v) {
    const n = toNum(v);
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function monthKey(dateStr) {
    return String(dateStr || '').slice(0, 7); // YYYY-MM
  }

  function fmtDate(dateStr) {
    return String(dateStr || '').slice(0, 10);
  }

  // ---------- CSV export ----------
  function toCsvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv(trades) {
    const headers = [
      '日期', '时间框架', '市场类型', '交易对', '方向', '杠杆',
      '进场价', '止损价', '目标价', '出场价',
      '本金(USDT)', '仓位比例(%)', '投入/保证金(USDT)',
      '强平价(预估)', '纪律', '情绪', '结果',
      '收益率(%)', '盈亏(USDT)', '进场理由', '复盘笔记', '截图数', '记录时间'
    ];
    const rows = [headers.join(',')];
    for (const t of trades) {
      const pnl = tradePnL(t);
      rows.push([
        t.date, TF_MAP[t.timeframe] || t.timeframe,
        t.marketType === 'futures' ? '合约' : '现货', t.pair,
        t.direction === 'short' ? '做空' : '做多', t.leverage || '',
        t.entryPrice, t.stopLoss, t.takeProfit, t.exitPrice,
        t.capital, t.positionSize, t.marginAmount,
        t.liqPrice || '',
        t.discipline === 'yes' ? '符合纪律' : '违反纪律',
        t.emotion ? EMOJI_MAP[t.emotion] + ' ' + t.emotion : '',
        RESULT_MAP[t.result] || t.result || '',
        pnl ? pnl.returnPct.toFixed(2) : '',
        pnl && pnl.pnlUsdt != null ? pnl.pnlUsdt.toFixed(2) : '',
        (t.reasons || []).join('；'),
        t.notes || '',
        (t.screenshots || []).length,
        t.createdAt
      ].map(toCsvCell).join(','));
    }
    return '\uFEFF' + rows.join('\r\n'); // BOM for Excel
  }

  // ---------- JSON backup / restore ----------
  function buildBackup(trades) {
    return JSON.stringify({ app: 'crypto-journal', version: 1, exportedAt: new Date().toISOString(), trades }, null, 2);
  }

  async function importBackup(jsonText) {
    const data = JSON.parse(jsonText);
    const list = data && Array.isArray(data.trades) ? data.trades : (Array.isArray(data) ? data : null);
    if (!list) throw new Error('不是有效的备份文件');
    const existing = await getAllTrades();
    const have = new Set(existing.map((t) => t.id));
    let added = 0;
    for (const t of list) {
      if (!t || !t.id || have.has(t.id)) continue;
      await saveTrade(t);
      have.add(t.id);
      added++;
    }
    return added;
  }

  // ---------- Download helper (works in browser & Tauri webview) ----------
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- Toast ----------
  let _toastEl = null;
  function toast(msg, kind) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.style.cssText =
        'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);' +
        'background:#101010;color:#fff;padding:12px 20px;border-radius:999px;font-size:14px;' +
        'z-index:400;box-shadow:0 12px 34px rgba(0,0,0,.3);opacity:0;transition:opacity .25s;max-width:80vw;text-align:center;';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.style.background = kind === 'error' ? '#a32f22' : kind === 'ok' ? '#1f3d2f' : '#101010';
    _toastEl.style.opacity = '1';
    clearTimeout(_toastEl._t);
    _toastEl._t = setTimeout(() => { _toastEl.style.opacity = '0'; }, 2600);
  }

   // ---------- Init (pages call this first) ----------
   async function init() {
     // Check for GitHub token, prompt if missing
     if (!getGhToken()) {
       const tok = prompt('输入 GitHub Token 开启双向同步\n\n在 GitHub Settings → Developer settings → Personal tokens 复制一个 repo 权限的 token');
       if (tok) localStorage.setItem('gh_token', tok);
     }
     // Try to load data from GitHub first (bidirectional sync)
     try {
       const ghData = await fetchGitHubData();
       if (ghData && ghData.length > 0) {
         await openDB();
         const existing = await idbGetAll();
         if (existing.length === 0) {
           for (const t of ghData) await idbPut(t);
         }
       } else {
         // Fallback to local data.json
         try {
           const j = await fetch('/data.json').then(r => r.json());
           if (Array.isArray(j) && j.length > 0) {
             await openDB();
             const existing = await idbGetAll();
             if (existing.length === 0) {
               for (const t of j) await idbPut(t);
             }
           } else {
             await openDB();
             await migrateLegacy();
           }
         } catch (e) {
           await openDB();
           await migrateLegacy();
         }
       }
     } catch (e) {
       // GitHub unreachable, try local data.json
       try {
         const j = await fetch('/data.json').then(r => r.json());
         if (Array.isArray(j) && j.length > 0) {
           await openDB();
           const existing = await idbGetAll();
           if (existing.length === 0) {
             for (const t of j) await idbPut(t);
           }
         } else {
           await openDB();
           await migrateLegacy();
         }
       } catch (e2) {
         await openDB();
         await migrateLegacy();
       }
     }
     return true;
   }

  global.CJ = {
    init, getAllTrades, saveTrade, deleteTrade, wipeAll,
    getAllNotes, saveNote, deleteNote,
    tradePnL, buildCsv, buildBackup, importBackup, download,
    fmtNum, fmtUsdt, fmtPct, fmtDate, esc, monthKey, toast,
    toNum, TF_MAP, RESULT_MAP, EMOJI_MAP,
    syncState, syncConnect, syncDisconnect, pushLocalToServer
  };
})(window);