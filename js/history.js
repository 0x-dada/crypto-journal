/* History page logic */
(function () {
  'use strict';
  const CJ = window.CJ;
  const PER_PAGE = 25;

  const state = {
    all: [],
    filter: { q: '', marketType: '', direction: '', result: '', month: '' },
    page: 1
  };

  const $ = (id) => document.getElementById(id);

  async function load() {
    const migrated = await CJ.init();
    if (migrated > 0) CJ.toast(`已从旧版本迁移 ${migrated} 条记录`);
    state.all = await CJ.getAllTrades();
    render();
    renderSync();
  }

  function applyFilters() {
    const f = state.filter;
    const kw = f.q.trim().toLowerCase();
    let list = state.all.filter((t) => {
      if (kw) {
        const hay = [t.pair, (t.reasons || []).join(' '), t.notes || ''].join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (f.marketType && t.marketType !== f.marketType) return false;
      if (f.direction && t.direction !== f.direction) return false;
      if (f.result && t.result !== f.result) return false;
      if (f.month && CJ.monthKey(t.date) !== f.month) return false;
      return true;
    });
    return list;
  }

  function render() {
    const list = applyFilters();
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PER_PAGE;
    const pageItems = list.slice(start, start + PER_PAGE);

    // Month options
    const months = new Set(state.all.map((t) => CJ.monthKey(t.date)).filter(Boolean));
    const monthSel = $('fMonth');
    if (monthSel.options.length === 1) {
      [...months].sort().reverse().forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        monthSel.appendChild(opt);
      });
    }

    renderSummary(list);
    renderTable(pageItems);
    renderPager(pages);
    $('resultCount').textContent = `共 ${total} 笔`;
  }

  function renderSummary(list) {
    const closed = list.filter((t) => t.result !== 'open');
    const wins = closed.filter((t) => t.result === 'win').length;
    let pnl = 0, invested = 0;
    closed.forEach((t) => {
      const p = CJ.tradePnL(t);
      if (p && p.pnlUsdt != null) pnl += p.pnlUsdt;
    });
    list.forEach((t) => {
      const p = CJ.tradePnL(t);
      if (p && p.invested != null) invested += p.invested;
    });
    const winRate = closed.length ? (wins / closed.length * 100) : null;
    $('sumTotal').textContent = list.length;
    $('sumClosed').textContent = closed.length;
    $('sumWinrate').textContent = winRate == null ? '—' : winRate.toFixed(1) + '%';
    const pnlEl = $('sumPnl');
    pnlEl.textContent = CJ.fmtUsdt(pnl);
    pnlEl.className = 'stat-value ' + (pnl > 0 ? 'up' : pnl < 0 ? 'down' : '');
  }

  function badgeFor(t, withDate) {
    const d = t.direction === 'short' ? 'short ▼' : 'long ▲';
    return `${d} · ${t.pair || '—'}`;
  }

  function renderTable(items) {
    const tb = $('tbody');
    const empty = $('histEmpty');
    const table = $('tradeTable');

    if (!items.length) {
      table.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    table.style.display = '';
    empty.style.display = 'none';

    tb.innerHTML = items.map((t) => {
      const isFutures = t.marketType === 'futures';
      const pnl = CJ.tradePnL(t);
      const marketLabel = isFutures ? `合约 ${t.leverage ? t.leverage + 'x' : ''}` : '现货';
      const resultBadge = resultBadgeHtml(t.result);
      const direction = t.direction === 'short'
        ? '<span class="badge" style="background:#f8e7e3;color:var(--red)">做空 ▼</span>'
        : '<span class="badge" style="background:#e5efe9;color:var(--forest)">做多 ▲</span>';

      let retHtml = '<span class="badge badge--muted">—</span>';
      let pnlHtml = '<span class="badge badge--muted">—</span>';
      if (t.result === 'open') {
        retHtml = '<span class="badge badge--dark">持仓</span>';
      } else if (pnl) {
        const cls = pnl.returnPct > 0 ? 'badge--green' : pnl.returnPct < 0 ? 'badge--red' : 'badge--muted';
        retHtml = `<span class="badge ${cls}">${CJ.fmtPct(pnl.returnPct)}</span>`;
        const pcls = pnl.pnlUsdt != null && pnl.pnlUsdt > 0 ? 'up' : pnl.pnlUsdt != null && pnl.pnlUsdt < 0 ? 'down' : '';
        pnlHtml = `<span style="font-weight:600;${pcls ? 'color:var(--' + (pcls === 'up' ? 'green' : 'red') + ')' : ''}">${CJ.fmtUsdt(pnl.pnlUsdt)}</span>`;
      }

      return `<tr data-id="${CJ.esc(t.id)}">
        <td>${CJ.fmtDate(t.date)}</td>
        <td><span class="pair">${CJ.esc(t.pair)}</span></td>
        <td>${direction}</td>
        <td><span class="badge badge--muted">${marketLabel}</span></td>
        <td>${CJ.fmtNum(t.entryPrice)} → ${CJ.fmtNum(t.exitPrice)}</td>
        <td>${retHtml}</td>
        <td>${pnlHtml}</td>
        <td>${resultBadge}</td>
        <td>${(t.reasons || []).length || '0'} 条</td>
      </tr>`;
    }).join('');
  }

  function resultBadgeHtml(r) {
    const map = {
      win: ['badge--green', '盈利'],
      loss: ['badge--red', '亏损'],
      breakeven: ['badge--muted', '持平'],
      open: ['badge--dark', '持仓']
    };
    const [cls, label] = map[r] || ['badge--muted', '—'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function renderPager(pages) {
    const box = $('pager');
    if (pages <= 1) { box.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= pages; i++) {
      const active = i === state.page ? ' style="background:var(--dark);color:#fff"' : '';
      html += `<a class="btn btn--ghost" style="width:auto;padding:7px 13px" data-page="${i}"${active}>${i}</a> `;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-page]').forEach((el) => {
      el.addEventListener('click', () => { state.page = parseInt(el.dataset.page); render(); });
    });
  }

  // ===== Detail modal =====
  function openDetail(id) {
    const t = state.all.find((x) => x.id === id);
    if (!t) return;
    const pnl = CJ.tradePnL(t);
    const back = $('modalBackdrop');
    const shots = (t.screenshots || []).map((s) =>
      `<img src="${s}" alt="screenshot" onclick="window.open(this.src)">`).join('');

    $('modalTitle').textContent = `${t.pair} · ${CJ.fmtDate(t.date)}`;
    $('modalBody').innerHTML = `
      <dl>
        <div><dt>市场类型</dt><dd>${t.marketType === 'futures' ? '合约' : '现货'}</dd></div>
        <div><dt>时间框架</dt><dd>${CJ.TF_MAP[t.timeframe] || '—'}</dd></div>
        <div><dt>方向</dt><dd>${t.direction === 'short' ? '做空 Short' : '做多 Long'}</dd></div>
        <div><dt>杠杆</dt><dd>${t.leverage ? t.leverage + 'x' : '—'}</dd></div>
        <div><dt>进场价</dt><dd>${CJ.fmtNum(t.entryPrice)}</dd></div>
        <div><dt>出场价</dt><dd>${CJ.fmtNum(t.exitPrice) || '—'}</dd></div>
        <div><dt>止损价</dt><dd>${CJ.fmtNum(t.stopLoss)}</dd></div>
        <div><dt>目标价</dt><dd>${CJ.fmtNum(t.takeProfit)}</dd></div>
        <div><dt>本金 / 仓位</dt><dd>${CJ.fmtNum(t.capital)} USDT · ${t.positionSize || '—'}%</dd></div>
        <div><dt>投入 / 保证金</dt><dd>${CJ.fmtUsdt(t.marginAmount)}</dd></div>
        <div><dt>预估强平价</dt><dd>${t.liqPrice || '—'}</dd></div>
        <div><dt>纪律</dt><dd>${t.discipline === 'yes' ? '符合纪律 ✓' : t.discipline === 'no' ? '违反纪律 ✗' : '—'}</dd></div>
        <div><dt>情绪</dt><dd>${t.emotion ? CJ.EMOJI_MAP[t.emotion] + ' ' + t.emotion : '—'}</dd></div>
        <div><dt>结果</dt><dd>${CJ.RESULT_MAP[t.result] || '—'}</dd></div>
        <div><dt>收益率</dt><dd>${pnl ? CJ.fmtPct(pnl.returnPct) : '—'}</dd></div>
        <div><dt>盈亏 (USDT)</dt><dd>${pnl ? CJ.fmtUsdt(pnl.pnlUsdt) : '—'}</dd></div>
      </dl>

      ${(t.reasons || []).length ? `
        <div class="m-section"><h4>进场理由</h4>
          <div class="reason-chips">${t.reasons.map((r) => `<span>${CJ.esc(r)}</span>`).join('')}</div>
        </div>` : ''}
      ${t.notes ? `
        <div class="m-section"><h4>复盘笔记</h4><div class="notes-text">${CJ.esc(t.notes)}</div></div>` : ''}
      ${shots ? `<div class="m-section"><h4>截图 (${(t.screenshots || []).length})</h4><div class="m-shots">${shots}</div></div>` : ''}
    `;

    const delBtn = $('modalDelete');
    delBtn.onclick = async () => {
      if (!confirm(`确定删除 ${t.pair} 这笔交易吗？不可恢复。`)) return;
      await CJ.deleteTrade(t.id);
      CJ.toast('已删除', 'ok');
      back.classList.remove('show');
      await load();
    };

    $('modalClose').onclick = () => back.classList.remove('show');
    back.onclick = (e) => { if (e.target === back) back.classList.remove('show'); };
    back.classList.add('show');
  }

  $('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDetail(tr.dataset.id);
  });

  // ===== Export / backup / restore =====
  $('btnCsv').addEventListener('click', () => {
    const list = applyFilters();
    if (!list.length) { CJ.toast('没有可导出的记录'); return; }
    const csv = CJ.buildCsv(list);
    const name = `crypto-journal_${new Date().toISOString().slice(0, 10)}.csv`;
    CJ.download(name, csv, 'text/csv');
    CJ.toast(`已导出 ${list.length} 条 CSV`, 'ok');
  });

  $('btnBackup').addEventListener('click', async () => {
    const list = await CJ.getAllTrades();
    if (!list.length) { CJ.toast('暂无数据可备份'); return; }
    CJ.download(`crypto-journal-backup_${new Date().toISOString().slice(0, 10)}.json`, CJ.buildBackup(list), 'application/json');
    CJ.toast('备份已下载', 'ok');
  });

  $('btnRestore').addEventListener('click', () => $('fileRestore').click());
  $('fileRestore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const added = await CJ.importBackup(text);
      CJ.toast(added > 0 ? `成功恢复 ${added} 条记录` : '没有新记录（已全部存在）', added > 0 ? 'ok' : '');
      await load();
    } catch (err) {
      CJ.toast('恢复失败：文件格式无效', 'error');
    }
  });

  // ===== Sync =====
  function renderSync() {
    const s = CJ.syncState();
    const el = $('syncStatus');
    if (s.mode === 'server') {
      el.className = 'sync-status ok';
      el.innerHTML = `<b>已连接</b>　数据来自服务器：${CJ.esc(s.base)}${s.servedByHttp ? '（本页面即来自该服务器，自动同步）' : ''}`;
      $('btnSyncConnect').textContent = '重新连接';
      if (!s.servedByHttp) $('syncUrl').value = s.base;
    } else {
      el.className = 'sync-status off';
      const loc = window.location.origin;
      el.innerHTML = `<b>本地模式</b>　数据仅存于本设备。` +
        (s.servedByHttp ? '（当前页面未检测到数据服务）' : ' 手机连同一网络后，用手机浏览器打开 http://(你Mac的局域网IP):8737 即可同步。');
    }
  }

  $('btnSyncConnect').addEventListener('click', async () => {
    const url = $('syncUrl').value.trim();
    if (!url) { CJ.toast('请先输入服务器地址', 'error'); return; }
    try {
      await CJ.syncConnect(url);
      renderSync();
      await load();
      CJ.toast('已连接，数据与服务器同步', 'ok');
    } catch (e) {
      CJ.toast('连接失败：请检查地址，并确认服务器已启动', 'error');
    }
  });

  $('btnSyncUpload').addEventListener('click', async () => {
    try {
      const r = await CJ.pushLocalToServer();
      CJ.toast(`已上传 ${r.pushed} 条（服务器新增 ${r.added} 条）`, 'ok');
      await load();
    } catch (e) {
      CJ.toast(e.message || '上传失败', 'error');
    }
  });

  $('btnSyncDisconnect').addEventListener('click', async () => {
    await CJ.syncDisconnect();
    renderSync();
    await load();
    CJ.toast('已断开，改用本机本地数据', '');
  });

  // ===== Filters =====
  ['q', 'marketType', 'direction', 'result', 'month'].forEach((k) => {
    $(`f${k[0].toUpperCase() + k.slice(1)}`).addEventListener('change', (e) => {
      state.filter[k] = e.target.value;
      state.page = 1;
      render();
    });
  });
  $('fQ').addEventListener('input', (e) => {
    state.filter.q = e.target.value;
    state.page = 1;
    render();
  });
  $('btnReset').addEventListener('click', () => {
    state.filter = { q: '', marketType: '', direction: '', result: '', month: '' };
    ['fQ', 'fMarketType', 'fDirection', 'fResult', 'fMonth'].forEach((id) => $(id).value = '');
    state.page = 1;
    render();
  });

  load(); window.__historyReload = load;
})();