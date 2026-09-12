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
