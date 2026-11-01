import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { clamp, rise } from '../anim';
import { Logo, Wordmark } from '../components/Logo';

export const S8_CUES = { press: 40 };

// 27,5–30 dtk: ajakan mencoba
export const S8Cta: React.FC = () => {
    const f = useCurrentFrame();
    const press = interpolate(f, [S8_CUES.press, S8_CUES.press + 4, S8_CUES.press + 10], [1, 0.94, 1], clamp);
    const cursor = interpolate(f, [16, S8_CUES.press], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
    return (
        <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 34, ...rise(f, 0, 14, 20) }}>
                    <Logo size={150} edge="#2C3B57" />
                    <Wordmark size={96} color={C.dInk} />
                </div>
                <div style={{ marginTop: 40, fontSize: 40, color: C.dMuted, ...rise(f, 6) }}>Dari koordinat ke kecamatan, dalam hitungan detik.</div>
                <div style={{ marginTop: 64, display: 'flex', alignItems: 'center', gap: 18, padding: 12, paddingLeft: 40, borderRadius: 999, background: C.dSurface, border: `2px solid ${C.dLine}`, position: 'relative', ...rise(f, 12) }}>
                    <span style={{ fontFamily: MONO, fontSize: 40, color: C.dInk }}>carikecamatan.vercel.app</span>
                    <span style={{ fontSize: 36, fontWeight: 600, color: C.ink, background: C.dGold, padding: '20px 40px', borderRadius: 999, transform: `scale(${press})`, boxShadow: '0 10px 30px rgba(245,180,40,.3)' }}>Coba sekarang</span>
                    {/* kursor menuju tombol */}
                    <svg viewBox="0 0 24 24" width="52" height="52" style={{ position: 'absolute', right: 70 - 0 * cursor, top: 70 + (1 - cursor) * 140, opacity: cursor, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.5))' }}>
                        <path d="M5 3l14 8-6 1.5L10 19z" fill="#fff" stroke={C.ink} strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: 54, fontSize: 24, color: '#8592A8', ...rise(f, 18, 12, 8) }}>Acuan informatif, bukan untuk keperluan hukum yang mengikat.</div>
        </AbsoluteFill>
    );
};
