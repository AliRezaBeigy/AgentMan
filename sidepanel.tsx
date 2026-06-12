import "~style.css"

import { useLayoutEffect } from "react"

import { SidePanelApp } from "~/components/SidePanelApp"
import { getSettings } from "~/lib/storage"

export default function SidePanel() {
  useLayoutEffect(() => {
    document.documentElement.classList.add("dark")
    void getSettings().then((settings) => {
      document.documentElement.classList.toggle("dark", settings.theme === "dark")
    })
  }, [])

  return <SidePanelApp />
}
