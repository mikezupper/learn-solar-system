import { provideDrivers } from "@gyral/core"
import { appDrivers } from "./runtime/app-runtime.js"
import "./styles/base.css"
import "./styles/controls.css"
import "./styles/reading.css"
import "./ui/classroom.js"
import "./ui/moment-clock.js"
import "./ui/stage.js"

provideDrivers(document.body, appDrivers)
