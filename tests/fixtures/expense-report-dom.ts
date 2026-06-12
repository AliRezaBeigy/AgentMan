/** Minimal expense-report DOM matching fillapp.ai structure (date grid rows + Add row). */

export interface MountedExpenseReport {
  root: HTMLElement
  getAddRowClickCount: () => number
  getRowCount: () => number
}

export function mountExpenseReportForm(initialRows = 4): MountedExpenseReport {
  document.body.innerHTML = ""

  const root = document.createElement("div")
  root.className = "space-y-4"

  const meta = document.createElement("div")
  meta.className = "grid gap-3 sm:grid-cols-3 rounded-lg border p-4"
  meta.innerHTML = `
    <div class="space-y-1.5">
      <label for="er-name">Report name</label>
      <input id="er-name" value="Q1 Sales Trip" />
    </div>
    <div class="space-y-1.5">
      <label for="er-dept">Department</label>
      <button type="button" role="combobox" id="er-dept"><span>Sales</span></button>
    </div>
    <div class="space-y-1.5">
      <label for="er-period">Period</label>
      <input id="er-period" type="text" value="Mar 15 – Mar 20, 2026" />
    </div>
  `
  root.appendChild(meta)

  const columnHeader = document.createElement("div")
  columnHeader.className = "hidden sm:grid sm:grid-cols-4 text-xs"
  columnHeader.innerHTML = "<span>Date</span><span>Description</span><span>Category</span><span>Amount</span>"
  root.appendChild(columnHeader)

  let addRowClicks = 0

  const createRow = (): HTMLElement => {
    const row = document.createElement("div")
    row.className =
      "grid grid-cols-1 sm:grid-cols-[100px_1fr_130px_100px_36px] gap-2 items-center rounded-lg border p-2"
    row.innerHTML = `
      <input type="date" />
      <input type="text" placeholder="What was it for?" />
      <button type="button" role="combobox"><span>Category</span></button>
      <input type="number" step="0.01" placeholder="0.00" />
      <button type="button" title="Remove row">×</button>
    `
    return row
  }

  const footer = document.createElement("div")
  footer.className = "flex items-center justify-between pt-3 border-t border-border"

  const addBtn = document.createElement("button")
  addBtn.type = "button"
  addBtn.className = "flex items-center gap-1.5 text-sm font-medium"
  addBtn.innerHTML = `<span>Add row</span>`
  addBtn.addEventListener("click", () => {
    addRowClicks += 1
    root.insertBefore(createRow(), footer)
  })
  footer.appendChild(addBtn)

  root.appendChild(footer)

  for (let i = 0; i < initialRows; i++) {
    root.insertBefore(createRow(), footer)
  }
  document.body.appendChild(root)

  const countRows = () =>
    Array.from(root.querySelectorAll("div[class*='grid-cols']")).filter((row) =>
      row.querySelector('input[type="date"]')
    ).length

  return {
    root,
    getAddRowClickCount: () => addRowClicks,
    getRowCount: countRows
  }
}
