/* Cafe 13 — renders the menu from data/menu.json, then runs the motion layer (GSAP + ScrollTrigger + Lenis). */
(() => {
  'use strict';

  /* ---------- Language ---------- */
  const qs = new URLSearchParams(location.search);
  let lang = qs.get('lang');
  try { if (lang) localStorage.setItem('c13-lang', lang); else lang = localStorage.getItem('c13-lang'); } catch (e) {}
  if (lang !== 'en') lang = 'fa';
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'fa' ? 'rtl' : 'ltr';
  const RTL = lang === 'fa';
  const PAGE = root.dataset.page || 'home';      // 'home' (cafe info) or 'menu'
  const BASE = root.dataset.base || '';          // path back to the site root
  const IS_MENU = PAGE === 'menu';

  const T = {
    fa: { mapLabel: 'نقشهٔ محل کافه 13', directions: 'مسیریابی', lead: 'قهوه، برگر و صبحانه', visitTitle: 'سر بزنید', addressLabel: 'آدرس', hoursLabel: 'ساعت کاری',
          phoneLabel: 'تلفن', callCta: 'سفارش تلفنی', igCta: 'اینستاگرام ما', priceNote: 'قیمت‌ها به هزار تومان', items: 'آیتم', out: 'تمام شد',
          error: 'منو بارگذاری نشد. صفحه را دوباره باز کنید.', title: 'کافه 13 تبریز | قهوه، برگر و صبحانه',
          menuDocTitle: 'منوی کافه 13 تبریز | قهوه، برگر و صبحانه', navMenu: 'منو', navHome: 'درباره کافه', menuTitle: 'منو', footLink: 'آدرس و نقشه',
          storyNow: 'تا امروز', statYears: 'سال پشت پیشخوان', statItems: 'آیتم در منو', storyCta: 'منو را ببینید' },
    en: { mapLabel: 'Map showing where Cafe 13 is', directions: 'Get directions', lead: 'Coffee, burgers and breakfast', visitTitle: 'Visit us', addressLabel: 'Address', hoursLabel: 'Hours',
          phoneLabel: 'Phone', callCta: 'Order by phone', igCta: 'Follow us', priceNote: 'Prices in thousand toman', items: 'items', out: 'Sold out',
          error: 'The menu did not load. Please reload the page.', title: 'Cafe 13 Tabriz | Coffee, burgers and breakfast',
          menuDocTitle: 'Menu | Cafe 13 Tabriz', navMenu: 'Menu', navHome: 'About', menuTitle: 'Menu', footLink: 'Address & map',
          storyNow: 'to today', statYears: 'years behind the counter', statItems: 'items on the menu', storyCta: 'See the menu' }
  }[lang];
  const WORD = { cafe: 'Coffee', burger: 'Burger', breakfast: 'Breakfast' };

  document.title = IS_MENU ? T.menuDocTitle : T.title;
  const sw = document.querySelector('[data-lang-switch]');
  sw.textContent = RTL ? 'EN' : 'فا';
  sw.href = '?lang=' + (RTL ? 'en' : 'fa');

  /* ---------- No zoom (the site is used on phones like an app) ---------- */
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  /* ---------- Helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // All numbers use English digits, also in text typed into the admin panel with Persian digits
  const latin = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٪/g, '%');
  const tx = o => latin((o && (o[lang] || o.fa || o.en)) || '');
  const num = n => Number(n).toLocaleString('en-US');
  const fmtPrice = n => Number(n).toLocaleString('en-US');   // prices always use Latin digits
  const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  const animate = hasGsap && !reduce;

  let firstVisit = true;
  try { firstVisit = !sessionStorage.getItem('c13-seen'); sessionStorage.setItem('c13-seen', '1'); } catch (e) {}
  if (!animate) { root.classList.remove('is-loading'); root.classList.add('no-motion'); }

  /* ---------- Story year: an odometer that rolls from the opening year to this year ---------- */
  const DIGITS = '0123456789';
  const calYear = d => {     // solar year in Persian, Gregorian in English
    if (!RTL) return d.getFullYear();
    try { return parseInt(new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric' }).format(d), 10); }
    catch (e) { return d.getFullYear() - 621; }
  };
  // Every column from the first changed digit onward spins one full turn and lands on its new digit.
  // Without motion the strips rest on the final digit through a CSS variable.
  let odo = null;
  function buildOdo(el, from, to) {
    const a = String(from), b = String(to);
    if (!el || !(to > from) || a.length !== b.length) return;
    const first = [...a].findIndex((d, i) => d !== b[i]);
    const steps = [];
    let html = '';
    for (let i = 0; i < b.length; i++) {
      const d0 = +a[i], k = i < first ? 0 : (+b[i] - d0 + 10) % 10 + 10;
      let strip = '';
      for (let s = 0; s <= k; s++) strip += `<span>${DIGITS[(d0 + s) % 10]}</span>`;
      html += `<span class="odo__col"><span class="odo__strip" style="--end:${(-k / (k + 1) * 100).toFixed(4)}%">${strip}</span></span>`;
      steps.push(k);
    }
    el.innerHTML = `<span class="odo">${html}</span>`;
    odo = { first, steps, strips: $$('.odo__strip', el) };
  }

  /* ---------- Render ---------- */
  function render(data) {
    const S = data.settings || {};
    const fill = {
      name: tx(S.name), city: tx(S.city), hours: tx(S.hours), address: tx(S.address),
      nav: IS_MENU ? T.navHome : T.navMenu,
      ...T
    };
    $$('[data-t]').forEach(el => { const k = el.dataset.t; if (fill[k] != null) el.textContent = fill[k]; });
    const ig = 'https://www.instagram.com/' + encodeURIComponent((S.instagram || 'caffe.13').replace(/^@/, ''));
    $$('[data-ig]').forEach(a => a.href = ig);
    $$('.btn .ltr').forEach(s => s.textContent = '@' + (S.instagram || 'caffe.13').replace(/^@/, ''));
    // Phone: one number from the settings (admin panel) drives the visit row and the floating "order by phone" button.
    // Empty = neither shows. Dialled in international form so it also works from a foreign SIM.
    const phone = latin(S.phone || '').replace(/[^\d+]/g, '');
    if (phone) {
      const tel = 'tel:' + (/^0\d{10}$/.test(phone) ? '+98' + phone.slice(1) : phone);
      const shown = /^0\d{10}$/.test(phone) ? phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3') : phone;
      if ($('.visit__cell--phone')) {
        $('.visit__cell--phone').hidden = false;
        const a = $('[data-phone]'); a.textContent = shown; a.href = tel; a.dir = 'ltr'; a.classList.add('ltr');
      }
      const call = $('[data-call]');
      if (call) {
        call.href = tel; call.hidden = false; call.setAttribute('aria-label', `${T.callCta} ${shown}`);
        $('[data-call-num]', call).textContent = shown;
        root.classList.add('has-call');
        // Menu: always at hand. Home: waits until the film and the cafe's name have scrolled away.
        const hero = $('.hero');
        const show = on => call.classList.toggle('is-shown', on);
        if (hero && 'IntersectionObserver' in window) new IntersectionObserver(es => show(!es[0].isIntersecting), { rootMargin: '0px 0px -35% 0px' }).observe(hero);
        else requestAnimationFrame(() => requestAnimationFrame(() => show(true)));
      }
    }
    // Map: labels in the current language, directions link only when one is set
    if ($('.map__svg')) {
      if (!RTL) $$('.map [data-en]').forEach(t => { t.textContent = t.dataset.en; });
      $('.map__svg').setAttribute('aria-label', T.mapLabel);
      const mapUrl = String(S.mapUrl || '').trim();
      if (/^https:\/\//i.test(mapUrl)) { const a = $('[data-map-link]'); a.href = mapUrl; a.hidden = false; }
      fitMap();
    }

    const st = S.story || {};
    const storyText = tx(st.text).trim();
    if (storyText && $('#story')) {
      $('[data-t="storySince"]').textContent = tx(st.since);
      const storyTitle = tx(st.title).trim();   // optional: empty in the admin panel = no headline
      if (storyTitle) $('[data-t="storyTitle"]').textContent = storyTitle;
      else { $('.story__title').remove(); $('#story').classList.add('story--plain'); }
      $('[data-story-body]').innerHTML = storyText.split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
      const opened = new Date((/^\d{4}-\d\d-\d\d$/.test(st.opened || '') ? st.opened : '2016-02-24') + 'T12:00:00');
      const now = new Date();
      let years = now.getFullYear() - opened.getFullYear();
      if (now < new Date(now.getFullYear(), opened.getMonth(), opened.getDate())) years--;
      buildOdo($('[data-odo]'), calYear(opened), calYear(now));
      $('[data-stat-years]').textContent = num(years) + '+';
      $('#story').hidden = false;
    }
    const notice = tx(S.notice).trim();
    if (notice && $('[data-notice]')) {
      const n = $('[data-notice]'); n.textContent = notice; n.hidden = false;
      if ($('.hero')) $('.hero').classList.add('has-notice');
    }
    let year = String(new Date().getFullYear());
    if (RTL) year = String(calYear(new Date()));
    $('[data-year]').textContent = year;

    const sections = (data.sections || []);

    // Home page: category links into the menu page
    if ($('.hero__cats')) $('.hero__cats').innerHTML = sections.map(s => `
      <a class="cat" href="${BASE}menu/#sec-${esc(s.id)}">
        <span class="cat__fill"></span>
        <span class="cat__name">${esc(tx(s.title))}</span>
        <span class="cat__meta"><span class="cat__arrow">${arrow}</span></span>
      </a>`).join('');

    if (!$('#menu')) return;      // the rest builds the menu page

    // Tabs and chips
    $('.tabs__row').innerHTML = sections.map((s, i) =>
      `<button class="tab" data-go="sec-${esc(s.id)}" data-i="${i}">${esc(tx(s.title))}</button>`).join('') +
      '<span class="tabs__ink"></span>';
    $('.tabs__chips').innerHTML = sections.map(s => s.groups.map(g =>
      `<button class="chip" data-sec="sec-${esc(s.id)}" data-go="g-${esc(g.id)}">${esc(tx(g.title))}</button>`).join('')).join('');

    // Sections
    $('#menu').innerHTML = sections.map(s => `
      <section class="sec sec--${esc(s.id)}" id="sec-${esc(s.id)}">
        <div class="wrap">
          <header class="sec__head">
            <span class="sec__word" aria-hidden="true">${esc(WORD[s.id] || tx(s.title))}</span>
            <h2 class="sec__title"><span class="mask"><span class="mask__in">${esc(tx(s.title))}</span></span></h2>
            <p class="sec__count">${T.priceNote}</p>
          </header>
          <div class="groups">${s.groups.map(groupHTML).join('')}</div>
        </div>
      </section>`).join('');
  }

  function groupHTML(g) {
    return `
      <div class="group" id="g-${esc(g.id)}">
        <div class="group__head"><h3 class="group__title">${esc(tx(g.title))}</h3>${RTL && g.title.en ? `<span class="group__en">${esc(g.title.en)}</span>` : ''}</div>
        <div class="group__rule"></div>
        ${g.note && tx(g.note) ? `<p class="group__note">${esc(tx(g.note))}</p>` : ''}
        <ul class="items">${g.items.map(itemHTML).join('')}</ul>
      </div>`;
  }

  function itemHTML(it) {
    const img = it.image ? esc(BASE + it.image.replace(/^\/+/, '')) : '';
    const has = !!img;
    const price = it.price == null || it.price === ''
      ? `<span class="item__price is-empty">—</span>`
      : `<span class="item__price">${fmtPrice(it.price)}</span>`;
    const desc = tx(it.desc);
    const tag = has ? 'button' : 'div';
    return `
      <li class="item${has ? ' has-img' : ''}${it.available === false ? ' is-out' : ''}" data-id="${esc(it.id)}">
        <${tag} class="item__btn"${has ? ' type="button"' : ''}>
          ${has ? `<span class="item__thumb"><img src="${img}" alt="" loading="lazy" decoding="async" width="64" height="64"></span>` : ''}
          <span class="item__name">${esc(tx(it.name))}</span>
          ${price}
          ${RTL && it.name && it.name.en ? `<span class="item__en">${esc(it.name.en)}</span>` : ''}
          ${desc ? `<span class="item__desc">${esc(desc)}</span>` : ''}
          ${it.available === false ? `<span class="item__out">${T.out}</span>` : ''}
        </${tag}>
      </li>`;
  }

  /* ---------- Map sizing: keep the pin and street names a readable screen size at any width ---------- */
  function fitMap() {
    const svg = $('.map__svg');
    if (!svg || svg.dataset.fit) return;
    svg.dataset.fit = '1';
    const fit = () => {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const s = Math.max(r.width / 1560, r.height / 1300);   // 'slice' scale from viewBox units to pixels
      svg.style.setProperty('--u', (1 / s).toFixed(3));
    };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(svg); else addEventListener('resize', fit);
  }

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  const headH = () => $('.top').offsetHeight + ($('.tabs') ? $('.tabs').offsetHeight : 0);
  function scrollToId(id, instant) {
    const el = document.getElementById(id);
    if (!el) return;
    const off = -headH() + (id.startsWith('sec-') ? 4 : -4);   // a few px past the boundary so the tab spy counts it as active
    if (instant) {
      const top = el.getBoundingClientRect().top + scrollY + off;
      window.scrollTo(0, top);
      if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
    } else if (lenis) {
      const dist = Math.abs(el.getBoundingClientRect().top + off);
      lenis.scrollTo(el, { offset: off, duration: Math.min(2, Math.max(.8, dist / 2600)) });
    }
    else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + off, behavior: reduce || instant ? 'auto' : 'smooth' });
  }

  // Arriving with #something in the address (menu section links, "address & map")
  const goHash = () => { const h = decodeURIComponent(location.hash.slice(1)); if (h) scrollToId(h, true); };

  /* ---------- Interactions ---------- */
  function bind(data) {
    document.addEventListener('click', e => {
      const go = e.target.closest('[data-go]');
      if (go) { e.preventDefault(); scrollToId(go.dataset.go); return; }
      const lg = e.target.closest('[data-lang-switch]');
      if (lg) { try { localStorage.setItem('c13-lang', RTL ? 'en' : 'fa'); } catch (_) {} }
      const btn = e.target.closest('.item.has-img .item__btn');
      if (btn) openSheet(btn.closest('.item').dataset.id, data);
      if (e.target.closest('[data-close]')) closeSheet();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  }

  // Active tab and chip
  const tabs = () => $$('.tab'), chips = () => $$('.chip');
  function setSection(id) {
    tabs().forEach(t => t.setAttribute('aria-current', t.dataset.go === id ? 'true' : 'false'));
    const i = tabs().findIndex(t => t.dataset.go === id);
    const ink = $('.tabs__ink');
    if (ink && i >= 0) ink.style.transform = `translateX(${(RTL ? -100 : 100) * i}%)`;
    chips().forEach(c => c.hidden = c.dataset.sec !== id);
    const shown = chips().filter(c => !c.hidden);
    if (shown.length && !shown.some(c => c.getAttribute('aria-current') === 'true')) setGroup(shown[0].dataset.go);
  }
  let chipTimer = 0;
  function setGroup(id) {
    let cur = null;
    chips().forEach(c => {
      const on = c.dataset.go === id;
      c.setAttribute('aria-current', on ? 'true' : 'false');
      if (on) cur = c;
    });
    if (!cur) return;
    clearTimeout(chipTimer);            // wait until the scroll settles, then centre the chip once
    chipTimer = setTimeout(() => {
      const box = cur.parentElement;
      if (!box || cur.hidden) return;
      const target = cur.offsetLeft - (box.clientWidth - cur.offsetWidth) / 2;
      if (Math.abs(box.scrollLeft - target) > 4) box.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' });
    }, 140);
  }
  function spy() {
    if (!IS_MENU) return;
    const secs = $$('.sec'), groups = $$('.group');
    if (!secs.length) return;
    setSection(secs[0].id); setGroup(groups[0] && groups[0].id);
    if (hasGsap) {
      secs.forEach(s => ScrollTrigger.create({ trigger: s, start: () => `top ${headH() + 2}px`, end: () => `bottom ${headH() + 2}px`,
        onToggle: st => st.isActive && setSection(s.id) }));
      groups.forEach(g => ScrollTrigger.create({ trigger: g, start: () => `top ${headH() + 40}px`, end: () => `bottom ${headH() + 40}px`,
        onToggle: st => st.isActive && setGroup(g.id) }));
    } else {
      const io = new IntersectionObserver(es => es.forEach(en => {
        if (!en.isIntersecting) return;
        if (en.target.classList.contains('sec')) setSection(en.target.id); else setGroup(en.target.id);
      }), { rootMargin: '-45% 0px -54% 0px' });
      secs.concat(groups).forEach(el => io.observe(el));
    }
  }

  // Item sheet (only items with a photo)
  function openSheet(id, data) {
    let it = null;
    data.sections.forEach(s => s.groups.forEach(g => g.items.forEach(i => { if (i.id === id) it = i; })));
    if (!it) return;
    const sh = $('.sheet');
    $('.sheet__img img', sh).src = BASE + it.image.replace(/^\/+/, '');
    $('.sheet__img img', sh).alt = tx(it.name);
    $('.sheet__body', sh).innerHTML = `
      <h3>${esc(tx(it.name))}</h3>${RTL && it.name.en ? `<div class="en">${esc(it.name.en)}</div>` : ''}
      ${tx(it.desc) ? `<p>${esc(tx(it.desc))}</p>` : ''}
      ${it.price != null && it.price !== '' ? `<div class="price">${fmtPrice(it.price)} <small>${esc(tx(data.settings.priceUnit))}</small></div>` : ''}`;
    sh.hidden = false;
    lenis && lenis.stop();
    if (animate) {
      gsap.fromTo('.sheet__scrim', { opacity: 0 }, { opacity: 1, duration: .4 });
      gsap.fromTo('.sheet__panel', { yPercent: 100 }, { yPercent: 0, duration: .7, ease: 'expo.out', clearProps: 'transform' });
    }
    $('.sheet__x').focus();
  }
  function closeSheet() {
    const sh = $('.sheet');
    if (sh.hidden) return;
    const done = () => { sh.hidden = true; lenis && lenis.start(); };
    if (animate) {
      gsap.to('.sheet__scrim', { opacity: 0, duration: .3 });
      gsap.to('.sheet__panel', { yPercent: 100, duration: .45, ease: 'power3.in', onComplete: () => { gsap.set('.sheet__panel', { clearProps: 'transform' }); done(); } });
    } else done();
  }

  /* ---------- Motion ---------- */
  function initMotion() {
    gsap.registerPlugin(ScrollTrigger, CustomEase);
    ScrollTrigger.config({ ignoreMobileResize: true });
    CustomEase.create('line', 'M0,0 C0.602,0.01 -0.024,0.995 1,1');

    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    // Hero film drifts down, swells a little and fades out as you scroll away
    if ($('.hero__film')) gsap.to('.hero__film', { autoAlpha: 0, yPercent: 16, scale: 1.08, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

    // Big section words: scattered letters gather as the section arrives
    $$('.sec__word').forEach(w => {
      w.innerHTML = [...w.textContent].map(c => `<span class="ch">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
      gsap.from($$('.ch', w), {
        x: () => gsap.utils.random(-140, 140), y: () => gsap.utils.random(-60, 160),
        rotate: () => gsap.utils.random(-50, 50), opacity: 0, ease: 'power2.out', stagger: { each: .02, from: 'random' },
        scrollTrigger: { trigger: w, start: 'top 98%', end: 'top 40%', scrub: .8 }
      });
    });

    // Titles rise out of their mask
    $$('.sec__title .mask__in, .visit__title .mask > span, .story__title .mask > span').forEach(el => {
      gsap.from(el, { yPercent: 115, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el.parentElement, start: 'top 94%', once: true } });
    });

    // Group rules draw with the line ease
    $$('.group__rule').forEach(r => gsap.from(r, { scaleX: 0, duration: 1.2, ease: 'line', scrollTrigger: { trigger: r, start: 'top 98%', once: true } }));

    // Menu rows rise in batches (and also when scrolling back up after a jump)
    if ($('.item')) {
      gsap.set('.item', { autoAlpha: 0, y: 18 });
      const show = b => gsap.to(b, { autoAlpha: 1, y: 0, duration: .6, ease: 'power2.out', stagger: .04, overwrite: true });
      ScrollTrigger.batch('.item', { start: 'top bottom+=60', onEnter: show, onEnterBack: show, interval: .06, batchMax: 10 });
    }

    // Footer mark draws itself, then fills
    const fp = $('.foot__mark path');
    if (fp) {
      gsap.timeline({ scrollTrigger: { trigger: '.foot', start: 'top 95%', end: 'bottom bottom', scrub: .6 } })
        .to(fp, { strokeDashoffset: 0, ease: 'none', duration: 1 })
        .to(fp, { fill: '#F5CD6E', duration: .35 }, '>-.1');
    }

    // Story: the year spins from the opening year to this year, the line draws, the rest rises in
    if ($('.story') && !$('.story').hidden) {
      const tl = gsap.timeline({ scrollTrigger: { trigger: '.story', start: 'top 70%', once: true } });
      tl.from('.story__since', { y: 16, autoAlpha: 0, duration: .8, ease: 'power3.out' }, 0);
      let land = 2.4;
      if (odo) {
        tl.from('.odo', { y: 30, autoAlpha: 0, duration: .9, ease: 'power3.out' }, .1);
        odo.strips.forEach((s, i) => {
          const k = odo.steps[i];
          if (!k) return;
          const j = i - odo.first, dur = 2.3 + j * .3, at = .35 + j * .06;
          gsap.set(s, { y: 0, yPercent: 0 });
          // pixel moves while spinning, then a percent rest so it stays right if the text size changes
          tl.to(s, { y: () => Math.round(-k * s.firstElementChild.getBoundingClientRect().height), duration: dur, ease: 'power3.inOut',
            onComplete: () => gsap.set(s, { y: 0, yPercent: -k / (k + 1) * 100 }) }, at);
          land = Math.max(land, at + dur);
        });
      }
      tl.from('.story__rule', { scaleX: 0, duration: land - .5, ease: 'power2.inOut' }, .5)
        .from('.story__now', { scale: .4, autoAlpha: 0, duration: .6, ease: 'back.out(2)' }, land - .1);
      gsap.from('.story__body p, .stat, .story__cta', { y: 24, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: .1,
        scrollTrigger: { trigger: '.story__body', start: 'top 88%', once: true } });
      $$('.stat').forEach(s => gsap.from($('.stat__num', s), { yPercent: 60, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: s, start: 'top 92%', once: true } }));
    }

    // Map: streets draw in, names fade up, the pin drops; the map drifts slowly as you scroll
    const map = $('[data-map]');
    if (map) {
      gsap.set('.map__pinbody', { transformOrigin: '50% 100%' });
      gsap.timeline({ scrollTrigger: { trigger: map, start: 'top 82%', once: true } })
        .from('.map__parks', { autoAlpha: 0, duration: 1, ease: 'power2.out' }, 0)
        .to('.map .r3, .map .r2, .map .r1', { strokeDashoffset: 0, duration: 1.7, ease: 'power2.inOut', stagger: { each: .035, from: 'start' } }, 0)
        .from('.map__labels .lbl', { autoAlpha: 0, y: 8, duration: .8, ease: 'power2.out', stagger: .04 }, .9)
        .from('.map__pinbody', { y: -90, autoAlpha: 0, duration: 1.1, ease: 'bounce.out' }, 1.2);
      // Aerial fly-in: the map starts high above the neighbourhood and, as you scroll down, dives toward the cafe's pin
      const svg = $('.map__svg'), ZOOM_FAR = .5, ZOOM_NEAR = 1.1, PIN = '928 628';
      const flyTo = () => {
        const z = +gsap.getProperty('.map__world', 'scale');
        svg.style.setProperty('--z', z.toFixed(3));                                            // keeps the pin a constant screen size
        svg.style.setProperty('--lo', Math.min(1, Math.max(0, (z - .6) / .4)).toFixed(3));     // small street names appear as we get close
      };
      gsap.fromTo('.map__world', { scale: ZOOM_FAR, svgOrigin: PIN }, { scale: ZOOM_NEAR, svgOrigin: PIN, ease: 'power1.inOut', onUpdate: flyTo,
        scrollTrigger: { trigger: map, start: 'top 88%', end: 'top 22%', scrub: .8 } });
      flyTo();
    }

    // Visit rows
    if ($('.visit__grid')) gsap.from('.visit__cell, .visit .btn', { y: 24, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: .08,
      scrollTrigger: { trigger: '.visit__grid', start: 'top 90%', once: true } });

    ScrollTrigger.refresh();
  }

  function heroIntro() {
    const tl = gsap.timeline();
    // the film punches in from close up and settles, like the opening shot of a film
    tl.from('.hero__reel', { scale: 1.38, autoAlpha: 0, duration: 2.8, ease: 'expo.out' }, 0)
      .from('.hero__name', { yPercent: 110, duration: 1.4, ease: 'power3.out' }, .15)
      .from('.hero__kicker, .hero__lead, .hero__notice:not([hidden])', { y: 20, autoAlpha: 0, duration: 1.1, ease: 'power3.out', stagger: .1 }, .4)
      .from('.cat', { y: 30, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: .08 }, .55)
      .from('.top', { yPercent: -100, duration: 1, ease: 'power3.out' }, .3);
    return tl;
  }

  function menuIntro() {
    return gsap.timeline()
      .from('.menuhead__kicker, .menuhead .hero__notice:not([hidden])', { y: 16, autoAlpha: 0, duration: .9, ease: 'power3.out', stagger: .08 }, .25)
      .from('.menuhead__title .mask > span', { yPercent: 112, duration: 1.2, ease: 'power3.out' }, .1)
      .from('.tabs', { y: 24, autoAlpha: 0, duration: .9, ease: 'power3.out' }, .45)
      .from('.top', { yPercent: -100, duration: .9, ease: 'power3.out' }, .2);
  }

  function loader() {
    const panels = $$('.loader__panels i');
    const circle = $('.loader__circle'), glyph = $('.loader__glyph');
    const long = firstVisit && !IS_MENU;      // guests from the table QR code get the short one
    return gsap.timeline()
      .to(circle, { strokeDashoffset: 0, duration: long ? 1.2 : .6, ease: 'expo.inOut' })
      .to(glyph, { strokeDashoffset: 0, duration: long ? 1.3 : .6, ease: 'expo.inOut' }, '<+.25')
      .to(glyph, { fill: '#F5CD6E', duration: .4, ease: 'sine.out' }, '>-.25')
      .to('.loader__mark', { scale: .7, autoAlpha: 0, duration: .5, ease: 'power3.in' }, '>+.1')
      .to(panels, { yPercent: gsap.utils.wrap([-100, 100]), duration: 1.1, ease: 'expo.inOut', stagger: .07 }, '<+.2');
  }

  /* ---------- Hero film: slow-motion coffee beans behind the cafe's name ----------
     One video per visit: portrait for phones, landscape for wide screens. WebM (VP9) is the lighter file;
     Apple's WebKit gets H.264 first, which every iPhone decodes in hardware. Without motion or with
     data saver on, only the still poster shows. The video plays only while the hero is on screen. */
  function film() {
    const box = $('[data-film]'), v = box && $('video', box);
    if (!v) return;
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    if (reduce || saveData) return;
    const name = BASE + 'assets/hero/coffee-' + (matchMedia('(max-aspect-ratio: 1/1)').matches ? 'port' : 'land');
    const ua = navigator.userAgent;
    const appleWebKit = /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Android|Edg/.test(ua) || /iPhone|iPad|iPod/.test(ua);
    const webm = `<source src="${name}.webm" type='video/webm; codecs="vp9"'>`, mp4 = `<source src="${name}.mp4" type="video/mp4">`;
    v.muted = true; v.defaultMuted = true; v.playsInline = true;
    v.innerHTML = appleWebKit ? mp4 + webm : webm + mp4;
    v.preload = 'auto';
    v.addEventListener('playing', () => v.classList.add('is-on'), { once: true });
    const play = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    v.load();
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { es[0].isIntersecting ? play() : v.pause(); }).observe(box);
    else play();
  }
  film();

  /* ---------- Boot ---------- */
  const dataP = fetch(BASE + 'data/menu.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

  if (animate) {
    gsap.registerPlugin(ScrollTrigger, CustomEase);
    const intro = loader();
    intro.pause();
    dataP.then(data => {
      render(data); bind(data);
      if (document.fonts && document.fonts.ready) return document.fonts.ready.then(() => data);
      return data;
    }).then(data => {
      initMotion(); spy();
      lenis && lenis.stop();
      goHash();                       // land on the linked section while the loader still covers the page
      intro.eventCallback('onComplete', () => { root.classList.remove('is-loading'); lenis && lenis.start(); ScrollTrigger.refresh(); goHash(); });
      intro.add(IS_MENU ? menuIntro() : heroIntro(), '<+.35');
      intro.play();
    }).catch(err => fail(err));
  } else {
    dataP.then(data => { render(data); bind(data); spy(); goHash(); }).catch(err => fail(err));
  }

  function fail(err) {
    console.error(err);
    root.classList.remove('is-loading');
    const box = $('#menu') || $('#top');
    if (box) box.insertAdjacentHTML('beforeend', `<p class="wrap" style="padding:48px 0">${T.error}</p>`);
  }
})();
