import { useState, useEffect } from 'react'

const BAR_COUNT = 12
const BAR_WIDTH = 3
const MAX_HEIGHT = 40
const MIN_HEIGHT = 4
const UPDATE_MS = 80

export function WaveformVisualizer() {
  const [heights, setHeights] = useState<number[]>(
    Array(BAR_COUNT).fill(MIN_HEIGHT)
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setHeights(
        Array.from({ length: BAR_COUNT }, () =>
          Math.random() * (MAX_HEIGHT - MIN_HEIGHT) + MIN_HEIGHT
        )
      )
    }, UPDATE_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: MAX_HEIGHT }}>
      {heights.map((h, i) => (
        <div
          key={i}
          className="bg-maroon rounded-full transition-all"
          style={{
            width: BAR_WIDTH,
            height: h,
            transitionDuration: `${UPDATE_MS}ms`,
          }}
        />
      ))}
    </div>
  )
}
