/**
 * Samodzielna strona panelu prowadzącego: bez zależności od `apps/web`, bez
 * osobnego bundlera i bez rejestracji w routingu SPA uczestnika — panel jest
 * serwowany bezpośrednio przez `AdminViewController` pod `/admin` i nigdy nie
 * jest linkowany z nawigacji produktu (AGENTS.md).
 *
 * Cały CSS i JS jest inline: strona nie ładuje żadnych zewnętrznych zasobów.
 */
export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Klinika Debug — panel prowadzącego</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f4f5f7;
    color: #1f2430;
  }
  main {
    max-width: 640px;
    margin: 48px auto;
    padding: 32px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  p.subtitle { color: #5b6472; margin: 0 0 24px; }
  label { display: block; font-weight: 600; margin: 16px 0 6px; }
  select, input[type="password"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #cbd2dc;
    border-radius: 8px;
    font-size: 1rem;
  }
  button {
    cursor: pointer;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 1rem;
    font-weight: 600;
    margin-top: 20px;
  }
  button.primary { background: #2454ff; color: #fff; }
  button.danger { background: #d3273e; color: #fff; margin-left: 12px; }
  button.secondary { background: #eef0f4; color: #1f2430; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  .status { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 0.95rem; display: none; }
  .status.visible { display: block; }
  .status.ok { background: #e5f6ec; color: #146c3f; }
  .status.error { background: #fdecec; color: #a3212f; }
  .meta { margin-top: 24px; font-size: 0.85rem; color: #5b6472; }
  #dashboard { display: none; }
  #dashboard.visible { display: block; }
  #loginForm.hidden { display: none; }
  .row { display: flex; align-items: center; flex-wrap: wrap; }
</style>
</head>
<body>
<main>
  <h1>Klinika Debug — panel prowadzącego</h1>
  <p class="subtitle">Narzędzie techniczne prowadzącego warsztat. Nie jest częścią aplikacji uczestnika.</p>

  <form id="loginForm">
    <label for="password">Hasło panelu prowadzącego</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required />
    <button class="primary" type="submit">Zaloguj</button>
    <div id="loginStatus" class="status"></div>
  </form>

  <section id="dashboard">
    <label for="labScenario">Scenariusz laboratorium</label>
    <select id="labScenario"></select>

    <label for="controlledBug">Kontrolowany błąd</label>
    <select id="controlledBug"></select>

    <label for="labDelayMs">Czas generowania wyników</label>
    <select id="labDelayMs"></select>

    <div class="row">
      <button class="primary" id="saveButton" type="button">Zapisz</button>
      <button class="danger" id="resetButton" type="button">Resetuj środowisko</button>
      <button class="secondary" id="logoutButton" type="button" style="margin-left:auto;">Wyloguj</button>
    </div>

    <div id="configStatus" class="status"></div>
    <p class="meta" id="updatedAtLabel"></p>
  </section>
</main>
<script>
(function () {
  "use strict";

  var loginForm = document.getElementById("loginForm");
  var passwordInput = document.getElementById("password");
  var loginStatus = document.getElementById("loginStatus");
  var dashboard = document.getElementById("dashboard");
  var labScenarioSelect = document.getElementById("labScenario");
  var controlledBugSelect = document.getElementById("controlledBug");
  var labDelayMsSelect = document.getElementById("labDelayMs");
  var saveButton = document.getElementById("saveButton");
  var resetButton = document.getElementById("resetButton");
  var logoutButton = document.getElementById("logoutButton");
  var configStatus = document.getElementById("configStatus");
  var updatedAtLabel = document.getElementById("updatedAtLabel");

  var SCENARIO_LABELS = {
    SUCCESS: "SUCCESS — sukces",
    PARTIAL_SUCCESS: "PARTIAL_SUCCESS — wynik częściowy",
    SAMPLE_REJECTED: "SAMPLE_REJECTED — odrzucenie próbki",
    VALIDATION_ERROR: "VALIDATION_ERROR — błąd walidacji (422)",
    RATE_LIMIT: "RATE_LIMIT — ograniczenie przepustowości (429)",
    SERVER_ERROR: "SERVER_ERROR — błąd serwera (503)",
    TIMEOUT: "TIMEOUT — brak odpowiedzi (504)"
  };
  var BUG_LABELS = {
    CLEAN: "CLEAN — brak aktywnego defektu",
    PATIENT_GUARDIAN: "PATIENT_GUARDIAN — pacjent/opiekun",
    ORDER_FLOW: "ORDER_FLOW — proces zlecenia",
    API_DIAGNOSTICS: "API_DIAGNOSTICS — diagnostyka API"
  };
  var LAB_DELAY_LABELS = {
    5000: "5 sekund",
    15000: "15 sekund",
    30000: "30 sekund",
    60000: "1 minuta",
    300000: "5 minut"
  };

  function showStatus(el, message, isError) {
    el.textContent = message;
    el.className = "status visible " + (isError ? "error" : "ok");
  }

  function clearStatus(el) {
    el.textContent = "";
    el.className = "status";
  }

  function populateSelect(select, values, labels) {
    select.innerHTML = "";
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = (labels && labels[value]) || value;
      select.appendChild(option);
    });
  }

  function api(path, options) {
    return fetch(path, Object.assign({ credentials: "same-origin" }, options || {})).then(
      function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) {
            var message = (body && body.error && body.error.message) || "Wystąpił błąd.";
            throw new Error(message);
          }
          return body;
        });
      }
    );
  }

  function showDashboard(config) {
    loginForm.classList.add("hidden");
    dashboard.classList.add("visible");
    applyConfig(config);
  }

  function applyConfig(config) {
    populateSelect(labScenarioSelect, config.availableLabScenarios, SCENARIO_LABELS);
    populateSelect(controlledBugSelect, config.availableControlledBugs, BUG_LABELS);
    populateSelect(labDelayMsSelect, config.availableLabDelaysMs, LAB_DELAY_LABELS);
    labScenarioSelect.value = config.labScenario;
    controlledBugSelect.value = config.controlledBug;
    labDelayMsSelect.value = config.labDelayMs;
    updatedAtLabel.textContent = "Ostatnia zmiana: " + new Date(config.updatedAt).toLocaleString("pl-PL");
  }

  function loadConfig() {
    return api("/admin/api/config", { method: "GET" }).then(showDashboard);
  }

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    clearStatus(loginStatus);
    api("/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value })
    })
      .then(function () {
        passwordInput.value = "";
        return loadConfig();
      })
      .catch(function (error) {
        showStatus(loginStatus, error.message, true);
      });
  });

  saveButton.addEventListener("click", function () {
    clearStatus(configStatus);
    api("/admin/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labScenario: labScenarioSelect.value,
        controlledBug: controlledBugSelect.value,
        labDelayMs: Number(labDelayMsSelect.value)
      })
    })
      .then(function (config) {
        applyConfig(config);
        showStatus(configStatus, "Zapisano konfigurację.", false);
      })
      .catch(function (error) {
        showStatus(configStatus, error.message, true);
      });
  });

  resetButton.addEventListener("click", function () {
    var confirmed = window.confirm(
      "Reset przywróci dane WSZYSTKICH workspace\\u00f3w warsztatowych do stanu początkowego i wyloguje wszystkich uczestników. Kontynuować?"
    );
    if (!confirmed) {
      return;
    }
    clearStatus(configStatus);
    api("/admin/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true })
    })
      .then(function (result) {
        applyConfig(result.config);
        showStatus(
          configStatus,
          "Zresetowano workspace\\u2019y: " + (result.resetWorkspaceSlugs.join(", ") || "brak"),
          false
        );
      })
      .catch(function (error) {
        showStatus(configStatus, error.message, true);
      });
  });

  logoutButton.addEventListener("click", function () {
    api("/admin/api/logout", { method: "POST" }).catch(function () {}).then(function () {
      dashboard.classList.remove("visible");
      loginForm.classList.remove("hidden");
      clearStatus(configStatus);
    });
  });

  // Sesja może już być aktywna (odświeżenie strony) — spróbuj wczytać
  // konfigurację od razu; brak ważnego ciasteczka po prostu zostawia
  // widoczny formularz logowania.
  loadConfig().catch(function () {});
})();
</script>
</body>
</html>
`;
