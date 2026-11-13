/**
 * Screenshot-only "game scene" backdrops. The overlay window is transparent, so
 * a plain screenshot cannot show what a low background opacity looks like over
 * the game. Painting the scene on <html> puts it behind everything else.
 */

const BRIGHT_SCENE = [
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.55) 0 14px, rgba(255,255,255,0) 14px 40px)',
    'repeating-linear-gradient(0deg, rgba(255,210,60,0.5) 0 9px, rgba(255,255,255,0) 9px 31px)',
    'radial-gradient(circle at 18% 30%, #ffffff 0 9%, rgba(255,255,255,0) 22%)',
    'radial-gradient(circle at 78% 62%, #fff6c8 0 12%, rgba(255,246,200,0) 30%)',
    'linear-gradient(160deg, #bfe6ff 0%, #e9f7ff 40%, #8fd46a 41%, #d9f2a2 100%)',
].join(',');

const DARK_SCENE = [
    'repeating-linear-gradient(90deg, rgba(0,0,0,0.5) 0 12px, rgba(0,0,0,0) 12px 37px)',
    'repeating-linear-gradient(0deg, rgba(60,50,70,0.55) 0 10px, rgba(0,0,0,0) 10px 29px)',
    'radial-gradient(circle at 25% 65%, rgba(255,110,20,0.65) 0 6%, rgba(255,110,20,0) 18%)',
    'radial-gradient(circle at 80% 25%, rgba(40,160,255,0.35) 0 5%, rgba(0,0,0,0) 16%)',
    'linear-gradient(200deg, #14121c 0%, #2a2430 55%, #0a0a10 100%)',
].join(',');

export function setBackdrop(scene: 'bright' | 'dark' | 'none'): void {
    document.documentElement.style.background =
        scene === 'bright' ? BRIGHT_SCENE : scene === 'dark' ? DARK_SCENE : '';
}
