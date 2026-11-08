/* Cafe 13 admin panel.
   Reads and writes data/menu.json in the GitHub repo through the Contents API, with a fine-grained token
   kept only in this browser. Photos are resized here to WebP and saved under images/menu/.
   GitHub Pages rebuilds the site after each save, so changes show on the site in about a minute. */
(() => {
  'use strict';

  const FILE = 'data/menu.json';
  const KEY = 'c13-admin';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const faNum = n => Number(n).toLocaleString('fa-IR');
  const toEnDigits = s => String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const ICON = {
    up: '<svg viewBox="0 0 20 20"><path d="M10 15V5M5 9.5 10 4.5l5 5"/></svg>',
    down: '<svg viewBox="0 0 20 20"><path d="M10 5v10M5 10.5l5 5 5-5"/></svg>',
    edit: '<svg viewBox="0 0 20 20"><path d="M4 16h3L16 7l-3-3-9 9v3z"/></svg>',
    photo: '<svg viewBox="0 0 20 20"><rect x="3" y="4.5" width="14" height="11" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="M17 13l-4-3.5L5 15.5"/></svg>'
  };

  /* ---------- Sign in ----------
     The panel opens only for the owner's phone number and password. Neither is stored anywhere: PBKDF2
     turns them into 64 bytes. The first half is checked against AUTH.check; the second half is an AES key
     that seals the GitHub token on this device (localStorage), so the token is never kept in plain text.
     To change the password, compute a new salt and check with the same parameters (see README). */
  const AUTH = { salt: '3a7352ef3364fb3c66b7b4985a24b7ec', iter: 600000, check: '6e6761ec1a5cc0c7a71345e0ce2b63cc49d9d2ca95cf6923351b78d84f6a8eba' };
  const REPO = 'plaipa/Cafe13';
  const hexBytes = h => Uint8Array.from(h.match(/../g), b => parseInt(b, 16));
  const bytesHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const b64bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const normPhone = s => {
    let p = toEnDigits(s).replace(/\D/g, '');
    if (p.startsWith('0098')) p = '0' + p.slice(4);
    else if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
    else if (p.length === 10 && p[0] === '9') p = '0' + p;
    return p;
  };

  async function unlock(phone, pass) {
    const raw = new TextEncoder().encode(phone + ':' + pass.normalize('NFC'));
    const base = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexBytes(AUTH.salt), iterations: AUTH.iter }, base, 512));
    const check = bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(0, 32))));
    if (check !== AUTH.check) return null;
    return crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  /* ---------- State ---------- */
  let cfg = {};                 // { token, repo, branch } for this tab only (sessionStorage)
  let store = {};               // kept on this device: { repo, branch, iv, ct } = the token sealed with the key
  let aesKey = null, fails = 0;
  try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  try { cfg = JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) {}
  let mode = 'github';          // or 'local' (preview: saving downloads the file)
  let data = null, sha = null, saved = '';
  let active = 0;               // section index, or 'settings'
  let query = '';
  const openItems = new Set();  // item ids whose edit panel is open
  const openGroups = new Set(); // group ids whose edit panel is open
  const fresh = new Set();      // items added in this session
  const photos = new Map();     // item id -> { b64, url, ext } waiting to upload
  let pickFor = null;           // item id the file picker is for
  let busy = false;

  const el = {
    login: $('#login'), form: $('#loginForm'), loginError: $('#loginError'), loginBtn: $('#loginBtn'), localBtn: $('#localBtn'),
    tform: $('#tokenForm'), tokenError: $('#tokenError'), tokenBtn: $('#tokenBtn'),
    editor: $('#editor'), stabs: $('#stabs'), panel: $('#panel'), search: $('#search'), save: $('#save'), dirty: $('#dirty'),
    loading: $('#loading'), toast: $('#toast'), file: $('#file'), logout: $('#logout'), mode: $('#mode')
  };

  /* ---------- GitHub ---------- */
  const b64enc = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
  const repoOk = r => /^[\w.-]+\/[\w.-]+$/.test(r || '');

  async function gh(path, opts = {}) {
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path ? '/' + path : ''}`, {
      ...opts,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + cfg.token,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error((body && body.message) || res.statusText); err.status = res.status; throw err; }
    return body;
  }

  function ghError(e) {
    if (e.status === 401) return 'توکن معتبر نیست یا منقضی شده است.';
    if (e.status === 403) return 'این توکن اجازهٔ نوشتن در مخزن را ندارد (Contents: Read and write).';
    if (e.status === 404) return 'مخزن یا شاخه پیدا نشد، یا توکن به این مخزن دسترسی ندارد.';
    if (e.status === 409 || e.status === 422) return 'منو در همین فاصله جای دیگری تغییر کرده است. صفحه را دوباره باز کنید و تغییرات را دوباره بزنید.';
    if (!navigator.onLine || e instanceof TypeError) return 'اتصال به گیت‌هاب برقرار نشد. اینترنت را بررسی کنید.';
    return 'خطا: ' + e.message;
  }

  async function loadRemote() {
    const r = await gh(`contents/${FILE}?ref=${encodeURIComponent(cfg.branch)}`);
    sha = r.sha;
    data = JSON.parse(b64dec(r.content));
  }

  async function loadLocal() {
    const r = await fetch('../' + FILE, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.statusText);
    data = await r.json();
  }

  /* ---------- Boot ---------- */
  async function start() {
    if (cfg.token && repoOk(cfg.repo) && cfg.branch) {
      try { await loadRemote(); mode = 'github'; return openEditor(); }
      catch (e) { endSession(); }
    }
    showLogin();
  }

  function endSession() {
    cfg = {}; aesKey = null;
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  function showLogin(msg) {
    el.loading.hidden = true; el.editor.hidden = true; el.login.hidden = false;
    el.logout.hidden = true; el.mode.hidden = true;
    el.form.hidden = false; el.tform.hidden = true;
    el.loginError.hidden = !msg; el.loginError.textContent = msg || '';
  }

  // After the password, when this device has no working token yet.
  function showToken(msg) {
    el.loading.hidden = true; el.editor.hidden = true; el.login.hidden = false;
    el.logout.hidden = true; el.mode.hidden = true;
    el.form.hidden = true; el.tform.hidden = false;
    el.tform.repo.value = store.repo || REPO;
    el.tform.branch.value = store.branch || 'main';
    el.tokenError.hidden = !msg; el.tokenError.textContent = msg || '';
  }

  async function seal(c) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(c.token)));
    store = { repo: c.repo, branch: c.branch, iv: b64enc(iv), ct: b64enc(ct) };
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  async function unseal() {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64bytes(store.iv) }, aesKey, b64bytes(store.ct));
    return new TextDecoder().decode(pt);
  }

  function enter() {
    try { sessionStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
    mode = 'github';
    openEditor();
  }

  el.form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = el.form;
    if (!window.crypto || !crypto.subtle) return showLogin('این مرورگر از ورود امن پشتیبانی نمی‌کند. صفحه را با https باز کنید.');
    el.loginBtn.disabled = true; el.loginBtn.textContent = 'در حال بررسی…';
    let wait = 0;
    try {
      const key = await unlock(normPhone(f.phone.value), f.password.value);
      if (!key) {
        fails++; wait = Math.min(fails, 5) * 1000;
        f.password.value = '';
        return showLogin('شماره تلفن یا رمز عبور درست نیست.');
      }
      fails = 0; aesKey = key; f.password.value = '';
      let token = '';
      if (store.ct) { try { token = await unseal(); } catch (err) {} }
      else if (store.token) token = store.token;   // saved in plain text by an older version of the panel
      if (!token) return showToken();
      cfg = { token, repo: repoOk(store.repo) ? store.repo : REPO, branch: store.branch || 'main' };
      try { await loadRemote(); }
      catch (err) { cfg = {}; return showToken(ghError(err) + ' یک توکن تازه وارد کنید.'); }
      if (!store.ct) await seal(cfg);
      enter();
    } catch (err) {
      showLogin('ورود انجام نشد: ' + err.message);
    } finally {
      setTimeout(() => { el.loginBtn.disabled = false; el.loginBtn.textContent = 'ورود'; }, wait);
    }
  });

  el.tform.addEventListener('submit', async e => {
    e.preventDefault();
    const f = el.tform;
    if (!aesKey) return showLogin();
    const next = { token: f.token.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main' };
    if (!repoOk(next.repo)) return showToken('نام مخزن باید به شکل owner/name باشد.');
    cfg = next;
    el.tokenBtn.disabled = true; el.tokenBtn.textContent = 'در حال بررسی…';
    try {
      const repo = await gh('');
      if (repo.permissions && repo.permissions.push === false) throw Object.assign(new Error('no push'), { status: 403 });
      await loadRemote();
      await seal(cfg);
      f.token.value = '';
      enter();
    } catch (err) {
      cfg = {};
      showToken(ghError(err));
    } finally {
      el.tokenBtn.disabled = false; el.tokenBtn.textContent = 'اتصال و ورود';
    }
  });

  el.localBtn.addEventListener('click', async () => {
    if (!aesKey) return showLogin();
    try { await loadLocal(); mode = 'local'; openEditor(); }
    catch (e) { showToken('فایل منو بارگذاری نشد.'); }
  });

  // Signs out of this tab. The sealed token stays on the device, so next time only the phone and password are asked.
  el.logout.addEventListener('click', () => {
    if (isDirty() && !confirm('تغییرات ذخیره نشده از بین می‌رود. خارج می‌شوید؟')) return;
    endSession();
    data = null; sha = null; saved = ''; photos.clear();
    showLogin();
  });

  function openEditor() {
    normalize();
    saved = JSON.stringify(data);
    el.loading.hidden = true; el.login.hidden = true; el.editor.hidden = false;
    el.logout.hidden = false;
    el.logout.textContent = mode === 'local' ? 'بازگشت' : 'خروج';
    el.mode.hidden = false;
    el.mode.textContent = mode === 'local' ? 'پیش‌نمایش' : cfg.repo;
    el.save.textContent = mode === 'local' ? 'دانلود menu.json' : 'ذخیره و انتشار';
    renderTabs(); renderPanel(); updateDirty();
  }

  // Make sure every object has the fields the editor and the site expect.
  function normalize() {
    data.settings = data.settings || {};
    ['name', 'city', 'address', 'hours', 'priceUnit', 'notice'].forEach(k => { data.settings[k] = { fa: '', en: '', ...(data.settings[k] || {}) }; });
    const st = data.settings.story = data.settings.story || {};
    ['since', 'title', 'text'].forEach(k => { st[k] = { fa: '', en: '', ...(st[k] || {}) }; });
    ['phone', 'instagram', 'mapUrl'].forEach(k => { if (data.settings[k] == null) data.settings[k] = ''; });
    data.sections = data.sections || [];
    data.sections.forEach(s => {
      s.title = { fa: '', en: '', ...(s.title || {}) };
      s.groups = s.groups || [];
      s.groups.forEach(normGroup);
    });
  }
  function normGroup(g) {
    g.title = { fa: '', en: '', ...(g.title || {}) };
    g.note = { fa: '', en: '', ...(g.note || {}) };
    g.items = g.items || [];
    g.items.forEach(normItem);
  }
  function normItem(it) {
    it.name = { fa: '', en: '', ...(it.name || {}) };
    it.desc = { fa: '', en: '', ...(it.desc || {}) };
    if (it.price === undefined || it.price === '') it.price = null;
    if (it.available === undefined) it.available = true;
    if (it.image === undefined) it.image = '';
  }

  /* ---------- Render ---------- */
  const count = s => s.groups.reduce((n, g) => n + g.items.length, 0);

  function renderTabs() {
    el.stabs.innerHTML = data.sections.map((s, i) =>
      `<button class="stab" type="button" data-tab="${i}" aria-current="${active === i}">${esc(s.title.fa || s.id)}<small>${faNum(count(s))}</small></button>`
    ).join('') + `<button class="stab" type="button" data-tab="settings" aria-current="${active === 'settings'}">تنظیمات</button>`;
  }

  function renderPanel() {
    el.search.parentElement.hidden = active === 'settings';
    const local = mode === 'local'
      ? '<p class="notice-local">حالت پیش‌نمایش: تغییرات در گیت‌هاب ذخیره نمی‌شود. دکمهٔ پایین فایل menu.json را دانلود می‌کند. برای ذخیرهٔ مستقیم و عکس‌ها وارد شوید.</p>'
      : '';
    if (active === 'settings') { el.panel.innerHTML = local + settingsHTML(); return; }
    const s = data.sections[active];
    el.panel.innerHTML = local +
      (s.groups.length ? '<div class="legend" aria-hidden="true"><span></span><span>نام</span><span>قیمت</span><span>موجود</span></div>' : '') +
      s.groups.map((g, gi) => groupHTML(s, g, gi)).join('') +
      `<button class="add" type="button" data-act="group-add">+ دستهٔ جدید در «${esc(s.title.fa)}»</button>`;
    applySearch();
  }

  function groupHTML(s, g, gi) {
    const open = openGroups.has(g.id);
    const last = s.groups.length - 1;
    return `
      <section class="grp card" data-g="${gi}">
        <div class="grp__head">
          <h2 class="grp__title">${esc(g.title.fa || 'بدون نام')}<small>${faNum(g.items.length)} آیتم${g.title.en ? ` · <bdi>${esc(g.title.en)}</bdi>` : ''}</small></h2>
          <button class="icon" type="button" data-act="group-up" aria-label="بالا" ${gi === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon" type="button" data-act="group-down" aria-label="پایین" ${gi === last ? 'disabled' : ''}>${ICON.down}</button>
          <button class="icon" type="button" data-act="group-toggle" aria-label="ویرایش دسته" aria-expanded="${open}">${ICON.edit}</button>
        </div>
        ${open ? `
        <div class="grp__edit">
          <div class="field-row">
            <label class="field"><span>نام دسته (فارسی)</span><input data-f="title.fa" value="${esc(g.title.fa)}"></label>
            <label class="field"><span>نام دسته (انگلیسی)</span><input data-f="title.en" dir="ltr" value="${esc(g.title.en)}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>یادداشت زیر دسته (فارسی)</span><input data-f="note.fa" value="${esc(g.note.fa)}"></label>
            <label class="field"><span>یادداشت (انگلیسی)</span><input data-f="note.en" dir="ltr" value="${esc(g.note.en)}"></label>
          </div>
          <div class="acts"><button class="btn btn--danger btn--sm" type="button" data-act="group-del">حذف این دسته</button></div>
        </div>` : ''}
        <ul class="rows">${g.items.length ? g.items.map((it, ii) => itemHTML(s, g, it, ii)).join('') : '<li class="empty">این دسته هنوز آیتمی ندارد.</li>'}</ul>
        <div class="grp__foot"><button class="add" type="button" data-act="item-add">+ آیتم جدید</button></div>
      </section>`;
  }

  function thumbSrc(it) {
    const p = photos.get(it.id);
    if (p) return p.url;
    return it.image ? '../' + it.image.replace(/^\/+/, '') : '';
  }

  function itemHTML(s, g, it, ii) {
    const open = openItems.has(it.id);
    const src = thumbSrc(it);
    const last = g.items.length - 1;
    const price = it.price == null ? '' : String(it.price);
    return `
      <li class="row${it.available === false ? ' is-out' : ''}${fresh.has(it.id) ? ' is-new' : ''}" data-i="${ii}" data-id="${esc(it.id)}">
        <div class="row__main">
          <span class="row__thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ICON.photo}</span>
          <button class="row__name" type="button" data-act="item-toggle" aria-expanded="${open}">
            <b data-label="fa">${esc(it.name.fa || 'آیتم بی‌نام')}</b><small data-label="en">${esc(it.name.en)}</small>
          </button>
          <label class="price" aria-label="قیمت به ${esc(data.settings.priceUnit.fa)}"><input data-f="price" inputmode="numeric" autocomplete="off" placeholder="—" value="${esc(price)}"></label>
          <label class="switch" aria-label="موجود"><input type="checkbox" data-f="available" ${it.available === false ? '' : 'checked'}><span></span></label>
        </div>
        ${open ? `
        <div class="row__edit">
          <div class="field-row">
            <label class="field"><span>نام (فارسی)</span><input data-f="name.fa" value="${esc(it.name.fa)}"></label>
            <label class="field"><span>نام (انگلیسی)</span><input data-f="name.en" dir="ltr" value="${esc(it.name.en)}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>توضیح (فارسی)</span><textarea data-f="desc.fa" rows="2">${esc(it.desc.fa)}</textarea></label>
            <label class="field"><span>توضیح (انگلیسی)</span><textarea data-f="desc.en" dir="ltr" rows="2">${esc(it.desc.en)}</textarea></label>
          </div>
          <div class="photo">
            <span class="photo__img">${src ? `<img src="${esc(src)}" alt="">` : ''}</span>
            <button class="btn btn--ghost btn--sm" type="button" data-act="photo-pick">${src ? 'عوض کردن عکس' : 'افزودن عکس'}</button>
            ${src ? '<button class="btn btn--danger btn--sm" type="button" data-act="photo-del">حذف عکس</button>' : ''}
            ${photos.has(it.id) ? '<span class="tag">با ذخیره آپلود می‌شود</span>' : ''}
          </div>
          <label class="field"><span>انتقال به دستهٔ دیگر</span>
            <select data-act-change="item-move">
              ${data.sections.map((sx, si) => `<optgroup label="${esc(sx.title.fa)}">${sx.groups.map((gx, gj) =>
                `<option value="${si}:${gj}" ${sx === s && gx === g ? 'selected' : ''}>${esc(gx.title.fa)}</option>`).join('')}</optgroup>`).join('')}
            </select>
          </label>
          <div class="acts">
            <button class="btn btn--ghost btn--sm" type="button" data-act="item-up" ${ii === 0 ? 'disabled' : ''}>بالا</button>
            <button class="btn btn--ghost btn--sm" type="button" data-act="item-down" ${ii === last ? 'disabled' : ''}>پایین</button>
            <button class="btn btn--danger btn--sm" type="button" data-act="item-del">حذف آیتم</button>
          </div>
        </div>` : ''}
      </li>`;
  }

  function settingsHTML() {
    const S = data.settings;
    const pair = (k, label) => `
      <div class="field-row">
        <label class="field"><span>${label} (فارسی)</span><input data-f="${k}.fa" value="${esc(S[k].fa)}"></label>
        <label class="field"><span>${label} (انگلیسی)</span><input data-f="${k}.en" dir="ltr" value="${esc(S[k].en)}"></label>
      </div>`;
    return `
      <section class="card settings" data-settings>
        <h2>اطلاعات کافه</h2>
        ${pair('name', 'نام')}
        ${pair('city', 'شهر')}
        ${pair('address', 'آدرس')}
        ${pair('hours', 'ساعت کاری')}
        <div class="field-row">
          <label class="field"><span>تلفن (خالی = نمایش داده نمی‌شود)</span><input data-f="phone" dir="ltr" inputmode="tel" value="${esc(S.phone)}"></label>
          <label class="field"><span>اینستاگرام</span><input data-f="instagram" dir="ltr" value="${esc(S.instagram)}"></label>
        </div>
        <label class="field"><span>لینک مسیریابی (نشان، بلد یا گوگل‌مپ؛ باید با https:// شروع شود. خالی = دکمه نمایش داده نمی‌شود)</span><input data-f="mapUrl" dir="ltr" inputmode="url" spellcheck="false" autocapitalize="off" value="${esc(S.mapUrl)}"></label>
        ${pair('priceUnit', 'واحد قیمت')}
        ${pair('notice', 'اطلاعیه بالای سایت (خالی = بدون اطلاعیه)')}
      </section>
      <section class="card settings" data-settings>
        <h2>دربارهٔ ما (متن افتتاحیه)</h2>
        <p class="muted">اگر «متن» را خالی بگذارید، این بخش در سایت نمایش داده نمی‌شود.</p>
        <div class="field-row">
          <label class="field"><span>برچسب تاریخ (فارسی)</span><input data-f="story.since.fa" value="${esc(S.story.since.fa)}"></label>
          <label class="field"><span>برچسب تاریخ (انگلیسی)</span><input data-f="story.since.en" dir="ltr" value="${esc(S.story.since.en)}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>عنوان (فارسی)</span><input data-f="story.title.fa" value="${esc(S.story.title.fa)}"></label>
          <label class="field"><span>عنوان (انگلیسی)</span><input data-f="story.title.en" dir="ltr" value="${esc(S.story.title.en)}"></label>
        </div>
        <label class="field"><span>متن (فارسی)</span><textarea data-f="story.text.fa" rows="6">${esc(S.story.text.fa)}</textarea></label>
        <label class="field"><span>متن (انگلیسی)</span><textarea data-f="story.text.en" dir="ltr" rows="6">${esc(S.story.text.en)}</textarea></label>
      </section>`;
  }

  /* ---------- Context helpers ---------- */
  function ctx(node) {
    if (node.closest('[data-settings]')) return { obj: data.settings };
    const gNode = node.closest('[data-g]');
    if (!gNode) return {};
    const s = data.sections[active];
    const g = s.groups[+gNode.dataset.g];
    const iNode = node.closest('[data-i]');
    const it = iNode ? g.items[+iNode.dataset.i] : null;
    return { s, g, gi: +gNode.dataset.g, it, ii: iNode ? +iNode.dataset.i : -1, obj: it || g, row: iNode };
  }

  function setPath(obj, path, val) {
    const keys = path.split('.');
    let o = obj;
    while (keys.length > 1) { const k = keys.shift(); if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }
    o[keys[0]] = val;
  }

  /* ---------- Editing ---------- */
  el.stabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    active = b.dataset.tab === 'settings' ? 'settings' : +b.dataset.tab;
    query = ''; el.search.value = '';
    renderTabs(); renderPanel();
    window.scrollTo({ top: 0 });
  });

  el.panel.addEventListener('input', e => {
    const t = e.target, f = t.dataset.f;
    if (!f || f === 'available') return;
    const c = ctx(t);
    if (!c.obj) return;
    if (f === 'price') {
      const digits = toEnDigits(t.value).replace(/[^\d]/g, '');
      c.obj.price = digits ? Number(digits) : null;
    } else if (f === 'instagram') {
      c.obj.instagram = t.value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[/?#].*$/, '');
    } else {
      setPath(c.obj, f, t.value);
    }
    if (c.row && (f === 'name.fa' || f === 'name.en')) {
      const lab = c.row.querySelector(`[data-label="${f.slice(5)}"]`);
      if (lab) lab.textContent = f === 'name.fa' ? (t.value || 'آیتم بی‌نام') : t.value;
    }
    updateDirty();
  });

  // Tidy the price box after typing (Persian digits become a clean number).
  el.panel.addEventListener('focusout', e => {
    const t = e.target;
    if (t.dataset && t.dataset.f === 'price') { const c = ctx(t); if (c.it) t.value = c.it.price == null ? '' : String(c.it.price); }
  });

  el.panel.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f === 'available') {
      const c = ctx(t);
      c.it.available = t.checked;
      c.row.classList.toggle('is-out', !t.checked);
      updateDirty();
      toast(t.checked ? `«${c.it.name.fa}» موجود شد` : `«${c.it.name.fa}» ناموجود شد`);
    } else if (t.dataset.actChange === 'item-move') {
      const c = ctx(t);
      const [si, gj] = t.value.split(':').map(Number);
      const target = data.sections[si] && data.sections[si].groups[gj];
      if (!target || target === c.g) return;
      c.g.items.splice(c.ii, 1);
      target.items.push(c.it);
      openItems.delete(c.it.id);
      updateDirty(); renderTabs(); renderPanel();
      toast(`منتقل شد به «${target.title.fa}»`);
    }
  });

  el.panel.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const c = ctx(b);
    const s = data.sections[active];
    const swap = (arr, i, j) => { [arr[i], arr[j]] = [arr[j], arr[i]]; };

    switch (act) {
      case 'item-toggle':
        openItems.has(c.it.id) ? openItems.delete(c.it.id) : openItems.add(c.it.id);
        return rerenderKeep(b);
      case 'group-toggle':
        openGroups.has(c.g.id) ? openGroups.delete(c.g.id) : openGroups.add(c.g.id);
        return rerenderKeep(b);
      case 'item-up':   swap(c.g.items, c.ii, c.ii - 1); break;
      case 'item-down': swap(c.g.items, c.ii, c.ii + 1); break;
      case 'group-up':  swap(s.groups, c.gi, c.gi - 1); break;
      case 'group-down': swap(s.groups, c.gi, c.gi + 1); break;
      case 'item-del':
        if (!confirm(`«${c.it.name.fa || 'این آیتم'}» حذف شود؟`)) return;
        c.g.items.splice(c.ii, 1); photos.delete(c.it.id); openItems.delete(c.it.id);
        toast('آیتم حذف شد. برای ثبت، ذخیره کنید.');
        break;
      case 'group-del':
        if (!confirm(`دستهٔ «${c.g.title.fa}» با ${faNum(c.g.items.length)} آیتم حذف شود؟`)) return;
        s.groups.splice(c.gi, 1);
        toast('دسته حذف شد. برای ثبت، ذخیره کنید.');
        break;
      case 'item-add': {
        const it = { id: `${c.g.id}-${uid()}`, name: { fa: '', en: '' }, desc: { fa: '', en: '' }, price: null, available: true, image: '' };
        c.g.items.push(it); openItems.add(it.id); fresh.add(it.id);
        updateDirty(); renderTabs(); renderPanel();
        const input = el.panel.querySelector(`[data-id="${CSS.escape(it.id)}"] [data-f="name.fa"]`);
        if (input) { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); input.focus({ preventScroll: true }); }
        return;
      }
      case 'group-add': {
        const name = prompt('نام دستهٔ جدید (فارسی):');
        if (!name || !name.trim()) return;
        const g = { id: `${s.id}-${uid()}`, title: { fa: name.trim(), en: '' }, note: { fa: '', en: '' }, items: [] };
        s.groups.push(g); openGroups.add(g.id);
        updateDirty(); renderTabs(); renderPanel();
        const node = el.panel.querySelector(`[data-g="${s.groups.length - 1}"]`);
        if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      case 'photo-pick':
        if (mode === 'local') return toast('برای افزودن عکس باید با توکن وارد شوید.', true);
        pickFor = c.it.id; el.file.value = ''; el.file.click();
        return;
      case 'photo-del':
        photos.delete(c.it.id); c.it.image = '';
        break;
      default: return;
    }
    updateDirty(); renderTabs(); renderPanel();
  });

  // Re-render but keep the tapped control where it was on screen.
  function rerenderKeep(node) {
    const row = node.closest('[data-id]') || node.closest('[data-g]');
    const key = row && (row.dataset.id ? `[data-id="${CSS.escape(row.dataset.id)}"]` : `[data-g="${row.dataset.g}"]`);
    const y = row ? row.getBoundingClientRect().top : 0;
    renderPanel();
    const again = key && el.panel.querySelector(key);
    if (again) window.scrollBy(0, again.getBoundingClientRect().top - y);
  }

  /* ---------- Search ---------- */
  el.search.addEventListener('input', () => { query = el.search.value.trim().toLowerCase(); applySearch(); });
  function applySearch() {
    if (active === 'settings') return;
    const q = toEnDigits(query);
    el.panel.querySelectorAll('.grp').forEach(gNode => {
      let any = false;
      gNode.querySelectorAll('.row').forEach(r => {
        const hit = !q || r.textContent.toLowerCase().includes(q);
        r.classList.toggle('is-hidden', !hit);
        any = any || hit;
      });
      gNode.hidden = !!q && !any;
    });
  }

  /* ---------- Photos ---------- */
  el.file.addEventListener('change', async () => {
    const file = el.file.files[0];
    const id = pickFor; pickFor = null;
    if (!file || !id) return;
    try {
      toast('در حال آماده‌سازی عکس…');
      const p = await prepPhoto(file);
      const old = photos.get(id); if (old) URL.revokeObjectURL(old.url);
      photos.set(id, p);
      updateDirty(); renderPanel();
      toast('عکس آماده است. با ذخیره آپلود می‌شود.');
    } catch (e) {
      toast('این عکس خوانده نشد. یک عکس JPG یا PNG انتخاب کنید.', true);
    }
  });

  async function prepPhoto(file) {
    const img = await new Promise((res, rej) => {
      const i = new Image(); const u = URL.createObjectURL(file);
      i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
      i.src = u;
    });
    const max = 1000;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, w, h);
    const enc = (type, q) => new Promise(r => cv.toBlob(r, type, q));
    let blob = await enc('image/webp', 0.82), ext = 'webp';
    if (!blob || blob.type !== 'image/webp') { blob = await enc('image/jpeg', 0.84); ext = 'jpg'; }
    if (!blob) throw new Error('encode');
    return { b64: b64enc(new Uint8Array(await blob.arrayBuffer())), url: URL.createObjectURL(blob), ext };
  }

  function findItem(id) {
    for (const s of data.sections) for (const g of s.groups) for (const it of g.items) if (it.id === id) return it;
    return null;
  }

  /* ---------- Save ---------- */
  const isDirty = () => !!data && (JSON.stringify(data) !== saved || photos.size > 0);

  function updateDirty() {
    const d = isDirty();
    el.save.disabled = !d || busy;
    el.dirty.classList.toggle('is-dirty', d);
    el.dirty.textContent = d ? 'تغییرات ذخیره نشده' : 'بدون تغییر';
  }

  el.save.addEventListener('click', save);

  async function save() {
    if (busy || !isDirty()) return;
    const empty = [];
    data.sections.forEach(s => s.groups.forEach(g => g.items.forEach(it => { if (!it.name.fa.trim()) empty.push(it); })));
    if (empty.length && !confirm(`${faNum(empty.length)} آیتم بدون نام فارسی است. همین‌طور ذخیره شود؟`)) return;

    if (mode === 'local') return download();

    busy = true; updateDirty();
    el.save.textContent = 'در حال ذخیره…';
    try {
      for (const [id, p] of photos) {
        const it = findItem(id);
        if (!it) { photos.delete(id); continue; }
        const safe = id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
        const path = `images/menu/${safe}-${uid()}.${p.ext}`;
        await gh(`contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `Menu photo: ${it.name.en || it.name.fa || id}`, content: p.b64, branch: cfg.branch }) });
        it.image = path;
        photos.delete(id);
      }
      const json = JSON.stringify(data, null, 2) + '\n';
      const r = await gh(`contents/${FILE}`, {
        method: 'PUT',
        body: JSON.stringify({ message: 'Update menu from admin panel', content: b64enc(new TextEncoder().encode(json)), sha, branch: cfg.branch })
      });
      sha = r.content.sha;
      saved = JSON.stringify(data);
      fresh.clear();
      renderPanel();
      toast('ذخیره شد. سایت تا حدود یک دقیقه دیگر به‌روز می‌شود.');
    } catch (e) {
      toast(ghError(e), true);
      if (e.status === 401) setTimeout(() => showLogin(ghError(e)), 1500);
    } finally {
      busy = false;
      el.save.textContent = 'ذخیره و انتشار';
      updateDirty();
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'menu.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    saved = JSON.stringify(data); updateDirty();
    toast('فایل menu.json دانلود شد.');
  }

  window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Toast ---------- */
  let tt = 0;
  function toast(msg, bad) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('is-bad', !!bad);
    el.toast.classList.add('is-on');
    clearTimeout(tt);
    tt = setTimeout(() => el.toast.classList.remove('is-on'), bad ? 5000 : 2600);
  }

  start();
})();
