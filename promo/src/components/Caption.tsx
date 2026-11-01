import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FONT } from '../brand';
import { rise } from '../anim';

// Judul besar + subjudul, muncul bertahap (hierarki: judul tebal, subjudul regular)
export const Caption: React.FC<{
    title: React.ReactNode; sub?: React.ReactNode; delay?: number; color: string; subColor: string;
    align?: 'left' | 'center'; size?: number; style?: React.CSSProperties;
}> = ({ title, sub, delay = 0, color, subColor, align = 'left', size = 72, style }) => {
    const f = useCurrentFrame();
    return (
        <div style={{ fontFamily: FONT, textAlign: align, ...style }}>
            <div style={{ fontSize: size, fontWeight: 700, color, lineHeight: 1.12, letterSpacing: -1.2, ...rise(f, delay) }}>{title}</div>
            {sub && <div style={{ marginTop: 18, fontSize: size * 0.5, fontWeight: 400, color: subColor, lineHeight: 1.4, ...rise(f, delay + 10) }}>{sub}</div>}
        </div>
    );
};
