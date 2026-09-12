import { useEffect, useRef, useState } from "react"

/**
 * Returns true once the element has entered the viewport. Used to start an
 * animation when a section is actually seen, not on page load.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(rootMargin = "-15% 0px -15% 0px") {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            observer.disconnect()
          }
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return { ref, inView }
}

/**
 * Advances a step index on a cadence while `active`.
 * `loop: true` cycles forever (used for the breathing hero graph).
 * `loop: false` advances to the final step and holds, so a decision settles
 * on screen instead of resetting (used for COMMIT BLOCKED / VERIFIED).
 */
export function useSequence(length: number, active: boolean, intervalMs = 900, loop = true) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!active || length <= 0) return
    setStep(0)
    const id = setInterval(() => {
      setStep((s) => {
        const next = s + 1
        if (next >= length) {
          if (loop) return 0
          clearInterval(id)
          return length - 1
        }
        return next
      })
    }, intervalMs)
    return () => clearInterval(id)
  }, [length, active, intervalMs, loop])

  return step
}

/** Types a string one character at a time once active. */
export function useTypewriter(text: string, active: boolean, cps = 46) {
  const [out, setOut] = useState("")

  useEffect(() => {
    if (!active) return
    setOut("")
    let i = 0
    const id = setInterval(() => {
      i += 1
      setOut(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 1000 / cps)
    return () => clearInterval(id)
  }, [text, active, cps])

  return out
}

/**
 * Pinned scroll progress for scrollytelling.
 * Attach `wrapRef` to a tall container and `stickRef` to its sticky child.
 * Returns progress 0..1 as the sticky child travels through the wrapper, so the
 * stage advances while the diagram stays on screen. Sets 1 under reduced motion
 * or when the layout is not tall enough to pin.
 */
export function usePinProgress<W extends HTMLElement, S extends HTMLElement>(stickyTop = 84) {
  const wrapRef = useRef<W | null>(null)
  const stickRef = useRef<S | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      setProgress(1)
      return
    }
    let raf = 0
    const compute = () => {
      const wrap = wrapRef.current
      const stick = stickRef.current
      if (!wrap || !stick) return
      const travel = wrap.offsetHeight - stick.offsetHeight
      if (travel <= 40) {
        setProgress(1)
        return
      }
      const top = wrap.getBoundingClientRect().top
      const p = Math.min(1, Math.max(0, (stickyTop - top) / travel))
      setProgress(p)
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    }
    compute()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [stickyTop])

  return { wrapRef, stickRef, progress }
}
