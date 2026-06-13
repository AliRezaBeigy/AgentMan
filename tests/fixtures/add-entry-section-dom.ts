export function mountAddEntrySectionForm(): void {
  document.body.innerHTML = `
    <section id="section-experience">
      <h2>Work experience</h2>
      <p>
        <button type="button" id="add-experience-btn">Add work experience</button>
      </p>
      <div class="collapse">
        <form id="experience-form">
          <label for="job-title">Title</label>
          <input type="text" id="job-title" name="title" />
          <label for="job-company">Employer</label>
          <input type="text" id="job-company" name="company" />
          <button type="submit">Add</button>
          <button type="button" class="btn-cancel" data-skilltype="experience">Cancel</button>
        </form>
      </div>
      <div id="experience-list">
        <div id="exp-1" class="experience-row">2020-2021 | Acme Corp | Engineer</div>
        <div id="exp-2" class="experience-row">2018-2019 | Beta LLC | Intern</div>
      </div>
    </section>
    <section id="section-profile">
      <h2>Personal details</h2>
      <label for="full-name">Full name</label>
      <input type="text" id="full-name" name="name" />
    </section>
  `
}
