(function () {
  "use strict";

  const STORAGE_KEY = "metal_builder_erp_v3";

  const VIEW_META = {
    dashboard: {
      title: "Dashboard",
      subtitle: "Real-time overview of ongoing projects, expenses, and net profit"
    },
    projects: {
      title: "Projects",
      subtitle: "Create construction projects, assign Skilled/Not Skilled workers, and track status"
    },
    employees: {
      title: "Employees & Salary Rates",
      subtitle: "Add workers, set Hour / Day / Month rates, and edit or delete records"
    },
    timelogs: {
      title: "Time In / Time Out",
      subtitle: "Daily attendance tracking with automatic shift & salary computation"
    },
    salary: {
      title: "Salary & Bale (Cash Advance)",
      subtitle: "Inspect worked days, deduct Bale advances, release payroll ('Nag sahod na'), and view history"
    },
    expenses: {
      title: "Other Project Expenses",
      subtitle: "Track gasoline, employee food, steel materials, and site costs per project"
    },
    settings: {
      title: "Settings & System Accounts",
      subtitle: "Add, edit, or delete Admin and Staff login accounts"
    }
  };

  function getDefaultAccounts() {
    return [
      {
        id: "acc-admin-default",
        name: "Romeo D Guarnes",
        email: "Romeo D Guarnes",
        password: "011105",
        role: "Admin",
        isDefault: true
      }
    ];
  }

  function getEmptyState() {
    return {
      accounts: getDefaultAccounts(),
      currentUserId: null,
      employees: [],
      projects: [],
      timeLogs: [],
      bales: [],
      expenses: [],
      salaryHistory: []
    };
  }

  let state = loadState();
  let currentView = "dashboard";

  function loadState() {
    try {
      localStorage.removeItem("metal_builder_erp_v1");
      localStorage.removeItem("metal_builder_erp_v2");
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getEmptyState();
      const parsed = JSON.parse(raw);
      const accounts =
        Array.isArray(parsed.accounts) && parsed.accounts.length > 0
          ? parsed.accounts
          : getDefaultAccounts();
      const validUser = accounts.some((a) => a.id === parsed.currentUserId)
        ? parsed.currentUserId
        : null;
      return {
        accounts,
        currentUserId: validUser,
        employees: Array.isArray(parsed.employees) ? parsed.employees : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        timeLogs: Array.isArray(parsed.timeLogs) ? parsed.timeLogs : [],
        bales: Array.isArray(parsed.bales) ? parsed.bales : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        salaryHistory: Array.isArray(parsed.salaryHistory) ? parsed.salaryHistory : []
      };
    } catch (e) {
      return getEmptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getCurrentUser() {
    return state.accounts.find((a) => a.id === state.currentUserId) || null;
  }

  function syncAuthScreen() {
    const user = getCurrentUser();
    const loginScreen = document.getElementById("login-screen");
    const appShell = document.getElementById("app-shell");

    if (!user) {
      loginScreen.style.display = "grid";
      appShell.style.display = "none";
      return;
    }

    loginScreen.style.display = "none";
    appShell.style.display = "flex";

    document.getElementById("sidebar-user-box").innerHTML = `
      <strong>${escapeHtml(user.name)}</strong>
      <span>${escapeHtml(user.role)} • ${escapeHtml(user.email)}</span>
    `;
    document.getElementById("topbar-user-pill").textContent =
      `Logged in: ${user.name} (${user.role})`;

    renderAll();
  }

  function peso(val) {
    const num = Number(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function getRateBreakdown(rateType, rateAmount) {
    const amt = Number(rateAmount) || 0;
    let hourly = 0;
    let daily = 0;
    if (rateType === "hour") {
      hourly = amt;
      daily = amt * 8;
    } else if (rateType === "month") {
      daily = amt / 26;
      hourly = daily / 8;
    } else {
      daily = amt;
      hourly = amt / 8;
    }
    return {
      hourly,
      daily,
      weekly: daily * 6,
      monthly: daily * 26
    };
  }

  function computeWorkedHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const [inH, inM] = timeIn.split(":").map(Number);
    const [outH, outM] = timeOut.split(":").map(Number);
    let diff = (outH * 60 + outM - (inH * 60 + inM)) / 60;
    if (diff < 0) diff += 24;
    if (diff > 5) diff -= 1;
    return Math.max(0, Math.round(diff * 100) / 100);
  }

  function getEmployeeBaleBalance(employeeId) {
    return state.bales
      .filter((b) => b.employeeId === employeeId && b.remaining > 0)
      .reduce((sum, b) => sum + Number(b.remaining), 0);
  }

  function getProjectFinancials(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return { labor: 0, other: 0, totalExpense: 0, netProfit: 0 };
    const labor = state.timeLogs
      .filter((l) => l.projectId === projectId)
      .reduce((sum, l) => sum + Number(l.pay), 0);
    const other = state.expenses
      .filter((e) => e.projectId === projectId)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const totalExpense = labor + other;
    const netProfit = Number(project.finalPrice) - totalExpense;
    return { labor, other, totalExpense, netProfit };
  }

  function switchView(viewName) {
    if (!VIEW_META[viewName]) return;
    currentView = viewName;
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === "view-" + viewName);
    });
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });
    document.getElementById("page-title").textContent = VIEW_META[viewName].title;
    document.getElementById("page-subtitle").textContent = VIEW_META[viewName].subtitle;
    document.getElementById("sidebar").classList.remove("open");
    renderAll();
  }

  function renderGlobalBaleNotification() {
    const employeesWithBale = state.employees
      .map((emp) => ({ emp, bal: getEmployeeBaleBalance(emp.id) }))
      .filter((item) => item.bal > 0);

    const badge = document.getElementById("nav-bale-badge");
    const banner = document.getElementById("global-bale-banner");

    if (employeesWithBale.length === 0) {
      badge.style.display = "none";
      banner.style.display = "none";
      return;
    }

    badge.style.display = "inline-block";
    badge.textContent = String(employeesWithBale.length);

    const summaryText = employeesWithBale
      .map((x) => `${escapeHtml(x.emp.name)} (${peso(x.bal)})`)
      .join(", ");

    banner.style.display = "flex";
    banner.innerHTML = `
      <div>
        <strong>⚠️ Down Salary (Bale) Alert:</strong> Employees with active Bale balance: ${summaryText}
      </div>
      <button class="btn btn-amber btn-sm" data-goto="salary">Review Salary &amp; Bale</button>
    `;
  }

  function renderDashboard() {
    const ongoing = state.projects.filter((p) => p.status === "Ongoing");
    const done = state.projects.filter((p) => p.status === "Done");

    let totalPrice = 0;
    let totalLabor = 0;
    let totalOther = 0;

    state.projects.forEach((p) => {
      totalPrice += Number(p.finalPrice) || 0;
      const fin = getProjectFinancials(p.id);
      totalLabor += fin.labor;
      totalOther += fin.other;
    });

    const totalExpenses = totalLabor + totalOther;
    const netProfit = totalPrice - totalExpenses;
    const margin = totalPrice > 0 ? ((netProfit / totalPrice) * 100).toFixed(1) : "0.0";

    document.getElementById("kpi-ongoing-count").textContent = String(ongoing.length);
    document.getElementById("kpi-done-count-sub").textContent = `${done.length} Project(s) Done`;
    document.getElementById("kpi-total-price").textContent = peso(totalPrice);
    document.getElementById("kpi-total-expenses").textContent = peso(totalExpenses);
    document.getElementById("kpi-expense-split").textContent = `Labor: ${peso(totalLabor)} | Site/Mat: ${peso(totalOther)}`;

    const profitEl = document.getElementById("kpi-net-profit");
    profitEl.textContent = peso(netProfit);
    profitEl.className = "kpi-value " + (netProfit >= 0 ? "text-green" : "text-red");
    document.getElementById("kpi-profit-margin").textContent = `${margin}% Overall Profit Margin`;

    const ongoingTbody = document.getElementById("dashboard-ongoing-tbody");
    if (ongoing.length === 0) {
      ongoingTbody.innerHTML = `<tr><td colspan="8" class="helper-text">No ongoing projects yet. Click "+ Manage Projects" to add your first project.</td></tr>`;
    } else {
      ongoingTbody.innerHTML = ongoing
        .map((p) => {
          const fin = getProjectFinancials(p.id);
          const crewNames = (p.assignedEmployeeIds || [])
            .map((id) => state.employees.find((e) => e.id === id)?.name)
            .filter(Boolean);
          return `
            <tr>
              <td><strong>${escapeHtml(p.name)}</strong></td>
              <td>${escapeHtml(p.client)}</td>
              <td>${crewNames.length ? escapeHtml(crewNames.join(", ")) : "<span class='helper-text'>None assigned</span>"}</td>
              <td class="num">${peso(p.finalPrice)}</td>
              <td class="num">${peso(fin.labor)}</td>
              <td class="num">${peso(fin.other)}</td>
              <td class="num ${fin.netProfit >= 0 ? "text-green" : "text-red"}"><strong>${peso(fin.netProfit)}</strong></td>
              <td><span class="badge badge-blue">Ongoing</span></td>
            </tr>
          `;
        })
        .join("");
    }

    const doneTbody = document.getElementById("dashboard-done-tbody");
    if (done.length === 0) {
      doneTbody.innerHTML = `<tr><td colspan="7" class="helper-text">No completed projects yet.</td></tr>`;
    } else {
      doneTbody.innerHTML = done
        .map((p) => {
          const fin = getProjectFinancials(p.id);
          return `
            <tr>
              <td><strong>${escapeHtml(p.name)}</strong></td>
              <td>${escapeHtml(p.client)}</td>
              <td>${escapeHtml(p.completedDate || "—")}</td>
              <td class="num">${peso(p.finalPrice)}</td>
              <td class="num">${peso(fin.totalExpense)}</td>
              <td class="num ${fin.netProfit >= 0 ? "text-green" : "text-red"}"><strong>${peso(fin.netProfit)}</strong></td>
              <td><span class="badge badge-green">Done</span></td>
            </tr>
          `;
        })
        .join("");
    }
  }

  function renderProjects() {
    const checklist = document.getElementById("proj-employee-checklist");
    if (state.employees.length === 0) {
      checklist.innerHTML = `<p class="helper-text">No employees available. Add employees first in the Employees tab.</p>`;
    } else {
      checklist.innerHTML = state.employees
        .map((emp) => {
          const rates = getRateBreakdown(emp.rateType, emp.rateAmount);
          return `
            <div class="checkbox-item">
              <label>
                <input type="checkbox" name="proj-emp" value="${escapeHtml(emp.id)}" />
                <span>${escapeHtml(emp.name)}</span>
              </label>
              <span class="badge ${emp.skill === "Skilled" ? "badge-blue" : "badge-gray"}">
                ${escapeHtml(emp.skill)} (${peso(rates.daily)}/d)
              </span>
            </div>
          `;
        })
        .join("");
    }

    const tbody = document.getElementById("projects-list-tbody");
    if (state.projects.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="helper-text">No projects created yet. Add one using the form on the left.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.projects
      .map((p) => {
        const fin = getProjectFinancials(p.id);
        const crewBadges = (p.assignedEmployeeIds || [])
          .map((id) => {
            const emp = state.employees.find((e) => e.id === id);
            if (!emp) return "";
            return `<span class="badge ${emp.skill === "Skilled" ? "badge-blue" : "badge-gray"}">${escapeHtml(emp.name)} (${escapeHtml(emp.skill)})</span>`;
          })
          .filter(Boolean)
          .join(" ");

        const isDone = p.status === "Done";
        return `
          <tr>
            <td>
              <strong>${escapeHtml(p.name)}</strong><br />
              <span class="helper-text">Client: ${escapeHtml(p.client)}</span>
            </td>
            <td>${crewBadges || "<span class='helper-text'>No crew assigned</span>"}</td>
            <td class="num">${peso(p.finalPrice)}</td>
            <td class="num">${peso(fin.totalExpense)}</td>
            <td class="num ${fin.netProfit >= 0 ? "text-green" : "text-red"}"><strong>${peso(fin.netProfit)}</strong></td>
            <td>
              <span class="badge ${isDone ? "badge-green" : "badge-blue"}">${escapeHtml(p.status)}</span>
            </td>
            <td>
              <div class="action-group">
                <button class="btn btn-outline btn-sm" data-toggle-project="${escapeHtml(p.id)}">
                  ${isDone ? "Reopen" : "Mark Done"}
                </button>
                <button class="btn btn-danger btn-sm" data-delete-project="${escapeHtml(p.id)}">
                  Delete
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderEmployees() {
    const tbody = document.getElementById("employees-tbody");
    if (state.employees.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="helper-text">No employees added yet. Add your workers on the left.</td></tr>`;
      return;
    }

    const rateLabel = { hour: "/ hr", day: "/ day", month: "/ mo" };

    tbody.innerHTML = state.employees
      .map((emp) => {
        const r = getRateBreakdown(emp.rateType, emp.rateAmount);
        const baleBal = getEmployeeBaleBalance(emp.id);
        return `
          <tr>
            <td>
              <strong>${escapeHtml(emp.name)}</strong>
              ${baleBal > 0 ? `<br><span class="badge badge-amber">Bale: ${peso(baleBal)}</span>` : ""}
            </td>
            <td>
              <span class="badge ${emp.skill === "Skilled" ? "badge-blue" : "badge-gray"}">
                ${escapeHtml(emp.skill)}
              </span>
            </td>
            <td><strong>${peso(emp.rateAmount)}</strong> ${rateLabel[emp.rateType] || ""}</td>
            <td class="num">${peso(r.daily)}</td>
            <td class="num">${peso(r.weekly)}</td>
            <td class="num">${peso(r.monthly)}</td>
            <td>
              <div class="action-group">
                <button class="btn btn-outline btn-sm" data-edit-emp="${escapeHtml(emp.id)}">Edit</button>
                <button class="btn btn-danger btn-sm" data-delete-emp="${escapeHtml(emp.id)}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderTimeLogs() {
    const empSelect = document.getElementById("log-employee");
    const projSelect = document.getElementById("log-project");
    const filterSelect = document.getElementById("filter-timelog-emp");
    const currentFilter = filterSelect.value || "all";

    empSelect.innerHTML = state.employees.length
      ? state.employees
          .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)} (${escapeHtml(e.skill)})</option>`)
          .join("")
      : `<option value="">-- Add an employee first --</option>`;

    projSelect.innerHTML = state.projects.length
      ? state.projects
          .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} [${escapeHtml(p.status)}]</option>`)
          .join("")
      : `<option value="">-- Add a project first --</option>`;

    filterSelect.innerHTML =
      `<option value="all">All Employees</option>` +
      state.employees
        .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`)
        .join("");
    filterSelect.value = currentFilter;

    const logs = state.timeLogs
      .filter((l) => currentFilter === "all" || l.employeeId === currentFilter)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    const tbody = document.getElementById("timelogs-tbody");
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="helper-text">No time logs recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs
      .map((l) => {
        const emp = state.employees.find((e) => e.id === l.employeeId);
        const proj = state.projects.find((p) => p.id === l.projectId);
        return `
          <tr>
            <td>${escapeHtml(l.date)}</td>
            <td><strong>${escapeHtml(emp ? emp.name : "Removed Employee")}</strong></td>
            <td>${escapeHtml(proj ? proj.name : "Removed Project")}</td>
            <td>${escapeHtml(l.timeIn)} – ${escapeHtml(l.timeOut)}</td>
            <td class="num">${l.hours} hrs</td>
            <td class="num"><strong>${peso(l.pay)}</strong></td>
            <td>
              ${
                l.paid
                  ? `<span class="badge badge-green">Nag sahod na</span>`
                  : `<span class="badge badge-amber">Unpaid (Pending)</span>`
              }
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderSalaryAndBale() {
    const baleEmpSelect = document.getElementById("bale-employee");
    const salaryEmpSelect = document.getElementById("salary-select-emp");
    const selectedEmpId = salaryEmpSelect.value || (state.employees[0] && state.employees[0].id) || "";

    const empOptions = state.employees.length
      ? state.employees
          .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)} (${escapeHtml(e.skill)})</option>`)
          .join("")
      : `<option value="">-- No employees yet --</option>`;

    baleEmpSelect.innerHTML = empOptions;
    salaryEmpSelect.innerHTML = empOptions;
    if (selectedEmpId && state.employees.some((e) => e.id === selectedEmpId)) {
      salaryEmpSelect.value = selectedEmpId;
    }

    const activeEmpId = salaryEmpSelect.value;
    const panel = document.getElementById("salary-inspector-panel");
    const emp = state.employees.find((e) => e.id === activeEmpId);

    if (!emp) {
      panel.innerHTML = `<p class="helper-text">Add an employee first in the Employees tab to compute salary and Bale.</p>`;
    } else {
      const unpaidLogs = state.timeLogs.filter((l) => l.employeeId === emp.id && !l.paid);
      const totalUnpaidHours = unpaidLogs.reduce((sum, l) => sum + Number(l.hours), 0);
      const grossSalary = unpaidLogs.reduce((sum, l) => sum + Number(l.pay), 0);
      const baleBalance = getEmployeeBaleBalance(emp.id);
      const lastPaidRecord = state.salaryHistory.find(
        (h) => h.employeeId === emp.id && h.type.includes("Nag sahod na")
      );

      const defaultDeduction = Math.min(grossSalary, baleBalance);
      const defaultNetCash = Math.max(0, grossSalary - defaultDeduction);

      panel.innerHTML = `
        ${
          unpaidLogs.length === 0 && lastPaidRecord
            ? `<div class="sahod-banner">✅ <strong>${escapeHtml(emp.name)} — Nag sahod na!</strong> Last payout of ${peso(lastPaidRecord.netPaid)} released on ${escapeHtml(lastPaidRecord.date)}.</div>`
            : ""
        }

        <div class="inspector-summary">
          <div class="mini-stat">
            <span>Unpaid Days / Hours</span>
            <strong>${unpaidLogs.length} day(s) (${totalUnpaidHours} hrs)</strong>
          </div>
          <div class="mini-stat">
            <span>Gross Earned Salary</span>
            <strong class="text-blue">${peso(grossSalary)}</strong>
          </div>
          <div class="mini-stat">
            <span>Active Down Salary (Bale)</span>
            <strong class="${baleBalance > 0 ? "text-amber" : "text-green"}">${peso(baleBalance)}</strong>
          </div>
        </div>

        ${
          baleBalance > 0
            ? `
          <div class="bale-box">
            <strong>⚠️ Notification: ${escapeHtml(emp.name)} has an unpaid Down Salary (Bale) of ${peso(baleBalance)}.</strong>
            <p class="helper-text" style="margin:6px 0 10px;">Choose if you want to deduct (minus) the Bale from this salary release:</p>
            <div class="form-row">
              <div class="form-group">
                <label for="bale-deduct-mode">Bale Deduction Option</label>
                <select id="bale-deduct-mode">
                  <option value="full">Minus Full Bale (${peso(defaultDeduction)})</option>
                  <option value="custom">Minus Custom Amount</option>
                  <option value="none">Do Not Minus (Keep Bale)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="bale-deduct-input">Amount to Minus (₱)</label>
                <input type="number" id="bale-deduct-input" min="0" max="${Math.min(grossSalary, baleBalance)}" step="0.01" value="${defaultDeduction.toFixed(2)}" />
              </div>
            </div>
          </div>
        `
            : ""
        }

        <h4 style="font-size:13.5px; margin-bottom:8px;">Worked Days Breakdown (Pending Salary)</h4>
        <div class="table-responsive" style="margin-bottom:14px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Shift</th>
                <th class="num">Hours</th>
                <th class="num">Pay</th>
              </tr>
            </thead>
            <tbody>
              ${
                unpaidLogs.length === 0
                  ? `<tr><td colspan="5" class="helper-text">No unpaid work days pending for ${escapeHtml(emp.name)}.</td></tr>`
                  : unpaidLogs
                      .map((l) => {
                        const proj = state.projects.find((p) => p.id === l.projectId);
                        return `
                          <tr>
                            <td>${escapeHtml(l.date)}</td>
                            <td>${escapeHtml(proj ? proj.name : "Project")}</td>
                            <td>${escapeHtml(l.timeIn)}–${escapeHtml(l.timeOut)}</td>
                            <td class="num">${l.hours}h</td>
                            <td class="num">${peso(l.pay)}</td>
                          </tr>
                        `;
                      })
                      .join("")
              }
            </tbody>
          </table>
        </div>

        <div class="payout-box">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <span class="helper-text">Net Salary Cash to Give:</span>
              <div style="font-size:22px; font-weight:800; color:#065f46;" id="computed-net-cash">${peso(defaultNetCash)}</div>
            </div>
            <button
              class="btn btn-green"
              id="btn-approve-salary"
              data-emp-id="${escapeHtml(emp.id)}"
              ${unpaidLogs.length === 0 ? "disabled style='opacity:0.5; cursor:not-allowed;'" : ""}
            >
              ✅ Approve &amp; Give Salary (Mark "Nag sahod na")
            </button>
          </div>
        </div>
      `;

      const modeEl = document.getElementById("bale-deduct-mode");
      const inputEl = document.getElementById("bale-deduct-input");
      const netCashEl = document.getElementById("computed-net-cash");

      function updateNetCashDisplay() {
        if (!inputEl || !netCashEl) return;
        let deduct = Number(inputEl.value) || 0;
        const maxAllowed = Math.min(grossSalary, baleBalance);
        if (deduct < 0) deduct = 0;
        if (deduct > maxAllowed) {
          deduct = maxAllowed;
          inputEl.value = maxAllowed.toFixed(2);
        }
        netCashEl.textContent = peso(Math.max(0, grossSalary - deduct));
      }

      if (modeEl && inputEl) {
        modeEl.addEventListener("change", () => {
          const maxAllowed = Math.min(grossSalary, baleBalance);
          if (modeEl.value === "full") {
            inputEl.value = maxAllowed.toFixed(2);
            inputEl.readOnly = true;
          } else if (modeEl.value === "none") {
            inputEl.value = "0.00";
            inputEl.readOnly = true;
          } else {
            inputEl.readOnly = false;
            inputEl.focus();
          }
          updateNetCashDisplay();
        });
        inputEl.readOnly = true;
        inputEl.addEventListener("input", updateNetCashDisplay);
      }
    }

    const histTbody = document.getElementById("salary-history-tbody");
    if (state.salaryHistory.length === 0) {
      histTbody.innerHTML = `<tr><td colspan="7" class="helper-text">No salary or Bale transactions yet.</td></tr>`;
    } else {
      histTbody.innerHTML = state.salaryHistory
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((h) => {
          const isSahod = h.type.includes("Nag sahod na");
          return `
            <tr>
              <td>${escapeHtml(h.date)}</td>
              <td><strong>${escapeHtml(h.employeeName)}</strong></td>
              <td>
                <span class="badge ${isSahod ? "badge-green" : "badge-amber"}">
                  ${escapeHtml(h.type)}
                </span>
              </td>
              <td class="num">${peso(h.grossAmount)}</td>
              <td class="num text-amber">${h.baleDeducted > 0 ? "-" + peso(h.baleDeducted) : "₱0.00"}</td>
              <td class="num"><strong>${peso(h.netPaid)}</strong></td>
              <td>${escapeHtml(h.details)}</td>
            </tr>
          `;
        })
        .join("");
    }
  }

  function renderExpenses() {
    const projSelect = document.getElementById("exp-project");
    const filterSelect = document.getElementById("filter-expense-project");
    const currentFilter = filterSelect.value || "all";

    const projOptions = state.projects.length
      ? state.projects
          .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
          .join("")
      : `<option value="">-- Add a project first --</option>`;

    projSelect.innerHTML = projOptions;
    filterSelect.innerHTML =
      `<option value="all">All Projects</option>` +
      state.projects
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join("");
    filterSelect.value = currentFilter;

    const list = state.expenses
      .filter((e) => currentFilter === "all" || e.projectId === currentFilter)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    const tbody = document.getElementById("expenses-tbody");
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="helper-text">No expenses logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((e) => {
        const proj = state.projects.find((p) => p.id === e.projectId);
        return `
          <tr>
            <td>${escapeHtml(e.date)}</td>
            <td><strong>${escapeHtml(proj ? proj.name : "Removed Project")}</strong></td>
            <td><span class="badge badge-blue">${escapeHtml(e.category)}</span></td>
            <td>${escapeHtml(e.description)}</td>
            <td class="num"><strong>${peso(e.amount)}</strong></td>
            <td>
              <button class="btn btn-danger btn-sm" data-delete-exp="${escapeHtml(e.id)}">Delete</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAccounts() {
    const tbody = document.getElementById("accounts-tbody");
    const currentUser = getCurrentUser();
    if (!tbody) return;

    tbody.innerHTML = state.accounts
      .map((acc) => {
        const isCurrent = currentUser && currentUser.id === acc.id;
        return `
          <tr>
            <td>
              <strong>${escapeHtml(acc.name)}</strong>
              ${isCurrent ? `<br><span class="badge badge-green">Active Session</span>` : ""}
            </td>
            <td>${escapeHtml(acc.email)}</td>
            <td><span class="badge ${acc.role === "Admin" ? "badge-blue" : "badge-gray"}">${escapeHtml(acc.role)}</span></td>
            <td><code>${escapeHtml(acc.password)}</code></td>
            <td>
              <div class="action-group">
                <button class="btn btn-outline btn-sm" data-edit-acc="${escapeHtml(acc.id)}">Edit</button>
                <button class="btn btn-danger btn-sm" data-delete-acc="${escapeHtml(acc.id)}" ${
                  state.accounts.length <= 1 ? "disabled style='opacity:0.45; cursor:not-allowed;'" : ""
                }>Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAll() {
    renderGlobalBaleNotification();
    renderDashboard();
    renderProjects();
    renderEmployees();
    renderTimeLogs();
    renderSalaryAndBale();
    renderExpenses();
    renderAccounts();
  }

  // ==================== EVENT LISTENERS ====================

  // Login Form
  document.getElementById("form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("login-email").value.trim().toLowerCase();
    const passInput = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");

    const found = state.accounts.find(
      (a) =>
        (a.email || "").trim().toLowerCase() === emailInput &&
        a.password === passInput
    );

    if (!found) {
      errorEl.textContent = "Invalid email/account or password.";
      errorEl.style.display = "block";
      return;
    }

    errorEl.style.display = "none";
    state.currentUserId = found.id;
    e.target.reset();
    saveState();
    syncAuthScreen();
    showToast(`Welcome back, ${found.name}!`);
  });

  // Logout
  document.getElementById("btn-logout").addEventListener("click", () => {
    state.currentUserId = null;
    saveState();
    syncAuthScreen();
    showToast("Logged out.");
  });

  // Navigation
  document.getElementById("nav-menu").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (btn && btn.dataset.view) {
      switchView(btn.dataset.view);
    }
  });

  document.body.addEventListener("click", (e) => {
    const gotoBtn = e.target.closest("[data-goto]");
    if (gotoBtn) {
      switchView(gotoBtn.dataset.goto);
      return;
    }

    const toggleProjBtn = e.target.closest("[data-toggle-project]");
    if (toggleProjBtn) {
      const proj = state.projects.find((p) => p.id === toggleProjBtn.dataset.toggleProject);
      if (proj) {
        if (proj.status === "Ongoing") {
          proj.status = "Done";
          proj.completedDate = todayISO();
          showToast(`Project "${proj.name}" marked as Done!`);
        } else {
          proj.status = "Ongoing";
          proj.completedDate = "";
          showToast(`Project "${proj.name}" reopened as Ongoing.`);
        }
        saveState();
        renderAll();
      }
      return;
    }

    const delProjBtn = e.target.closest("[data-delete-project]");
    if (delProjBtn) {
      const id = delProjBtn.dataset.deleteProject;
      state.projects = state.projects.filter((p) => p.id !== id);
      saveState();
      renderAll();
      showToast("Project deleted.");
      return;
    }

    const editEmpBtn = e.target.closest("[data-edit-emp]");
    if (editEmpBtn) {
      const emp = state.employees.find((x) => x.id === editEmpBtn.dataset.editEmp);
      if (emp) {
        document.getElementById("edit-emp-id").value = emp.id;
        document.getElementById("edit-emp-name").value = emp.name;
        document.getElementById("edit-emp-skill").value = emp.skill;
        document.getElementById("edit-emp-rate-type").value = emp.rateType;
        document.getElementById("edit-emp-rate-amount").value = emp.rateAmount;
        updateRatePreview("edit-emp-rate-type", "edit-emp-rate-amount", "edit-emp-rate-preview");
        document.getElementById("modal-edit-employee").style.display = "grid";
      }
      return;
    }

    const delEmpBtn = e.target.closest("[data-delete-emp]");
    if (delEmpBtn) {
      const id = delEmpBtn.dataset.deleteEmp;
      const emp = state.employees.find((x) => x.id === id);
      state.employees = state.employees.filter((x) => x.id !== id);
      state.projects.forEach((p) => {
        p.assignedEmployeeIds = (p.assignedEmployeeIds || []).filter((eid) => eid !== id);
      });
      saveState();
      renderAll();
      showToast(`Employee "${emp ? emp.name : ""}" deleted.`);
      return;
    }

    // Open Edit Account Modal
    const editAccBtn = e.target.closest("[data-edit-acc]");
    if (editAccBtn) {
      const acc = state.accounts.find((x) => x.id === editAccBtn.dataset.editAcc);
      if (acc) {
        document.getElementById("edit-acc-id").value = acc.id;
        document.getElementById("edit-acc-name").value = acc.name;
        document.getElementById("edit-acc-email").value = acc.email;
        document.getElementById("edit-acc-role").value = acc.role;
        document.getElementById("edit-acc-password").value = acc.password;
        document.getElementById("modal-edit-account").style.display = "grid";
      }
      return;
    }

    // Delete Account
    const delAccBtn = e.target.closest("[data-delete-acc]");
    if (delAccBtn && !delAccBtn.disabled) {
      const id = delAccBtn.dataset.deleteAcc;
      if (state.accounts.length <= 1) {
        showToast("At least one system account must remain.");
        return;
      }
      const target = state.accounts.find((x) => x.id === id);
      state.accounts = state.accounts.filter((x) => x.id !== id);
      if (state.currentUserId === id) {
        state.currentUserId = state.accounts[0]?.id || null;
      }
      saveState();
      syncAuthScreen();
      showToast(`Account "${target ? target.name : ""}" deleted.`);
      return;
    }

    const delExpBtn = e.target.closest("[data-delete-exp]");
    if (delExpBtn) {
      const id = delExpBtn.dataset.deleteExp;
      state.expenses = state.expenses.filter((x) => x.id !== id);
      saveState();
      renderAll();
      showToast("Expense removed.");
      return;
    }

    const approveBtn = e.target.closest("#btn-approve-salary");
    if (approveBtn && !approveBtn.disabled) {
      const empId = approveBtn.dataset.empId;
      const emp = state.employees.find((x) => x.id === empId);
      if (!emp) return;

      const unpaidLogs = state.timeLogs.filter((l) => l.employeeId === empId && !l.paid);
      if (unpaidLogs.length === 0) return;

      const grossSalary = unpaidLogs.reduce((sum, l) => sum + Number(l.pay), 0);
      const baleBalance = getEmployeeBaleBalance(empId);
      const deductInput = document.getElementById("bale-deduct-input");
      let deductAmount = deductInput ? Number(deductInput.value) || 0 : 0;
      deductAmount = Math.max(0, Math.min(deductAmount, grossSalary, baleBalance));

      let remainingToDeduct = deductAmount;
      state.bales.forEach((b) => {
        if (b.employeeId === empId && b.remaining > 0 && remainingToDeduct > 0) {
          const take = Math.min(b.remaining, remainingToDeduct);
          b.remaining = Math.round((b.remaining - take) * 100) / 100;
          remainingToDeduct = Math.round((remainingToDeduct - take) * 100) / 100;
        }
      });

      unpaidLogs.forEach((l) => {
        l.paid = true;
      });

      const netPaid = Math.max(0, grossSalary - deductAmount);
      state.salaryHistory.unshift({
        id: "hist-" + Date.now(),
        date: todayISO(),
        employeeId: emp.id,
        employeeName: emp.name,
        type: "Salary Released (Nag sahod na)",
        grossAmount: grossSalary,
        baleDeducted: deductAmount,
        netPaid,
        details: `${unpaidLogs.length} day(s) worked${deductAmount > 0 ? " • Bale deducted" : ""}`
      });

      saveState();
      renderAll();
      showToast(`✅ ${emp.name}: Nag sahod na! (${peso(netPaid)} released)`);
      return;
    }

    const closeModalBtn = e.target.closest("[data-close-modal]");
    if (closeModalBtn) {
      document.getElementById(closeModalBtn.dataset.closeModal).style.display = "none";
    }
  });

  document.getElementById("menu-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  function updateRatePreview(typeId, amountId, previewId) {
    const type = document.getElementById(typeId).value;
    const amt = document.getElementById(amountId).value;
    const r = getRateBreakdown(type, amt);
    document.getElementById(previewId).textContent =
      `Daily: ${peso(r.daily)} | Hourly: ${peso(r.hourly)} | Weekly (6d): ${peso(r.weekly)} | Monthly (26d): ${peso(r.monthly)}`;
  }

  ["emp-rate-type", "emp-rate-amount"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      updateRatePreview("emp-rate-type", "emp-rate-amount", "add-emp-rate-preview");
    });
  });

  ["edit-emp-rate-type", "edit-emp-rate-amount"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      updateRatePreview("edit-emp-rate-type", "edit-emp-rate-amount", "edit-emp-rate-preview");
    });
  });

  // Add Account Form
  document.getElementById("form-add-account").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("acc-name").value.trim();
    const email = document.getElementById("acc-email").value.trim();
    const role = document.getElementById("acc-role").value;
    const password = document.getElementById("acc-password").value;

    const duplicate = state.accounts.some(
      (a) => (a.email || "").trim().toLowerCase() === email.toLowerCase()
    );
    if (duplicate) {
      showToast("An account with that email/login ID already exists.");
      return;
    }

    state.accounts.push({
      id: "acc-" + Date.now(),
      name,
      email,
      role,
      password,
      isDefault: false
    });

    e.target.reset();
    saveState();
    renderAccounts();
    showToast(`Account "${name}" added!`);
  });

  // Edit Account Form
  document.getElementById("form-edit-account").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-acc-id").value;
    const acc = state.accounts.find((x) => x.id === id);
    if (!acc) return;

    acc.name = document.getElementById("edit-acc-name").value.trim();
    acc.email = document.getElementById("edit-acc-email").value.trim();
    acc.role = document.getElementById("edit-acc-role").value;
    acc.password = document.getElementById("edit-acc-password").value;

    document.getElementById("modal-edit-account").style.display = "none";
    saveState();
    syncAuthScreen();
    showToast(`Updated account "${acc.name}"!`);
  });

  document.getElementById("form-add-project").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("proj-name").value.trim();
    const client = document.getElementById("proj-client").value.trim();
    const finalPrice = parseFloat(document.getElementById("proj-price").value) || 0;
    const assignedEmployeeIds = Array.from(
      document.querySelectorAll("input[name='proj-emp']:checked")
    ).map((cb) => cb.value);

    state.projects.unshift({
      id: "proj-" + Date.now(),
      name,
      client,
      finalPrice,
      status: "Ongoing",
      completedDate: "",
      assignedEmployeeIds
    });

    e.target.reset();
    saveState();
    renderAll();
    showToast(`Project "${name}" added!`);
  });

  document.getElementById("form-add-employee").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("emp-name").value.trim();
    const skill = document.getElementById("emp-skill").value;
    const rateType = document.getElementById("emp-rate-type").value;
    const rateAmount = parseFloat(document.getElementById("emp-rate-amount").value) || 0;

    state.employees.push({
      id: "emp-" + Date.now(),
      name,
      skill,
      rateType,
      rateAmount
    });

    e.target.reset();
    updateRatePreview("emp-rate-type", "emp-rate-amount", "add-emp-rate-preview");
    saveState();
    renderAll();
    showToast(`Employee "${name}" (${skill}) added!`);
  });

  document.getElementById("form-edit-employee").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-emp-id").value;
    const emp = state.employees.find((x) => x.id === id);
    if (!emp) return;

    emp.name = document.getElementById("edit-emp-name").value.trim();
    emp.skill = document.getElementById("edit-emp-skill").value;
    emp.rateType = document.getElementById("edit-emp-rate-type").value;
    emp.rateAmount = parseFloat(document.getElementById("edit-emp-rate-amount").value) || 0;

    document.getElementById("modal-edit-employee").style.display = "none";
    saveState();
    renderAll();
    showToast(`Updated ${emp.name}'s profile & salary!`);
  });

  document.getElementById("form-add-timelog").addEventListener("submit", (e) => {
    e.preventDefault();
    const employeeId = document.getElementById("log-employee").value;
    const projectId = document.getElementById("log-project").value;
    const date = document.getElementById("log-date").value;
    const timeIn = document.getElementById("log-time-in").value;
    const timeOut = document.getElementById("log-time-out").value;

    const emp = state.employees.find((x) => x.id === employeeId);
    const proj = state.projects.find((x) => x.id === projectId);
    if (!emp || !proj) {
      showToast("Please add an employee and a project first.");
      return;
    }

    const hours = computeWorkedHours(timeIn, timeOut);
    const rates = getRateBreakdown(emp.rateType, emp.rateAmount);
    const pay = Math.round(hours * rates.hourly * 100) / 100;

    state.timeLogs.unshift({
      id: "log-" + Date.now(),
      employeeId,
      projectId,
      date,
      timeIn,
      timeOut,
      hours,
      pay,
      paid: false
    });

    saveState();
    renderAll();
    showToast(`Logged ${hours} hrs (${peso(pay)}) for ${emp.name}.`);
  });

  document.getElementById("form-add-bale").addEventListener("submit", (e) => {
    e.preventDefault();
    const employeeId = document.getElementById("bale-employee").value;
    const amount = parseFloat(document.getElementById("bale-amount").value) || 0;
    const date = document.getElementById("bale-date").value;
    const note = document.getElementById("bale-note").value.trim() || "Down Salary (Bale)";

    const emp = state.employees.find((x) => x.id === employeeId);
    if (!emp || amount <= 0) {
      showToast("Please select an employee and enter a valid Bale amount.");
      return;
    }

    state.bales.push({
      id: "bale-" + Date.now(),
      employeeId,
      amount,
      remaining: amount,
      date,
      note
    });

    state.salaryHistory.unshift({
      id: "hist-" + Date.now(),
      date,
      employeeId,
      employeeName: emp.name,
      type: "Bale Given",
      grossAmount: amount,
      baleDeducted: 0,
      netPaid: amount,
      details: note
    });

    document.getElementById("bale-amount").value = "";
    document.getElementById("bale-note").value = "";
    saveState();
    renderAll();
    showToast(`Recorded ${peso(amount)} Bale for ${emp.name}.`);
  });

  document.getElementById("form-add-expense").addEventListener("submit", (e) => {
    e.preventDefault();
    const projectId = document.getElementById("exp-project").value;
    const category = document.getElementById("exp-category").value;
    const description = document.getElementById("exp-desc").value.trim();
    const amount = parseFloat(document.getElementById("exp-amount").value) || 0;
    const date = document.getElementById("exp-date").value;

    if (!projectId) {
      showToast("Please add a project first before logging expenses.");
      return;
    }

    state.expenses.unshift({
      id: "exp-" + Date.now(),
      projectId,
      category,
      description,
      amount,
      date
    });

    document.getElementById("exp-desc").value = "";
    document.getElementById("exp-amount").value = "";
    saveState();
    renderAll();
    showToast(`Added ${peso(amount)} expense (${category}).`);
  });

  document.getElementById("filter-timelog-emp").addEventListener("change", renderTimeLogs);
  document.getElementById("salary-select-emp").addEventListener("change", renderSalaryAndBale);
  document.getElementById("filter-expense-project").addEventListener("change", renderExpenses);

  document.getElementById("btn-export-backup").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metal-builder-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup JSON downloaded!");
  });

  document.getElementById("btn-clear-data").addEventListener("click", () => {
    if (!confirm("Are you sure you want to permanently clear all stored projects, employees, time logs, and expenses? (Login accounts will be kept)")) {
      return;
    }
    const keptAccounts = state.accounts.length ? state.accounts : getDefaultAccounts();
    const keptUserId = state.currentUserId;
    state = getEmptyState();
    state.accounts = keptAccounts;
    state.currentUserId = keptUserId;
    saveState();
    renderAll();
    showToast("All operational data cleared!");
  });

  document.getElementById("log-date").value = todayISO();
  document.getElementById("bale-date").value = todayISO();
  document.getElementById("exp-date").value = todayISO();
  syncAuthScreen();
})();
