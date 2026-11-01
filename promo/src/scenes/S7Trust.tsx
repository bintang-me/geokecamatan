import React from 'react';
import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { clamp, pop } from '../anim';
import { Logo, Wordmark } from '../components/Logo';

export const S7_CUES = { chips: [4, 12, 20], toggle: 36 };

// 25–27,5 dtk: tiga nilai kepercayaan + tampilan situs berganti ke mode gelap
export const S7Trust: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const d = interpolate(f, [S7_CUES.toggle, S7_CUES.toggle + 12], [0, 1], clamp);
    const col = (a: string, b: string) => interpolateColors(d, [0, 1], [a, b]);
    const press = interpolate(f, [S7_CUES.toggle - 2, S7_CUES.toggle + 2, S7_CUES.toggle + 8], [1, 0.88, 1], clamp);
    const chips = ['Gratis', 'Tanpa daftar', 'Unduh CSV'];
    return (
        <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center' }}>
            <div style={{ position: 'absolute', top: 110, display: 'flex', gap: 26 }}>
                {chips.map((t, i) => {
                    const p = pop(f, fps, S7_CUES.chips[i], 170);
                    return <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 16, fontSize: 40, fontWeight: 600, padding: '20px 34px', borderRadius: 999, background: col(C.surface, C.dSurface), color: col(C.ink, C.dInk), border: `2px solid ${col(C.line, C.dLine)}`, boxShadow: '0 10px 30px rgba(15,29,53,.12)', transform: `scale(${p})`, opacity: p }}>
                        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke={col(C.success, '#6EDDA6')} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{t}</span>;
                })}
            </div>
            {/* tiruan tampilan situs */}
            <div style={{ position: 'absolute', top: 290, width: 1440, height: 660, borderRadius: 30, overflow: 'hidden', background: col(C.canvas, C.dCanvas), border: `2px solid ${col(C.line, C.dLine)}`, boxShadow: '0 40px 90px rgba(0,0,0,.25)' }}>
                <div style={{ height: 96, display: 'flex', alignItems: 'center', gap: 18, padding: '0 44px', background: col(C.surface, '#111A2B'), borderBottom: `2px solid ${col(C.line, C.dLine)}` }}>
                    <Logo size={52} edge={d > 0.5 ? '#2C3B57' : undefined} />
                    <Wordmark size={32} color={col(C.ink, C.dInk)} />
                    <div style={{ margin: '0 auto', display: 'flex', gap: 6, padding: 6, borderRadius: 14, background: col(C.lineSoft, '#1C2639') }}>
                        <span style={{ fontSize: 22, fontWeight: 600, padding: '10px 22px', borderRadius: 10, background: col(C.surface, C.dSurface), color: col(C.ink, C.dInk) }}>Cari Tunggal</span>
                        <span style={{ fontSize: 22, fontWeight: 500, padding: '10px 22px', color: col(C.muted, C.dMuted) }}>Cari Massal</span>
                    </div>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', border: `2px solid ${col(C.line, C.dLine)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${press})`, background: col(C.surface, C.dSurface) }}>
                        {d < 0.5
                            ? <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" /></svg>
                            : <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke={C.dGold} strokeWidth="2" strokeLinecap="round" style={{ transform: `rotate(${(1 - d) * -60}deg)` }}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>}
                    </div>
                </div>
                <div style={{ padding: '64px 70px' }}>
                    <div style={{ fontSize: 58, fontWeight: 700, color: col(C.ink, C.dInk), letterSpacing: -1 }}>Temukan Kecamatan dari Titik Koordinat</div>
                    <div style={{ fontSize: 26, color: col(C.muted, C.dMuted), marginTop: 16 }}>Ketik atau tempel koordinat dalam format desimal maupun DMS</div>
                    <div style={{ display: 'flex', gap: 18, marginTop: 44 }}>
                        <div style={{ flex: 1, height: 92, borderRadius: 20, background: col(C.surface, C.dSurface), border: `2px solid ${col(C.line, C.dLine)}`, display: 'flex', alignItems: 'center', padding: '0 30px', fontFamily: MONO, fontSize: 34, color: col(C.ink, C.dInk) }}>-6.1754, 106.8272</div>
                        <div style={{ height: 92, padding: '0 40px', borderRadius: 20, background: col(C.gold, C.dGold), color: C.ink, fontSize: 30, fontWeight: 600, display: 'flex', alignItems: 'center' }}>Cari kecamatan</div>
                    </div>
                </div>
            </div>
        </AbsoluteFill>
    );
};
