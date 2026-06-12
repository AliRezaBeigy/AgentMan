let suppressDepth = 0
let savedDialogs: { alert: typeof window.alert; confirm: typeof window.confirm } | null = null

export function suppressPageValidation(): void {
  suppressDepth += 1
  if (suppressDepth > 1) return

  savedDialogs = {
    alert: window.alert?.bind(window) ?? (() => {}),
    confirm: window.confirm?.bind(window) ?? (() => true)
  }
  window.alert = () => {}
  window.confirm = () => true
}

export function restorePageValidation(): void {
  if (suppressDepth <= 0) return
  suppressDepth -= 1
  if (suppressDepth > 0 || !savedDialogs) return

  window.alert = savedDialogs.alert
  window.confirm = savedDialogs.confirm
  savedDialogs = null
}

/** Clear HTML5 validity state on a field after programmatic fill. */
export function clearFieldValidation(el: Element): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    el.setCustomValidity("")
  }
  const form = el.closest("form")
  if (form instanceof HTMLFormElement) {
    form.noValidate = true
  }
}
