import { useRef, useState, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'

interface SwipeableRouteRowProps {
  children: React.ReactNode
  onSwipeRight: () => void
  onSwipeLeft: () => void
}

const THRESHOLD = 80

export function SwipeableRouteRow({ children, onSwipeRight, onSwipeLeft }: SwipeableRouteRowProps) {
  const { t } = useI18n()
  const startX = useRef(0)
  const startY = useRef(0)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    setSwiping(false)
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current
    const dy = Math.abs(e.touches[0].clientY - startY.current)
    // Only track horizontal swipes
    if (!swiping && dy > 15 && Math.abs(dx) < dy) return
    if (Math.abs(dx) > 10) setSwiping(true)
    if (swiping) setOffset(dx)
  }, [swiping])

  const onTouchEnd = useCallback(() => {
    if (offset > THRESHOLD) {
      onSwipeRight()
    } else if (offset < -THRESHOLD) {
      onSwipeLeft()
    }
    setOffset(0)
    setSwiping(false)
  }, [offset, onSwipeRight, onSwipeLeft])

  const bgColor = offset > 30 ? 'bg-green-500' : offset < -30 ? 'bg-orange-500' : ''
  const label = offset > 30 ? t('swipe.toProjects') : offset < -30 ? t('swipe.logAscent') : ''

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Background revealed during swipe */}
      {bgColor && (
        <div className={`absolute inset-0 ${bgColor} flex items-center ${offset > 0 ? 'justify-start pl-4' : 'justify-end pr-4'}`}>
          <span className="text-white text-sm font-medium">{label}</span>
        </div>
      )}
      {/* Foreground content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: swiping ? `translateX(${offset}px)` : undefined, transition: swiping ? 'none' : 'transform 0.2s' }}
      >
        {children}
      </div>
    </div>
  )
}
