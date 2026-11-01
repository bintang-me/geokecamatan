import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { clamp, pop, rise } from '../anim';

export const HOOK_TEXT = '-6,1754; 106,8272';
export const HOOK_TYPE_START = 14;
export const HOOK_TYPE_STEP = 2.5;

// 0–3 dtk: koordinat diketik di kotak gelap, muncul tanda tanya
export const S1Hook: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const typed = Math.max(0, Math.min(HOOK_TEXT.length, Math.floor((f - HOOK_TYPE_START) / HOOK_TYPE_STEP) + 1));
    const caret = Math.floor(f / 8) % 2 === 0 ? 1 : 0;
    const q = pop(f, fps, 62, 180);
    const box = interpolate(f, [0, 12], [0, 1], clamp);
    return (
        <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 190, width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: 70, fontWeight: 700, color: C.dInk, letterSpacing: -1.1, ...rise(f, 4) }}>Punya titik koordinat,</div>
                <div style={{ fontSize: 70, fontWeight: 700, color: C.dGold, letterSpacing: -1.1, marginTop: 4, lineHeight: 1.18, ...rise(f, 16) }}>tapi masih harus mencari kecamatan<br />dan wilayah administrasi lainnya?</div>
            </div>
            <div style={{
                position: 'absolute', top: 640, display: 'flex', alignItems: 'center', gap: 22,
                width: 980, height: 120, padding: '0 40px', borderRadius: 26,
                background: C.dSurface, border: `2px solid ${C.dLine}`,
                boxShadow: '0 30px 80px rgba(0,0,0,.45)', opacity: box, transform: `scale(${0.96 + 0.04 * box})`,
            }}>
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={C.dMuted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <span style={{ fontFamily: MONO, fontSize: 50, color: C.dInk, letterSpacing: 1 }}>
                    {HOOK_TEXT.slice(0, typed)}
                    <span style={{ display: 'inline-block', width: 4, height: 54, marginLeft: 4, verticalAlign: -8, background: C.dGold, opacity: caret }} />
                </span>
                <div style={{
                    marginLeft: 'auto', width: 74, height: 74, borderRadius: '50%', background: C.dGold, color: C.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 50, fontWeight: 800,
                    transform: `scale(${q}) rotate(${(1 - q) * -40}deg)`,
                }}>?</div>
            </div>
        </AbsoluteFill>
    );
};
