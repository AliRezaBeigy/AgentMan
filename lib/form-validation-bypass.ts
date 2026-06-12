/** In-page script for add-entry submit — bypasses HTML5 + Varbi alert validation. */
export function buildAddEntrySubmitScript(formSelector: string, submitSelector: string): string {
  return `(() => {
    const form = document.querySelector(${JSON.stringify(formSelector)});
    const submit = document.querySelector(${JSON.stringify(submitSelector)});
    if (!form) return { ok: false, error: "form not found" };
    if (!submit) return { ok: false, error: "submit button not found" };

    const prevAlert = window.alert;
    const prevConfirm = window.confirm;
    window.alert = () => {};
    window.confirm = () => true;

    submit.scrollIntoView({ block: "center", inline: "center" });
    const previousNoValidate = form.noValidate;
    form.noValidate = true;

    const requiredEls = [];
    for (const el of form.querySelectorAll("input, select, textarea")) {
      if (el.hasAttribute("required")) {
        requiredEls.push(el);
        el.removeAttribute("required");
      }
      if (typeof el.setCustomValidity === "function") el.setCustomValidity("");
    }

    let submitError = null;
    try {
      submit.click();
    } catch (e) {
      submitError = e instanceof Error ? e.message : String(e);
    } finally {
      form.noValidate = previousNoValidate;
      window.alert = prevAlert;
      window.confirm = prevConfirm;
      for (const el of requiredEls) el.setAttribute("required", "");
    }

    for (const el of document.querySelectorAll(
      ".alert, .alert-danger, [role='alert'], .validation-summary, .help-block.error-message"
    )) {
      const text = el.textContent || "";
      if (/missing or incorrect|required|obligatorisk|felaktig/i.test(text)) {
        el.classList.add("hidden");
        el.style.display = "none";
      }
    }

    return { ok: !submitError, error: submitError ?? undefined };
  })()`
}
