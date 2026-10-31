import { clockParts } from "./classroom-format.js"

export interface ClockView {
  readonly moment: number
  /** Simulated seconds per real second, zero when stopped. */
  readonly rate: number
  /** The clock runs on between the page's ticks, but never past the data it has. */
  readonly limit: number
  readonly locale: string
  readonly timeZone: string
}

const MILLIS_PER_REDRAW = 45

/**
 * The big date. It has a lifecycle of its own because it runs far faster than the page's four ticks a
 * second, and redrawing the whole page that often would be wasteful on a school laptop.
 */
export class MomentClock extends HTMLElement {
  #view: ClockView | undefined = undefined
  #arrivedAt = 0
  #lastDrawn = 0
  #frame = 0
  readonly #time = document.createElement("time")
  readonly #date = document.createElement("b")
  readonly #hour = document.createElement("small")

  set view(view: ClockView) {
    this.#view = view
    this.#arrivedAt = performance.now()
    this.#draw(this.#arrivedAt)
    cancelAnimationFrame(this.#frame)
    if (view.rate !== 0) this.#run()
  }

  connectedCallback(): void {
    this.#time.replaceChildren(this.#date, " ", this.#hour)
    this.replaceChildren(this.#time)
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#frame)
  }

  #run(): void {
    this.#frame = requestAnimationFrame((now) => {
      if (now - this.#lastDrawn >= MILLIS_PER_REDRAW) this.#draw(now)
      this.#run()
    })
  }

  #draw(now: number): void {
    const view = this.#view
    if (view === undefined) return
    this.#lastDrawn = now
    const moment = Math.min(view.moment + view.rate * (now - this.#arrivedAt), view.limit)
    const { date, time } = clockParts(moment, view.locale, view.timeZone)
    if (this.#date.textContent !== date) this.#date.textContent = date
    if (this.#hour.textContent !== time) this.#hour.textContent = time
    this.#time.setAttribute("datetime", new Date(moment).toISOString())
  }
}

customElements.define("moment-clock", MomentClock)
