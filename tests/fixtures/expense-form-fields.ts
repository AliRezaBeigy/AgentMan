import type { FormFieldDescriptor, RepeatableSectionDescriptor } from "~/lib/types"

const ROW_COLUMNS = ["Date", "Description", "Category", "Amount"] as const

export function buildExpenseFormFields(rowCount: number): FormFieldDescriptor[] {
  const fields: FormFieldDescriptor[] = [
    {
      selector: "#er-name",
      tag: "input",
      type: "text",
      id: "er-name",
      label: "Report name"
    },
    {
      selector: "#er-dept",
      tag: "button",
      type: "select",
      id: "er-dept",
      label: "Department",
      widget: "combobox"
    },
    {
      selector: "#er-period",
      tag: "input",
      type: "text",
      id: "er-period",
      label: "Period"
    }
  ]

  for (let row = 1; row <= rowCount; row++) {
    for (const col of ROW_COLUMNS) {
      const label = `Row ${row} - ${col}`
      const type =
        col === "Date" ? "date" : col === "Amount" ? "number" : col === "Category" ? "select" : "text"
      fields.push({
        selector: `[data-agentman-field-key="${label}"]`,
        tag: col === "Category" ? "button" : "input",
        type,
        label,
        ...(col === "Category" ? { widget: "combobox" as const } : {})
      })
    }
  }

  return fields
}

export function buildExpenseRepeatableSection(rowCount: number): RepeatableSectionDescriptor[] {
  return [
    {
      addButtonSelector: '[data-agentman-add-button="row"]',
      addButtonLabel: "Add row",
      sectionSelector: '[data-agentman-repeatable-section="0"]',
      rowCount
    }
  ]
}

export const expenseRowFieldLabels = (rowCount: number): string[] => {
  const labels: string[] = []
  for (let row = 1; row <= rowCount; row++) {
    for (const col of ROW_COLUMNS) {
      labels.push(`Row ${row} - ${col}`)
    }
  }
  return labels
}
