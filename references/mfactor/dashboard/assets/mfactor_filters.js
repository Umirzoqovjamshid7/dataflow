/* MFactor dashboard — barcha sahifalar uchun umumiy davr (sana) filtri.
 *
 * Nima uchun umumiy fayl: ilgari har sahifada ikkita bo'sh <input type="date">
 * turardi, foydalanuvchi har safar ikkala sanani qo'lda terib, "Ko'rsatish"
 * tugmasini bosishi kerak edi. Endi tayyor davrlar (Bugun, 7 kun, Bu oy, ...)
 * bir bosishda qo'llanadi va tanlangan davr sahifalar orasida saqlanadi.
 *
 * Sahifa faqat shuni qiladi:
 *   const period = MFilter.mount(document.getElementById('periodBar'), load);
 *   ... fetch('/mfactor_api/...?' + new URLSearchParams(period.range()))
 *   ... javob kelgach: period.sync(d.start, d.end);
 */
(function () {
  const SAQLASH_KALITI = 'mfactor_period';
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const kun = (n) => new Date(Date.now() - n * 864e5);

  // "Butun davr" uchun yuborilgan sana faqat zaxira. Server `period=hammasi`
  // ni ko'rib, haqiqiy boshlanishni eng eski Bitrix lididan oladi.
  const PRESETS = [
    { key: 'bugun', label: 'Bugun', range: () => [iso(new Date()), iso(new Date())] },
    { key: 'kecha', label: 'Kecha', range: () => [iso(kun(1)), iso(kun(1))] },
    { key: '7kun', label: '7 kun', range: () => [iso(kun(6)), iso(new Date())] },
    { key: '30kun', label: '30 kun', range: () => [iso(kun(29)), iso(new Date())] },
    {
      key: 'buoy', label: 'Bu oy',
      range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; },
    },
    {
      key: 'otganoy', label: 'O‘tgan oy',
      range: () => {
        const n = new Date(), b = new Date(n.getFullYear(), n.getMonth() - 1, 1);
        return [iso(b), iso(new Date(n.getFullYear(), n.getMonth(), 0))];
      },
    },
    {
      key: 'buyil', label: 'Bu yil',
      range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)]; },
    },
    { key: 'hammasi', label: 'Butun davr', range: () => [iso(kun(1830)), iso(new Date())] },
  ];

  const STYLE = `
.periodBar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.periodBar .chips{display:flex;gap:4px;flex-wrap:wrap;background:#0c1729;border:1px solid #2c3d58;border-radius:8px;padding:3px}
.periodBar .chips button{background:none;border:0;color:#8fb0e6;font:inherit;font-size:11.5px;padding:6px 8px;border-radius:6px;cursor:pointer;white-space:nowrap}
.periodBar .chips button:hover{background:#17233a;color:#bdd3fa}
.periodBar .chips button[aria-pressed="true"]{background:#2a291e;color:#f0b90b;font-weight:700}
.periodBar .dates{display:flex;gap:6px;align-items:center}
.periodBar input[type=date]{background:#0c1729;color:#bdd3fa;border:1px solid #2c3d58;border-radius:8px;padding:6px 8px;font:inherit;font-size:11.5px;color-scheme:dark}
.periodBar input[type=date]:focus{outline:none;border-color:#f0b90b}
.periodBar .dash{color:#7190c2;font-size:12px}
.periodBar .reset{background:#0c1729;border:1px solid #2c3d58;color:#7190c2;border-radius:8px;padding:6px 10px;font:inherit;font-size:11.5px;cursor:pointer}
.periodBar .reset:hover{border-color:#f0b90b;color:#f0b90b}
.periodNote{color:#7190c2;font-size:11px;margin-top:6px}
@media(max-width:800px){.app>main{min-width:0}.periodBar,.mfilterHost{width:100%;max-width:100%;min-width:0;align-self:stretch}.periodBar .chips{width:100%}.periodBar .chips button{flex:1 1 auto;text-align:center}.periodBar .dates{flex:1 1 100%}.periodBar input[type=date]{flex:1;min-width:0}.periodBar .reset{flex:0 0 auto}.mfilterHost select{flex:1 1 100%;width:100%}}
`;

  function ensureStyle() {
    if (document.getElementById('mfilterStyle')) return;
    const el = document.createElement('style');
    el.id = 'mfilterStyle';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function saqlanganDavr() {
    // URL ustun turadi: havola bilan ulashilgan davr saqlangan tanlovni bosadi
    const q = new URLSearchParams(location.search);
    if (q.get('from') && q.get('to')) return { from: q.get('from'), to: q.get('to'), preset: q.get('period') || '' };
    if (q.get('period')) return { preset: q.get('period') };
    try {
      const saved = JSON.parse(localStorage.getItem(SAQLASH_KALITI) || 'null');
      if (saved && saved.from && saved.to) return saved;
    } catch (e) { /* buzuq qiymat — standart davrga tushamiz */ }
    return null;
  }

  function mount(host, onApply, options) {
    ensureStyle();
    const cfg = options || {};
    const defaultPreset = cfg.defaultPreset || '30kun';
    const presets = PRESETS.filter((p) => !cfg.hide || cfg.hide.indexOf(p.key) < 0);

    host.classList.add('periodBar');
    // Ota blok ham kichik ekranda to'liq kenglikka yoyilsin — aks holda
    // ustun (column) joylashuvida tugmalar ekrandan chiqib ketardi
    if (host.parentElement) host.parentElement.classList.add('mfilterHost');
    host.innerHTML =
      '<div class="chips">' +
      presets.map((p) => `<button type="button" data-preset="${p.key}" aria-pressed="false">${p.label}</button>`).join('') +
      '</div><div class="dates"><input type="date" class="pFrom" aria-label="Boshlanish sanasi">' +
      '<span class="dash">–</span><input type="date" class="pTo" aria-label="Tugash sanasi"></div>' +
      '<button type="button" class="reset" title="Standart davrga qaytarish">Tozalash</button>';

    const from = host.querySelector('.pFrom'), to = host.querySelector('.pTo');
    let quiet = false;   // sync() paytida onApply qayta chaqirilmasin
    let selectedPreset = '';
    let pending = null;  // oxirgi so'ralgan davr — kechikkan javobni tanish uchun
    let debounce = 0;

    function markPresets() {
      const cur = [from.value, to.value].join('|');
      host.querySelectorAll('[data-preset]').forEach((b) => {
        const p = presets.find((x) => x.key === b.dataset.preset);
        b.setAttribute('aria-pressed', String(
          selectedPreset === p.key || (!selectedPreset && p.range().join('|') === cur)
        ));
      });
    }

    function apply(save) {
      markPresets();
      if (save !== false) {
        const active = host.querySelector('[data-preset][aria-pressed="true"]');
        try {
          localStorage.setItem(SAQLASH_KALITI, JSON.stringify({
            from: from.value, to: to.value,
            preset: selectedPreset || (active ? active.dataset.preset : ''),
          }));
        } catch (e) { /* localStorage o'chirilgan bo'lsa ham filtr ishlayveradi */ }
      }
      if (!quiet) onApply();
    }

    function setRange(a, b, save) {
      from.value = a; to.value = b;
      apply(save);
    }

    host.querySelectorAll('[data-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        const p = presets.find((x) => x.key === b.dataset.preset);
        selectedPreset = p.key;
        setRange(...p.range());
      });
    });
    // Sana o'zgarishi darhol qo'llanadi — "Ko'rsatish" tugmasini kutmaydi.
    // Kichik kechikish: boshlanish va tugash sanasi ketma-ket kiritilganda
    // ikki o'rniga bitta so'rov ketsin.
    [from, to].forEach((el) => el.addEventListener('change', () => {
      selectedPreset = '';
      clearTimeout(debounce);
      debounce = setTimeout(() => apply(), 350);
    }));
    host.querySelector('.reset').addEventListener('click', () => {
      try { localStorage.removeItem(SAQLASH_KALITI); } catch (e) { /* e'tiborsiz */ }
      // Avval sahifaning o'z filtrlari tozalansin, keyin davr qo'llanadi —
      // aks holda so'rov eski xodim/holat tanlovi bilan ketardi
      if (cfg.onReset) cfg.onReset();
      const p = presets.find((x) => x.key === defaultPreset) || presets[0];
      selectedPreset = p.key;
      setRange(...p.range());
    });

    const saved = saqlanganDavr();
    // Saqlangan tanlov tayyor davr bo'lsa (masalan "Bugun"), sanalar qaytadan
    // hisoblanadi — aks holda ertaga ochilganda kechagi sana qotib qolardi
    const savedPreset = saved && presets.find((x) => x.key === saved.preset);
    selectedPreset = savedPreset ? savedPreset.key : (!saved ? defaultPreset : '');
    const boshlangich = savedPreset
      ? savedPreset.range()
      : saved
        ? [saved.from, saved.to]
        : (presets.find((x) => x.key === defaultPreset) || presets[0]).range();
    from.value = boshlangich[0];
    to.value = boshlangich[1];
    markPresets();

    return {
      range() {
        pending = [from.value, to.value];
        return { from: from.value, to: to.value, period: selectedPreset };
      },
      // Server davrni qisqartirgan yoki teskari sanalarni almashtirgan bo'lsa,
      // maydonlar haqiqiy qo'llangan davrni ko'rsatsin. Lekin javob kechikib
      // kelgan bo'lsa (foydalanuvchi allaqachon boshqa sana kiritgan)
      // yozmaymiz — aks holda eski javob yangi tanlovni bosib ketardi.
      sync(a, b) {
        const eskirgan = !pending || pending[0] !== from.value || pending[1] !== to.value;
        if (eskirgan || !a || !b || (a === from.value && b === to.value)) { markPresets(); return; }
        quiet = true;
        setRange(a, b);
        quiet = false;
      },
      reload: onApply,
    };
  }

  window.MFilter = { mount, PRESETS };
})();

/* ---------------------------------------------------------------------------
 * Tooltip'ni majburan yopish — barcha sahifalar uchun umumiy "himoya to'ri".
 *
 * Muammo (2026-09-03): sichqoncha grafikdan olinganda tooltip ba'zan joyida
 * qotib qolardi. Har bir grafik o'z elementiga `pointerleave` osgan, lekin u
 * quyidagi hollarda UMUMAN ishlamaydi:
 *   - element o'chib ketsa (60 soniyalik avtoyangilanish, filtr almashishi) —
 *     yo'q bo'lgan elementdan `pointerleave` chiqmaydi;
 *   - sichqoncha juda tez chiqib ketsa yoki brauzer oynasidan chiqsa;
 *   - sahifa aylantirilsa yoki boshqa oynaga o'tilsa.
 *
 * Shuning uchun: sichqoncha SVG ustida bo'lmasa — hamma tooltip yopiladi.
 * Sahifalarda ikki xil mexanizm bor (biri `.on` klassi, biri `display`),
 * shuning uchun ikkalasi ham hisobga olinadi.
 * ------------------------------------------------------------------------- */
(function () {
  function yop() {
    var tips = document.querySelectorAll('.tip, .callTip');
    for (var i = 0; i < tips.length; i++) {
      tips[i].classList.remove('on');                 /* opacity bilan ishlaydiganlar */
      if (tips[i].style.display === 'block') {        /* display bilan ishlaydiganlar */
        tips[i].style.display = 'none';
      }
    }
    /* nuqtani ko'rsatib turgan punktir chiziq ham qolib ketmasin */
    var guides = document.querySelectorAll('.guide');
    for (var j = 0; j < guides.length; j++) guides[j].style.display = 'none';
  }

  /* Sichqoncha grafik ustida bo'lsa tegmaymiz — sahifaning o'z kodi boshqaradi.
     Ushlash bosqichida (capture) tinglaymiz, shunda grafik o'z tooltip'ini
     ko'rsatishidan OLDIN ishlaymiz va uni o'chirib qo'ymaymiz. */
  document.addEventListener('pointermove', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('svg')) return;
    yop();
  }, true);

  document.addEventListener('pointerleave', yop);
  document.addEventListener('pointercancel', yop);
  window.addEventListener('blur', yop);
  window.addEventListener('scroll', yop, true);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) yop();
  });

  window.MTip = { yop: yop };
})();

/* ---------------------------------------------------------------------------
 * Portal sessiyasi tugaganini tutish.
 *
 * Muammo (2026-09-03): sahifadagi hamma raqam "0" bo'lib qolardi, hech qanday
 * tushuntirishsiz. Sabab zanjiri:
 *   1. sessiya tugaydi;
 *   2. nginx `auth_request` /mfactor_api/... so'rovini login sahifasiga 302 qiladi;
 *   3. fetch yo'naltirishga O'ZI ergashadi va login HTML'ini 200 bilan qaytaradi;
 *   4. shuning uchun `r.ok` — TRUE, kod xatoni sezmaydi;
 *   5. `r.json()` "Unexpected token '<'" bilan yiqiladi;
 *   6. sahifadagi kartochkalar HTML'dagi "0" plaseholderida qolib ketadi.
 *
 * Endi bunday javob shu yerda tutiladi va foydalanuvchiga aniq sabab ko'rsatiladi.
 * ------------------------------------------------------------------------- */
(function () {
  const asl = window.fetch;
  if (!asl) return;
  let ochilgan = false;

  window.fetch = async function (kirish, ...qolgan) {
    const javob = await asl.call(this, kirish, ...qolgan);
    const yol = String((kirish && kirish.url) || kirish || '');
    if (!yol.includes('/mfactor_api/')) return javob;
    const turi = javob.headers.get('content-type') || '';
    // JSON kutgan joyda HTML kelsa yoki so'rov boshqa manzilga ko'chgan bo'lsa —
    // bu ma'lumot emas, login sahifasi.
    if (javob.redirected || (javob.ok && !turi.includes('json'))) {
      korsat(javob.url || '/dash/mfactor');
      throw new Error('Portal sessiyasi tugagan — qayta kirish kerak');
    }
    return javob;
  };

  function korsat(manzil) {
    if (ochilgan) return;
    ochilgan = true;
    const qatlam = document.createElement('div');
    qatlam.setAttribute('role', 'alertdialog');
    qatlam.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;' +
      'background:#07101fdd;backdrop-filter:blur(3px);font:14px/1.5 "Segoe UI",Arial,sans-serif';
    const quti = document.createElement('div');
    quti.style.cssText =
      'max-width:380px;margin:20px;padding:26px 28px;text-align:center;color:#f5f7ff;' +
      'background:#0d192d;border:1px solid #433821;border-radius:12px;box-shadow:0 20px 60px #000a';
    const sarlavha = document.createElement('div');
    sarlavha.textContent = 'Sessiya tugadi';
    sarlavha.style.cssText = 'font-size:17px;font-weight:700;margin-bottom:8px';
    const matn = document.createElement('p');
    matn.textContent =
      'Portalga kirish muddati tugagani uchun ma’lumot yuklanmadi. ' +
      'Sahifadagi raqamlar shu sababdan 0 ko‘rinmoqda.';
    matn.style.cssText = 'margin:0 0 18px;color:#8fa9d4;font-size:12.5px';
    const tugma = document.createElement('button');
    tugma.type = 'button';
    tugma.textContent = 'Qayta kirish';
    tugma.style.cssText =
      'background:#2a291e;color:#f0b90b;border:1px solid #433821;border-radius:8px;' +
      'padding:10px 22px;font:inherit;font-weight:600;cursor:pointer';
    tugma.addEventListener('click', () => {
      // Dashboard portal ichida iframe'da ochiladi — login yuqori oynada ochilsin
      try { (window.top || window).location.href = manzil; }
      catch (e) { window.location.href = manzil; }
    });
    quti.append(sarlavha, matn, tugma);
    qatlam.appendChild(quti);
    (document.body || document.documentElement).appendChild(qatlam);
  }
})();
