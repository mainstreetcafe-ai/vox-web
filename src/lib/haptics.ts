export function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export const Haptics = {
  light: () => vibrate(10),
  medium: () => vibrate(20),
  heavy: () => vibrate(40),
  success: () => vibrate([10, 50, 10]),
  error: () => vibrate([30, 50, 30]),
  warning: () => vibrate([20, 40, 20]),
}
