import { subscription } from "@gyral/core"
import { Option } from "effect"
import { readTryRequest } from "../service/try-request.js"
import type { TryRequest } from "../types/index.js"

/**
 * The buttons in the explanation are static HTML outside the component, so that they read with no
 * script. This carries their clicks in, then brings the picture back into view.
 */
export const tryRequests = subscription<TryRequest>("try-requests", (emit) => {
  const onClick = (event: Event) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLElement>("[data-try-view]")
    if (button === null) return
    Option.map(readTryRequest(button.dataset), (request) => {
      emit(request)
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
      document.querySelector("solar-classroom")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" })
    })
  }
  document.addEventListener("click", onClick)
  return () => {
    document.removeEventListener("click", onClick)
  }
})
