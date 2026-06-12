const CURSOR_ID = "agentman-cursor"
const CAPTION_ID = "agentman-caption"
const STOP_ID = "agentman-stop-overlay"

export function ensureCursor(): HTMLElement {
  let cursor = document.getElementById(CURSOR_ID)
  if (!cursor) {
    cursor = document.createElement("div")
    cursor.id = CURSOR_ID
    cursor.style.cssText = `
      position: fixed; width: 18px; height: 18px; border-radius: 50%;
      background: hsl(0 84% 60%); border: 2px solid white; pointer-events: none;
      z-index: 2147483646; transform: translate(-50%, -50%); transition: left 0.2s ease, top 0.2s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    `
    document.documentElement.appendChild(cursor)
  }
  return cursor
}

export function moveCursor(x: number, y: number): void {
  const cursor = ensureCursor()
  cursor.style.left = `${x}px`
  cursor.style.top = `${y}px`
}

export function setCaption(text: string): void {
  let caption = document.getElementById(CAPTION_ID)
  if (!caption) {
    caption = document.createElement("div")
    caption.id = CAPTION_ID
    caption.style.cssText = `
      position: fixed; left: 16px; bottom: 16px; max-width: 320px;
      background: rgba(0,0,0,0.8); color: white; padding: 8px 12px;
      border-radius: 8px; font: 13px/1.4 Inter, system-ui, sans-serif;
      z-index: 2147483646; pointer-events: none;
    `
    document.documentElement.appendChild(caption)
  }
  caption.textContent = text
}

export function showStopOverlay(onStop: () => void): void {
  if (document.getElementById(STOP_ID)) return

  const overlay = document.createElement("div")
  overlay.id = STOP_ID
  overlay.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  `

  const button = document.createElement("button")
  button.textContent = "Stop Agent"
  button.style.cssText = `
    background: hsl(0 84% 60%); color: white; border: none; border-radius: 999px;
    padding: 10px 16px; font: 600 13px Inter, system-ui, sans-serif; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `
  button.addEventListener("click", onStop)
  overlay.appendChild(button)
  document.documentElement.appendChild(overlay)
}

export function hideStopOverlay(): void {
  document.getElementById(STOP_ID)?.remove()
}

export function hideAgentUi(): void {
  document.getElementById(CURSOR_ID)?.remove()
  document.getElementById(CAPTION_ID)?.remove()
  hideStopOverlay()
}

export function startScreenshotSelection(
  onComplete: (region: { x: number; y: number; width: number; height: number }) => void,
  onCancel: () => void
): void {
  const overlay = document.createElement("div")
  overlay.id = "agentman-screenshot-overlay"
  overlay.style.cssText = `
    position: fixed; inset: 0; cursor: crosshair; z-index: 2147483647;
    background: rgba(0,0,0,0.15);
  `

  const selection = document.createElement("div")
  selection.style.cssText = `
    position: fixed; border: 2px dashed white; background: rgba(59,130,246,0.15);
    display: none; pointer-events: none;
  `
  overlay.appendChild(selection)

  let startX = 0
  let startY = 0
  let dragging = false

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cleanup()
      onCancel()
    }
  }

  const cleanup = () => {
    overlay.remove()
    document.removeEventListener("keydown", onKeyDown)
  }

  overlay.addEventListener("mousedown", (e) => {
    dragging = true
    startX = e.clientX
    startY = e.clientY
    selection.style.display = "block"
    selection.style.left = `${startX}px`
    selection.style.top = `${startY}px`
    selection.style.width = "0"
    selection.style.height = "0"
  })

  overlay.addEventListener("mousemove", (e) => {
    if (!dragging) return
    const x = Math.min(startX, e.clientX)
    const y = Math.min(startY, e.clientY)
    const width = Math.abs(e.clientX - startX)
    const height = Math.abs(e.clientY - startY)
    selection.style.left = `${x}px`
    selection.style.top = `${y}px`
    selection.style.width = `${width}px`
    selection.style.height = `${height}px`
  })

  overlay.addEventListener("mouseup", (e) => {
    if (!dragging) return
    dragging = false
    const x = Math.min(startX, e.clientX)
    const y = Math.min(startY, e.clientY)
    const width = Math.abs(e.clientX - startX)
    const height = Math.abs(e.clientY - startY)
    cleanup()
    if (width < 4 || height < 4) {
      onCancel()
      return
    }
    onComplete({ x, y, width, height })
  })

  document.addEventListener("keydown", onKeyDown)
  document.documentElement.appendChild(overlay)
}

export function cropDataUrl(
  dataUrl: string,
  region: { x: number; y: number; width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      const dpr = window.devicePixelRatio || 1
      canvas.width = region.width * dpr
      canvas.height = region.height * dpr
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas unavailable"))
        return
      }
      ctx.drawImage(
        img,
        region.x * dpr,
        region.y * dpr,
        region.width * dpr,
        region.height * dpr,
        0,
        0,
        region.width * dpr,
        region.height * dpr
      )
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => reject(new Error("Failed to load screenshot"))
    img.src = dataUrl
  })
}
