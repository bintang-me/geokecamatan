import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { clamp, pop, rise } from '../anim';
import { Logo, Wordmark } from '../components/Logo';
import { QR_ROWS } from '../data/qr';

export const S8_CUES = { press: 40, qr: 54 };

const QrCode: React.FC<{ size: number }> = ({ size }) => {
    const n = QR_ROWS.length, q = 3; // q = zona tenang (modul)
    return (
        <svg viewBox={`${-q} ${-q} ${n + q * 2} ${n + q * 2}`} width={size} height={size} shapeRendering="crispEdges" style={{ display: 'block', background: '#fff', borderRadius: 20 }}>
            {QR_ROWS.flatMap((row, y) => [...row].map((c, x) => c === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={C.ink} /> : null))}
        </svg>
    );
};

// 27,5–35 dtk: layar akhir (cukup lama untuk elemen layar akhir YouTube & presentasi), dengan kode QR
export const S8Cta: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const press = interpolate(f, [S8_CUES.press, S8_CUES.press + 4, S8_CUES.press + 10], [1, 0.94, 1], clamp);
    const cursor = interpolate(f, [16, S8_CUES.press], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
    const cursorOut = interpolate(f, [S8_CUES.press + 14, S8_CUES.press + 24], [1, 0], clamp);
    const qr = pop(f, fps, S8_CUES.qr);
    return (
        <AbsoluteFill style={{ fontFamily: FONT }}>
            <div style={{ position: 'absolute', left: 170, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 32, ...rise(f, 0, 14, 20) }}>
                    <Logo size={136} edge="#2C3B57" />
                    <Wordmark size={88} color={C.dInk} />
                </div>
                <div style={{ marginTop: 36, fontSize: 40, color: C.dMuted, ...rise(f, 6) }}>Berdasarkan koordinat, cepat dan akurat</div>
                <div style={{ marginTop: 60, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 18, padding: 12, paddingLeft: 40, borderRadius: 999, background: C.dSurface, border: `2px solid ${C.dLine}`, position: 'relative', ...rise(f, 12) }}>
                    <span style={{ fontFamily: MONO, fontSize: 40, color: C.dInk }}>carikecamatan.vercel.app</span>
                    <span style={{ fontSize: 36, fontWeight: 600, color: C.ink, background: C.dGold, padding: '20px 40px', borderRadius: 999, transform: `scale(${press})`, boxShadow: '0 10px 30px rgba(245,180,40,.3)' }}>Coba sekarang</span>
                    <svg viewBox="0 0 24 24" width="52" height="52" style={{ position: 'absolute', right: 70, top: 70 + (1 - cursor) * 140, opacity: cursor * cursorOut, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.5))' }}>
                        <path d="M5 3l14 8-6 1.5L10 19z" fill="#fff" stroke={C.ink} strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                </div>
                <div style={{ marginTop: 30, fontSize: 28, color: C.dMuted, ...rise(f, 20) }}>Gratis · Tanpa daftar · Langsung di peramban</div>
            </div>
            {/* kode QR */}
            <div style={{ position: 'absolute', right: 170, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: qr, transform: `scale(${0.9 + 0.1 * qr})` }}>
                <div style={{ padding: 14, borderRadius: 30, background: C.dSurface, border: `2px solid ${C.dLine}` }}><QrCode size={300} /></div>
                <div style={{ fontSize: 28, fontWeight: 600, color: C.dInk }}>Pindai untuk mencoba</div>
            </div>
            <div style={{ position: 'absolute', bottom: 54, width: '100%', textAlign: 'center', fontSize: 24, color: '#8592A8', ...rise(f, 18, 12, 8) }}>Acuan informatif, bukan untuk keperluan hukum yang mengikat.</div>
        </AbsoluteFill>
    );
};
