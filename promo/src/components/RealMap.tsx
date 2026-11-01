import React from 'react';
import { evolvePath } from '@remotion/paths';
import { C, FONT } from '../brand';
import { JKT_H, JKT_KEC, JKT_PUSAT_OUTLINE, JKT_W } from '../data/jakarta';

// Peta administrasi nyata di sekitar Kecamatan Gambir (batas kecamatan 2020).
// kec/kab: 0→1 progres penggambaran garis; label: kejelasan nama kecamatan tetangga.
const FILLS = ['#F2EFE9', '#ECE8E0', '#F5F3EF', '#EFEBE4'];
const GAMBIR = JKT_KEC.find(k => k.gambir)!;

export const RealMap: React.FC<{ kec?: number; kab?: number; label?: number }> = ({ kec = 1, kab = 1, label = 1 }) => {
    const kecEvo = evolvePath(Math.max(0.0001, kec), GAMBIR.path);
    const kabEvo = evolvePath(Math.max(0.0001, kab), JKT_PUSAT_OUTLINE);
    return (
        <svg viewBox={`0 0 ${JKT_W} ${JKT_H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
            <rect width={JKT_W} height={JKT_H} fill="#E6E2DA" />
            {JKT_KEC.map((k, i) => (
                <path key={k.code} d={k.path} fill={k.gambir ? '#F7F4EE' : FILLS[i % FILLS.length]} stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" />
            ))}
            {JKT_KEC.map(k => (
                <path key={`l${k.code}`} d={k.path} fill="none" stroke="#CFC8BC" strokeWidth="1.2" strokeLinejoin="round" />
            ))}
            {/* batas Kota Jakarta Pusat */}
            <path d={JKT_PUSAT_OUTLINE} fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinejoin="round" opacity={kab > 0 ? 0.9 : 0}
                style={{ strokeDasharray: kabEvo.strokeDasharray, strokeDashoffset: kabEvo.strokeDashoffset }} />
            <g style={{ clipPath: `inset(0 ${(1 - kab) * 100}% 0 0)` }}>
                <path d={JKT_PUSAT_OUTLINE} fill="none" stroke={C.violet} strokeWidth="5" strokeDasharray="20 12" strokeLinejoin="round" opacity={kab > 0 ? 0.95 : 0} />
            </g>
            {/* Kecamatan Gambir */}
            <path d={GAMBIR.path} fill={`rgba(238,162,1,${0.16 * kec})`} stroke="none" />
            <path d={GAMBIR.path} fill="none" stroke={C.ink} strokeOpacity="0.55" strokeWidth="13" strokeLinejoin="round" strokeLinecap="round"
                style={{ strokeDasharray: kecEvo.strokeDasharray, strokeDashoffset: kecEvo.strokeDashoffset }} />
            <path d={GAMBIR.path} fill="none" stroke={C.amber} strokeWidth="6.5" strokeLinejoin="round" strokeLinecap="round"
                style={{ strokeDasharray: kecEvo.strokeDasharray, strokeDashoffset: kecEvo.strokeDashoffset }} />
            {/* nama kecamatan tetangga */}
            <g fontFamily={FONT} fontWeight={600} fill="#7C8596" fontSize="24" textAnchor="middle" opacity={label}>
                {JKT_KEC.filter(k => {
                    // label harus utuh di dalam tampilan (termasuk saat peta diperbesar 12% di adegan 5)
                    const half = k.name.length * 7.5;
                    return !k.gambir && k.lx - half > 110 && k.lx + half < JKT_W - 110 && k.ly > 70 && k.ly < JKT_H - 60;
                }).map(k => (
                    <text key={k.code} x={k.lx} y={k.ly} stroke="#F4F1EB" strokeWidth="5" paintOrder="stroke">{k.name}</text>
                ))}
            </g>
        </svg>
    );
};
