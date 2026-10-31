import { provideDrivers } from "@gyral/core"
import { appDrivers } from "./runtime/app-runtime.js"
import "./styles.css"
import "./ui/classroom.js"
import "./ui/stage.js"

provideDrivers(document.body, appDrivers)
