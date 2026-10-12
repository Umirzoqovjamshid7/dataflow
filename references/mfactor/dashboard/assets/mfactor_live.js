/* ============================================================
   MFactor Live — dashboard "jonli" runtime
   ------------------------------------------------------------
   Sahifalar kodi qayta yozilmaydi: mavjud render funksiyalari
   avvalgidek textContent/innerHTML yozaveradi, MLive esa
   MutationObserver orqali o'zgarishni ushlab count-up, chaqnash,
   stagger va grafik animatsiyalarini o'zi qo'llaydi.

   Muhim nuqta: xodimlar/facebook sahifalarida kartalar har
   yangilanishda BUTUNLAY qayta yaratiladi. Shuning uchun eski
   qiymat DOM tugunida emas, `memory` registrida kalit bo'yicha
   saqlanadi — yangi element eski qiymatdan davom etadi.

   Qo'lda boshqarish:
     MLive.bar(el, 0.42)        -> ustun scaleY bilan o'sadi
     MLive.bar(el, 0.42, true)  -> gorizontal (scaleX)
     MLive.touch()              -> "oxirgi yangilanish"ni yangilaydi
   ============================================================ */
(function (global) {
  'use strict';

  /* 2026-09-03: sahifa "2-3 soniya yangilanib turadi" shikoyati — sabab
     ochilishdagi count-up edi (1300ms + 4 karta x 80ms = ~1.6s). Ko'z
     o'zgarishni ilg'ashi uchun shuncha kerak emas; qisqartirildi. */
  var DUR = 1050;      /* premium count-up: taxminan 1 soniya */
  var STAGGER = 70;   /* cardlar ketma-ket, yengil entrance */    /* kartalar orasidagi kechikish */
  var FLASH = 600;     /* o'sdi/tushdi chaqnashi */

  var VALUE_SEL = '.value, .trend, .kpi .val, .metric b, .conversion b, .summary b, [data-mlive]';
  var CARD_SEL = '.card, .kpi, .employee-card, [data-mlive-card]';
  var SKEL_CONTAINERS = '.cards, .kpis, #kpis, #employeeGrid, [data-mlive-skel]';

  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches); }

  /* qayta yaratiladigan elementlar uchun qiymat xotirasi: kalit -> son */
  var memory = Object.create(null);

  /* ---------------- format: matndan son va shaklni ajratish ------------- */
  /* "1 250 000 so'm" -> 1250000 {group:' ', suffix:" so'm"}
     "87.5%"          -> 87.5    {dec:'.', places:1, suffix:'%'}
     "+12.4%"         -> 12.4    {plus:true, places:1, suffix:'%'}          */
  var NUM_RE = /[+\-−]?\d[\d\s .,]*/;

  function parseValue(text) {
    if (text == null) return null;
    var s = String(text);
    var m = s.match(NUM_RE);
    if (!m) return null;

    /* oxiridagi ajratuvchilar kesiladi: "12 ta." -> "12" */
    var raw = m[0].replace(/−/g, '-').replace(/[\s .,]+$/, '');
    if (!/\d/.test(raw)) return null;

    var prefix = s.slice(0, m.index);
    var suffix = s.slice(m.index + raw.length);

    /* "0:00", "1:23:45" — vaqt, count-up mos kelmaydi */
    if (/^\s*:/.test(suffix)) return null;

    var sign = raw.charAt(0) === '+' ? '+' : (raw.charAt(0) === '-' ? '-' : '');
    var body = sign ? raw.slice(1) : raw;

    var seps = body.replace(/\d/g, '');
    var uniq = [];
    for (var i = 0; i < seps.length; i++) {
      if (uniq.indexOf(seps.charAt(i)) < 0) uniq.push(seps.charAt(i));
    }

    var group = '', dec = '', places = 0;
    if (uniq.length === 1) {
      var c = uniq[0];
      var after = body.length - body.lastIndexOf(c) - 1;
      var isSpace = (c === ' ' || c === ' ');
      /* bo'sh joy — doim minglik; 3 xonali quyruq ham minglik ("1,250") */
      if (isSpace || seps.length > 1 || after === 3) group = c;
      else { dec = c; places = after; }
    } else if (uniq.length > 1) {
      dec = seps.charAt(seps.length - 1);          /* oxirgisi kasr ajratuvchisi */
      for (var j = 0; j < uniq.length; j++) if (uniq[j] !== dec) { group = uniq[j]; break; }
      places = body.length - body.lastIndexOf(dec) - 1;
    }

    var numeric = body;
    if (group) numeric = numeric.split(group).join('');
    if (dec) numeric = numeric.split(dec).join('.');
    var value = parseFloat(numeric);
    if (!isFinite(value)) return null;
    if (sign === '-') value = -value;

    return {
      value: value,
      fmt: {
        prefix: prefix, suffix: suffix,
        group: group, dec: dec || '.', places: places,
        plus: sign === '+'
      }
    };
  }

  /* aniqlangan shaklni saqlab sonni qayta yozadi */
  function format(v, f) {
    var neg = v < 0;
    var abs = Math.abs(v);
    var s = f.places > 0 ? abs.toFixed(f.places) : String(Math.round(abs));
    var ip = s, fp = '';
    if (f.places > 0) {
      var k = s.indexOf('.');
      ip = s.slice(0, k);
      fp = s.slice(k + 1);
    }
    if (f.group) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, f.group);
    var sign = neg ? '-' : (f.plus ? '+' : '');
    return f.prefix + sign + ip + (f.places > 0 ? f.dec + fp : '') + f.suffix;
  }

  /* easeOutExpo — oxirida sekinlashadi */
  function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  /* ---------------- element kalitini aniqlash ---------------- */
  /* Qayta yaratilgan element eski qiymatini topa olishi uchun barqaror kalit */
  function keyOf(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    var card = el.closest ? el.closest('.employee-card, .kpi, .card, tr') : null;
    if (card) {
      var nm = card.querySelector('.name, .lbl, .employee, th');
      if (nm) parts.push((nm.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40));
    }
    var p = el.parentNode;
    if (p && p.nodeType === 1) {
      var own = el.textContent || '';
      var label = (p.textContent || '');
      var at = label.indexOf(own);
      if (at >= 0 && own) label = label.slice(0, at) + label.slice(at + own.length);
      parts.push(label.replace(/\s+/g, ' ').trim().slice(0, 60));
    }
    parts.push(String(el.className || ''));
    return parts.join('|');
  }

  /* ---------------- count-up ---------------- */
  function state(el) { return el.__mlive || (el.__mlive = {}); }

  function write(el, text) {
    state(el).lastWritten = text;   /* o'z yozuvimizni observer'da e'tiborsiz qoldiramiz */
    el.textContent = text;
  }

  function animate(el, from, to, fmt, key) {
    var st = state(el);
    if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
    st.value = to;
    if (key) memory[key] = to;

    if (reduced() || from === to) { write(el, format(to, fmt)); return; }

    var t0 = 0;
    function step(ts) {
      if (!el.isConnected) { st.raf = 0; return; }   /* element DOM'dan olib tashlandi */
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / DUR);
      var v = from + (to - from) * easeOutExpo(p);
      write(el, format(fmt.places > 0 ? v : Math.round(v), fmt));
      if (p < 1) st.raf = requestAnimationFrame(step);
      else { st.raf = 0; write(el, format(to, fmt)); }
    }
    st.raf = requestAnimationFrame(step);
  }

  /* ---------------- o'sdi/tushdi chaqnashi ---------------- */
  function flash(el, up) {
    if (reduced()) return;
    var card = el.closest ? el.closest(CARD_SEL) : null;
    if (!card) return;
    card.classList.remove('mlive-up', 'mlive-down');
    void card.offsetWidth;                       /* animatsiyani qayta ishga tushirish */
    card.classList.add(up ? 'mlive-up' : 'mlive-down');
    clearTimeout(card.__mliveFlashT);
    card.__mliveFlashT = setTimeout(function () {
      card.classList.remove('mlive-up', 'mlive-down');
    }, FLASH + 60);
  }

  /* ---------------- qiymat elementini kuzatish ---------------- */
  function onText(el, first) {
    var st = state(el);
    var txt = el.textContent;
    if (txt === st.lastWritten) return;          /* o'zimiz yozgan oraliq kadr */

    var p = parseValue(txt);
    if (!p) {                                    /* "—", "0:00", "ma'lumot yo'q" ... */
      st.value = undefined;
      st.lastWritten = undefined;
      return;
    }

    var key = st.key || (st.key = keyOf(el));

    /* Sahifadagi boshlang'ich "0" — bu hali ma'lumot emas, shunchaki
       o'rin egallab turgan qiymat. Skeleton haqiqiy ma'lumot kelguncha qoladi. */
    if (first && p.value === 0 && el.classList.contains('mlive-skel')) {
      st.value = 0;
      st.lastWritten = txt;
      return;
    }
    unskeleton(el);
    var known = (typeof st.value === 'number') ? st.value
              : (typeof memory[key] === 'number' ? memory[key] : undefined);
    var from = (typeof known === 'number') ? known : 0;
    var isNew = (typeof known !== 'number');

    MLive.touch();                               /* birinchi ma'lumot ham yangilanish */
    if (!isNew && from !== p.value) flash(el, p.value > from);

    animate(el, from, p.value, p.fmt, key);
  }

  function watchValue(el) {
    if (el.__mliveWatched) return;
    el.__mliveWatched = true;
    /* tabular-nums shu klass orqali beriladi — CSS selektori bilan JS
       ro'yxati bir-biridan uzilib qolmasligi uchun */
    el.classList.add('mlive-num');
    var mo = new MutationObserver(function () { onText(el, false); });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    state(el).mo = mo;
    onText(el, true);
  }

  /* ---------------- 3. skeleton ---------------- */
  function skeleton(el) { el.classList.add('mlive-skel'); }
  function unskeleton(el) {
    if (el.classList.contains('mlive-skel')) el.classList.remove('mlive-skel');
  }

  /* bo'sh konteynerlarga o'lchamni oldindan band qiluvchi shimmer bloklar */
  function skeletonFill(c) {
    if (c.__mliveSkelFilled || c.children.length) return;
    c.__mliveSkelFilled = true;
    var n = parseInt(c.getAttribute('data-mlive-skel'), 10) || 5;
    var html = '';
    for (var i = 0; i < n; i++) html += '<div class="mlive-skel-block"></div>';
    c.innerHTML = html;                 /* haqiqiy render innerHTML bilan almashtiradi */
  }

  /* ---------------- 2. stagger (konteyner bo'yicha bir marta) ---------------- */
  function staggerContainer(c) {
    if (!c || c.nodeType !== 1 || c.__mliveStaggered) return;
    var kids = [];
    for (var i = 0; i < c.children.length; i++) {
      if (c.children[i].matches && c.children[i].matches(CARD_SEL)) kids.push(c.children[i]);
    }
    if (!kids.length) return;
    c.__mliveStaggered = true;
    if (reduced()) return;

    kids.forEach(function (card, i) {
      card.classList.add('mlive-stagger');
      card.style.animationDelay = (i * STAGGER) + 'ms';
      /* animatsiya tugagach klass olib tashlanadi — aks holda
         animation-fill-mode:both hover'dagi translateY'ni bosib qoladi */
      card.addEventListener('animationend', function handler(e) {
        if (e.animationName !== 'mlive-in') return;
        card.classList.remove('mlive-stagger', 'mlive-run');
        card.style.animationDelay = '';
        card.removeEventListener('animationend', handler);
      });
      requestAnimationFrame(function () { card.classList.add('mlive-run'); });
    });
  }

  /* ---------------- 4. grafiklar ---------------- */
  function drawSvg(svg) {
    if (svg.__mliveDrawn) return;
    svg.__mliveDrawn = true;
    if (reduced()) return;

    var host = (svg.parentNode && svg.parentNode.nodeType === 1) ? svg.parentNode : null;

    /* Sahifa yuklanganda grafik ketma-ket bir necha marta chiziladi
       (avval bo'sh, keyin ma'lumot bilan, ba'zan filtr o'rnatilgach yana).
       Bularning hammasi bitta "ochilish" hisoblanadi — to'liq animatsiya
       ko'rsatamiz. 1 daqiqalik fon yangilanishi esa (oxirgi chizishdan
       ancha keyin) faqat yumshoq fade bilan chiqadi — sahifa miltillamasin. */
    var now = Date.now();
    var last = host ? host.__mliveChartAt : 0;
    var opening = !last || (now - last) < 5000;
    if (!opening) { svg.classList.add('mlive-soft'); return; }

    var drew = 0;
    Array.prototype.forEach.call(svg.querySelectorAll('polyline, path'), function (el, i) {
      if (typeof el.getTotalLength !== 'function') return;
      var len = 0;
      try { len = el.getTotalLength(); } catch (e) { return; }
      if (!len || !isFinite(len)) return;
      el.style.setProperty('--mlive-len', len);
      el.style.animationDelay = (i * 70) + 'ms';
      el.classList.add('mlive-draw');            /* chapdan o'ngga chizilishi */
      drew++;
    });

    /* Sahifalar grafikni avval BO'SH ma'lumot bilan, keyin haqiqiy ma'lumot
       bilan chizadi. Agar bo'sh renderni ham "birinchi" deb belgilasak,
       haqiqiy grafik animatsiyasiz chiqadi. Shuning uchun faqat haqiqatan
       chiziq chizilgan bo'lsa belgilaymiz. */
    /* faqat haqiqatan chiziq chizilgan bo'lsa vaqtni belgilaymiz —
       bo'sh render "ochilish" oynasini yopib qo'ymasin */
    if (drew && host) host.__mliveChartAt = now;

    Array.prototype.forEach.call(svg.querySelectorAll('polygon'), function (el, i) {
      el.style.animationDelay = (200 + i * 70) + 'ms';
      el.classList.add('mlive-fade');
    });

    Array.prototype.forEach.call(svg.querySelectorAll('circle'), function (el, i) {
      el.style.animationDelay = (400 + Math.min(i, 40) * 18) + 'ms';
      el.classList.add('mlive-pop');
    });
  }

  /* ustun: faqat transform (width/height EMAS) */
  function bar(el, ratio, horizontal) {
    if (!el) return;
    var r = Math.max(0, Math.min(1, Number(ratio) || 0));
    el.classList.add(horizontal ? 'mlive-bar-h' : 'mlive-bar-v');
    requestAnimationFrame(function () {
      el.style.transform = (horizontal ? 'scaleX(' : 'scaleY(') + r + ')';
    });
  }

  /* ---------------- bar va jadval entrance ---------------- */
  function animateBar(el) {
    if (!el || el.__mliveBar) return;
    el.__mliveBar = true;
    if (!reduced()) {
      el.classList.add('mlive-bar-v');
      requestAnimationFrame(function () { el.style.transform = 'scaleY(1)'; });
    }
  }

  function animateRow(el) {
    if (!el || el.__mliveRow) return;
    el.__mliveRow = true;
    if (!reduced()) el.classList.add('mlive-row-in');
  }

  /* ---------------- 4. tooltip (150ms) ---------------- */
  function tipShim(el) {
    if (el.__mliveTip) return;
    el.__mliveTip = true;
    el.classList.add('mlive-tip');
    var mo = new MutationObserver(function () {
      var shown = getComputedStyle(el).display !== 'none';
      requestAnimationFrame(function () {
        el.classList.toggle('mlive-tip-on', shown);
      });
    });
    mo.observe(el, { attributes: true, attributeFilter: ['style'] });
  }

  /* ---------------- TELEFON: pastki navigatsiya ---------------- */
  /* Sahifalarda `aside` <=800px da yashiriladi va telefonda sahifalar
     orasida o'tish imkoni qolmaydi. Shu sabab mavjud nav havolalaridan
     pastki panel yasaymiz — HTML fayllarga tegmasdan. */
  var NAV_SHORT = {
    '/mfactor_umumiy.html': 'Umumiy',
    '/mfactor_xodimlar.html': 'Xodimlar',
    '/mfactor_pbx.html': 'Qo\u2018ng\u2018iroq',
    '/mfactor_bitrix.html': 'Bitrix',
    '/mfactor_facebook.html': 'Facebook',
    '/mfactor_kampaniyalar.html': 'Kampaniyalar',
    '/mfactor_kreativlar.html': 'Kreativlar'
  };

  function mobileNav() {
    if (document.querySelector('.mlive-nav')) return;
    var links = document.querySelectorAll('aside nav a, nav a');
    if (!links.length) return;

    var bar = document.createElement('nav');
    bar.className = 'mlive-nav';
    bar.setAttribute('aria-label', 'Asosiy menyu');

    Array.prototype.forEach.call(links, function (a) {
      var href = a.getAttribute('href') || '#';
      /* matn "\u25a6 \u00a0 Umumiy" ko'rinishida — belgi va nomni ajratamiz */
      var txt = (a.textContent || '').replace(/\u00a0/g, ' ').trim();
      var sp = txt.search(/\s/);
      var icon = sp > 0 ? txt.slice(0, sp) : txt.charAt(0);
      var label = NAV_SHORT[href] || (sp > 0 ? txt.slice(sp).trim() : txt);

      var el = document.createElement('a');
      el.href = href;
      if (a.classList.contains('active')) {
        el.className = 'active';
        el.setAttribute('aria-current', 'page');
      }
      var b = document.createElement('b');
      b.textContent = icon;
      var s2 = document.createElement('span');
      s2.textContent = label;
      el.appendChild(b);
      el.appendChild(s2);
      bar.appendChild(el);
    });

    document.body.appendChild(bar);
    document.body.classList.add('mlive-has-nav');
  }

  /* ---------------- TELEFON: keng jadvallarni skrollga o'rash ---------------- */
  function wrapTable(t) {
    if (t.__mliveWrapped) return;
    t.__mliveWrapped = true;
    var p = t.parentNode;
    /* allaqachon skrollanadigan o'ram ichida bo'lsa — tegmaymiz */
    if (p && p.nodeType === 1) {
      if (p.classList.contains('mlive-scroll') || p.classList.contains('tablewrap')) return;
      var ov = '';
      try { ov = getComputedStyle(p).overflowX; } catch (e) { ov = ''; }
      if (ov === 'auto' || ov === 'scroll') return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'mlive-scroll';
    if (p) p.insertBefore(wrap, t);
    wrap.appendChild(t);
  }

  /* ---------------- 5. "Oxirgi yangilanish: 14:32" ---------------- */
  var badge = null, lastAt = 0, staleTimer = 0;
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function ensureBadge() {
    if (badge) return badge;
    badge = document.querySelector('[data-mlive-updated]');
    if (badge) return badge;
    var host = document.querySelector('header > div:first-child') || document.querySelector('header');
    if (!host) return null;
    badge = document.createElement('div');
    badge.className = 'mlive-updated';
    badge.setAttribute('data-mlive-updated', '');
    badge.innerHTML = '<span class="mlive-dot"></span><span class="mlive-updated-text">Yangilanmoqda…</span>';
    host.appendChild(badge);
    return badge;
  }

  function touch() {
    lastAt = Date.now();
    var b = ensureBadge();
    if (!b) return;
    var t = b.querySelector('.mlive-updated-text');
    var d = new Date(lastAt);
    if (t) t.textContent = 'Oxirgi yangilanish: ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    b.classList.remove('mlive-busy', 'mlive-stale');
    clearTimeout(staleTimer);
    /* 2.5 daqiqa jim qolsa — ko'rsatkich qizaradi */
    staleTimer = setTimeout(function () { b.classList.add('mlive-stale'); }, 150000);
  }

  /* ---------------- skanerlash ---------------- */
  function scan(node) {
    if (!node || node.nodeType !== 1) return;

    if (node.matches(VALUE_SEL)) watchValue(node);
    Array.prototype.forEach.call(node.querySelectorAll(VALUE_SEL), watchValue);

    if ((node.tagName || '').toLowerCase() === 'svg') drawSvg(node);
    else Array.prototype.forEach.call(node.querySelectorAll('svg'), drawSvg);

    if (node.matches('.tip, [data-mlive-tip]')) tipShim(node);
    Array.prototype.forEach.call(node.querySelectorAll('.tip, [data-mlive-tip]'), tipShim);

    if (node.matches('.bar')) animateBar(node);
    Array.prototype.forEach.call(node.querySelectorAll('.bar'), animateBar);
    if (node.matches('tbody tr')) animateRow(node);
    Array.prototype.forEach.call(node.querySelectorAll('tbody tr'), animateRow);

    /* keng jadvallar telefonda sahifani yon tomonga surmasin */
    if (node.tagName === 'TABLE') wrapTable(node);
    Array.prototype.forEach.call(node.querySelectorAll('table'), wrapTable);
  }

  /* ---------------- ishga tushirish ---------------- */
  function init() {
    if (!document.body) return;

    /* ma'lumot kelguncha skeleton — layout shift bo'lmasin */
    Array.prototype.forEach.call(document.querySelectorAll(VALUE_SEL), function (el) {
      var p = parseValue(el.textContent);
      if (!p || p.value === 0) skeleton(el);     /* "0" / "—" hali haqiqiy ma'lumot emas */
    });
    Array.prototype.forEach.call(document.querySelectorAll(SKEL_CONTAINERS), skeletonFill);

    scan(document.body);
    ensureBadge();
    mobileNav();

    /* boshlang'ich kartalar uchun stagger */
    var seen = [];
    Array.prototype.forEach.call(document.querySelectorAll(CARD_SEL), function (card) {
      var p = card.parentElement;
      if (p && seen.indexOf(p) < 0) { seen.push(p); staggerContainer(p); }
    });

    /* keyin qo'shiladigan elementlar: jadval, grafik, xodim kartalari */
    var root = new MutationObserver(function (muts) {
      var parents = [];
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n || n.nodeType !== 1) continue;
          scan(n);
          if (n.matches(CARD_SEL) && n.parentElement && parents.indexOf(n.parentElement) < 0) {
            parents.push(n.parentElement);
          }
        }
      }
      parents.forEach(staggerContainer);
    });
    root.observe(document.body, { childList: true, subtree: true });

    /* 6 soniyada ma'lumot kelmasa skeleton olib tashlanadi (bo'sh baza holati) */
    setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('.mlive-skel'), function (el) {
        el.classList.remove('mlive-skel');
      });
      /* barcha qiymat 0 bo'lsa hech qanday o'zgarish bo'lmaydi — baribir
         vaqtni yozamiz, aks holda "Yangilanmoqda…" abadiy qolib ketadi */
      if (!lastAt) touch();
    }, 6000);
  }

  /* Plan / Fakt barcha dashboard sahifalarida bir xil navigatsiyada ko‘rinsin. */
  document.querySelectorAll('nav').forEach(function (nav) {
    if (nav.querySelector('a[href="/mfactor_plan_fact.html"]')) return;
    var link = document.createElement('a');
    link.href = '/mfactor_plan_fact.html';
    link.textContent = '▥  Plan / Fakt';
    if (location.pathname === '/mfactor_plan_fact.html') link.className = 'active';
    nav.appendChild(link);
  });

  var MLive = {
    bar: bar,
    mobileNav: mobileNav,
    touch: touch,
    stagger: staggerContainer,
    parseValue: parseValue,
    format: format,
    reduced: reduced,
    lastUpdate: function () { return lastAt; }
  };
  global.MLive = MLive;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
