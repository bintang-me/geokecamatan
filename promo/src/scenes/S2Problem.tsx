import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { clamp, rise } from '../anim';

// Format campur aduk seperti di lembar kerja sungguhan
const MESSY = [
    "6°14'52\"S 106°52'40\"E", '6.9175 LS, 107.6191 BT', '-62088, 1068456', '106.8456, -6.2088',
    '-6,9839; 110,4106', '"-7.2459","112.7378"', "3°34'31\"N 98°41'01\"E", '5,5536; 95,3173',
    'S 0.3051 E 100.3696', '-51341, 1194053', '107.6188, -6.9025', "7o15'45\"S 112o44'16\"E",
];
const BAD = new Set([2, 5, 9, 14, 19, 23, 28]);

// 3–7 dtk: lembar kerja bergulir, beberapa sel berkedip merah
export const S2Problem: React.FC = () => {
    const f = useCurrentFrame();
    const scroll = interpolate(f, [0, 120], [0, -520], clamp);
    const count = Math.round(interpolate(f, [8, 100], [12, 216], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) }));
    const rows = Array.from({ length: 30 }, (_, i) => i);
    return (
        <AbsoluteFill style={{ fontFamily: FONT }}>
            {/* lembar kerja miring */}
            <div style={{ position: 'absolute', left: 980, top: -40, width: 860, height: 1200, transform: 'perspective(1600px) rotateY(-14deg) rotateZ(2deg)', transformOrigin: 'left center', ...rise(f, 0, 16, 60) }}>
                <div style={{ transform: `translateY(${scroll}px)` }}>
                    {rows.map(i => {
                        const bad = BAD.has(i);
                        const flash = bad ? interpolate((f + i * 7) % 40, [0, 10, 20], [0.15, 1, 0.15], clamp) : 0;
                        return (
                            <div key={i} style={{ display: 'flex', height: 64, borderBottom: `1px solid ${C.dLine}` }}>
                                <div style={{ width: 70, color: C.dMuted, fontFamily: MONO, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${C.dLine}`, background: '#101a2c' }}>{i + 1}</div>
                                <div style={{
                                    flex: 1, display: 'flex', alignItems: 'center', padding: '0 24px', fontFamily: MONO, fontSize: 28, color: C.dInk,
                                    background: bad ? `rgba(242,103,91,${0.18 * flash})` : C.dSurface,
                                    boxShadow: bad ? `inset 0 0 0 2px rgba(242,103,91,${0.9 * flash})` : 'none',
                                }}>{MESSY[i % MESSY.length]}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${C.dCanvas} 46%, rgba(11,18,32,0) 70%)` }} />
            <div style={{ position: 'absolute', left: 140, top: 330, width: 820 }}>
                <div style={{ fontSize: 76, fontWeight: 700, color: C.dInk, letterSpacing: -1.2, lineHeight: 1.12, ...rise(f, 6) }}>Bingung, format<br />datanya campur aduk.</div>
                <div style={{ fontSize: 76, fontWeight: 700, color: C.dGold, letterSpacing: -1.2, lineHeight: 1.12, marginTop: 14, ...rise(f, 30) }}>Datanya ratusan baris.</div>
                <div style={{ marginTop: 40, fontFamily: MONO, fontSize: 30, color: C.dMuted, ...rise(f, 40) }}>{count} baris</div>
            </div>
        </AbsoluteFill>
    );
};
