/* =========================================================
   Cari Kecamatan — Tema terang/gelap
   Tema awal dipasang oleh skrip kecil di <head> (tanpa kilatan putih).
   Bawaan mengikuti pengaturan perangkat; pilihan manual disimpan di
   peramban ini saja (localStorage "ck_theme").
   ========================================================= */
(function () {
    const KEY = 'ck_theme';
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const META = { light: '#0F1D35', dark: '#0B1220' };

    const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
    const current = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

    function syncButtons() {
        const dark = current() === 'dark';
        document.querySelectorAll('.theme-toggle').forEach(b => {
            const label = dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap';
            b.setAttribute('aria-label', label);
            b.title = label;
            b.setAttribute('aria-pressed', dark ? 'true' : 'false');
        });
    }

    function apply(theme, animate) {
        if (theme === current()) return;
        const swap = () => {
            root.dataset.theme = theme;
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.content = META[theme];
            syncButtons();
            window.dispatchEvent(new CustomEvent('ck-themechange', { detail: { theme } }));
        };
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (animate && document.startViewTransition && !reduce) {
            const t = document.startViewTransition(swap); // pergantian tema memudar halus
            t.ready.catch(() => {}); t.finished.catch(() => {});
        } else {
            swap();
        }
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.theme-toggle');
        if (!btn) return;
        const next = current() === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch (err) { /* abaikan */ }
        apply(next, true);
    });

    // Tanpa pilihan manual: ikuti perubahan pengaturan perangkat
    media.addEventListener('change', (e) => { if (!saved()) apply(e.matches ? 'dark' : 'light', true); });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncButtons);
    else syncButtons();
})();
