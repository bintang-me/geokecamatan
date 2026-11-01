import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../brand';
import { clamp, easeOut, pop, rise } from '../anim';
import { MAP_TALL, MAP_WIDE, RealMap, slicePoint, VB } from '../components/RealMap';
import { MAP_CARD, TALL_CARD_VB } from './S4Single';
import { useVertical } from '../layout';
import { MainPin } from '../components/Logo';

export const S5_CUES = { badge: 52, tooltip: 62 };

// 15–20 dtk: peta memenuhi layar, batas kecamatan & kab./kota tergambar, label sumber resmi BIG
export const S5Map: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    // kartu peta (adegan 4) membesar menjadi layar penuh
    const grow = interpolate(f, [0, 18], [0, 1], { ...clamp, easing: easeOut });
    const V = useVertical();
    const MC = V ? MAP_CARD.tall : MAP_CARD.wide;
    const MD = V ? MAP_TALL : MAP_WIDE;
    const FW = V ? 1080 : 1920, FH = V ? 1920 : 1080;
    const left = MC.x * (1 - grow), top = MC.y * (1 - grow);
    const w = MC.w + (FW - MC.w) * grow, h = MC.h + (FH - MC.h) * grow;
    // vertikal: jendela peta melebar dari Gambir (kartu adegan 4) ke peta penuh, seiring kartu membesar
    let vb: VB | undefined;
    if (V) {
        // skala & pusat bergerak lurus dari jendela Gambir ke peta penuh; rasio jendela selalu = rasio wadah
        const s0 = MC.w / TALL_CARD_VB[2], s1 = Math.max(FW / MD.W, FH / MD.H);
        const s = s0 + (s1 - s0) * grow;
        const cx0 = TALL_CARD_VB[0] + TALL_CARD_VB[2] / 2, cy0 = TALL_CARD_VB[1] + TALL_CARD_VB[3] / 2;
        const cx = cx0 + (MD.W / 2 - cx0) * grow, cy = cy0 + (MD.H / 2 - cy0) * grow;
        vb = [cx - w / s / 2, cy - h / s / 2, w / s, h / s];
    }
    const pin = slicePoint(MD, MD.PIN, w, h, vb);
    const zoom = interpolate(f, [0, 150], [1.0, 1.12], clamp);
    const kab = interpolate(f, [22, 70], [0, 1], { ...clamp, easing: easeOut });
    const badge = pop(f, fps, S5_CUES.badge);
    const tip = pop(f, fps, S5_CUES.tooltip);
    return (
        <AbsoluteFill style={{ fontFamily: FONT }}>
            <div style={{ position: 'absolute', left, top, width: w, height: h, borderRadius: 30 * (1 - grow), overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})` }}>
                    <RealMap kec={1} kab={kab} label={interpolate(f, [20, 40], [0, 1], clamp)} data={MD} vb={vb} />
                    <div style={{ position: 'absolute', left: pin.x, top: pin.y, transform: 'translate(-50%, -100%)' }}><MainPin size={52 + 18 * grow} /></div>
                    {/* tooltip kecamatan */}
                    <div style={{ position: 'absolute', left: pin.x, top: pin.y - 92, transform: `translate(-50%, -100%) scale(${tip})`, transformOrigin: 'bottom center', background: C.ink, color: '#fff', fontSize: 28, fontWeight: 600, padding: '12px 22px', borderRadius: 14, boxShadow: '0 10px 30px rgba(15,29,53,.3)', whiteSpace: 'nowrap' }}>Kecamatan: Gambir</div>
                </div>
            </div>
            {/* legenda */}
            <div style={{ position: 'absolute', left: V ? 50 : 64, top: V ? 250 : 56, display: 'flex', gap: V ? 22 : 30, padding: V ? '14px 20px' : '16px 24px', borderRadius: 16, background: 'rgba(255,255,255,.95)', boxShadow: '0 2px 8px rgba(15,29,53,.12)', fontSize: V ? 23 : 26, color: C.ink, ...rise(f, 20, 12, 12) }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 40, height: 8, borderRadius: 4, background: C.amber, boxShadow: `0 0 0 3px rgba(15,29,53,.5)` }} />Kecamatan</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 40, borderTop: `6px dashed ${C.violet}` }} />Kabupaten/Kota</span>
            </div>
            {/* label sumber */}
            <div style={{ position: 'absolute', right: V ? 50 : 64, top: V ? 250 : 56, fontSize: V ? 23 : 28, fontWeight: 600, color: C.successText, background: C.successBg, padding: '14px 26px', borderRadius: 999, boxShadow: '0 4px 14px rgba(15,29,53,.12)', transform: `scale(${badge})` }}>● Sumber resmi · BIG</div>
            {/* teks */}
            <div style={{ position: 'absolute', right: V ? 50 : 64, left: V ? 50 : undefined, bottom: V ? 400 : 64, padding: V ? '32px 38px' : '36px 46px', borderRadius: 28, background: 'rgba(255,255,255,.96)', boxShadow: '0 20px 50px rgba(15,29,53,.18)', maxWidth: 1200, ...rise(f, 14, 14, 30) }}>
                <div style={{ fontSize: V ? 44 : 52, fontWeight: 700, color: C.ink, letterSpacing: -0.8, lineHeight: 1.18 }}>{V ? <>Menggunakan data batas wilayah<br />dari Badan Informasi<br />Geospasial (BIG)</> : <>Menggunakan data batas wilayah dari<br />Badan Informasi Geospasial (BIG)</>}</div>
            </div>
        </AbsoluteFill>
    );
};
