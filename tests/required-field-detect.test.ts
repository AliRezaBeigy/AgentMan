// @vitest-environment happy-dom

import { describe, expect, it } from "vitest"

import {
  buildIndirectAttachmentHint,
  buildMissingRequiredMessage,
  detectFieldRequired,
  getMissingRequiredFields,
  isEmptyFieldValue,
  labelElementIndicatesRequired,
  labelTextIndicatesRequired
} from "~/lib/required-field-detect"
import type { FormFieldDescriptor } from "~/lib/types"

describe("required-field-detect", () => {
  it("detects Varbi education form required markers from DOM", () => {
    document.body.innerHTML = `
      <form id="add-cveducation">
        <label for="education_field">Field of education <span class="required">*</span></label>
        <input id="education_field" name="education_field" />
        <label for="education-country">Country <span class="required">*</span></label>
        <select id="education-country" name="country"><option value="-1">Choose</option><option value="IR">Iran</option></select>
        <label for="education-credits">Credits</label>
        <input id="education-credits" name="credits" />
      </form>
    `
    expect(detectFieldRequired(document.getElementById("education_field")!)).toBe(true)
    expect(detectFieldRequired(document.getElementById("education-country")!)).toBe(true)
    expect(detectFieldRequired(document.getElementById("education-credits")!)).toBe(false)
  })

  it("detects asterisk and sr-only required markers on labels", () => {
    document.body.innerHTML = `
      <label for="education_field">
        Field of education <span class="required">*</span>
      </label>
      <input id="education_field" name="education_field" />
    `
    const input = document.getElementById("education_field")!
    expect(labelElementIndicatesRequired(document.querySelector("label")!)).toBe(true)
    expect(detectFieldRequired(input)).toBe(true)
    expect(labelTextIndicatesRequired("City *")).toBe(true)
  })

  it("maps indirect attachment hints for education labels", () => {
    const field: FormFieldDescriptor = {
      selector: "#education_field",
      tag: "input",
      type: "text",
      label: "Education - Field of education",
      required: true
    }
    expect(buildIndirectAttachmentHint(field)).toContain("major")
  })

  it("treats Choose/-1 select values as empty", () => {
    const field: FormFieldDescriptor = {
      selector: "#education-country",
      tag: "select",
      type: "select",
      label: "Education - Country",
      required: true,
      value: "-1"
    }
    expect(isEmptyFieldValue(field, "-1")).toBe(true)
    expect(isEmptyFieldValue(field, "IR")).toBe(false)
  })

  it("lists missing required fields not in fill batch", () => {
    const fields: FormFieldDescriptor[] = [
      {
        selector: "#a",
        tag: "input",
        type: "text",
        label: "Education - Field of education",
        required: true,
        value: ""
      },
      {
        selector: "#b",
        tag: "input",
        type: "text",
        label: "Education - Education name",
        required: true,
        value: "Master"
      },
      {
        selector: "#c",
        tag: "input",
        type: "text",
        label: "Education - Credits",
        required: false,
        value: ""
      }
    ]
    const missing = getMissingRequiredFields(fields, new Set(["#b"]))
    expect(missing).toHaveLength(1)
    expect(missing[0].label).toContain("Field of education")
    expect(buildMissingRequiredMessage(missing)).toContain("major")
  })
})
