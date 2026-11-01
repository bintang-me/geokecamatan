import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../brand';
import { clamp, easeOut, pop, rise } from '../anim';
import { RealMap } from '../components/RealMap';
import { PIN, JKT_W, JKT_H } from '../data/jakarta';
import { MainPin } from '../components/Logo';

export const S5_CUES = { badge: 52, tooltip: 62 };

// 15–20 dtk: peta memenuhi layar, batas kecamatan & kab./kota tergambar, label sumber resmi BIG
export const S5Map: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    // kartu peta (adegan 4) membesar menjadi layar penuh
    const grow = interpolate(f, [0, 18], [0, 1], { ...clamp, easing: easeOut });
    const left = 900 * (1 - grow), top = 520 * (1 - grow);
    const w = 860 + (1920 - 860) * grow, h = 470 + (1080 - 470) * grow;
    const zoom = interpolate(f, [0, 150], [1.0, 1.12], clamp);
    const kab = interpolate(f, [22, 70], [0, 1], { ...clamp, easing: easeOut });
    const badge = pop(f, fps, S5_CUES.badge);
    const tip = pop(f, fps, S5_CUES.tooltip);
    return (
        <AbsoluteFill style={{ fontFamily: FONT }}>
            <div style={{ position: 'absolute', left, top, width: w, height: h, borderRadius: 30 * (1 - grow), overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})` }}>
                    <RealMap kec={1} kab={kab} label={interpolate(f, [20, 40], [0, 1], clamp)} />
                    <div style={{ position: 'absolute', left: `${PIN.x / JKT_W * 100}%`, top: `${PIN.y / JKT_H * 100}%`, transform: 'translate(-50%, -100%)' }}><MainPin size={52 + 18 * grow} /></div>
                    {/* tooltip kecamatan */}
                    <div style={{ position: 'absolute', left: `${PIN.x / JKT_W * 100}%`, top: `calc(${PIN.y / JKT_H * 100}% - 92px)`, transform: `translate(-50%, -100%) scale(${tip})`, transformOrigin: 'bottom center', background: C.ink, color: '#fff', fontSize: 28, fontWeight: 600, padding: '12px 22px', borderRadius: 14, boxShadow: '0 10px 30px rgba(15,29,53,.3)', whiteSpace: 'nowrap' }}>Kecamatan: Gambir</div>
                </div>
            </div>
            {/* legenda */}
            <div style={{ position: 'absolute', left: 64, top: 56, display: 'flex', gap: 30, padding: '16px 24px', borderRadius: 16, background: 'rgba(255,255,255,.95)', boxShadow: '0 2px 8px rgba(15,29,53,.12)', fontSize: 26, color: C.ink, ...rise(f, 20, 12, 12) }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 40, height: 8, borderRadius: 4, background: C.amber, boxShadow: `0 0 0 3px rgba(15,29,53,.5)` }} />Kecamatan</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 40, borderTop: `6px dashed ${C.violet}` }} />Kabupaten/Kota</span>
            </div>
            {/* label sumber */}
            <div style={{ position: 'absolute', right: 64, top: 56, fontSize: 28, fontWeight: 600, color: C.successText, background: C.successBg, padding: '14px 26px', borderRadius: 999, boxShadow: '0 4px 14px rgba(15,29,53,.12)', transform: `scale(${badge})` }}>● Sumber resmi · BIG</div>
            {/* teks */}
            <div style={{ position: 'absolute', right: 64, bottom: 64, padding: '36px 46px', borderRadius: 28, background: 'rgba(255,255,255,.96)', boxShadow: '0 20px 50px rgba(15,29,53,.18)', maxWidth: 1000, ...rise(f, 14, 14, 30) }}>
                <div style={{ fontSize: 58, fontWeight: 700, color: C.ink, letterSpacing: -1, lineHeight: 1.15 }}>Dicocokkan langsung dengan<br />batas wilayah resmi BIG.</div>
                <div style={{ fontSize: 28, color: C.muted, marginTop: 14, ...rise(f, 28, 12, 10) }}>Badan Informasi Geospasial, penyelenggara informasi geospasial dasar Indonesia.</div>
            </div>
        </AbsoluteFill>
    );
};
