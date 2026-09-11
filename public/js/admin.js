let elections = [];
let auditPage = 1;
let searchTimer;
const viewTitles = { dashboard: "Dashboard", elections: "Elections", voters: "Voters", results: "Results & Reports", audit: "Audit Logs", settings: "Settings" };

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

document.querySelectorAll(".sidebar a[data-view]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelectorAll(".sidebar a[data-view]").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    document.querySelectorAll("[id^='view-']").forEach((view) => { view.style.display = "none"; });
    document.getElementById(`view-${link.dataset.view}`).style.display = "block";
    document.getElementById("admin-view-title").textContent = viewTitles[link.dataset.view];
    document.getElementById("admin-sidebar").classList.remove("is-open");
    if (link.dataset.view === "audit") loadAuditLogs();
    if (link.dataset.view === "settings") loadSettings();
  });
});

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  document.getElementById("admin-sidebar").classList.toggle("is-open");
});

document.getElementById("logout-link").addEventListener("click", async (event) => {
  event.preventDefault();
  await api("/auth/logout", { method: "POST" });
  window.location.href = "/";
});

function transitionButtons(election) {
  const transitions = { DRAFT: ["SCHEDULED"], SCHEDULED: ["ACTIVE"], ACTIVE: ["PAUSED", "CLOSED"], PAUSED: ["ACTIVE", "CLOSED"], CLOSED: ["RESULTS_PUBLISHED"] };
  const actions = document.createElement("div");
  (transitions[election.status] || []).forEach((status) => {
    const button = make("button", "btn btn-outline", status);
    button.dataset.transition = status;
    button.dataset.id = election.id;
    button.style.marginLeft = "6px";
    actions.appendChild(button);
  });
  return actions;
}

async function loadElections() {
  const response = await api("/admin/elections");
  elections = response.elections;
  [document.getElementById("election-select"), document.getElementById("results-election-select")].forEach((select) => {
    select.replaceChildren(...elections.map((election) => {
      const option = make("option", "", `${election.title} (${election.status})`);
      option.value = election.id;
      return option;
    }));
  });

  document.getElementById("elections-list").replaceChildren(...elections.map((election) => {
    const row = document.createElement("div");
    row.style.cssText = "padding:10px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center";
    const summary = document.createElement("div");
    const badge = election.status === "ACTIVE" ? "active" : ["CLOSED", "RESULTS_PUBLISHED"].includes(election.status) ? "closed" : "draft";
    summary.append(make("strong", "", election.title), " ", make("span", `badge badge-${badge}`, election.status));
    row.append(summary, transitionButtons(election));
    return row;
  }));
  document.querySelectorAll("[data-transition]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/admin/elections/${button.dataset.id}/transition`, { method: "POST", body: { status: button.dataset.transition } });
      await loadElections();
    });
  });
  if (elections.length) {
    await loadDashboard(document.getElementById("election-select").value);
    await loadResults(document.getElementById("results-election-select").value);
  }
}

async function loadDashboard(electionId) {
  if (!electionId) return;
  const response = await api(`/admin/results/elections/${electionId}/dashboard`);
  const values = [[response.metrics.registeredVoters, "Registered Voters"], [response.metrics.votesCast, "Votes Cast"], [`${response.metrics.turnoutRate}%`, "Turnout Rate"], [response.metrics.positions, "Positions"]];
  document.getElementById("metrics").replaceChildren(...values.map(([value, label]) => {
    const card = make("div", "metric-card");
    card.append(make("div", "value", value), make("div", "label", label));
    return card;
  }));
  document.getElementById("status-card").replaceChildren(
    make("h2", "", response.election.title),
    make("span", `badge badge-${response.election.status === "ACTIVE" ? "active" : "draft"}`, response.election.status),
    make("p", "muted", `Start: ${new Date(response.election.startDate).toLocaleString()} · End: ${new Date(response.election.endDate).toLocaleString()}`),
    make("p", "muted", response.resultsVisible ? "Results are available." : "Candidate totals are hidden until this election closes, to avoid influencing ongoing voting."),
  );
  const turnout = await api(`/admin/results/elections/${electionId}/turnout-timeline`);
  charts.drawLineChart(document.getElementById("turnout-chart"), turnout.timeline.map((item, index) => ({ x: index, y: item.cumulative })), { label: "Cumulative votes" });
  const participation = await api(`/admin/results/elections/${electionId}/position-participation`);
  charts.drawBarChart(document.getElementById("position-chart"), participation.positions.map((position) => ({ label: position.title, value: position.ballotsWithSelection })));
  const alerts = await api("/admin/audit/security-alerts");
  const container = document.getElementById("security-alerts");
  if (!alerts.alerts.length) container.replaceChildren(make("p", "muted", `No security alerts in the last ${alerts.windowHours}h.`));
  else container.replaceChildren(...alerts.alerts.map((alert) => {
    const row = document.createElement("div");
    row.style.cssText = "padding:8px 0;border-bottom:1px solid var(--border)";
    row.append(make("span", `badge badge-${alert.severity === "high" ? "closed" : "draft"}`, alert.severity.toUpperCase()), ` ${alert.actor} — ${alert.count} failed login attempts`);
    return row;
  }));
}

async function loadResults(electionId) {
  if (!electionId) return;
  document.getElementById("download-report").href = `/api/admin/reports/elections/${electionId}/report.pptx`;
  const container = document.getElementById("results-container");
  try {
    const response = await api(`/admin/results/elections/${electionId}/results`);
    const nodes = [];
    response.results.forEach((position) => {
      nodes.push(make("h3", "", position.positionTitle));
      position.candidates.forEach((candidate) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)";
        row.append(make("span", "", candidate.fullName), make("strong", "", candidate.votes));
        nodes.push(row);
      });
    });
    container.replaceChildren(...nodes);
  } catch (err) {
    container.replaceChildren(make("p", "muted", err.message));
  }
}

async function searchVoters(query) {
  const response = await api(`/admin/voters?q=${encodeURIComponent(query || "")}`);
  document.getElementById("voters-table").replaceChildren(...response.students.map((student) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)";
    const details = document.createElement("div");
    details.append(make("strong", "", student.fullName), ` — ${student.matricNumber}`, document.createElement("br"), make("span", "muted", `${student.email} · ${student.department || ""} ${student.level || ""}`));
    row.append(details, make("span", `badge badge-${student.accountStatus === "ACTIVE" ? "active" : "closed"}`, student.accountStatus));
    return row;
  }));
}

async function loadAuditLogs() {
  const action = document.getElementById("audit-filter").value.trim();
  const response = await api(`/admin/audit?page=${auditPage}&pageSize=20${action ? `&action=${encodeURIComponent(action)}` : ""}`);
  const nodes = response.logs.map((log) => {
    const row = document.createElement("div");
    row.style.cssText = "padding:8px 0;border-bottom:1px solid var(--border);font-size:13px";
    const entity = log.entity ? ` · ${log.entity}${log.entityId ? ` (${log.entityId.slice(0, 8)}…)` : ""}` : "";
    row.append(make("strong", "", log.action), ` — ${log.actor}`, document.createElement("br"), make("span", "muted", `${new Date(log.createdAt).toLocaleString()}${entity}`));
    return row;
  });
  document.getElementById("audit-table").replaceChildren(...(nodes.length ? nodes : [make("p", "muted", "No audit entries match.")]));
}

async function loadSettings() {
  const [response, me] = await Promise.all([api("/admin/settings"), api("/auth/me")]);
  ["SITE_NAME", "SUPPORT_EMAIL", "ELECTORAL_OFFICE_CONTACT"].forEach((key) => { document.getElementById(`setting-${key}`).value = response.settings[key] || ""; });
  document.getElementById("account-management-card").style.display = me.student.role === "ADMIN" ? "block" : "none";
}

document.getElementById("election-select").addEventListener("change", (event) => loadDashboard(event.target.value));
document.getElementById("results-election-select").addEventListener("change", (event) => loadResults(event.target.value));
document.getElementById("create-election-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/admin/elections", { method: "POST", body: { title: document.getElementById("e-title").value, academicSession: document.getElementById("e-session").value, startDate: document.getElementById("e-start").value, endDate: document.getElementById("e-end").value } });
  event.target.reset();
  await loadElections();
});
document.getElementById("import-btn").addEventListener("click", async () => {
  const file = document.getElementById("csv-file").files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const response = await api("/admin/voters/import", { method: "POST", body: form, isForm: true });
  document.getElementById("import-result").textContent = `Created: ${response.created}, Skipped: ${response.skipped}, Errors: ${response.errors.length}`;
});
document.getElementById("voter-search").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchVoters(event.target.value), 300); });
document.getElementById("audit-filter").addEventListener("input", () => { auditPage = 1; loadAuditLogs(); });
document.getElementById("audit-prev").addEventListener("click", () => { auditPage = Math.max(1, auditPage - 1); loadAuditLogs(); });
document.getElementById("audit-next").addEventListener("click", () => { auditPage += 1; loadAuditLogs(); });
document.getElementById("save-settings").addEventListener("click", async () => {
  const message = document.getElementById("settings-msg");
  message.textContent = "Saving…";
  try {
    for (const key of ["SITE_NAME", "SUPPORT_EMAIL", "ELECTORAL_OFFICE_CONTACT"]) {
      await api(`/admin/settings/${key}`, { method: "PUT", body: { value: document.getElementById(`setting-${key}`).value } });
    }
    message.textContent = "Saved.";
  } catch (err) { message.textContent = err.message; }
});

document.getElementById("create-account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("account-msg");
  message.textContent = "Creating account…";
  try {
    const response = await api("/admin/accounts", {
      method: "POST",
      body: {
        fullName: document.getElementById("account-full-name").value,
        email: document.getElementById("account-email").value,
        role: document.getElementById("account-role").value,
        password: document.getElementById("account-password").value,
      },
    });
    event.target.reset();
    message.textContent = `${response.account.role} account created for ${response.account.fullName}.`;
  } catch (err) {
    message.textContent = err.message;
  }
});

loadElections().catch((err) => { document.getElementById("elections-list").textContent = err.message; });
searchVoters("").catch(() => {});
