import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const EDGE_WIDTH = 30
const MIN_DISTANCE = 60
const MAX_Y_DRIFT = 80

/** Detect right-swipe from left edge → navigate(-1). Disabled on map page and topo viewer. */
export function useSwipeBack() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0]
      // Only start from the left edge
      if (touch.clientX > EDGE_WIDTH) return
      // Disable on map page
      if (location.pathname === '/map') return
      // Disable if touching a canvas/svg (topo viewer)
      const target = e.target as HTMLElement
      if (target.closest('canvas, svg, .openseadragon-container')) return

      startX = touch.clientX
      startY = touch.clientY
      tracking = true
    }

    function onTouchEnd(e: TouchEvent) {
      if (!tracking) return
      tracking = false

      const touch = e.changedTouches[0]
      const dx = touch.clientX - startX
      const dy = Math.abs(touch.clientY - startY)

      if (dx > MIN_DISTANCE && dy < MAX_Y_DRIFT) {
        navigate(-1)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [navigate, location.pathname])
}
