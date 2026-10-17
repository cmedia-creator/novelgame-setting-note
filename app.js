// ノベルゲーム設定資料ノート（静的Webアプリ。外部通信なし。データはブラウザの localStorage に保存）
(function () {
  'use strict';
  const DEF = window.NG_DEF;
  const STORE_KEY = 'ngst:project:v1';
  const UNDO_KEY = 'ngst:undo:v1';
  const APP_ID = 'novelgame-setting-tool';

  const CHAR_FIELDS = [
    { key: 'name', label: '名前（読み）', req: true },
    { key: 'role', label: '役割', type: 'select', options: ['主人公', '主要人物', '脇役', 'その他'] },
    { key: 'profile', label: '年齢・立場・プロフィール', wide: true, area: true },
    { key: 'goal', label: '目的', wide: true, area: true, hint: '性格の形容詞より先に、何を求めているかを書きます。' },
    { key: 'reason', label: '目的を持つ理由', wide: true, area: true },
    { key: 'habit', label: '行動のくせ（判断の仕方）', wide: true, area: true },
    { key: 'clash', label: '主人公とぶつかる点', wide: true, area: true, hint: 'ぶつからない人物は、役割を見直します。' },
    { key: 'memo', label: 'メモ（外見・口調・立ち絵の差分など）', wide: true, area: true },
  ];
  const ROUTE_COLS = [{ key: 'name', label: 'ルート名' }, { key: 'note', label: '範囲・入る条件', area: true }];
  const FLAG_COLS = [{ key: 'name', label: 'フラグ名' }, { key: 'set', label: '立つ場面', area: true }, { key: 'use', label: '参照する場面', area: true }, { key: 'meaning', label: '意味', area: true }];
  const END_COLS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'エンディング名' }, { key: 'route', label: 'ルート', list: 'routeList' }, { key: 'cond', label: '条件', area: true }, { key: 'rel', label: '結末の内容', area: true }];
  const AREA_SCENE = new Set(['summary', 'purpose', 'conflict', 'start', 'end', 'choice', 'cond', 'ending']);
  const WIDE_SCENE = new Set(['summary', 'purpose', 'conflict', 'choice', 'cond', 'ending']);

  // ───────── データ ─────────
  function emptyProject() {
    const proposal = {};
    DEF.PROPOSAL_FIELDS.forEach(f => { proposal[f.key] = ''; });
    return { app: APP_ID, version: 1, proposal, characters: [], routes: [{ name: '共通', note: '' }], flags: [], endings: [], scenes: [] };
  }
  function blank(fields) { const o = {}; fields.forEach(f => { o[f.key] = ''; }); return o; }
  function newScene() { const s = blank(DEF.SCENE_FIELDS); s.status = DEF.STATUS[0]; return s; }
  function normalize(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('JSONの形式が違います');
    if (!d.proposal && !d.scenes && !d.characters) throw new Error('このツールのバックアップではないようです');
    const base = emptyProject();
    const str = v => (v == null ? '' : String(v));
    const list = (arr, fields, extra) => (Array.isArray(arr) ? arr : []).filter(x => x && typeof x === 'object').map(x => {
      const o = {}; fields.forEach(f => { o[f.key] = str(x[f.key]); }); if (extra) extra(o); return o;
    });
    DEF.PROPOSAL_FIELDS.forEach(f => { base.proposal[f.key] = str(d.proposal && d.proposal[f.key]); });
    base.characters = list(d.characters, CHAR_FIELDS, o => { if (!o.role) o.role = 'その他'; });
    base.routes = list(d.routes, ROUTE_COLS);
    base.flags = list(d.flags, FLAG_COLS);
    base.endings = list(d.endings, END_COLS);
    base.scenes = list(d.scenes, DEF.SCENE_FIELDS);
    return base;
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  let state;
  try { const raw = lsGet(STORE_KEY); state = raw ? normalize(JSON.parse(raw)) : null; } catch (e) { state = null; }
  const firstRun = !state;
  if (!state) state = emptyProject();

  let saveTimer = null;
  const saveStateEl = document.getElementById('saveState');
  function scheduleSave() {
    saveStateEl.textContent = '保存待ち…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    const ok = lsSet(STORE_KEY, JSON.stringify(state));
    const t = new Date();
    saveStateEl.textContent = ok ? `ブラウザに保存済み ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}` : '⚠ ブラウザに保存できません（JSONで書き出してください）';
  }
  window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
  function replaceState(next, msg) {
    lsSet(UNDO_KEY, JSON.stringify(state));
    state = next; saveNow(); renderAll();
    toast(msg, { label: '元に戻す', fn: undo });
  }
  function undo() {
    const raw = lsGet(UNDO_KEY);
    if (!raw) return toast('元に戻せるデータがありません');
    try { const prev = normalize(JSON.parse(raw)); lsSet(UNDO_KEY, JSON.stringify(state)); state = prev; saveNow(); renderAll(); toast('元に戻しました'); }
    catch (e) { toast('元に戻せませんでした'); }
  }

  // ───────── 小道具 ─────────
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const $ = (sel, root) => (root || document).querySelector(sel);
  function toast(msg, action) {
    const el = document.getElementById('toast');
    el.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
    if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.fn(); };
    el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), action ? 7000 : 2500);
  }
  function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state); }
  function setPath(path, v) { const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((a, k) => a[k], state); o[last] = v; }
  function inputHTML(path, f) {
    const v = getPath(path) || '';
    const list = f.list ? ` list="${f.list}"` : '';
    if (f.type === 'select') {
      const opts = f.options.slice(); if (v && !opts.includes(v)) opts.push(v);
      return `<select data-bind="${path}">${opts.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    if (f.area) return `<textarea data-bind="${path}" rows="${f.rows || 3}">${esc(v)}</textarea>`;
    return `<input type="text" data-bind="${path}" value="${esc(v)}"${list}${f.mode ? ` inputmode="${f.mode}"` : ''}>`;
  }
  function fieldHTML(path, f, opts = {}) {
    const id = 'f_' + path.replace(/\./g, '_');
    return `<div class="field${f.wide ? ' wide' : ''}">
      <label for="${id}">${esc(f.label)}${f.req ? '<span class="req">必須</span>' : ''}</label>
      ${f.hint && !opts.noHint ? `<p class="hint">${esc(f.hint)}</p>` : ''}
      ${inputHTML(path, f).replace('data-bind=', `id="${id}" data-bind=`)}
      ${f.judge ? `<p class="judge">${esc(f.judge)}</p>` : ''}
    </div>`;
  }
  function delBtn(action, idx) { return `<button type="button" class="btn small danger" data-act="${action}" data-i="${idx}">削除</button>`; }
  function moveBtns(action, idx) {
    return `<button type="button" class="btn small" data-act="${action}" data-i="${idx}" data-d="-1" aria-label="上へ">↑</button>
            <button type="button" class="btn small" data-act="${action}" data-i="${idx}" data-d="1" aria-label="下へ">↓</button>`;
  }
  function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; }

  // ───────── 企画書 ─────────
  function renderProposal() {
    let html = `<h2>企画書</h2><p class="lead">各項目のヒントと確認ポイントを見ながら書きます。主人公・登場人物は「キャラクター」タブに書きます。</p>`;
    let group = '';
    DEF.PROPOSAL_FIELDS.forEach(f => {
      if (f.group !== group) { group = f.group; html += `<h3>${esc(group)}</h3>`; }
      html += fieldHTML('proposal.' + f.key, { ...f, area: f.key !== 'title', rows: f.key === 'oneLine' ? 2 : 4 });
    });
    $('#tab-proposal').innerHTML = html;
  }

  // ───────── キャラクター ─────────
  function charSummary(c) { return [esc(c.name || '（名前未入力）'), esc(c.role || ''), esc(c.goal || c.profile || '')]; }
  function renderCharacters() {
    const open = openSet('#tab-characters');
    let html = `<h2>キャラクター設定</h2><p class="lead">一人ずつ「目的」と「主人公とぶつかる点」を書くと、プロットで役割がぶれにくくなります。</p>
      <div class="bar"><button type="button" class="btn primary" data-act="char-add">＋ キャラクターを追加</button><span class="hint">${state.characters.length}人</span></div>`;
    state.characters.forEach((c, i) => {
      const [n, r, g] = charSummary(c);
      html += `<details class="card" data-i="${i}"${open.has(i) ? ' open' : ''}><summary><span class="sum-title" data-sum="title">${n}</span><span class="tag" data-sum="tag">${r}</span><span class="sum-text" data-sum="text">${g}</span></summary>
        <div class="body"><div class="grid2">${CHAR_FIELDS.map(f => fieldHTML(`characters.${i}.${f.key}`, f)).join('')}</div>
        <div class="card-actions">${moveBtns('char-move', i)}${delBtn('char-del', i)}</div></div></details>`;
    });
    $('#tab-characters').innerHTML = html;
  }

  // ───────── プロット（シーン） ─────────
  const sceneFilter = { route: '', q: '' };
  function sceneMatches(s) {
    if (sceneFilter.route && s.route !== sceneFilter.route) return false;
    if (sceneFilter.q) { const q = sceneFilter.q.toLowerCase(); return Object.values(s).some(v => String(v).toLowerCase().includes(q)); }
    return true;
  }
  function routeNames() {
    const set = new Set(state.routes.map(r => r.name).filter(Boolean));
    state.scenes.forEach(s => s.route && set.add(s.route));
    return [...set];
  }
  function renderScenes() {
    const open = openSet('#tab-scenes');
    const routes = routeNames();
    const shown = state.scenes.map((s, i) => [s, i]).filter(([s]) => sceneMatches(s));
    let html = `<h2>プロット（シーン一覧）</h2><p class="lead">1シーンずつ「開始時の状態」と「終了時の状態」が変わるように書きます。ルート名は「分岐」タブのルート一覧から選べます。</p>
      <div class="bar"><button type="button" class="btn primary" data-act="scene-add">＋ シーンを追加</button>
      <div class="filter"><select id="sceneRoute" aria-label="ルートで絞り込み"><option value="">すべてのルート</option>${routes.map(r => `<option${r === sceneFilter.route ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <input type="text" id="sceneQ" placeholder="検索（ID・人物・本文）" value="${esc(sceneFilter.q)}"></div>
      <span class="hint">${shown.length} / ${state.scenes.length} シーン</span></div>`;
    shown.forEach(([s, i]) => {
      html += `<details class="card" data-i="${i}"${open.has(i) ? ' open' : ''}><summary>${sceneSumHTML(s)}</summary>
        <div class="body"><div class="grid2">${DEF.SCENE_FIELDS.map(f => fieldHTML(`scenes.${i}.${f.key}`, sceneFieldDef(f))).join('')}</div>
        <div class="card-actions">${moveBtns('scene-move', i)}<button type="button" class="btn small" data-act="scene-dup" data-i="${i}">複製</button>${delBtn('scene-del', i)}</div></div></details>`;
    });
    if (!shown.length) html += `<p class="hint">シーンがありません。「＋ シーンを追加」から始めるか、「保存・復元」タブで見本を読み込めます。</p>`;
    $('#tab-scenes').innerHTML = html;
  }
  function sceneFieldDef(f) {
    const d = { ...f, area: AREA_SCENE.has(f.key), wide: WIDE_SCENE.has(f.key) };
    if (f.key === 'route') d.list = 'routeList';
    if (f.key === 'status') { d.type = 'select'; d.options = DEF.STATUS; }
    if (f.key === 'chars_n') d.mode = 'numeric';
    return d;
  }
  function sceneSumHTML(s) {
    return `<span class="sum-title" data-sum="title">${esc(s.id || '（ID未入力）')}</span><span class="tag" data-sum="tag">${esc(s.route || '—')}</span>${s.choice ? '<span class="tag choice">選択肢</span>' : ''}<span class="sum-text" data-sum="text">${esc(s.summary)}</span>`;
  }
  function openSet(sel) { return new Set([...document.querySelectorAll(sel + ' details.card[open]')].map(d => +d.dataset.i)); }

  // ───────── 分岐 ─────────
  const ID_RE = /[A-Za-z]{1,4}\d+[a-z]?/g;
  function analyze(d) {
    const ids = d.scenes.map(s => s.id.trim());
    const idSet = new Set(ids.filter(Boolean));
    const issues = [], info = [];
    const dup = ids.filter((x, i) => x && ids.indexOf(x) !== i);
    [...new Set(dup)].forEach(x => issues.push(`シーンID「${x}」が重複しています。`));
    d.scenes.forEach((s, i) => { if (!s.id.trim()) issues.push(`${i + 1}行目のシーンにIDがありません。`); });
    const referenced = new Set();
    const edges = [];
    d.scenes.forEach(s => {
      const refs = (s.next.match(ID_RE) || []);
      refs.forEach(r => { referenced.add(r); edges.push([s.id, r]); if (!idSet.has(r)) issues.push(`${s.id || '（ID未入力）'} の次シーン「${r}」がシーン一覧にありません。`); });
      if (!s.next.trim()) issues.push(`${s.id || '（ID未入力）'} に次シーンがありません（終わりなら「（終）」と書きます）。`);
      if (s.choice.trim() && refs.length <= 1) info.push(`${s.id}：選択肢はあるが行き先は1つ（フラグだけで後の展開が変わる場面）。`);
    });
    d.scenes.forEach((s, i) => { if (i > 0 && s.id && !referenced.has(s.id.trim())) issues.push(`${s.id} はどのシーンの「次シーン」からも指されていません（到達できない可能性）。`); });
    d.endings.forEach(e => { if (e.id && !idSet.has(e.id.trim())) info.push(`エンディング ${e.id}「${e.name}」に対応するシーンがまだありません。`); });
    const flagUse = d.flags.map(f => {
      const name = f.name.trim(); if (!name) return null;
      const hits = d.scenes.filter(s => [s.cond, s.summary, s.choice, s.next].some(v => v.includes(name))).map(s => s.id);
      if (!hits.length) issues.push(`フラグ「${name}」はどのシーンにも書かれていません。`);
      return { name, hits };
    }).filter(Boolean);
    const isSample = d.scenes.some(s => s.summary.startsWith('（見本では省略）'));
    return { isSample, issues, info, flagUse, choiceScenes: d.scenes.filter(s => s.choice.trim()), edges };
  }
  function tableEditor(listKey, cols, addAct, delAct) {
    const rows = state[listKey];
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr>${cols.map(c => `<td>${inputHTML(`${listKey}.${i}.${c.key}`, { ...c, rows: 2 })}</td>`).join('')}<td>${delBtn(delAct, i)}</td></tr>`).join('')}
      </tbody></table></div><div class="bar"><button type="button" class="btn small" data-act="${addAct}">＋ 行を追加</button></div>`;
  }
  function renderBranches() {
    const a = analyze(state);
    let html = `<h2>選択肢と分岐</h2><p class="lead">ルート・フラグ・エンディングを表で整理します。下の「分岐の確認」は、プロットの「選択肢」「分岐条件」「次シーン」から自動で作られます。</p>
      <h3>ルート一覧</h3>${tableEditor('routes', ROUTE_COLS, 'route-add', 'route-del')}
      <h3>フラグ一覧</h3>${tableEditor('flags', FLAG_COLS, 'flag-add', 'flag-del')}
      <h3>エンディング一覧</h3>${tableEditor('endings', END_COLS, 'end-add', 'end-del')}
      <div id="branchCheck">${branchCheckHTML(a)}</div>`;
    $('#tab-branches').innerHTML = html;
  }
  function branchCheckHTML(a) {
    let html = a.isSample ? '<div class="notice">見本『しまいの写真館（仮）』は、千景ルート（K01）を概要だけ収録しています。E4・E5 の場面がないという警告は、見本の収録範囲によるもので、故障ではありません。自分の企画では、警告が消えるまで場面を足していきます。</div>' : '';
    html += `<h3>選択肢のある場面</h3>`;
    html += a.choiceScenes.length ? `<div class="flow">${a.choiceScenes.map(s => `<div class="node"><b>${esc(s.id)}</b> <span class="tag">${esc(s.route)}</span> ${esc(s.choice)}<br><span class="arrow">→ ${esc(s.next)}</span>${s.cond ? `<span class="hint">　条件・フラグ：${esc(s.cond)}</span>` : ''}</div>`).join('')}</div>` : '<p class="hint">選択肢のある場面はまだありません。</p>';
    html += `<h3>フラグの使われ方</h3>`;
    html += a.flagUse.length ? `<ul>${a.flagUse.map(f => `<li>〈${esc(f.name)}〉：${f.hits.length ? esc(f.hits.join('、')) : '<span class="issue-warn">未使用</span>'}</li>`).join('')}</ul>` : '<p class="hint">フラグはまだありません。</p>';
    html += `<h3>分岐の確認</h3><ul class="issues">`;
    html += a.issues.length ? a.issues.map(x => `<li class="issue-warn">⚠ ${esc(x)}</li>`).join('') : '<li class="issue-ok">✓ 次シーンの指定に問題は見つかりませんでした。</li>';
    html += a.info.map(x => `<li>ℹ ${esc(x)}</li>`).join('') + '</ul>';
    return html;
  }

  // ───────── 集計 ─────────
  function tally(d) {
    const split = v => String(v || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean);
    const count = key => { const m = new Map(); d.scenes.forEach(s => split(s[key]).forEach(n => m.set(n, (m.get(n) || 0) + 1))); return [...m.entries()]; };
    const byRoute = new Map(); let total = 0;
    d.scenes.forEach(s => { const n = parseInt(String(s.chars_n).replace(/[^\d]/g, ''), 10) || 0; total += n; const r = s.route || '（未設定）'; byRoute.set(r, (byRoute.get(r) || 0) + n); });
    return { bg: count('bg'), stand: count('stand'), cg: count('cg'), bgm: count('bgm'), byRoute: [...byRoute.entries()], total };
  }

  // ───────── 資料出力 ─────────
  function buildDoc(d) {
    const title = d.proposal.title || '無題の企画';
    const a = analyze(d), t = tally(d);
    const today = new Date(); const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const H = [], M = [];
    H.push(`<h1>${esc(title)} 設定資料</h1><p class="meta">作成日 ${date}　／　ノベルゲーム設定資料ノートで作成</p>`);
    M.push(`# ${title} 設定資料\n\n作成日 ${date}\n`);
    // 1 企画書
    H.push(`<h2>1. 企画書</h2>`); M.push(`## 1. 企画書\n`);
    let group = '';
    DEF.PROPOSAL_FIELDS.forEach(f => {
      const v = d.proposal[f.key]; if (!v.trim()) return;
      if (f.group !== group) { group = f.group; H.push(`<h3>${esc(group)}</h3>`); M.push(`### ${group}\n`); }
      H.push(`<h4>${esc(f.label)}</h4><p>${nl2br(v)}</p>`); M.push(`#### ${f.label}\n\n${v}\n`);
    });
    // 2 キャラクター
    H.push(`<h2>2. キャラクター</h2>`); M.push(`## 2. キャラクター\n`);
    if (!d.characters.length) { H.push('<p>（未入力）</p>'); M.push('（未入力）\n'); }
    d.characters.forEach(c => {
      H.push(`<div class="char"><h4>${esc(c.name || '（名前未入力）')}　<small>${esc(c.role)}</small></h4><dl>`);
      M.push(`### ${c.name || '（名前未入力）'}（${c.role}）\n`);
      CHAR_FIELDS.slice(2).forEach(f => { if (c[f.key].trim()) { H.push(`<dt>${esc(f.label)}</dt><dd>${nl2br(c[f.key])}</dd>`); M.push(`- **${f.label}**：${c[f.key].replace(/\n/g, '\n  ')}`); } });
      H.push('</dl></div>'); M.push('');
    });
    // 3 ルート・フラグ・エンディング
    H.push(`<h2>3. ルート・フラグ・エンディング</h2>`); M.push(`## 3. ルート・フラグ・エンディング\n`);
    const tbl = (label, rows, cols) => {
      if (!rows.length) return;
      H.push(`<h3>${label}</h3><table><thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${nl2br(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      M.push(`### ${label}\n\n| ${cols.map(c => c.label).join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map(r => `| ${cols.map(c => mdCell(r[c.key])).join(' | ')} |`).join('\n')}\n`);
    };
    tbl('ルート', d.routes, ROUTE_COLS); tbl('フラグ', d.flags, FLAG_COLS); tbl('エンディング', d.endings, END_COLS);
    if (a.choiceScenes.length) {
      H.push(`<h3>選択肢のある場面</h3><ul>${a.choiceScenes.map(s => `<li><b>${esc(s.id)}</b>（${esc(s.route)}）${esc(s.choice)} → ${esc(s.next)}${s.cond ? `／${esc(s.cond)}` : ''}</li>`).join('')}</ul>`);
      M.push(`### 選択肢のある場面\n\n${a.choiceScenes.map(s => `- **${s.id}**（${s.route}）${s.choice} → ${s.next}${s.cond ? `／${s.cond}` : ''}`).join('\n')}\n`);
    }
    // 4 シーン
    H.push(`<h2>4. プロット（${d.scenes.length}シーン）</h2>`); M.push(`## 4. プロット（${d.scenes.length}シーン）\n`);
    d.scenes.forEach(s => {
      H.push(`<div class="scene"><h4>${esc(s.id)}　<small>${esc(s.route)}${s.when ? '／' + esc(s.when) : ''}${s.status ? '／' + esc(s.status) : ''}</small></h4><dl>`);
      M.push(`### ${s.id}（${s.route}${s.when ? '／' + s.when : ''}）\n`);
      DEF.SCENE_FIELDS.forEach(f => {
        if (['id', 'route', 'when', 'status'].includes(f.key) || !String(s[f.key]).trim()) return;
        H.push(`<dt>${esc(f.label)}</dt><dd>${nl2br(s[f.key])}</dd>`); M.push(`- **${f.label}**：${String(s[f.key]).replace(/\n/g, '\n  ')}`);
      });
      H.push('</dl></div>'); M.push('');
    });
    // 5 集計
    H.push(`<h2>5. 規模の集計（プロットから自動）</h2>`); M.push(`## 5. 規模の集計（プロットから自動）\n`);
    H.push(`<p>想定文字数の合計：<b>${t.total.toLocaleString()}字</b>（${t.byRoute.map(([r, n]) => `${esc(r)} ${n.toLocaleString()}字`).join('／')}）</p>`);
    M.push(`想定文字数の合計：${t.total.toLocaleString()}字（${t.byRoute.map(([r, n]) => `${r} ${n.toLocaleString()}字`).join('／')}）\n`);
    [['背景', t.bg], ['立ち絵', t.stand], ['CG', t.cg], ['BGM・SE', t.bgm]].forEach(([label, arr]) => {
      if (!arr.length) return;
      H.push(`<p><b>${label}（${arr.length}種）</b>：${arr.map(([n, c]) => `${esc(n)}×${c}`).join('、')}</p>`);
      M.push(`- **${label}（${arr.length}種）**：${arr.map(([n, c]) => `${n}×${c}`).join('、')}`);
    });
    M.push('');
    if (a.issues.length) {
      H.push(`<h2>6. 未解決の分岐チェック</h2><ul>${a.issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
      M.push(`## 6. 未解決の分岐チェック\n\n${a.issues.map(x => `- ${x}`).join('\n')}\n`);
    }
    return { title, html: H.join('\n'), md: M.join('\n') };
  }
  function mdCell(v) { return String(v || '').replace(/\|/g, '｜').replace(/\n/g, '<br>'); }
  const DOC_CSS = `body{font-family:"BIZ UDPGothic","Hiragino Sans","Yu Gothic","Meiryo",sans-serif;color:#222;line-height:1.75;max-width:860px;margin:24px auto;padding:0 16px;font-size:14px}
h1{font-size:22px;border-bottom:2px solid #2f5d8a;padding-bottom:6px}h2{font-size:18px;margin-top:28px;border-bottom:1px solid #ccc;padding-bottom:3px;break-after:avoid}
h3{font-size:15.5px;margin:18px 0 6px;color:#2f5d8a}h4{font-size:14.5px;margin:12px 0 2px}h4 small{font-weight:normal;color:#666}.meta{color:#666;font-size:12px}
p{margin:2px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px}th,td{border:1px solid #bbb;padding:4px 6px;vertical-align:top;text-align:left}th{background:#eef3f8}
dl{margin:0 0 8px;display:grid;grid-template-columns:9em 1fr;gap:2px 10px}dt{color:#555;font-weight:bold}dd{margin:0}.scene,.char{border-top:1px dashed #ccc;padding-top:4px;break-inside:avoid}
@media(max-width:600px){dl{grid-template-columns:1fr}dt{margin-top:4px}}@media print{body{margin:0;max-width:none}}`;
  function renderOutput() {
    const doc = buildDoc(state);
    $('#tab-output').innerHTML = `<h2>資料出力</h2>
      <p class="lead">入力内容から設定資料をまとめます。空欄の項目は出力に出ません。</p>
      <div class="bar no-print">
        <button type="button" class="btn primary" data-act="print">印刷・PDFで保存</button>
        <button type="button" class="btn" data-act="dl-html">HTMLファイルで保存</button>
        <button type="button" class="btn" data-act="dl-md">テキスト（Markdown）で保存</button>
        <button type="button" class="btn" data-act="copy-md">テキストをコピー</button>
      </div>
      <p class="hint no-print">スマホで印刷・PDFにする場合は、ブラウザの共有メニューから「プリント」を選びます。HTMLファイルは Word や Google ドキュメントで開いて編集できます。</p>
      <style>#docPreview h1{font-size:20px;margin-top:0}#docPreview h2{font-size:17px;border-bottom:1px solid #ccc;margin-top:24px}#docPreview h3{border:none;padding:0;color:#2f5d8a}#docPreview h4{margin:10px 0 2px}#docPreview h4 small{font-weight:normal;color:#666}
      #docPreview table{border-collapse:collapse;width:100%;font-size:13px}#docPreview th,#docPreview td{border:1px solid #bbb;padding:4px 6px;vertical-align:top;text-align:left}#docPreview th{background:#eef3f8}
      #docPreview dl{display:grid;grid-template-columns:9em 1fr;gap:2px 10px;margin:0 0 8px}#docPreview dt{color:#555;font-weight:bold}#docPreview dd{margin:0}#docPreview .scene,#docPreview .char{border-top:1px dashed #ccc;padding-top:4px;break-inside:avoid}#docPreview .meta{color:#666;font-size:12px}
      @media(max-width:600px){#docPreview{padding:12px}#docPreview dl{grid-template-columns:1fr}}</style>
      <article id="docPreview">${doc.html}</article>`;
  }
  function fileStamp() { const t = new Date(); return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`; }
  function safeName(s) { return (s || '無題').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40); }
  function download(name, text, type) {
    const blob = new Blob([type.startsWith('text/') ? '﻿' + text : text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ───────── 保存・復元 ─────────
  function renderData() {
    $('#tab-data').innerHTML = `<h2>保存・復元</h2>
      <div class="notice">入力内容は、このブラウザに自動で保存されます（外部には送信されません）。ブラウザの履歴やサイトデータを消すと失われるため、区切りごとに「JSONで書き出す」でバックアップを取ってください。</div>
      <div class="notice"><b>別の端末・別のブラウザ・新しいURLへ移るとき</b><br>保存データは、ブラウザとURLごとに別々です。パソコンからスマホへ、ダウンロードしたファイルから公開版のURLへ移ると、前の入力は表示されません（消えたわけではなく、前の環境に残っています）。前の環境で「JSONで書き出す」を押し、新しい環境で「JSONから復元」を選んでファイルを読み込んでください。</div>
      <h3>バックアップ</h3>
      <div class="bar"><button type="button" class="btn primary" data-act="export">JSONで書き出す</button>
        <label class="btn" for="importFile">JSONから復元</label><input type="file" id="importFile" accept=".json,application/json" hidden></div>
      <p class="hint">復元すると、いま入力中の内容は置き換わります（直後なら「元に戻す」で戻せます）。</p>
      <h3>見本・新規</h3>
      <div class="bar"><button type="button" class="btn" data-act="load-sample">見本『しまいの写真館（仮）』を読み込む</button>
        <button type="button" class="btn danger" data-act="reset">すべて消して新規作成</button>
        <button type="button" class="btn" data-act="undo">元に戻す</button></div>
      <p class="hint">見本は、共通ルートと汐里ルート（エンディングE1〜E3）までを場面ごとに収録しています。千景ルートは概要1行（K01）だけで、エンディングE4・E5の場面は収録していません。そのため「分岐」タブに E4・E5 の警告が出ますが、故障ではありません。</p>
      <h3>いまの入力量</h3>
      <div><span class="stat">企画書<b>${DEF.PROPOSAL_FIELDS.filter(f => state.proposal[f.key].trim()).length}/${DEF.PROPOSAL_FIELDS.length}</b></span><span class="stat">キャラクター<b>${state.characters.length}</b></span><span class="stat">シーン<b>${state.scenes.length}</b></span><span class="stat">エンディング<b>${state.endings.length}</b></span></div>`;
    $('#importFile').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        try { const d = normalize(JSON.parse(String(r.result).replace(/^﻿/, ''))); replaceState(d, `「${file.name}」から復元しました`); }
        catch (err) { toast('復元できませんでした：' + err.message); }
        e.target.value = '';
      };
      r.onerror = () => toast('ファイルを読み込めませんでした');
      r.readAsText(file);
    });
  }

  // ───────── タブとイベント ─────────
  const renderers = { proposal: renderProposal, characters: renderCharacters, scenes: renderScenes, branches: renderBranches, output: renderOutput, data: renderData };
  let current = 'proposal';
  function updateRouteList() { $('#routeList').innerHTML = routeNames().map(r => `<option value="${esc(r)}">`).join(''); }
  function showTab(name) {
    current = name;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    updateRouteList(); renderers[name]();
    lsSet('ngst:tab', name);
  }
  function renderAll() { updateRouteList(); renderers[current](); }
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { showTab(b.dataset.tab); window.scrollTo(0, 0); } });

  const main = document.getElementById('main');
  main.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'sceneQ') { sceneFilter.q = el.value; const pos = el.selectionStart; renderScenes(); const q = $('#sceneQ'); q.focus(); q.setSelectionRange(pos, pos); return; }
    const path = el.dataset.bind; if (!path) return;
    setPath(path, el.value); scheduleSave();
    const card = el.closest('details.card');
    if (card) {
      const [list, idx] = path.split('.');
      const item = state[list][+idx];
      if (list === 'characters') { const [n, r, g] = charSummary(item); card.querySelector('[data-sum=title]').innerHTML = n; card.querySelector('[data-sum=tag]').innerHTML = r; card.querySelector('[data-sum=text]').innerHTML = g; }
      if (list === 'scenes') card.querySelector('summary').innerHTML = sceneSumHTML(item);
    }
    if (current === 'branches') { const bc = $('#branchCheck'); if (bc) bc.innerHTML = branchCheckHTML(analyze(state)); }
  });
  main.addEventListener('change', e => {
    if (e.target.id === 'sceneRoute') { sceneFilter.route = e.target.value; renderScenes(); return; }
    if (e.target.dataset.bind) { setPath(e.target.dataset.bind, e.target.value); scheduleSave(); if (/^routes\./.test(e.target.dataset.bind) || /\.route$/.test(e.target.dataset.bind)) updateRouteList(); }
  });

  const armed = new WeakMap();
  function confirmTwice(btn) {
    if (armed.get(btn)) return true;
    armed.set(btn, true); const orig = btn.textContent; btn.classList.add('armed'); btn.textContent = 'もう一度押すと実行';
    setTimeout(() => { armed.delete(btn); btn.classList.remove('armed'); btn.textContent = orig; }, 3000);
    return false;
  }
  main.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, i = +b.dataset.i, dir = +b.dataset.d;
    const structural = (list, fn, rerender) => { fn(state[list]); scheduleSave(); rerender(); };
    switch (act) {
      case 'char-add': state.characters.push({ ...blank(CHAR_FIELDS), role: state.characters.length ? '主要人物' : '主人公' }); scheduleSave(); renderCharacters(); openLast('#tab-characters'); break;
      case 'char-del': if (confirmTwice(b)) structural('characters', a => a.splice(i, 1), renderCharacters); break;
      case 'char-move': if (move(state.characters, i, dir)) { scheduleSave(); renderCharacters(); } break;
      case 'scene-add': {
        const s = newScene(); if (sceneFilter.route) s.route = sceneFilter.route;
        state.scenes.push(s); sceneFilter.q = ''; scheduleSave(); renderScenes(); openLast('#tab-scenes'); break;
      }
      case 'scene-dup': { const c = clone(state.scenes[i]); c.id = c.id ? c.id + '_copy' : ''; state.scenes.splice(i + 1, 0, c); scheduleSave(); renderScenes(); break; }
      case 'scene-del': if (confirmTwice(b)) structural('scenes', a => a.splice(i, 1), renderScenes); break;
      case 'scene-move': if (move(state.scenes, i, dir)) { scheduleSave(); renderScenes(); } break;
      case 'route-add': structural('routes', a => a.push(blank(ROUTE_COLS)), renderBranches); break;
      case 'route-del': if (confirmTwice(b)) structural('routes', a => a.splice(i, 1), renderBranches); break;
      case 'flag-add': structural('flags', a => a.push(blank(FLAG_COLS)), renderBranches); break;
      case 'flag-del': if (confirmTwice(b)) structural('flags', a => a.splice(i, 1), renderBranches); break;
      case 'end-add': structural('endings', a => a.push(blank(END_COLS)), renderBranches); break;
      case 'end-del': if (confirmTwice(b)) structural('endings', a => a.splice(i, 1), renderBranches); break;
      case 'print': window.print(); break;
      case 'dl-html': { const d = buildDoc(state); download(`${safeName(d.title)}_設定資料_${fileStamp()}.html`, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.title)} 設定資料</title><style>${DOC_CSS}</style></head><body>${d.html}</body></html>`, 'text/html'); toast('HTMLファイルを保存しました'); break; }
      case 'dl-md': { const d = buildDoc(state); download(`${safeName(d.title)}_設定資料_${fileStamp()}.md`, d.md, 'text/markdown'); toast('テキストファイルを保存しました'); break; }
      case 'copy-md': { const d = buildDoc(state); copyText(d.md); break; }
      case 'export': { saveNow(); download(`${safeName(state.proposal.title)}_バックアップ_${fileStamp()}.json`, JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), 'application/json'); toast('JSONを書き出しました'); break; }
      case 'load-sample': replaceState(normalize(clone(window.NG_SAMPLE)), '見本を読み込みました'); break;
      case 'reset': if (confirmTwice(b)) replaceState(emptyProject(), 'すべて消して新規作成しました'); break;
      case 'undo': undo(); break;
    }
  });
  function openLast(sel) { const cards = document.querySelectorAll(sel + ' details.card'); const last = cards[cards.length - 1]; if (last) { last.open = true; last.scrollIntoView({ block: 'start', behavior: 'smooth' }); const f = last.querySelector('input,textarea'); if (f) f.focus({ preventScroll: true }); } }
  function copyText(text) {
    const done = () => toast('テキストをコピーしました');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした'); } ta.remove(); }
  }

  // 起動
  window.NGST = { get state() { return state; }, buildDoc, analyze, normalize, tally }; // 動作確認用
  const lastTab = lsGet('ngst:tab');
  showTab(firstRun ? 'data' : (renderers[lastTab] ? lastTab : 'proposal'));
  saveStateEl.textContent = firstRun ? '未保存（入力すると自動で保存）' : 'ブラウザに保存済み';
})();
