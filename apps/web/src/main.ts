import { provideDrivers } from "@gyral/core"
import { appDrivers } from "./runtime/app-runtime.js"
import "./ui/classroom.js"
import "./ui/moment-clock.js"
import "./ui/stage.js"

provideDrivers(document.body, appDrivers)
