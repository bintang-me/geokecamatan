import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { clamp, pop, rise } from '../anim';
import { useVertical } from '../layout';
import { BG_POINTS, LANDMARKS, MAP_H, MAP_W, PROVINCE_PATHS } from '../data/indonesia';

export const S6_CUES = { rowsStart: 26, rowStep: 8, chips: 102, download: 116 };
const fixed = (l: { raw: string; lat: number; lon: number }) => l.raw !== `${l.lat}, ${l.lon}`;
const N_FIXED = LANDMARKS.filter(fixed).length;
// 8 titik contoh tampil sebagai 8 data terakhir dari daftar panjang
const PREV = BG_POINTS.length;            // 208 data sebelumnya (sudah selesai)
const TOTAL = PREV + LANDMARKS.length;    // 216
const PREV_FIXED = 37;                    // ilustrasi: sebagian data sebelumnya juga dirapikan

// 20–25 dtk: tabel Cari Massal terisi, pin berjatuhan di peta Indonesia
export const S6Batch: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const V = useVertical();
    const done = LANDMARKS.filter((_, i) => f >= S6_CUES.rowsStart + i * S6_CUES.rowStep).length;
    const prog = (PREV + done) / TOTAL;
    const fixedDone = PREV_FIXED + LANDMARKS.slice(0, done).filter(fixed).length;
    const dl = interpolate(f, [S6_CUES.download, S6_CUES.download + 4, S6_CUES.download + 12], [1, 0.94, 1], clamp);
    const glow = interpolate(f, [S6_CUES.download, S6_CUES.download + 20], [0.55, 0], clamp);
    return (
        <AbsoluteFill style={{ fontFamily: FONT }}>
            <div style={{ position: 'absolute', left: V ? 70 : 120, top: V ? 250 : 70, width: V ? 940 : undefined }}>
                <div style={{ fontSize: 66, fontWeight: 700, color: C.ink, letterSpacing: -1.1, ...rise(f, 2) }}>Ratusan titik sekaligus</div>
                <div style={{ fontSize: V ? 30 : 34, lineHeight: 1.4, color: C.muted, marginTop: 10, ...rise(f, 12) }}>Setiap baris boleh berbeda format, hasilnya bisa disalin atau diunduh</div>
            </div>
            {/* kartu tabel */}
            <div style={{ position: 'absolute', left: V ? 70 : 120, top: V ? 470 : 270, width: V ? 940 : 1060, padding: V ? '24px 26px' : '28px 34px', borderRadius: 30, background: C.surface, border: `1.5px solid ${C.line}`, boxShadow: '0 20px 50px rgba(15,29,53,.10)', ...rise(f, 6, 14, 30) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: V ? 10 : 14, flexWrap: 'nowrap' }}>
                    <span style={{ fontSize: V ? 26 : 30, fontWeight: 600, color: C.ink, marginRight: V ? 2 : 8 }}>Hasil</span>
                    {[['Semua', TOTAL, null], ['Ditemukan', TOTAL, C.success], ['Dirapikan otomatis', PREV_FIXED + N_FIXED, C.gold]].map(([k, n, dot], i) => {
                        const p = pop(f, fps, S6_CUES.chips + i * 4);
                        return <span key={String(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: V ? 7 : 9, fontSize: V ? 17 : 21, padding: V ? '6px 11px' : '7px 15px', borderRadius: 999, whiteSpace: 'nowrap', border: `1.5px solid ${C.line}`, color: C.ink, transform: `scale(${p})`, opacity: p }}>
                            {dot && <span style={{ width: 10, height: 10, borderRadius: '50%', background: String(dot) }} />}{k} <b style={{ fontWeight: 600 }}>{n}</b></span>;
                    })}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: V ? 8 : 10, fontSize: V ? 18 : 22, fontWeight: 600, padding: V ? '10px 14px' : '12px 20px', borderRadius: 14, whiteSpace: 'nowrap', background: C.ink, color: '#fff', transform: `scale(${dl})`, boxShadow: `0 0 0 ${10 * glow}px rgba(238,162,1,${glow})`, opacity: interpolate(f, [S6_CUES.chips, S6_CUES.chips + 8], [0, 1], clamp) }}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>Unduh CSV
                    </span>
                </div>
                {/* progress */}
                <div style={{ marginTop: 22, height: 8, borderRadius: 99, background: C.lineSoft, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', background: C.ink, transform: `scaleX(${prog})`, transformOrigin: 'left', transition: 'none' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 20, color: C.muted }}>
                    <span>{done < LANDMARKS.length ? 'Memproses' : 'Selesai'}</span>
                    <span style={{ fontFamily: MONO, color: C.ink, fontWeight: 500 }}>{PREV + done} / {TOTAL}</span>
                </div>
                <div style={{ display: 'flex', fontSize: 20, color: C.muted, fontWeight: 500, padding: '18px 8px 10px', borderBottom: `1.5px solid ${C.line}` }}>
                    <span style={{ width: 50 }}>No.</span><span style={{ width: 300, paddingLeft: 12 }}>Koordinat</span><span style={{ width: V ? undefined : 220, flex: V ? 1 : undefined }}>Kecamatan</span>{!V && <span style={{ flex: 1 }}>Kab./Kota</span>}<span style={{ width: 130 }}>Status</span>
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
                            <span style={{ width: 50, color: C.muted }}>{PREV + i + 1}</span>
                            <span style={{ width: 300, paddingLeft: 12, fontFamily: MONO, fontSize: 20, color: C.ink, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                                {l.lat}, {l.lon}
                                {fixed(l) && <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#FDF6E3', color: C.goldText, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>}
                            </span>
                            <span style={{ width: V ? undefined : 220, flex: V ? 1 : undefined, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{l.kec}</span>
                            {!V && <span style={{ flex: 1, color: C.ink, whiteSpace: 'nowrap' }}>{l.kab}</span>}
                            <span style={{ width: 130 }}><span style={{ fontSize: 18, fontWeight: 600, color: C.successText, background: C.successBg, padding: '5px 12px', borderRadius: 999 }}>Ditemukan</span></span>
                        </div>
                    );
                })}
            </div>
            {/* peta (Indonesia bagian barat–tengah, tempat semua titik berada) */}
            <div style={{ position: 'absolute', left: V ? 70 : 1210, top: V ? 1150 : 270, width: V ? 560 : 590, height: V ? 300 : 372, borderRadius: 30, background: '#E9EEF1', border: `1.5px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 20px 50px rgba(15,29,53,.10)', ...rise(f, 10, 14, 30) }}>
                <svg viewBox={`-14 -40 ${MAP_W + 28} ${MAP_H + 70}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
                    {PROVINCE_PATHS.map((d, i) => <path key={i} d={d} fill="#FBFAF7" stroke="#D6DBE2" strokeWidth={1.1} strokeLinejoin="round" />)}
                    {/* 208 data sebelumnya: pin kecil yang sudah ada */}
                    {BG_POINTS.map(([x, y], i) => (
                        <path key={`b${i}`} d="M0 0 C-2.5 -4 -7 -8 -7 -12.5 A7 7 0 0 1 7 -12.5 C7 -8 2.5 -4 0 0 Z" transform={`translate(${x} ${y}) scale(0.75)`} fill={C.success} stroke="#fff" strokeWidth="1.6" opacity={0.85} />
                    ))}
                    {LANDMARKS.map((l, i) => {
                        const p = pop(f, fps, S6_CUES.rowsStart + i * S6_CUES.rowStep, 220);
                        return (
                            <g key={l.name} transform={`translate(${l.x} ${l.y - (1 - p) * 30})`} opacity={Math.min(1, p * 2)}>
                                <path d="M0 0 C-2.5 -4 -7 -8 -7 -12.5 A7 7 0 0 1 7 -12.5 C7 -8 2.5 -4 0 0 Z" fill={C.success} stroke="#fff" strokeWidth="1.4" transform="scale(1.7)" />
                                <circle cx="0" cy={-12.5 * 1.7} r={2.6 * 1.7} fill="rgba(255,255,255,.92)" />
                            </g>
                        );
                    })}
                </svg>
                <div style={{ position: 'absolute', left: 20, bottom: 18, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 12, background: 'rgba(255,255,255,.95)', fontSize: 19, color: C.ink }}>
                    <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.success }} />Ditemukan
                </div>
            </div>
            {/* ringkasan */}
            <div style={{ position: 'absolute', left: V ? 650 : 1210, top: V ? 1150 : 670, width: V ? 360 : 590, height: V ? 300 : undefined, padding: V ? '24px 24px' : '30px 36px', borderRadius: 30, background: C.surface, border: `1.5px solid ${C.line}`, boxShadow: '0 20px 50px rgba(15,29,53,.10)', ...rise(f, 14, 14, 30) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: V ? 22 : 26, fontWeight: 600, color: C.ink }}>Ringkasan</span>
                    <span style={{ fontFamily: MONO, fontSize: V ? 19 : 24, color: C.muted }}>{PREV + done} / {TOTAL}</span>
                </div>
                <div style={{ display: 'flex', gap: V ? 8 : 18, marginTop: V ? 18 : 22 }}>
                    {[[PREV + done, 'Ditemukan', C.success], [fixedDone, 'Dirapikan otomatis', C.goldText], [0, 'Gagal', C.muted]].map(([n, k, col]) => (
                        <div key={String(k)} style={{ flex: 1, padding: V ? '14px 10px' : '16px 18px', borderRadius: 18, background: C.canvas, minHeight: V ? 150 : undefined }}>
                            <div style={{ fontSize: V ? 40 : 54, fontWeight: 700, color: String(col), lineHeight: 1 }}>{n}</div>
                            <div style={{ fontSize: V ? 16 : 19, color: C.muted, marginTop: 8, lineHeight: 1.3 }}>{k}</div>
                        </div>
                    ))}
                </div>
            </div>
        </AbsoluteFill>
    );
};
