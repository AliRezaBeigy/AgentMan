const CDP_VERSION = "1.3"

export class CdpSession {
  private tabId: number | null = null

  async attach(tabId: number): Promise<void> {
    if (this.tabId === tabId) return
    await this.detach()
    await chrome.debugger.attach({ tabId }, CDP_VERSION)
    this.tabId = tabId
  }

  async detach(): Promise<void> {
    if (this.tabId == null) return
    try {
      await chrome.debugger.detach({ tabId: this.tabId })
    } catch {
      // already detached
    }
    this.tabId = null
  }

  get attachedTabId(): number | null {
    return this.tabId
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (this.tabId == null) {
      throw new Error("CDP session not attached")
    }
    const result = await chrome.debugger.sendCommand({ tabId: this.tabId }, method, params ?? {})
    return result as T
  }

  async clickAt(x: number, y: number): Promise<void> {
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1
    })
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1
    })
  }

  async clickSelector(selector: string): Promise<void> {
    const rect = await this.getElementRect(selector)
    if (!rect) throw new Error(`Element not found: ${selector}`)
    await this.clickAt(rect.x + rect.width / 2, rect.y + rect.height / 2)
  }

  async typeText(text: string, selector?: string): Promise<void> {
    if (selector) {
      await this.clickSelector(selector)
    }
    await this.send("Input.insertText", { text })
  }

  async fillSelector(selector: string, value: string): Promise<void> {
    const objectId = await this.queryObjectId(selector)
    if (!objectId) throw new Error(`Element not found: ${selector}`)

    await this.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(value) {
        if (this.type === 'checkbox') {
          this.checked = value === 'true' || value === true;
        } else if (this.tagName === 'SELECT') {
          this.value = value;
        } else {
          this.value = value;
        }
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
      }`,
      arguments: [{ value }]
    })
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url })
  }

  async navigateBack(): Promise<void> {
    const history = await this.send<{ currentIndex: number; entries: unknown[] }>(
      "Page.getNavigationHistory"
    )
    if (history.currentIndex <= 0) return
    await this.send("Page.navigateToHistoryEntry", {
      entryId: (history as { entries: Array<{ id: number }> }).entries[
        history.currentIndex - 1
      ].id
    })
  }

  async uploadFile(selector: string, files: string[]): Promise<void> {
    const { root } = await this.send<{ root: { nodeId: number } }>("DOM.getDocument")
    const { nodeId } = await this.send<{ nodeId: number }>("DOM.querySelector", {
      nodeId: root.nodeId,
      selector
    })
    if (!nodeId) throw new Error(`File input not found: ${selector}`)
    await this.send("DOM.setFileInputFiles", { nodeId, files })
  }

  private async queryObjectId(selector: string): Promise<string | null> {
    const { result } = await this.send<{ result: { objectId?: string } }>("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: false
    })
    return result.objectId ?? null
  }

  async evaluateBoolean(expression: string): Promise<boolean> {
    const value = await this.evaluateJson<boolean>(expression)
    return value === true
  }

  async evaluateJson<T>(expression: string): Promise<T | null> {
    const { result } = await this.send<{ result: { value?: T } }>("Runtime.evaluate", {
      expression,
      returnByValue: true
    })
    return result.value ?? null
  }

  async clickSelectorDom(selector: string): Promise<void> {
    const objectId = await this.queryObjectId(selector)
    if (!objectId) throw new Error(`Element not found: ${selector}`)

    await this.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() {
        this.scrollIntoView({ block: "center", inline: "center" });
        if (typeof this.click === "function") this.click();
      }`
    })
  }

  async waitUntil(
    expression: string,
    options: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 8000
    const intervalMs = options.intervalMs ?? 200
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (await this.evaluateBoolean(expression)) return true
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    return false
  }

  private async getElementRect(
    selector: string
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const objectId = await this.queryObjectId(selector)
    if (!objectId) return null
    const { result } = await this.send<{
      result: { value?: { x: number; y: number; width: number; height: number } }
    }>("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() {
        const rect = this.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }`,
      returnByValue: true
    })
    return result.value ?? null
  }
}

export const cdpSession = new CdpSession()
