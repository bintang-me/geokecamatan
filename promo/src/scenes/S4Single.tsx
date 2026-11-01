import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO, SEARCH_SECONDS } from '../brand';
import { clamp, easeOut, pop, rise } from '../anim';
import { MAP_TALL, MAP_WIDE, RealMap, slicePoint, VB } from '../components/RealMap';
import { useVertical } from '../layout';
import { MainPin } from '../components/Logo';

// Kartu peta (adegan 5 membesarkannya dari posisi ini)
export const MAP_CARD = { wide: { x: 900, y: 520, w: 860, h: 470 }, tall: { x: 70, y: 640, w: 940, h: 440 } };
// Versi vertikal: kartu memperbesar ke Kecamatan Gambir (koordinat peta tegak)
export const TALL_CARD_VB: VB = [0, 510, 900, 421];
export const S4_CUES = { paste: 8, fix: 26, press: 42, result: 66, map: 78 };
const RAW = '-6,1754; 106,8272';
const FIXED = '-6.1754, 106.8272';

const Row: React.FC<{ k: string; v: string; d: number }> = ({ k, v, d }) => {
    const f = useCurrentFrame();
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 0', borderTop: `1.5px solid ${C.lineSoft}`, fontSize: 28, ...rise(f, d, 12, 14) }}>
            <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 600, color: C.ink }}>{v}</span>
        </div>
    );
};

// 9,5–15 dtk: tempel koordinat berantakan → dirapikan → hasil Gambir
export const S4Single: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const pasted = f >= S4_CUES.paste;
    const fixP = interpolate(f, [S4_CUES.fix, S4_CUES.fix + 8], [0, 1], clamp);
    const sweep = interpolate(f, [S4_CUES.fix - 4, S4_CUES.fix + 10], [-20, 120], clamp);
    const press = interpolate(f, [S4_CUES.press, S4_CUES.press + 4, S4_CUES.press + 10], [1, 0.95, 1], clamp);
    const V = useVertical();
    const MC = V ? MAP_CARD.tall : MAP_CARD.wide;
    const MD = V ? MAP_TALL : MAP_WIDE;
    const vb = V ? TALL_CARD_VB : undefined;
    const pin = slicePoint(MD, MD.PIN, MC.w, MC.h, vb);
    const card = pop(f, fps, S4_CUES.result);
    // stopwatch: berjalan dari tombol ditekan sampai hasil muncul, lalu berhenti di SEARCH_SECONDS
    const sw = interpolate(f, [S4_CUES.press, S4_CUES.result], [0, SEARCH_SECONDS], clamp);
    const swShow = interpolate(f, [S4_CUES.press, S4_CUES.press + 4], [0, 1], clamp);
    const swDone = f >= S4_CUES.result;
    const mapCard = pop(f, fps, S4_CUES.map);
    const pinDrop = pop(f, fps, S4_CUES.map + 8, 200);
    const kec = interpolate(f, [S4_CUES.map + 12, S4_CUES.map + 50], [0, 1], { ...clamp, easing: easeOut });
    return (
        <AbsoluteFill style={{ fontFamily: FONT }}>
            <div style={{ position: 'absolute', left: V ? 70 : 160, top: V ? 270 : 96 }}>
                <div style={{ fontSize: 66, fontWeight: 700, color: C.ink, letterSpacing: -1.1, ...rise(f, 2) }}>Ketik apa adanya</div>
            </div>
            {/* kotak pencarian + tombol */}
            <div style={{ position: 'absolute', left: V ? 70 : 160, top: V ? 390 : 300, width: V ? 940 : 1600, display: 'flex', gap: V ? 14 : 20, ...rise(f, 0, 12, 18) }}>
                <div style={{ flex: 1, height: 104, borderRadius: 22, background: C.surface, border: `2px solid ${fixP > 0 && fixP < 1 ? C.gold : C.line}`, display: 'flex', alignItems: 'center', gap: 22, padding: '0 34px', position: 'relative', overflow: 'hidden', boxShadow: '0 2px 6px rgba(15,29,53,.05)' }}>
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                    <span style={{ fontFamily: MONO, fontSize: V ? 34 : 42, color: C.ink, position: 'relative' }}>
                        {pasted && <span style={{ opacity: 1 - fixP, position: fixP > 0 ? 'absolute' : 'static', left: 0, whiteSpace: 'nowrap' }}>{RAW}</span>}
                        {fixP > 0 && <span style={{ opacity: fixP, whiteSpace: 'nowrap' }}>{FIXED}</span>}
                        {!pasted && <span style={{ color: '#9AA2B1' }}>-6.2088, 106.8456</span>}
                    </span>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${sweep}%`, width: '18%', background: 'linear-gradient(90deg, rgba(238,162,1,0), rgba(238,162,1,.28), rgba(238,162,1,0))' }} />
                </div>
                <div style={{ height: 104, padding: V ? '0 26px' : '0 46px', borderRadius: 22, background: C.gold, color: C.ink, fontSize: V ? 28 : 34, whiteSpace: 'nowrap', fontWeight: 600, display: 'flex', alignItems: 'center', transform: `scale(${press})`, boxShadow: '0 8px 22px rgba(238,162,1,.3)' }}>Cari kecamatan</div>
            </div>
            {/* keterangan koreksi otomatis */}
            <div style={{ position: 'absolute', left: V ? 76 : 170, top: V ? 514 : 426, width: V ? 930 : undefined, flexWrap: 'wrap', rowGap: 8, display: 'flex', alignItems: 'center', gap: 14, fontSize: V ? 25 : 27, color: C.muted, ...rise(f, S4_CUES.fix + 4, 12, 10) }}>
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke={C.success} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                <span>Dirapikan otomatis: koma desimal diubah menjadi titik</span>
                <span style={{ color: C.lineStrong }}>·</span>
                <span style={{ color: '#626B7E' }}>Masukan asli:</span>
                <span style={{ fontFamily: MONO, fontSize: 24, padding: '3px 12px', borderRadius: 8, background: C.canvas, border: `1.5px solid ${C.lineSoft}`, color: C.ink }}>{RAW}</span>
            </div>
            {/* stopwatch */}
            <div style={{ position: 'absolute', left: MC.x + 24, top: MC.y + 24, zIndex: 5, boxShadow: '0 6px 18px rgba(15,29,53,.12)', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderRadius: 999, background: swDone ? C.successBg : C.surface, border: `1.5px solid ${swDone ? 'transparent' : C.line}`, color: swDone ? C.successText : C.muted, fontSize: 27, fontWeight: 600, opacity: swShow }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2.5h5" /></svg>
                <span>{swDone ? 'Ditemukan dalam ' : ''}<span style={{ fontFamily: MONO }}>{sw.toFixed(1).replace('.', ',')}</span> detik</span>
            </div>
            {/* kartu hasil */}
            <div style={{ position: 'absolute', left: V ? 70 : 160, top: V ? 1110 : 520, width: V ? 940 : 700, padding: V ? '28px 40px 12px' : '34px 40px 18px', borderRadius: 30, background: C.surface, border: `1.5px solid ${C.line}`, boxShadow: '0 20px 50px rgba(15,29,53,.10)', opacity: card, transform: `translateY(${(1 - card) * 60}px)` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 30, fontWeight: 600, color: C.ink }}>Hasil</span>
                    <span style={{ fontSize: 22, fontWeight: 600, color: C.successText, background: C.successBg, padding: '7px 16px', borderRadius: 999 }}>● Sumber resmi · BIG</span>
                </div>
                <div style={{ marginTop: 24, fontSize: 24, color: C.muted }}>Kecamatan</div>
                <div style={{ fontSize: 76, fontWeight: 700, color: C.ink, letterSpacing: -1.5, marginBottom: 14 }}>Gambir</div>
                <Row k="Desa/Kelurahan" v="Gambir" d={S4_CUES.result + 8} />
                <Row k="Kabupaten/Kota" v="Kota Jakarta Pusat" d={S4_CUES.result + 14} />
                <Row k="Provinsi" v="DKI Jakarta" d={S4_CUES.result + 20} />
            </div>
            {/* kartu peta (diperbesar di adegan berikut) */}
            <div style={{ position: 'absolute', left: MC.x, top: MC.y, width: MC.w, height: MC.h, borderRadius: 30, overflow: 'hidden', border: `1.5px solid ${C.line}`, boxShadow: '0 20px 50px rgba(15,29,53,.10)', opacity: mapCard, transform: `scale(${0.94 + 0.06 * mapCard})` }}>
                <RealMap kec={kec} kab={0} label={0} data={MD} vb={vb} />
                <div style={{ position: 'absolute', left: pin.x, top: pin.y, transform: `translate(-50%, ${-100 + (1 - pinDrop) * -60}%)`, opacity: pinDrop }}><MainPin size={52} /></div>
            </div>
        </AbsoluteFill>
    );
};
