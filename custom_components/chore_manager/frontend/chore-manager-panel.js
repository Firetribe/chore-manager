const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[char]));

class ChoreManagerPanel extends HTMLElement {
  connectedCallback() {
    if (!this._hass) {
      this.textContent = "Loading chores...";
    }
  }

  set hass(hass) {
    this._hass = hass;
    try {
      this._render();
    } catch (error) {
      this._signature = undefined;
      console.error("Chore Manager panel failed to render", error);
      this.textContent = `Chore Manager could not render: ${error.message}`;
    }
  }

  _render() {
    if (!this._hass) return;

    const language = this._hass.locale?.language?.startsWith("de") ? "de" : "en";
    const german = language === "de";
    const personName = (person) => person.name || person.attributes?.friendly_name || person.entity_id;
    const chores = Object.values(this._hass.states)
      .filter((state) => state.entity_id.startsWith("sensor.") && state.attributes?.chore_id)
      .map((state) => {
        const attributes = state.attributes;
        const lastDone = attributes.last_done ? Date.parse(attributes.last_done) : NaN;
        const dueAt = Number.isNaN(lastDone)
          ? Date.now()
          : lastDone + Number(attributes.frequency_days || 1) * 86400000;
        return { state, attributes, dueAt };
      })
      .sort((left, right) => left.dueAt - right.dueAt);
    const people = Object.values(this._hass.states)
      .filter((state) => state.entity_id.startsWith("person."))
      .sort((left, right) => personName(left).localeCompare(personName(right), language));
    const signature = JSON.stringify([
      chores.map(({ state }) => [state.entity_id, state.state, state.attributes]),
      people.map((person) => [person.entity_id, person.name]),
    ]);
    if (signature === this._signature) return;
    const formatDate = new Intl.DateTimeFormat(language, { month: "short", day: "numeric", year: "numeric" });
    const personOptions = (selected) => [
      `<option value="">${german ? "Nicht festgelegt" : "Not set"}</option>`,
      ...people.map((person) => `<option value="${escapeHtml(person.entity_id)}" ${person.entity_id === selected ? "selected" : ""}>${escapeHtml(personName(person))}</option>`),
    ].join("");

    this.innerHTML = `
      <style>
        :host{display:block;color:var(--primary-text-color);padding:clamp(16px,4vw,40px);--line:var(--divider-color,#d8d8d8);--soft:var(--secondary-background-color,#f4f5f2);--accent:var(--success-color,#27815b)}
        .page{max-width:1120px;margin:0 auto}header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:8px 0 22px;border-bottom:2px solid var(--primary-text-color)}
        h1{font:700 2rem Georgia,serif;margin:0}.count{color:var(--secondary-text-color);font-size:.95rem}h2{font-size:1.05rem;margin:0 0 16px}
        .add{padding:22px 0;border-bottom:1px solid var(--line)}form{display:grid;grid-template-columns:minmax(180px,2fr) minmax(120px,1fr) minmax(140px,1fr) auto;align-items:end;gap:12px}
        label{display:grid;gap:6px;font-size:.82rem;color:var(--secondary-text-color)}input,select,button{font:inherit;color:var(--primary-text-color)}input,select{box-sizing:border-box;width:100%;min-height:42px;padding:8px 10px;border:1px solid var(--line);border-radius:4px;background:var(--card-background-color,#fff)}
        button{min-height:40px;padding:8px 14px;border:1px solid var(--line);border-radius:4px;background:var(--card-background-color,#fff);font-weight:650;cursor:pointer}button:hover{border-color:var(--primary-text-color)}button.primary{background:var(--primary-text-color);color:var(--card-background-color,#fff);border-color:var(--primary-text-color)}
        .list{padding-top:22px}.rows{display:grid}.row{display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(130px,.8fr) minmax(140px,.8fr) minmax(180px,1fr) auto;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
        .title{font-weight:700}.meta{font-size:.84rem;color:var(--secondary-text-color);margin-top:4px}.due{font-variant-numeric:tabular-nums}.status{display:inline-flex;align-items:center;gap:7px;font-size:.85rem;font-weight:650}.dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}.dot.due_soon{background:var(--warning-color,#d49b22)}.dot.overdue{background:var(--error-color,#c94338)}.person-actions{display:grid;grid-template-columns:minmax(130px,1fr) auto;gap:7px;align-items:center}.actions{display:flex;gap:7px}.empty{padding:30px 0;color:var(--secondary-text-color)}
        @media(max-width:760px){form{grid-template-columns:1fr 1fr}.row{grid-template-columns:1fr 1fr;gap:10px}.row-main{grid-column:1/-1}.person-actions{grid-column:1/-1}.actions{grid-column:1/-1}.actions button{flex:1}}
        @media(max-width:440px){:host{padding:16px}form{grid-template-columns:1fr}.row{grid-template-columns:1fr}.row-main,.person-actions,.actions{grid-column:auto}.person-actions{grid-template-columns:1fr auto}.actions{display:grid;grid-template-columns:1fr 1fr}}
      </style>
      <main class="page">
        <header><h1>${german ? "Aufgaben" : "Chores"}</h1><span class="count">${chores.length} ${german ? (chores.length === 1 ? "Aufgabe" : "Aufgaben") : (chores.length === 1 ? "chore" : "chores")}</span></header>
        <section class="add" aria-labelledby="add-title">
          <h2 id="add-title">${german ? "Aufgabe hinzufügen" : "Add a chore"}</h2>
          <form id="add-form">
            <label>${german ? "Aufgabe" : "Chore name"}<input name="name" required maxlength="100" placeholder="${german ? "Zum Beispiel: Bad putzen" : "For example: Clean bathroom"}"></label>
            <label>${german ? "Intervall in Tagen" : "Repeat every (days)"}<input name="frequency_days" type="number" min="1" step="1" value="7" required></label>
            <label>${german ? "Raum (optional)" : "Room (optional)"}<input name="room" maxlength="100"></label>
            <button class="primary" type="submit">${german ? "Hinzufügen" : "Add chore"}</button>
          </form>
        </section>
        <section class="list" aria-labelledby="list-title">
          <h2 id="list-title">${german ? "Als Nächstes fällig" : "Upcoming chores"}</h2>
          ${chores.length ? `<div class="rows">${chores.map(({ state, attributes, dueAt }) => {
            const status = state.state;
            const doneBy = attributes.done_by_entity || "";
            const dueLabel = formatDate.format(new Date(dueAt));
            const room = [attributes.floor, attributes.room].filter(Boolean).join(" · ");
            return `<article class="row" data-id="${escapeHtml(attributes.chore_id)}" data-name="${escapeHtml(attributes.chore_name || state.name)}" data-frequency="${escapeHtml(attributes.frequency_days)}">
              <div class="row-main"><div class="title">${escapeHtml(attributes.chore_name || state.name)}</div><div class="meta">${escapeHtml(room || (german ? "Kein Raum" : "No room"))} · ${german ? "alle" : "every"} ${escapeHtml(attributes.frequency_days)} ${german ? "Tage" : "days"}</div></div>
              <div><div class="status"><span class="dot ${escapeHtml(status)}"></span>${status === "overdue" ? (german ? "Überfällig" : "Overdue") : status === "due_soon" ? (german ? "Bald fällig" : "Due soon") : (german ? "Geplant" : "On track")}</div><div class="meta due">${german ? "Fällig" : "Due"} ${escapeHtml(dueLabel)}</div></div>
              <div><div class="meta">${german ? "Zuletzt erledigt von" : "Last done by"}</div><div class="title">${escapeHtml(attributes.done_by || (german ? "Noch nicht erledigt" : "Not completed yet"))}</div></div>
              <div class="person-actions"><select aria-label="${german ? "Person" : "Person"}" data-person>${personOptions(doneBy)}</select><button type="button" data-save>${german ? "Speichern" : "Save person"}</button></div>
              <div class="actions"><button class="primary" type="button" data-done>${german ? "Erledigt" : "Mark done"}</button><button type="button" data-edit>${german ? "Bearbeiten" : "Edit"}</button></div>
            </article>`;
          }).join("")}</div>` : `<p class="empty">${german ? "Noch keine Aufgaben. Füge oben deine erste Aufgabe hinzu." : "No chores yet. Add your first chore above."}</p>`}
        </section>
      </main>`;

    this.querySelector("#add-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      this._hass.callService("chore_manager", "add_chore", {
        name: form.get("name").trim(),
        frequency_days: Number(form.get("frequency_days")),
        room: form.get("room").trim(),
      });
      event.currentTarget.reset();
      event.currentTarget.elements.frequency_days.value = 7;
    });

    this.querySelectorAll(".row").forEach((row) => {
      const choreId = row.dataset.id;
      const selectedPerson = () => row.querySelector("[data-person]").value;
      row.querySelector("[data-done]").addEventListener("click", () => {
        const person = selectedPerson();
        this._hass.callService("chore_manager", "mark_done", {
          chore_id: choreId,
          ...(person ? { person } : {}),
        });
      });
      row.querySelector("[data-save]").addEventListener("click", () => {
        const person = this._hass.states[selectedPerson()];
        this._hass.callService("chore_manager", "update_chore", {
          chore_id: choreId,
          done_by: person ? personName(person) : "",
          done_by_entity: person?.entity_id || "",
        });
      });
      row.querySelector("[data-edit]").addEventListener("click", () => {
        const name = prompt(german ? "Name der Aufgabe" : "Chore name", row.dataset.name || "");
        if (name === null || !name.trim()) return;
        const interval = prompt(german ? "Intervall in Tagen" : "Repeat every (days)", row.dataset.frequency || 7);
        if (interval === null || !/^\d+$/.test(interval) || Number(interval) < 1) return;
        this._hass.callService("chore_manager", "update_chore", {
          chore_id: choreId,
          name: name.trim(),
          frequency_days: Number(interval),
        });
      });
    });
    this._signature = signature;
  }
}

customElements.define("chore-manager-panel", ChoreManagerPanel);
