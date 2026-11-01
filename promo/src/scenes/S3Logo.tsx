import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, FONT } from '../brand';
import { clamp, easeOut, rise } from '../anim';
import { Logo, Wordmark } from '../components/Logo';

// 7–9,5 dtk: layar terbuka menjadi terang, logo tergambar seperti layar pembuka situs
export const S3Logo: React.FC = () => {
    const f = useCurrentFrame();
    const r = interpolate(f, [0, 16], [0, 1300], { ...clamp, easing: easeOut });
    const ul = interpolate(f, [30, 44], [0, 1], { ...clamp, easing: easeOut });
    return (
        <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', left: 960 - r, top: 540 - r, width: r * 2, height: r * 2, borderRadius: '50%', background: C.canvas }} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
                    <Logo size={150} animated delay={2} />
                    <div style={rise(f, 22, 14, 30)}><Wordmark size={96} underline={ul} /></div>
                </div>
                <div style={{ marginTop: 40, fontSize: 40, color: C.muted, ...rise(f, 38) }}>Berdasarkan koordinat, cepat dan akurat</div>
            </div>
        </AbsoluteFill>
    );
};
