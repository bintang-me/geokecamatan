import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { clamp, pop, rise } from '../anim';
import { BG_POINTS, LANDMARKS, MAP_H, MAP_W, PROVINCE_PATHS } from '../data/indonesia';

export const S6_CUES = { rowsStart: 20, rowStep: 8, download: 112 };
const fixed = (l: { raw: string; lat: number; lon: number }) => l.raw !== `${l.lat}, ${l.lon}`;
// 8 titik contoh tampil sebagai 8 data terakhir dari daftar panjang
const PREV = BG_POINTS.length;            // 208 data sebelumnya (sudah selesai)
const TOTAL = PREV + LANDMARKS.length;    // 216
const PIN = 'M0 0 C-2.5 -4 -7 -8 -7 -12.5 A7 7 0 0 1 7 -12.5 C7 -8 2.5 -4 0 0 Z';

// 20–25 dtk: satu fokus — angka 216 / 216 dan tombol Unduh CSV; tabel & peta sebagai pendukung
export const S6Batch: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const done = LANDMARKS.filter((_, i) => f >= S6_CUES.rowsStart + i * S6_CUES.rowStep).length;
    const count = PREV + done;
    const finished = done === LANDMARKS.length;
    const finishAt = S6_CUES.rowsStart + (LANDMARKS.length - 1) * S6_CUES.rowStep;
    const bump = finished ? pop(f, fps, finishAt, 260) : 0;
    const dl = interpolate(f, [S6_CUES.download, S6_CUES.download + 4, S6_CUES.download + 12], [1, 0.94, 1], clamp);
    const glow = interpolate(f, [S6_CUES.download, S6_CUES.download + 22], [0.6, 0], clamp);
    const dlIn = pop(f, fps, finishAt + 6);
    return (
        <AbsoluteFill style={{ fontFamily: FONT }}>
            <div style={{ position: 'absolute', left: 120, top: 76, fontSize: 66, fontWeight: 700, color: C.ink, letterSpacing: -1.1, ...rise(f, 2) }}>Ratusan titik sekaligus.</div>

            {/* tabel (pendukung): 8 data terakhir */}
            <div style={{ position: 'absolute', left: 120, top: 220, width: 1060, padding: '26px 34px 18px', borderRadius: 30, background: C.surface, border: `1.5px solid ${C.line}`, boxShadow: '0 20px 50px rgba(15,29,53,.10)', ...rise(f, 6, 14, 30) }}>
                <div style={{ display: 'flex', fontSize: 20, color: C.muted, fontWeight: 500, padding: '0 8px 12px', borderBottom: `1.5px solid ${C.line}` }}>
                    <span style={{ width: 62 }}>No.</span><span style={{ width: 300 }}>Koordinat</span><span style={{ width: 220 }}>Kecamatan</span><span style={{ flex: 1 }}>Kab./Kota</span><span style={{ width: 130 }}>Status</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 19, color: C.muted, padding: '11px 8px', borderBottom: `1.5px solid ${C.lineSoft}` }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                    <span>{PREV} baris sebelumnya selesai diproses</span>
                </div>
                {LANDMARKS.map((l, i) => {
                    const st = S6_CUES.rowsStart + i * S6_CUES.rowStep;
                    const o = interpolate(f, [st, st + 6], [0, 1], clamp);
                    return (
                        <div key={l.name} style={{ display: 'flex', alignItems: 'center', fontSize: 22, padding: '13px 8px', borderBottom: `1.5px solid ${C.lineSoft}`, opacity: o, background: o > 0 && f - st < 10 ? '#FDF6E3' : 'transparent' }}>
                            <span style={{ width: 62, color: C.muted }}>{PREV + i + 1}</span>
                            <span style={{ width: 300, fontFamily: MONO, fontSize: 20, color: C.ink, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                                {l.lat}, {l.lon}
                                {fixed(l) && <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#FDF6E3', color: C.goldText, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>}
                            </span>
                            <span style={{ width: 220, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{l.kec}</span>
                            <span style={{ flex: 1, color: C.ink, whiteSpace: 'nowrap' }}>{l.kab}</span>
                            <span style={{ width: 130 }}><span style={{ fontSize: 18, fontWeight: 600, color: C.successText, background: C.successBg, padding: '5px 12px', borderRadius: 999 }}>Ditemukan</span></span>
                        </div>
                    );
                })}
            </div>

            {/* peta: ratusan pin sudah ada, 8 pin baru jatuh */}
            <div style={{ position: 'absolute', left: 1210, top: 220, width: 590, height: 340, borderRadius: 30, background: '#E9EEF1', border: `1.5px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 20px 50px rgba(15,29,53,.10)', ...rise(f, 10, 14, 30) }}>
                <svg viewBox={`-14 -40 ${MAP_W + 28} ${MAP_H + 70}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
                    {PROVINCE_PATHS.map((d, i) => <path key={i} d={d} fill="#FBFAF7" stroke="#D6DBE2" strokeWidth={1.1} strokeLinejoin="round" />)}
                    {BG_POINTS.map(([x, y], i) => <path key={`b${i}`} d={PIN} transform={`translate(${x} ${y}) scale(0.75)`} fill={C.success} stroke="#fff" strokeWidth="1.6" opacity={0.85} />)}
                    {LANDMARKS.map((l, i) => {
                        const p = pop(f, fps, S6_CUES.rowsStart + i * S6_CUES.rowStep, 220);
                        return (
                            <g key={l.name} transform={`translate(${l.x} ${l.y - (1 - p) * 30})`} opacity={Math.min(1, p * 2)}>
                                <path d={PIN} fill={C.success} stroke="#fff" strokeWidth="1.4" transform="scale(1.7)" />
                                <circle cx="0" cy={-12.5 * 1.7} r={2.6 * 1.7} fill="rgba(255,255,255,.92)" />
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* fokus: hitungan besar + Unduh CSV */}
            <div style={{ position: 'absolute', left: 1210, top: 590, width: 590, height: 392, padding: '38px 44px', borderRadius: 30, background: C.surface, border: `1.5px solid ${C.line}`, boxShadow: '0 20px 50px rgba(15,29,53,.10)', display: 'flex', flexDirection: 'column', ...rise(f, 14, 14, 30) }}>
                <div style={{ fontSize: 26, fontWeight: 500, color: finished ? C.successText : C.muted }}>{finished ? 'Selesai' : 'Memproses…'}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 6, transform: `scale(${1 + 0.06 * bump * (1 - bump)})`, transformOrigin: 'left center' }}>
                    <span style={{ fontSize: 128, fontWeight: 800, color: C.ink, letterSpacing: -4, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                    <span style={{ fontSize: 48, fontWeight: 600, color: C.muted }}>/ {TOTAL} titik</span>
                </div>
                <div style={{ marginTop: 22, height: 10, borderRadius: 99, background: C.lineSoft, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', background: finished ? C.success : C.ink, transform: `scaleX(${count / TOTAL})`, transformOrigin: 'left' }} />
                </div>
                <div style={{ marginTop: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 14, fontSize: 32, fontWeight: 600, padding: '20px 34px', borderRadius: 18, background: C.ink, color: '#fff', transform: `scale(${dl * (0.9 + 0.1 * dlIn)})`, opacity: dlIn, boxShadow: `0 0 0 ${12 * glow}px rgba(238,162,1,${glow})` }}>
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>Unduh CSV
                </div>
            </div>
        </AbsoluteFill>
    );
};
