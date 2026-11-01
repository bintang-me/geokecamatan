import React from 'react';
import { evolvePath } from '@remotion/paths';
import { C, FONT } from '../brand';

// Peta ilustrasi (gaya peta jalan) di sekitar Monas, Jakarta Pusat — bukan geometri sebenarnya.
const KEC = 'M 560 250 L 700 205 L 850 225 L 980 200 L 1060 290 L 1040 420 L 1080 540 L 990 650 L 840 690 L 700 660 L 600 580 L 540 450 Z';
const KAB = 'M 300 120 L 760 70 L 1250 110 L 1420 330 L 1380 640 L 1160 820 L 700 850 L 380 760 L 220 480 Z';
const ROADS = [
    'M 0 300 C 400 280 700 330 1600 290', 'M 0 610 C 500 640 900 600 1600 640', 'M 420 0 C 440 300 470 600 430 900',
    'M 1150 0 C 1120 300 1180 600 1140 900', 'M 0 120 L 1600 160', 'M 0 790 L 1600 760', 'M 250 0 L 300 900', 'M 1380 0 L 1330 900',
];
const MAJOR = ['M 0 450 C 500 470 1100 430 1600 455', 'M 790 0 C 800 300 760 600 800 900'];

export const MapArt: React.FC<{ kec?: number; kab?: number; label?: number; dark?: boolean }> = ({ kec = 1, kab = 1, label = 1 }) => {
    const kecEvo = evolvePath(kec, KEC);
    const kabEvo = evolvePath(kab, KAB);
    return (
        <svg viewBox="0 0 1600 900" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
            <rect width="1600" height="900" fill="#EFECE6" />
            {/* blok bangunan */}
            {Array.from({ length: 70 }, (_, i) => {
                const x = (i * 233) % 1600, y = (i * 137) % 900;
                return <rect key={i} x={x} y={y} width={60 + (i % 4) * 22} height={42 + (i % 3) * 18} rx={4} fill="#E4E0D8" />;
            })}
            {/* taman Monas & sungai */}
            <rect x="690" y="350" width="220" height="200" rx="10" fill="#D7E8CC" />
            <path d="M 0 840 C 300 800 520 860 800 820 S 1300 780 1600 830" stroke="#BCD7EA" strokeWidth="28" fill="none" />
            {ROADS.map((d, i) => <path key={i} d={d} stroke="#FFFFFF" strokeWidth="16" fill="none" />)}
            {MAJOR.map((d, i) => <g key={i}><path d={d} stroke="#E9D9A8" strokeWidth="30" fill="none" /><path d={d} stroke="#FCEFC4" strokeWidth="22" fill="none" /></g>)}
            {/* batas kab./kota: putus-putus ungu dengan casing putih */}
            <path d={KAB} fill="rgba(109,40,217,0.03)" stroke="#FFFFFF" strokeWidth="12" strokeLinejoin="round" style={{ strokeDasharray: kabEvo.strokeDasharray, strokeDashoffset: kabEvo.strokeDashoffset }} />
            <path d={KAB} fill="none" stroke={C.violet} strokeWidth="6" strokeDasharray="22 14" strokeLinejoin="round" opacity={kab > 0 ? 0.95 : 0} style={{ clipPath: kab < 1 ? `inset(0 ${100 - kab * 100}% 0 0)` : undefined }} />
            {/* batas kecamatan: amber dengan casing navy */}
            <path d={KEC} fill={`rgba(238,162,1,${0.14 * kec})`} stroke="none" />
            <path d={KEC} fill="none" stroke={C.ink} strokeOpacity="0.55" strokeWidth="15" strokeLinejoin="round" strokeLinecap="round" style={{ strokeDasharray: kecEvo.strokeDasharray, strokeDashoffset: kecEvo.strokeDashoffset }} />
            <path d={KEC} fill="none" stroke={C.amber} strokeWidth="7.5" strokeLinejoin="round" strokeLinecap="round" style={{ strokeDasharray: kecEvo.strokeDasharray, strokeDashoffset: kecEvo.strokeDashoffset }} />
            {/* nama wilayah sekitar */}
            <g fontFamily={FONT} fontWeight={600} fill="#7C8596" fontSize="30" opacity={label}>
                <text x="880" y="150" textAnchor="middle">Sawah Besar</text>
                <text x="1260" y="470" textAnchor="middle">Senen</text>
                <text x="1110" y="770" textAnchor="middle">Menteng</text>
                <text x="330" y="470" textAnchor="middle">Tanah Abang</text>
            </g>
        </svg>
    );
};
