// Token warna & huruf — sama dengan situs Cari Kecamatan (css/style.css)
export const C = {
    ink: '#0F1D35',
    canvas: '#F6F7F9',
    surface: '#FFFFFF',
    line: '#E6E8EC',
    lineSoft: '#EEF0F3',
    lineStrong: '#D5D9E0',
    muted: '#5B6577',
    gold: '#EEA201',
    goldText: '#9A6700',
    success: '#0F7B4A',
    successBg: '#E8F5EE',
    successText: '#0F6B41',
    danger: '#B42318',
    dangerBg: '#FBE4E2',
    violet: '#6D28D9',
    amber: '#E08A00',
    // mode gelap
    dCanvas: '#0B1220',
    dSurface: '#131C2E',
    dInk: '#E8EDF5',
    dLine: '#26324A',
    dMuted: '#A6B1C4',
    dGold: '#F5B428',
};

export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

// Pergantian adegan (frame, 30 fps) — tepat di ketukan musik 120 BPM (15 frame per ketukan)
export const SCENES = {
    hook: { from: 0, dur: 90 },
    problem: { from: 90, dur: 120 },
    logo: { from: 210, dur: 75 },
    single: { from: 285, dur: 165 },
    map: { from: 450, dur: 150 },
    batch: { from: 600, dur: 150 },
    trust: { from: 750, dur: 75 },
    cta: { from: 825, dur: 75 },
} as const;
