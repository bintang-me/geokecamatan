import { createContext, useContext } from 'react';

// true = versi vertikal 9:16 (1080×1920) untuk Shorts/Reels/TikTok
export const VerticalCtx = createContext(false);
export const useVertical = () => useContext(VerticalCtx);
