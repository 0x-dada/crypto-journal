/* Stats page logic — hand-rolled SVG charts, zero dependencies */
(function () {
  'use strict';
  const CJ = window.CJ;
  const $ = (id) => document.getElementById(id);

  const GREEN = '#1f3d2f', RED = '#b33a2b', LINE = '#e4e2db',
        TINT = '#f5f4ef', MUTED = '#7c7c72', INK = '#14140f';

  let trades = [];

  async function load() {
    await CJ.init();
    trades = await CJ.getAllTrades();
    if (!trades.length) {
      document.querySelector('.chart-grid').style.display = 'none';
      $('statsEmpty').style.display = 'block';
      return;
    }
    document.querySelector('.chart-grid').style.display = '';
    $('statsEmpty').style.display = 'none';
    renderResultBar();
    renderMarket();
    renderTimeframe();
    renderDirection();
    renderReasons();
    renderEmotion();
    renderPressure();
    await renderPlaza();
  }

  // ---------- helpers ----------
  function esc(v) { return CJ.esc(v); }

  function svgWrap(inner, vb) {
    return `<svg viewBox="0 0 ${vb[0]} ${vb[1]}" style="width:100%;height:auto;display:block">${inner}</svg>`;
  }

  // ---------- stacked result bar ----------
  function renderResultBar() {
    const counts = { win: 0, loss: 0, breakeven: 0, open: 0 };
    trades.forEach((t) => { if (counts[t.result] != null) counts[t.result]++; });
    const total = trades.length || 1;
    const seg = [
      { key: 'win', label: '盈利', color: GREEN },
      { key: 'loss', label: '亏损', color: RED },
      { key: 'breakeven', label: '持平', color: '#d9a41f' },
      { key: 'open', label: '持仓', color: '#2f6fb2' }
    ];
    const nonzeroTotal = seg.reduce((a, s) => a + counts[s.key], 0) || 1;
    const zeroCount = seg.filter((s) => counts[s.key] === 0).length;

    const W = 760, H = 150, padL = 0, padR = 0;
    const full = W - padL - padR;
    const barY = 52, barH = 20, r = 10, MIN_SLOT = 64;
    const usable = Math.max(full - zeroCount * MIN_SLOT, 0);
    let x = padL;
    let rects = '';
    seg.forEach((s, i) => {
      const n = counts[s.key];
      const w = n === 0 ? MIN_SLOT : usable * (n / nonzeroTotal);
      const rw = Math.max(w - 2, 0);
      const leftR = i === 0;
      const rightR = i === seg.length - 1;
      let shape = '';
      if (leftR && rightR) {
        shape = `<rect x="${x}" y="${barY}" width="${rw}" height="${barH}" rx="${r}" fill="${s.color}"/>`;
      } else if (leftR) {
        shape = `<circle cx="${x + r}" cy="${barY + r}" r="${r}" fill="${s.color}"/>
        <rect x="${x + r}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>`;
      } else if (rightR) {
        shape = `<rect x="${x}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>
        <circle cx="${x + Math.max(rw - r, 0)}" cy="${barY + r}" r="${r}" fill="${s.color}"/>`;
      } else {
        shape = `<rect x="${x}" y="${barY}" width="${rw}" height="${barH}" fill="${s.color}"/>`;
      }
      rects += shape;
      rects += `<text x="${x}" y="38" font-size="25.6" font-weight="700" fill="${s.color}" text-anchor="start">${s.label} ${n}</text>`;
      x += w;
    });
    $('resultChart').innerHTML = svgWrap(rects, [W, H]);
  }

  // ---------- market type stacked bar ----------
  function renderMarket() {
    const counts = { spot: 0, futures: 0 };
    trades.forEach((t) => { if (counts[t.marketType] != null) counts[t.marketType]++; });
    const total = trades.length || 1;
    const seg = [
      { key: 'spot', label: '现货', color: GREEN },
      { key: 'futures', label: '合约', color: RED }
    ].filter((s) => counts[s.key] > 0);

    const W = 760, H = 150, padL = 0, padR = 0;
    const full = W - padL - padR;
    const barY = 52, barH = 20, r = 10;
    let x = padL;
    let rects = '';
    seg.forEach((s) => {
      const w = full * (counts[s.key] / total);
      const rw = Math.max(w - 2, 0);
      if (s.key === 'spot') {
        rects += `<circle cx="${x + r}" cy="${barY + r}" r="${r}" fill="${s.color}"/>
        <rect x="${x + r}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>`;
      } else {
        rects += `<rect x="${x}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>
        <circle cx="${x + Math.max(rw - r, 0)}" cy="${barY + r}" r="${r}" fill="${s.color}"/>`;
      }
      rects += `<text x="${x}" y="38" font-size="25.6" font-weight="700" fill="${s.color}" text-anchor="start">${s.label} ${counts[s.key]}</text>`;
      x += w;
    });
    $('marketChart').innerHTML = svgWrap(rects, [W, H]);
  }

  // ---------- direction ----------
  function renderDirection() {
    const map = [
      { key: 'long', label: '做多', color: GREEN },
      { key: 'short', label: '做空', color: RED }
    ];
    const counts = {};
    map.forEach((m) => { counts[m.key] = 0; });
    trades.forEach((t) => { if (counts[t.direction] != null) counts[t.direction]++; });
    const total = trades.length || 1;
    const seg = map.filter((m) => counts[m.key] > 0);

    const W = 760, H = 150, padL = 0, padR = 0;
    const full = W - padL - padR;
    const barY = 52, barH = 20, r = 10;
    let x = padL;
    let rects = '';
    seg.forEach((s, i) => {
      const w = full * (counts[s.key] / total);
      const rw = Math.max(w - 2, 0);
      const leftR = i === 0;
      const rightR = i === seg.length - 1;
      let shape = '';
      if (leftR && rightR) {
        shape = `<rect x="${x}" y="${barY}" width="${rw}" height="${barH}" rx="${r}" fill="${s.color}"/>`;
      } else if (leftR) {
        shape = `<circle cx="${x + r}" cy="${barY + r}" r="${r}" fill="${s.color}"/>
        <rect x="${x + r}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>`;
      } else if (rightR) {
        shape = `<rect x="${x}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>
        <circle cx="${x + Math.max(rw - r, 0)}" cy="${barY + r}" r="${r}" fill="${s.color}"/>`;
      } else {
        shape = `<rect x="${x}" y="${barY}" width="${rw}" height="${barH}" fill="${s.color}"/>`;
      }
      rects += shape;
      rects += `<text x="${x}" y="38" font-size="25.6" font-weight="700" fill="${s.color}" text-anchor="start">${s.label} ${counts[s.key]}</text>`;
      x += w;
    });
    $('directionChart').innerHTML = svgWrap(rects, [W, H]);
  }

  // ---------- reasons ----------
  function renderReasons() {
    const list = trades
      .filter((t) => t.date)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-15);
    if (!list.length) { $('reasonsChart').innerHTML = '<p style="color:var(--muted);font-size:14px">暂无理由数据</p>'; return; }

    const MAX = 10;
    function count(t) {
      return Math.min((t.reasons || []).filter((r) => String(r).trim()).length, MAX);
    }
    function l(a, b, f) { return Math.round(a + (b - a) * f); }
    function colorFor(n) {
      const f = Math.max(0, Math.min(1, n / MAX));
      const c = [l(0xb3, 0x1f, f), l(0x3a, 0x3d, f), l(0x2b, 0x2f, f)];
      return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    }

    const SLOTS = 15;
    const W = 760, H = 195, padL = 18, padR = 18, padT = 26, padB = 39;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const baseY = padT + plotH;
    const slot = plotW / SLOTS;
    const maxR = 10;
    let bars = `<line x1="${padL}" y1="${(baseY + 4).toFixed(1)}" x2="${W - padR}" y2="${(baseY + 4).toFixed(1)}" stroke="${LINE}" stroke-width="1.5"/>`;
    list.forEach((t, i) => {
      const n = count(t);
      const h = (n / MAX) * plotH;
      const cx = padL + i * slot + slot / 2;
      const r = Math.min(maxR, h / 2);
      const w = 2 * r;
      const topY = baseY - h;
      bars += `<rect x="${(cx - r).toFixed(2)}" y="${(topY + r).toFixed(2)}" width="${w.toFixed(2)}" height="${Math.max(h - r, 0).toFixed(2)}" fill="${colorFor(n)}"/>
        <circle cx="${cx.toFixed(2)}" cy="${(topY + r).toFixed(2)}" r="${r.toFixed(2)}" fill="${colorFor(n)}"/>
        <text x="${cx.toFixed(2)}" y="${(topY - 6).toFixed(2)}" font-size="12" fill="${INK}" text-anchor="middle" font-weight="600">${n}</text>
        <text x="${cx.toFixed(2)}" y="${baseY + 26}" font-size="12.5" fill="${MUTED}" text-anchor="middle">${t.date.slice(5)}</text>`;
    });
    $('reasonsChart').innerHTML = svgWrap(bars, [W, H]);
  }

  // ---------- emotion distribution ----------
  function renderEmotion() {
    const counts = [0, 0, 0, 0, 0];
    trades.forEach((t) => {
      const v = CJ.toNum(t.emotion);
      if (v >= 1 && v <= 5) counts[v - 1]++;
    });
    if (!counts.reduce((a, b) => a + b, 0)) {
      $('emotionChart').innerHTML = '<p style="color:var(--muted);font-size:14px">暂无情绪数据</p>';
      return;
    }
    const W = 760, H = 220, padL = 30, padB = 40, padT = 16;
    const plotW = W - padL - 24, plotH = H - padT - padB;
    const max = Math.max(...counts);
    const step = plotW / 5, bw = 46;
    let bars = '';
    const colors = ['#a32f22', '#c8563a', '#b8860b', '#2d5a45', '#1f3d2f'];
    counts.forEach((c, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const h = max ? c / max * (plotH - 30) : 0;
      const y = padT + plotH - h;
      bars += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(1, h)}" rx="4" fill="${colors[i]}" opacity="0.85"/>
        <text x="${x + bw / 2}" y="${y - 8}" font-size="12" fill="${INK}" text-anchor="middle" font-weight="600">${c}</text>
        <text x="${x + bw / 2}" y="${padT + plotH + 20}" font-size="12.5" fill="${MUTED}" text-anchor="middle">${i + 1} ${i + 1 <= 2 ? '😟' : i + 1 === 3 ? '😐' : i + 1 >= 4 ? '🙂' : ''}</text>`;
    });
    $('emotionChart').innerHTML = svgWrap(bars, [W, H]);
  }

  // ---------- timeframe stacked bar ----------
  function renderTimeframe() {
    const map = [
      { key: 'scalp', label: '超短', color: RED },
      { key: 'swing', label: '波段', color: '#d9a41f' },
      { key: 'intraday', label: '日内', color: '#2f6fb2' },
      { key: 'position', label: '中长', color: GREEN }
    ];
    const counts = {};
    map.forEach((m) => { counts[m.key] = 0; });
    trades.forEach((t) => { if (counts[t.timeframe] != null) counts[t.timeframe]++; });
    const total = trades.length || 1;
    const seg = map.filter((m) => counts[m.key] > 0);

    const W = 760, H = 150, padL = 0, padR = 0;
    const full = W - padL - padR;
    const barY = 52, barH = 20, r = 10;
    let x = padL;
    let rects = '';
    seg.forEach((s, i) => {
      const w = full * (counts[s.key] / total);
      const rw = Math.max(w - 2, 0);
      const leftR = i === 0;
      const rightR = i === seg.length - 1;
      let shape = '';
      if (leftR && rightR) {
        shape = `<rect x="${x}" y="${barY}" width="${rw}" height="${barH}" rx="${r}" fill="${s.color}"/>`;
      } else if (leftR) {
        shape = `<circle cx="${x + r}" cy="${barY + r}" r="${r}" fill="${s.color}"/>
        <rect x="${x + r}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>`;
      } else if (rightR) {
        shape = `<rect x="${x}" y="${barY}" width="${Math.max(rw - r, 0)}" height="${barH}" fill="${s.color}"/>
        <circle cx="${x + Math.max(rw - r, 0)}" cy="${barY + r}" r="${r}" fill="${s.color}"/>`;
      } else {
        shape = `<rect x="${x}" y="${barY}" width="${rw}" height="${barH}" fill="${s.color}"/>`;
      }
      rects += shape;
      rects += `<text x="${x}" y="38" font-size="25.6" font-weight="700" fill="${s.color}" text-anchor="start">${s.label} ${counts[s.key]}</text>`;
      x += w;
    });
    $('timeframeChart').innerHTML = svgWrap(rects, [W, H]);
  }

  // ---------- trading plaza: trade summary cards ----------
  function shortDate(d) {
    const m = String(d || '').match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0].slice(5).replace('-', '/') : String(d || '');
  }
  const marketLabel = (t) => t.marketType === 'spot' ? '现货' : t.marketType === 'futures' ? '合约' : '';
  const dirLabel = (t) => t.direction === 'long' ? '做多' : t.direction === 'short' ? '做空' : '';
  const resultLabel = (t) => t.result === 'win' ? '盈利' : t.result === 'loss' ? '亏损' : t.result === 'breakeven' ? '持平' : t.result === 'open' ? '持仓中' : '—';
  const TF_LABEL = { scalp: '超短', swing: '波段', intraday: '日内', position: '中长' };

  let detailId = null;

  async function renderPlaza() {
    const board = $('plazaBoard');
    if (!board) return;
    const list = trades
      .filter((t) => t.date)
      .slice()
      .sort((a, b) => {
        const da = !!a.result && a.result !== 'open';
        const db = !!b.result && b.result !== 'open';
        if (da !== db) return da ? 1 : -1;
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
    if (!list.length) { board.innerHTML = '<p style="color:var(--muted);font-size:14px">还没有交易记录，先记录几笔吧。</p>'; return; }
    let html = '';
    let prevDone;
    list.forEach((t) => {
      const done = !!t.result && t.result !== 'open';
      const barColor = done ? '#4c8468' : '#8a8a80';
      const mmdd = shortDate(t.date);
      const name = esc(t.pair || '未知品种') + (marketLabel(t) ? ' · ' + marketLabel(t) : '') + (dirLabel(t) ? ' · ' + dirLabel(t) : '');
      const sep = prevDone !== undefined && prevDone !== done ? '<div class="plaza-separator"></div>' : '';
      const cardCls = done ? 'note-card note-card--done' : 'note-card note-card--link';
      const onclick = done ? '' : ` onclick="window.toggleTradeDetail('${esc(t.id)}')"`;
      html += `${sep}<div class="${cardCls}"${onclick}>
        <div class="note-card__top">
          <span class="note-card__date">${esc(mmdd)}</span>
          <span class="note-card__bar" style="background:${barColor}"></span>
          <h4 class="note-card__title">${name}</h4>
          <span class="badge ${done ? 'badge--done' : 'badge--undone'}">${done ? '已完成' : '未完成'}</span>
        </div>
      </div>
      <div class="plaza-detail" id="plazaDetail-${esc(t.id)}" style="display:none">
        <div class="plaza-detail__status" id="plazaStatus-${esc(t.id)}">${done
          ? '<span class="badge badge--done">已完成</span>'
          : ''}</div>
        <div class="detail-actions">
          <button class="detail-btn detail-btn--win" onclick="window.__pickTradeOutcome('win','${esc(t.id)}')">盈利</button>
          <button class="detail-btn detail-btn--be" onclick="window.__pickTradeOutcome('breakeven','${esc(t.id)}')">持平</button>
          <button class="detail-btn detail-btn--loss" onclick="window.__pickTradeOutcome('loss','${esc(t.id)}')">亏损</button>
        </div>
        <div class="plaza-note-editor" id="plazaEditor-${esc(t.id)}" style="display:none">
          <label class="note-field-label" for="plazaNoteTitle-${esc(t.id)}">标题</label>
          <input type="text" id="plazaNoteTitle-${esc(t.id)}" class="note-input" maxlength="60" placeholder="本次复盘的主题是什么？">
          <div class="form__step note-kind">
            <div class="choices">
              <label class="choice"><input type="radio" name="plazaNoteKind-${esc(t.id)}" value="gain" id="plazaNoteKindGain-${esc(t.id)}" checked><div><strong>经验 Gain</strong><em>做对的，继续保持</em></div></label>
              <label class="choice"><input type="radio" name="plazaNoteKind-${esc(t.id)}" value="lesson" id="plazaNoteKindLesson-${esc(t.id)}"><div><strong>教训 Lesson</strong><em>踩过的坑，下次绕开</em></div></label>
            </div>
          </div>
          <label class="note-field-label" for="plazaNoteBody-${esc(t.id)}">正文</label>
          <textarea id="plazaNoteBody-${esc(t.id)}" class="note-textarea" maxlength="1000" placeholder="正文：交易结束后写下经验教训，下次复盘时一目了然……" oninput="window.__plazaCount(this,'${esc(t.id)}')"></textarea>
          <div class="note-editor">
            <span class="note-count" id="plazaNoteCount-${esc(t.id)}">0</span>
            <button type="button" class="btn btn--primary btn--save" onclick="window.__plazaSaveReview('${esc(t.id)}')">保存复盘笔记</button>
          </div>
        </div>
      </div>`;
      prevDone = done;
    });
    board.innerHTML = html;
  }

  function toggleTradeDetail(id) {
    detailId = id;
    document.querySelectorAll('.plaza-detail').forEach((el) => {
      if (el.id !== 'plazaDetail-' + id) { el.style.display = 'none'; el.classList.remove('plaza--open'); }
    });
    const box = $('plazaDetail-' + id);
    if (!box) return;
    const open = box.style.display !== 'none';
    box.style.display = open ? 'none' : '';
    box.classList.toggle('plaza--open', !open);
  }

  window.toggleTradeDetail = toggleTradeDetail;
  window.__getTradeById = (id) => trades.find((x) => x.id === id) || null;
  const pickedResults = {};

  function openReviewEditor(id) {
    detailId = id;
    window.__pendingReviewTrade = id;
    const box = $('plazaEditor-' + id);
    if (!box) return;
    const tInput = $('plazaNoteTitle-' + id);
    if (tInput) tInput.value = '';
    const kind = pickedResults[id] === 'loss' ? 'lesson' : 'gain';
    $('plazaNoteKindLesson-' + id).checked = kind === 'lesson';
    $('plazaNoteKindGain-' + id).checked = kind === 'gain';
    const body = $('plazaNoteBody-' + id);
    if (body) body.value = '';
    const cnt = $('plazaNoteCount-' + id);
    if (cnt) cnt.textContent = '0';
    box.style.display = '';
    box.classList.toggle('plaza--open', true);
    if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  window.__pickTradeOutcome = function (r, id) {
    detailId = id || detailId;
    window.__pendingReviewTrade = detailId;
    pickedResults[detailId] = r;
    const map = { win: 'win', breakeven: 'be', loss: 'loss' };
    document.querySelectorAll('#plazaDetail-' + detailId + ' .detail-btn').forEach((b) => b.classList.remove('is--picked'));
    const picked = document.querySelector('#plazaDetail-' + detailId + ' .detail-btn--' + (map[r] || ''));
    if (picked && picked.classList) picked.classList.add('is--picked');
    openReviewEditor(detailId);
  };

  window.__plazaCount = function (el, id) {
    if (el.value.length > 1000) el.value = el.value.slice(0, 1000);
    const cnt = $('plazaNoteCount-' + id);
    if (cnt) cnt.textContent = el.value.length;
  };

  window.__plazaSaveReview = async function (id) {
    const title = $('plazaNoteTitle-' + id).value.trim();
    const body = $('plazaNoteBody-' + id).value.trim();
    const kind = $('plazaNoteKindLesson-' + id).checked ? 'lesson' : 'gain';
    if (!title) { CJ.toast('请先填写标题', 'error'); return; }
    if (!body) { CJ.toast('请填写正文内容', 'error'); return; }
    await CJ.saveNote({
      id: 'note-' + Date.now(), title, body, kind,
      createdAt: new Date().toISOString(),
      tradeId: id,
      result: pickedResults[id] || undefined
    });
    $('plazaNoteTitle-' + id).value = '';
    $('plazaNoteBody-' + id).value = '';
    const cnt = $('plazaNoteCount-' + id);
    if (cnt) cnt.textContent = '0';
    const box = $('plazaEditor-' + id);
    if (box) { box.style.display = 'none'; box.classList.remove('plaza--open'); }
    if (window.__statsReload) await window.__statsReload();
    if (typeof renderReviewNotes === 'function') renderReviewNotes();
    CJ.toast('复盘笔记已保存', 'ok');
  };

  // ---------- discipline pressure: winrate by discipline ----------
  function renderPressure() {
    const discNote = $('disciplineNote');
    const discWin = trades.filter((t) => t.discipline === 'yes' && t.result === 'win').length;
    const discLoss = trades.filter((t) => t.discipline === 'yes' && t.result === 'loss').length;
    const discClosed = discWin + discLoss;
    const delWin = trades.filter((t) => t.discipline === 'no' && t.result === 'win').length;
    const delLoss = trades.filter((t) => t.discipline === 'no' && t.result === 'loss').length;
    const delClosed = delWin + delLoss;
    const parts = [];
    if (discClosed) parts.push(`符合纪律时胜率 ${(discWin / discClosed * 100).toFixed(0)}% (${discWin}/${discClosed})`);
    if (delClosed) parts.push(`违反纪律时胜率 ${(delWin / delClosed * 100).toFixed(0)}% (${delWin}/${delClosed})`);
    discNote.textContent = parts.join('  ·  ') || '暂无已平仓记录';

    const rows = [
      { key: 'yes', label: '符合纪律' },
      { key: 'no', label: '违反纪律' }
    ];
    let html = '';
    rows.forEach((r) => {
      const subset = trades.filter((t) => t.discipline === r.key && t.result !== 'open');
      const wins = subset.filter((t) => t.result === 'win').length;
      const rate = subset.length ? wins / subset.length * 100 : null;
      html += `<div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px">
          <span>${r.label}</span>
          <span style="font-weight:600">${rate == null ? '—' : rate.toFixed(0) + '%'} <span style="color:var(--muted);font-weight:400">(${subset.length} 笔已平仓)</span></span>
        </div>
        <div style="height:10px;background:${TINT};border-radius:999px;overflow:hidden">
          <div style="width:${rate == null ? 0 : rate}%;height:100%;background:${r.key === 'yes' ? GREEN : RED};border-radius:999px"></div>
        </div>
      </div>`;
    });
    $('pressureChart').innerHTML = html;
  }

  load(); window.__statsReload = load;
})();