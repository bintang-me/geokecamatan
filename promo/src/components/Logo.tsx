import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../brand';
import { clamp, pop } from '../anim';

// Logo Cari Kecamatan (sama dengan favicon.svg). animated=true: cincin tergambar, pin jatuh, ekuator memudar.
export const Logo: React.FC<{ size: number; animated?: boolean; delay?: number; edge?: string }> = ({ size, animated = false, delay = 0, edge }) => {
    const frame = useCurrentFrame() - delay;
    const { fps } = useVideoConfig();
    const ring = animated ? interpolate(frame, [2, 26], [120, 0], clamp) : 0;
    const eq = animated ? interpolate(frame, [22, 34], [0, 0.5], clamp) : 0.5;
    const drop = animated ? pop(frame, fps, 10, 170) : 1;
    const pinY = (1 - drop) * -26;
    const pinO = animated ? interpolate(frame, [10, 14], [0, 1], clamp) : 1;
    return (
        <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
            <rect width="64" height="64" rx="16" fill={C.ink} stroke={edge || 'none'} strokeWidth={edge ? 1.5 : 0} />
            <ellipse cx="32" cy="38" rx="19" ry="5.5" fill="none" stroke={C.gold} strokeWidth="2" opacity={eq} />
            <circle cx="32" cy="34" r="19" fill="none" stroke={C.gold} strokeWidth="3" strokeDasharray="120" strokeDashoffset={ring} transform="rotate(-90 32 34)" />
            <g transform={`translate(0 ${pinY})`} opacity={pinO}>
                <path d="M32 47 C27 40 20.5 34 20.5 25.5 A11.5 11.5 0 0 1 43.5 25.5 C43.5 34 37 40 32 47 Z" fill={C.gold} stroke={C.ink} strokeWidth="3" paintOrder="stroke" />
                <path d="M27 23 L31 20 L36.5 21.5 L38 26 L34.5 30 L28.5 29.2 Z" fill={C.ink} />
            </g>
        </svg>
    );
};

// Tulisan "Cari Kecamatan" dengan garis bawah emas
export const Wordmark: React.FC<{ size: number; color?: string; underline?: number }> = ({ size, color = C.ink, underline = 1 }) => (
    <span style={{ fontSize: size, color, letterSpacing: -0.3 * (size / 40), whiteSpace: 'nowrap', lineHeight: 1.1 }}>
        <span style={{ fontWeight: 500 }}>Cari </span>
        <span style={{ fontWeight: 700, position: 'relative', display: 'inline-block' }}>
            Kecamatan
            <span style={{ position: 'absolute', left: 0, bottom: -size * 0.08, height: Math.max(3, size * 0.07), width: `${underline * 100}%`, background: C.gold, borderRadius: 2 }} />
        </span>
    </span>
);

// Pin lokasi utama (navy + titik emas), sama dengan peta situs
export const MainPin: React.FC<{ size?: number }> = ({ size = 56 }) => (
    <svg viewBox="0 0 36 46" width={size} height={size * 46 / 36} style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 6px 10px rgba(15,29,53,.3))' }}>
        <path d="M18 45C18 45 3 28 3 17a15 15 0 0 1 30 0c0 11-15 28-15 28z" fill={C.ink} stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="18" cy="17" r="6" fill={C.gold} />
    </svg>
);
