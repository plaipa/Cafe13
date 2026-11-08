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

  const T = {
    fa: { mapLabel: 'نقشهٔ محل کافه ۱۳', directions: 'مسیریابی', lead: 'قهوه، برگر و صبحانه', visitTitle: 'سر بزنید', addressLabel: 'آدرس', hoursLabel: 'ساعت کاری',
          phoneLabel: 'تلفن', igCta: 'اینستاگرام ما', priceNote: 'قیمت‌ها به هزار تومان', items: 'آیتم', out: 'تمام شد',
          error: 'منو بارگذاری نشد. صفحه را دوباره باز کنید.', title: 'کافه ۱۳ تبریز | منوی قهوه، برگر و صبحانه' },
    en: { mapLabel: 'Map showing where Cafe 13 is', directions: 'Get directions', lead: 'Coffee, burgers and breakfast', visitTitle: 'Visit us', addressLabel: 'Address', hoursLabel: 'Hours',
          phoneLabel: 'Phone', igCta: 'Follow us', priceNote: 'Prices in thousand toman', items: 'items', out: 'Sold out',
          error: 'The menu did not load. Please reload the page.', title: 'Cafe 13 Tabriz | Coffee, burgers and breakfast' }
  }[lang];
  const WORD = { cafe: 'Coffee', burger: 'Burger', breakfast: 'Breakfast' };

  document.title = T.title;
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
  const tx = o => (o && (o[lang] || o.fa || o.en)) || '';
  const num = n => Number(n).toLocaleString(RTL ? 'fa-IR' : 'en-US');
  const fmtPrice = n => Number(n).toLocaleString('en-US');   // prices always use Latin digits
  const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  const animate = hasGsap && !reduce;

  let firstVisit = true;
  try { firstVisit = !sessionStorage.getItem('c13-seen'); sessionStorage.setItem('c13-seen', '1'); } catch (e) {}
  if (!animate) { root.classList.remove('is-loading'); root.classList.add('no-motion'); }

  /* ---------- Render ---------- */
  let unit = '';
  function render(data) {
    const S = data.settings || {};
    unit = tx(S.priceUnit);
    const fill = {
      name: tx(S.name), city: tx(S.city), hours: tx(S.hours), address: tx(S.address),
      ...T
    };
    $$('[data-t]').forEach(el => { const k = el.dataset.t; if (fill[k] != null) el.textContent = fill[k]; });
    const ig = 'https://www.instagram.com/' + encodeURIComponent((S.instagram || 'caffe.13').replace(/^@/, ''));
    $$('[data-ig]').forEach(a => a.href = ig);
    $$('.btn .ltr').forEach(s => s.textContent = '@' + (S.instagram || 'caffe.13').replace(/^@/, ''));
    if (S.phone) {
      const cell = $('.visit__cell--phone'); cell.hidden = false;
      const a = $('[data-phone]'); a.textContent = S.phone; a.href = 'tel:' + S.phone.replace(/[^\d+]/g, '');
    }
    // Map: labels in the current language, directions link only when one is set
    if (!RTL) $$('.map [data-en]').forEach(t => { t.textContent = t.dataset.en; });
    $('.map__svg').setAttribute('aria-label', T.mapLabel);
    const mapUrl = String(S.mapUrl || '').trim();
    if (/^https:\/\//i.test(mapUrl)) { const a = $('[data-map-link]'); a.href = mapUrl; a.hidden = false; }
    fitMap();

    const st = S.story || {};
    const storyText = tx(st.text).trim();
    if (storyText) {
      $('[data-t="storySince"]').textContent = tx(st.since);
      $('[data-t="storyTitle"]').textContent = tx(st.title);
      $('[data-t="storyText"]').textContent = storyText;
      $('#story').hidden = false;
    }
    const notice = tx(S.notice).trim();
    if (notice) {
      const n = $('[data-notice]'); n.textContent = notice; n.hidden = false;
      $('.hero').classList.add('has-notice');
    }
    let year = String(new Date().getFullYear());
    if (RTL) try { year = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date()).replace(/[^۰-۹]/g, ''); } catch (e) {}
    $('[data-year]').textContent = year;

    const sections = (data.sections || []);
    const count = s => s.groups.reduce((n, g) => n + g.items.length, 0);

    // Hero category links
    $('.hero__cats').innerHTML = sections.map(s => `
      <a class="cat" href="#sec-${esc(s.id)}" data-go="sec-${esc(s.id)}">
        <span class="cat__fill"></span>
        <span class="cat__name">${esc(tx(s.title))}</span>
        <span class="cat__meta"><span>${num(count(s))} ${T.items}</span><span class="cat__arrow">${arrow}</span></span>
      </a>`).join('');

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
            <p class="sec__count">${num(count(s))} ${T.items} · ${T.priceNote}</p>
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
    const img = it.image ? esc(it.image) : '';
    const has = !!img;
    const price = it.price == null || it.price === ''
      ? `<span class="item__price is-empty">—</span>`
      : `<span class="item__price">${fmtPrice(it.price)}${unit ? `<small class="item__unit">${esc(unit)}</small>` : ''}</span>`;
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
  const headH = () => $('.top').offsetHeight + $('.tabs').offsetHeight;
  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const off = -headH() + (id.startsWith('sec-') ? 1 : -4);
    if (lenis) {
      const dist = Math.abs(el.getBoundingClientRect().top + off);
      lenis.scrollTo(el, { offset: off, duration: Math.min(2, Math.max(.8, dist / 2600)) });
    }
    else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + off, behavior: reduce ? 'auto' : 'smooth' });
  }

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
    $('.sheet__img img', sh).src = it.image;
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

    // Hero disc turns and sinks as you scroll away
    gsap.to('.hero__disc', { rotate: RTL ? 60 : -60, yPercent: 22, scale: .82, ease: 'none',
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
    gsap.set('.item', { autoAlpha: 0, y: 18 });
    const show = b => gsap.to(b, { autoAlpha: 1, y: 0, duration: .6, ease: 'power2.out', stagger: .04, overwrite: true });
    ScrollTrigger.batch('.item', { start: 'top bottom+=60', onEnter: show, onEnterBack: show, interval: .06, batchMax: 10 });

    // Footer mark draws itself, then fills
    const fp = $('.foot__mark path');
    if (fp) {
      gsap.timeline({ scrollTrigger: { trigger: '.foot', start: 'top 95%', end: 'bottom bottom', scrub: .6 } })
        .to(fp, { strokeDashoffset: 0, ease: 'none', duration: 1 })
        .to(fp, { fill: '#F5CD6E', duration: .35 }, '>-.1');
    }

    // Story
    gsap.from('.story__since, .story__text', { y: 24, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: .12,
      scrollTrigger: { trigger: '.story', start: 'top 75%', once: true } });

    // Map: streets draw in, names fade up, the pin drops; the map drifts slowly as you scroll
    const map = $('[data-map]');
    if (map) {
      gsap.set('.map__pinbody', { transformOrigin: '50% 100%' });
      gsap.timeline({ scrollTrigger: { trigger: map, start: 'top 82%', once: true } })
        .from('.map__parks', { autoAlpha: 0, duration: 1, ease: 'power2.out' }, 0)
        .to('.map .r3, .map .r2, .map .r1', { strokeDashoffset: 0, duration: 1.7, ease: 'power2.inOut', stagger: { each: .035, from: 'start' } }, 0)
        .from('.map__labels .lbl', { autoAlpha: 0, y: 8, duration: .8, ease: 'power2.out', stagger: .04 }, .9)
        .from('.map__pinbody', { y: -90, autoAlpha: 0, duration: 1.1, ease: 'bounce.out' }, 1.2);
      gsap.fromTo('.map__world', { y: 34 }, { y: -34, ease: 'none',
        scrollTrigger: { trigger: map, start: 'top bottom', end: 'bottom top', scrub: .6 } });
    }

    // Visit rows
    gsap.from('.visit__cell, .visit .btn', { y: 24, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: .08,
      scrollTrigger: { trigger: '.visit__grid', start: 'top 90%', once: true } });

    ScrollTrigger.refresh();
  }

  function heroIntro() {
    const tl = gsap.timeline();
    tl.from('.hero__disc', { scale: .55, rotate: RTL ? -70 : 70, autoAlpha: 0, duration: 1.8, ease: 'expo.out' }, 0)
      .from('.hero__name', { yPercent: 110, duration: 1.4, ease: 'power3.out' }, .15)
      .from('.hero__kicker, .hero__lead, .hero__notice:not([hidden])', { y: 20, autoAlpha: 0, duration: 1.1, ease: 'power3.out', stagger: .1 }, .4)
      .from('.cat', { y: 30, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: .08 }, .55)
      .from('.top', { yPercent: -100, duration: 1, ease: 'power3.out' }, .3);
    return tl;
  }

  function loader() {
    const panels = $$('.loader__panels i');
    const circle = $('.loader__circle'), glyph = $('.loader__glyph');
    const long = firstVisit;
    return gsap.timeline()
      .to(circle, { strokeDashoffset: 0, duration: long ? 1.2 : .6, ease: 'expo.inOut' })
      .to(glyph, { strokeDashoffset: 0, duration: long ? 1.3 : .6, ease: 'expo.inOut' }, '<+.25')
      .to(glyph, { fill: '#F5CD6E', duration: .4, ease: 'sine.out' }, '>-.25')
      .to('.loader__mark', { scale: .7, autoAlpha: 0, duration: .5, ease: 'power3.in' }, '>+.1')
      .to(panels, { yPercent: gsap.utils.wrap([-100, 100]), duration: 1.1, ease: 'expo.inOut', stagger: .07 }, '<+.2');
  }

  /* ---------- Boot ---------- */
  const dataP = fetch('data/menu.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

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
      intro.eventCallback('onComplete', () => { root.classList.remove('is-loading'); lenis && lenis.start(); ScrollTrigger.refresh(); });
      intro.add(heroIntro(), '<+.35');
      intro.play();
    }).catch(err => fail(err));
  } else {
    dataP.then(data => { render(data); bind(data); spy(); }).catch(err => fail(err));
  }

  function fail(err) {
    console.error(err);
    root.classList.remove('is-loading');
    $('#menu').innerHTML = `<p class="wrap" style="padding:48px 0">${T.error}</p>`;
  }
})();
