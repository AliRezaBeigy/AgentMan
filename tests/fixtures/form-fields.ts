import type { FormFieldDescriptor, RepeatableSectionDescriptor } from "~/lib/types"

/** FillApp-style contact form (fillapp.ai) */
export const contactFormFields: FormFieldDescriptor[] = [
  {
    selector: "#nc-name",
    tag: "input",
    type: "text",
    id: "nc-name",
    label: "Contact name"
  },
  {
    selector: "#nc-company",
    tag: "input",
    type: "text",
    id: "nc-company",
    label: "Company"
  },
  {
    selector: "#nc-title",
    tag: "input",
    type: "text",
    id: "nc-title",
    label: "Job title"
  },
  {
    selector: "#nc-email",
    tag: "input",
    type: "email",
    id: "nc-email",
    label: "Email"
  },
  {
    selector: "#nc-phone",
    tag: "input",
    type: "tel",
    id: "nc-phone",
    label: "Phone"
  },
  {
    selector: "#nc-source",
    tag: "select",
    type: "select",
    id: "nc-source",
    label: "Lead source",
    options: [
      { value: "web", label: "Website" },
      { value: "referral", label: "Referral" },
      { value: "event", label: "Event" },
      { value: "other", label: "Other" }
    ]
  },
  {
    selector: '[data-agentman-field-key="Priority"]',
    tag: "button",
    type: "button-group",
    label: "Priority",
    widget: "button-group",
    options: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" }
    ]
  },
  {
    selector: "#nc-notes",
    tag: "textarea",
    type: "textarea",
    id: "nc-notes",
    label: "Notes"
  },
  {
    selector: "#nc-file",
    tag: "input",
    type: "file",
    id: "nc-file",
    label: "File",
    isFileInput: true
  }
]

/** Expense report with repeating rows */
export const expenseFormFields: FormFieldDescriptor[] = [
  {
    selector: "#er-name",
    tag: "input",
    type: "text",
    id: "er-name",
    label: "Report name"
  },
  {
    selector: "#er-dept",
    tag: "select",
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
  },
  {
    selector: '[data-agentman-field-key="Row 1 - Date"]',
    tag: "input",
    type: "date",
    label: "Row 1 - Date"
  },
  {
    selector: '[data-agentman-field-key="Row 1 - Description"]',
    tag: "input",
    type: "text",
    label: "Row 1 - Description"
  },
  {
    selector: '[data-agentman-field-key="Row 1 - Category"]',
    tag: "select",
    type: "select",
    label: "Row 1 - Category",
    widget: "combobox"
  },
  {
    selector: '[data-agentman-field-key="Row 1 - Amount"]',
    tag: "input",
    type: "number",
    label: "Row 1 - Amount"
  },
  {
    selector: '[data-agentman-field-key="Row 2 - Date"]',
    tag: "input",
    type: "date",
    label: "Row 2 - Date"
  },
  {
    selector: '[data-agentman-field-key="Row 2 - Description"]',
    tag: "input",
    type: "text",
    label: "Row 2 - Description"
  },
  {
    selector: '[data-agentman-field-key="Row 2 - Category"]',
    tag: "select",
    type: "select",
    label: "Row 2 - Category",
    widget: "combobox"
  },
  {
    selector: '[data-agentman-field-key="Row 2 - Amount"]',
    tag: "input",
    type: "number",
    label: "Row 2 - Amount"
  }
]

export const expenseRepeatableSections: RepeatableSectionDescriptor[] = [
  {
    addButtonSelector: 'button:has-text("Add row")',
    addButtonLabel: "Add row",
    sectionSelector: ".expense-rows",
    rowCount: 2
  }
]
