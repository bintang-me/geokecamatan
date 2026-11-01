import { interpolate, spring, Easing } from 'remotion';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

// 0 → 1 dengan pegas lembut, mulai pada frame `delay`
export const pop = (frame: number, fps: number, delay = 0, stiff = 140) =>
    spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: stiff, mass: 0.8 } });

// Muncul (naik + memudar) dalam `len` frame
export const rise = (frame: number, delay = 0, len = 14, dist = 24) => {
    const p = interpolate(frame, [delay, delay + len], [0, 1], { ...clamp, easing: easeOut });
    return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

// Masuk & keluar adegan: memudar di awal dan akhir
export const sceneFade = (frame: number, dur: number, inLen = 8, outLen = 8) =>
    interpolate(frame, [0, inLen, dur - outLen, dur], [0, 1, 1, 0], clamp);
