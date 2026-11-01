import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, interpolate, interpolateColors, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { C, SCENES } from './brand';
import { clamp } from './anim';
import { S1Hook, HOOK_TEXT, HOOK_TYPE_START, HOOK_TYPE_STEP } from './scenes/S1Hook';
import { S2Problem } from './scenes/S2Problem';
import { S3Logo } from './scenes/S3Logo';
import { S4Single, S4_CUES } from './scenes/S4Single';
import { S5Map, S5_CUES } from './scenes/S5Map';
import { S6Batch, S6_CUES } from './scenes/S6Batch';
import { S7Trust, S7_CUES } from './scenes/S7Trust';
import { S8Cta, S8_CUES } from './scenes/S8Cta';
import { LANDMARKS } from './data/indonesia';
import { VerticalCtx } from './layout';

export const AD_FRAMES = 1050; // 35 dtk
const S = SCENES;

// Latar: navy gelap (masalah) → terang (solusi, dibuka oleh logo) → gelap (mode gelap & ajakan)
const Background: React.FC = () => {
    const f = useCurrentFrame();
    const darkEnd = S.trust.from + S7_CUES.toggle;
    const light = f < S.single.from ? 0 : interpolate(f, [darkEnd, darkEnd + 12], [1, 0], clamp);
    const bg = interpolateColors(light, [0, 1], [C.dCanvas, C.canvas]);
    const glow = interpolate(light, [0, 1], [1, 0], clamp);
    return (
        <AbsoluteFill style={{ background: bg }}>
            <AbsoluteFill style={{ opacity: glow, background: 'radial-gradient(1200px 700px at 50% 45%, rgba(238,162,1,.10), rgba(11,18,32,0) 70%)' }} />
        </AbsoluteFill>
    );
};

// Adegan dengan masuk/keluar memudar (crossfade tipis antaradegan)
const Scene: React.FC<{ from: number; dur: number; fadeIn?: number; fadeOut?: number; children: React.ReactNode }> = ({ from, dur, fadeIn = 8, fadeOut = 8, children }) => (
    <Sequence from={from} durationInFrames={dur}>
        <Fade dur={dur} fadeIn={fadeIn} fadeOut={fadeOut}>{children}</Fade>
    </Sequence>
);
const Fade: React.FC<{ dur: number; fadeIn: number; fadeOut: number; children: React.ReactNode }> = ({ dur, fadeIn, fadeOut, children }) => {
    const f = useCurrentFrame();
    const o = Math.min(fadeIn ? interpolate(f, [0, fadeIn], [0, 1], clamp) : 1, fadeOut ? interpolate(f, [dur - fadeOut, dur], [1, 0], clamp) : 1);
    return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 1 }) => (
    <Sequence from={Math.round(at)} durationInFrames={60} layout="none">
        <Audio src={staticFile(`audio/${name}.wav`)} volume={volume} />
    </Sequence>
);

export const Ad: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
    // Tunggu huruf termuat agar setiap frame memakai Plus Jakarta Sans & JetBrains Mono
    const [handle] = useState(() => delayRender('Memuat huruf'));
    useEffect(() => {
        const specs = ['400', '500', '600', '700', '800'].map(w => `${w} 40px "Plus Jakarta Sans"`).concat(['400 40px "JetBrains Mono"', '500 40px "JetBrains Mono"']);
        Promise.all(specs.map(s => document.fonts.load(s))).then(() => document.fonts.ready).then(() => continueRender(handle)).catch(() => continueRender(handle));
    }, [handle]);

    const keys = Array.from({ length: HOOK_TEXT.length }, (_, i) => HOOK_TYPE_START + i * HOOK_TYPE_STEP);
    return (
        <VerticalCtx.Provider value={vertical}>
        <AbsoluteFill style={{ wordSpacing: '0.06em' }}>
            <Background />
            <Scene from={S.hook.from} dur={S.hook.dur + 6} fadeIn={0}><S1Hook /></Scene>
            <Scene from={S.problem.from} dur={S.problem.dur}><S2Problem /></Scene>
            <Scene from={S.logo.from} dur={S.logo.dur + 6} fadeIn={0}><S3Logo /></Scene>
            {/* adegan 4 tetap tampil sesaat di bawah peta yang membesar */}
            <Scene from={S.single.from} dur={S.single.dur + 16} fadeOut={16}><S4Single /></Scene>
            <Scene from={S.map.from} dur={S.map.dur} fadeIn={0}><S5Map /></Scene>
            <Scene from={S.batch.from} dur={S.batch.dur}><S6Batch /></Scene>
            <Scene from={S.trust.from} dur={S.trust.dur + 4}><S7Trust /></Scene>
            <Scene from={S.cta.from} dur={S.cta.dur} fadeOut={0}><S8Cta /></Scene>

            {/* musik latar & efek suara (semua disintesis, lihat scripts/make_audio.py) */}
            <Audio src={staticFile('audio/music.wav')} volume={0.85} />
            {keys.map((k, i) => <Sfx key={i} at={k} name={`key${(i % 3) + 1}`} volume={0.5} />)}
            <Sfx at={S.problem.from + 104} name="whoosh" volume={0.5} />
            <Sfx at={S.logo.from + 2} name="chime" volume={0.55} />
            <Sfx at={S.single.from + S4_CUES.paste} name="pop" volume={0.6} />
            <Sfx at={S.single.from + S4_CUES.fix} name="tick" volume={0.7} />
            <Sfx at={S.single.from + S4_CUES.press} name="click" volume={0.6} />
            <Sfx at={S.single.from + S4_CUES.result} name="pop" volume={0.6} />
            <Sfx at={S.single.from + S4_CUES.map} name="pop" volume={0.4} />
            <Sfx at={S.map.from - 2} name="whoosh" volume={0.45} />
            <Sfx at={S.map.from + S5_CUES.badge} name="pop" volume={0.5} />
            <Sfx at={S.map.from + S5_CUES.tooltip} name="pop" volume={0.35} />
            {LANDMARKS.map((_, i) => <Sfx key={`p${i}`} at={S.batch.from + S6_CUES.rowsStart + i * S6_CUES.rowStep} name="plip" volume={0.45} />)}
            <Sfx at={S.batch.from + S6_CUES.chips} name="pop" volume={0.45} />
            <Sfx at={S.batch.from + S6_CUES.download} name="click" volume={0.6} />
            {S7_CUES.chips.map((c, i) => <Sfx key={`c${i}`} at={S.trust.from + c} name="pop" volume={0.55} />)}
            <Sfx at={S.trust.from + S7_CUES.toggle} name="click" volume={0.65} />
            <Sfx at={S.cta.from + S8_CUES.press} name="click" volume={0.65} />
        </AbsoluteFill>
        </VerticalCtx.Provider>
    );
};
