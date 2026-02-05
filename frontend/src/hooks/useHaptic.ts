type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error';

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 50, 10],
  error: [30, 50, 30, 50, 30],
};

export function useHaptic() {
  const trigger = (pattern: HapticPattern = 'light') => {
    if ('vibrate' in navigator) {
      navigator.vibrate(patterns[pattern]);
    }
  };

  return { trigger };
}
