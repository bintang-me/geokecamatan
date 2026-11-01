import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import React from 'react';
import { Composition } from 'remotion';
import { Ad, AD_FRAMES } from './Ad';

export const Root: React.FC = () => (
    <Composition
        id="CariKecamatanAd"
        component={Ad}
        durationInFrames={AD_FRAMES}
        fps={30}
        width={1920}
        height={1080}
    />
);
