import { defineDriver } from "@gyral/core"
import type { FramesMeasured, PageFacts, SkyLoad } from "../types/index.js"

/**
 * Commands name these tokens; `app-runtime.ts` provides what runs behind them. This file loads no
 * Effect runtime and no network code, so a component and its tests can import it freely.
 */
export const pageFacts = defineDriver<undefined, PageFacts>("page-facts")
export const skyLoader = defineDriver<{ readonly moment: number }, SkyLoad>("sky-loader")
export const frameRecorder = defineDriver<FramesMeasured, undefined>("frame-recorder")
