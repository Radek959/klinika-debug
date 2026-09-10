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
    max-width: 880px;
    margin: 48px auto;
    padding: 32px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  h2 { font-size: 1.05rem; margin: 0 0 4px; }
  p.subtitle { color: #5b6472; margin: 0 0 24px; }
  p.sectionHint { color: #5b6472; margin: 0 0 16px; font-size: 0.9rem; }
  section.block {
    border-top: 1px solid #e5e8ee;
    padding-top: 24px;
    margin-top: 24px;
  }
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
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: 0; }

  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: #eef0f4;
    color: #1f2430;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .badge .badge-label { font-weight: 500; color: #5b6472; }
  .badge.badge-clean { background: #e5f6ec; color: #146c3f; }
  .badge.badge-bug { background: #fdecec; color: #a3212f; }

  .infoBox {
    margin-top: 10px;
    padding: 12px 14px;
    border-radius: 8px;
    background: #f4f5f7;
    border: 1px solid #e5e8ee;
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .infoBox.infoBox-clean { background: #eef8f0; border-color: #cfe9d6; }
  .infoBox.infoBox-bug { background: #fef3f3; border-color: #f3d4d6; }
  .infoBox strong.infoHeading { display: block; margin: 8px 0 2px; }
  .infoBox strong.infoHeading:first-child { margin-top: 0; }
  .infoBox ul { margin: 2px 0 0; padding-left: 20px; }

  .presetGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .presetCard {
    border: 1px solid #cbd2dc;
    border-radius: 10px;
    padding: 14px;
    background: #fbfbfc;
  }
  .presetCard h3 { margin: 0 0 4px; font-size: 0.95rem; }
  .presetCard p { margin: 0 0 10px; font-size: 0.82rem; color: #5b6472; }
  .presetCard button { margin-top: 0; width: 100%; }

  .dangerZone {
    border: 1px solid #f3d4d6;
    border-radius: 10px;
    padding: 14px;
    background: #fef8f8;
  }
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

    <section class="block" id="section-summary">
      <h2>1. Aktualna konfiguracja</h2>
      <p class="sectionHint">Podsumowanie widoczne wyłącznie dla prowadzącego — uczestnicy go nie widzą.</p>
      <div class="badges">
        <span class="badge" id="badgeScenario">Scenariusz: —</span>
        <span class="badge" id="badgeBug">Defekt: —</span>
        <span class="badge" id="badgeDelay">Wyniki: —</span>
      </div>
      <p class="meta" id="updatedAtLabel"></p>
    </section>

    <section class="block" id="section-presets">
      <h2>2. Szybkie ustawienia</h2>
      <p class="sectionHint">Jedno kliknięcie zapisuje scenariusz laboratorium, kontrolowany błąd i czas generowania wyników — bez dodatkowego „Zapisz”.</p>
      <div class="presetGrid" id="presetGrid"></div>
      <div id="presetStatus" class="status"></div>
    </section>

    <section class="block" id="section-manual">
      <h2>3. Konfiguracja ręczna</h2>
      <p class="sectionHint">Zmiana selecta pokazuje opis wybranej opcji od razu, jeszcze przed zapisaniem.</p>

      <label for="labScenario">Scenariusz laboratorium</label>
      <select id="labScenario"></select>
      <div class="infoBox" id="labScenarioInfo"></div>

      <label for="controlledBug">Kontrolowany błąd</label>
      <select id="controlledBug"></select>
      <div class="infoBox" id="controlledBugInfo"></div>

      <label for="labDelayMs">Czas generowania wyników</label>
      <select id="labDelayMs"></select>
      <p class="sectionHint" style="margin-top:6px;">Określa czas oczekiwania na wynik po przyjęciu zlecenia przez laboratorium. Nie zmienia harmonogramu automatycznych retry 15 / 30 / 60 s.</p>

      <div class="row">
        <button class="primary" id="saveButton" type="button">Zapisz</button>
      </div>
      <div id="configStatus" class="status"></div>
    </section>

    <section class="block" id="section-participant-reset">
      <h2>4. Reset uczestnika</h2>
      <p class="sectionHint">Przywraca dane TYLKO wybranego workspace'u. Pozostali uczestnicy nie są dotknięci.</p>

      <label for="participantSelect">Uczestnik</label>
      <select id="participantSelect"></select>
      <button class="danger" id="resetParticipantButton" type="button" style="margin-left:0;">Resetuj wybranego uczestnika</button>
      <div id="participantResetStatus" class="status"></div>
    </section>

    <section class="block" id="section-full-reset">
      <h2>5. Reset całego środowiska</h2>
      <div class="dangerZone">
        <p class="sectionHint" style="margin-bottom:12px;">Przywraca dane WSZYSTKICH workspace'ów warsztatowych, wylogowuje wszystkich uczestników i przywraca czas generowania wyników do wartości domyślnej (5 minut).</p>
        <button class="danger" id="resetButton" type="button" style="margin-left:0;">Resetuj środowisko</button>
      </div>
      <div id="fullResetStatus" class="status"></div>
    </section>

    <div class="row" style="margin-top:24px;">
      <button class="secondary" id="logoutButton" type="button" style="margin-left:auto;">Wyloguj</button>
    </div>
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
  var fullResetStatus = document.getElementById("fullResetStatus");
  var presetStatus = document.getElementById("presetStatus");
  var updatedAtLabel = document.getElementById("updatedAtLabel");
  var badgeScenario = document.getElementById("badgeScenario");
  var badgeBug = document.getElementById("badgeBug");
  var badgeDelay = document.getElementById("badgeDelay");
  var labScenarioInfo = document.getElementById("labScenarioInfo");
  var controlledBugInfo = document.getElementById("controlledBugInfo");
  var presetGrid = document.getElementById("presetGrid");
  var participantSelect = document.getElementById("participantSelect");
  var resetParticipantButton = document.getElementById("resetParticipantButton");
  var participantResetStatus = document.getElementById("participantResetStatus");

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
    API_DIAGNOSTICS: "API_DIAGNOSTICS — diagnostyka API",
    PATIENT_EDIT_NOT_SAVED: "PATIENT_EDIT_NOT_SAVED — edycja pacjenta",
    ORDER_PRIORITY_MAPPING: "ORDER_PRIORITY_MAPPING — priorytet zlecenia"
  };
  var LAB_DELAY_LABELS = {
    5000: "5 sekund",
    15000: "15 sekund",
    30000: "30 sekund",
    60000: "1 minuta",
    300000: "5 minut"
  };

  var BUG_DESCRIPTIONS = {
    CLEAN:
      "<strong class=\\"infoHeading\\">Co robi?</strong>" +
      "Brak kontrolowanego defektu. Aplikacja zachowuje się zgodnie z dokumentacją produktową. " +
      "Domyślny i bezpieczny stan środowiska.",
    PATIENT_GUARDIAN:
      "<strong class=\\"infoHeading\\">Co robi?</strong>" +
      "Wyłącza wyłącznie wymaganie podania opiekuna dla pacjenta niepełnoletniego." +
      "<strong class=\\"infoHeading\\">Jak wywołać?</strong>" +
      "Spróbuj utworzyć albo edytować pacjenta niepełnoletniego bez danych opiekuna." +
      "<strong class=\\"infoHeading\\">Co powinno się wydarzyć?</strong>" +
      "Aplikacja błędnie pozwala zapisać pacjenta mimo braku wymaganego opiekuna." +
      "<strong class=\\"infoHeading\\">Nie wpływa na</strong>" +
      "<ul><li>poprawność PESEL</li><li>datę urodzenia</li><li>płeć</li><li>pozostałe walidacje</li>" +
      "<li>walidację danych opiekuna, jeśli opiekun został podany</li></ul>",
    ORDER_FLOW:
      "<strong class=\\"infoHeading\\">Co robi?</strong>" +
      "Dla zlecenia wymagającego co najmniej dwóch różnych rodzajów próbek status zmienia się zbyt " +
      "wcześnie na „Próbki pobrane”." +
      "<strong class=\\"infoHeading\\">Jak wywołać?</strong>" +
      "<ul><li>Utwórz zlecenie wymagające 2+ materiałów, np. surowicy oraz moczu.</li>" +
      "<li>Zarejestruj tylko pierwszą wymaganą próbkę.</li></ul>" +
      "<strong class=\\"infoHeading\\">Co powinno się wydarzyć?</strong>" +
      "Zlecenie błędnie przechodzi do statusu „Próbki pobrane” (SAMPLE_COLLECTED), mimo że inna próbka " +
      "nadal ma status „Wymagana” (REQUIRED).",
    API_DIAGNOSTICS:
      "<strong class=\\"infoHeading\\">Co robi?</strong>" +
      "Powoduje kontrolowany błąd HTTP 500 przy wysyłaniu określonego zlecenia do laboratorium." +
      "<strong class=\\"infoHeading\\">Jak wywołać?</strong>" +
      "<ul><li>Utwórz zlecenie zawierające badanie TSH.</li><li>Zarejestruj wszystkie wymagane próbki.</li>" +
      "<li>Kliknij „Wyślij do laboratorium”.</li></ul>" +
      "<strong class=\\"infoHeading\\">Co obserwować?</strong>" +
      "UI → DevTools → POST /api/v1/orders/{id}/send → HTTP 500 → Correlation ID." +
      "<strong class=\\"infoHeading\\">Ważne</strong>" +
      "<ul><li>błąd występuje przed przyjęciem zlecenia przez laboratorium</li>" +
      "<li>nie powstaje externalOrderId</li><li>nie powstaje job laboratoryjny</li>" +
      "<li>po przełączeniu na CLEAN to samo zlecenie może zostać ponownie wysłane</li></ul>",
    PATIENT_EDIT_NOT_SAVED:
      "<strong class=\\"infoHeading\\">Co robi?</strong>" +
      "Podczas edycji pacjenta zmiana numeru telefonu jest ignorowana mimo komunikatu o poprawnym zapisie." +
      "<strong class=\\"infoHeading\\">Jak wywołać?</strong>" +
      "Edytuj istniejącego pacjenta, zmień telefon i zapisz formularz." +
      "<strong class=\\"infoHeading\\">Co powinno się wydarzyć?</strong>" +
      "Aplikacja informuje o sukcesie, ale po zapisie nadal widoczny jest poprzedni telefon." +
      "<strong class=\\"infoHeading\\">Nie wpływa na</strong>" +
      "<ul><li>tworzenie pacjenta</li><li>pozostałe pola</li><li>walidację danych</li></ul>",
    ORDER_PRIORITY_MAPPING:
      "<strong class=\\"infoHeading\\">Co robi?</strong>" +
      "Podczas tworzenia zlecenia wybór priorytetu Pilne jest błędnie wysyłany jako Rutynowe." +
      "<strong class=\\"infoHeading\\">Jak wywołać?</strong>" +
      "Utwórz nowe zlecenie i wybierz priorytet Pilne." +
      "<strong class=\\"infoHeading\\">Co powinno się wydarzyć?</strong>" +
      "Po utworzeniu zlecenie ma priorytet Rutynowe." +
      "<strong class=\\"infoHeading\\">Wskazówka dla prowadzącego</strong>" +
      "Request w DevTools (POST /api/v1/orders) zawiera ROUTINE." +
      "<strong class=\\"infoHeading\\">Nie wpływa na</strong>" +
      "<ul><li>zlecenia tworzone jako Rutynowe</li><li>wybór badań</li><li>próbki</li><li>laboratorium</li></ul>"
  };

  var SCENARIO_DESCRIPTIONS = {
    SUCCESS:
      "Laboratorium przyjmuje zlecenie i po skonfigurowanym czasie zwraca kompletny wynik.",
    PARTIAL_SUCCESS:
      "Dla zlecenia z co najmniej 2 badaniami: najpierw pojawia się wynik częściowy, później wynik " +
      "kompletny. Dla zlecenia z jednym badaniem scenariusz zachowuje się jak SUCCESS.",
    SAMPLE_REJECTED:
      "Laboratorium przyjmuje zlecenie, ale podczas realizacji odrzuca jedną próbkę i badania zależne " +
      "wyłącznie od tej próbki — pozostałe badania kończą się normalnym wynikiem.",
    VALIDATION_ERROR:
      "Laboratorium odrzuca zlecenie synchronicznie błędem walidacji. Nie powstają: externalOrderId, " +
      "callback wynikowy, job laboratoryjny.",
    RATE_LIMIT:
      "Pierwsza próba wysyłki otrzymuje HTTP 429. Aplikacja planuje automatyczne ponowienie (pierwszy " +
      "retry po 15 sekundach). Druga próba jest deterministycznie przyjmowana jak normalna wysyłka.",
    SERVER_ERROR:
      "Laboratorium zwraca HTTP 503. Aplikacja korzysta z istniejącego mechanizmu automatycznych " +
      "ponowień (15 s → 30 s → 60 s). Po wyczerpaniu dostępnych prób zlecenie kończy jako błąd " +
      "techniczny.",
    TIMEOUT:
      "Symulowany timeout / brak poprawnej odpowiedzi laboratorium (HTTP 504). Korzysta z tego samego " +
      "mechanizmu automatycznych ponowień co SERVER_ERROR (15 s → 30 s → 60 s)."
  };

  var QUICK_PRESETS = [
    {
      id: "clean-fast",
      name: "CLEAN — szybkie wyniki",
      description: "Standardowe poprawne zachowanie i wynik po około 5 sekundach.",
      labScenario: "SUCCESS",
      controlledBug: "CLEAN",
      labDelayMs: 5000
    },
    {
      id: "clean-default",
      name: "CLEAN — domyślne",
      description: "Standardowy stan środowiska. Wyniki po 5 minutach.",
      labScenario: "SUCCESS",
      controlledBug: "CLEAN",
      labDelayMs: 300000
    },
    {
      id: "partial-success",
      name: "Wynik częściowy",
      description: "Przydatne do pokazania przejścia przez PARTIAL → COMPLETED.",
      labScenario: "PARTIAL_SUCCESS",
      controlledBug: "CLEAN",
      labDelayMs: 5000
    },
    {
      id: "investigation-api",
      name: "Investigation API",
      description: "Gotowe ustawienie do ćwiczenia UI → DevTools → Correlation ID → logi.",
      labScenario: "SUCCESS",
      controlledBug: "API_DIAGNOSTICS",
      labDelayMs: 5000
    }
  ];

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

  function renderPresets() {
    presetGrid.innerHTML = "";
    QUICK_PRESETS.forEach(function (preset) {
      var card = document.createElement("div");
      card.className = "presetCard";

      var title = document.createElement("h3");
      title.textContent = preset.name;
      card.appendChild(title);

      var description = document.createElement("p");
      description.textContent = preset.description;
      card.appendChild(description);

      var button = document.createElement("button");
      button.className = "secondary";
      button.type = "button";
      button.textContent = "Zastosuj";
      button.addEventListener("click", function () {
        applyPreset(preset);
      });
      card.appendChild(button);

      presetGrid.appendChild(card);
    });
  }

  function applyPreset(preset) {
    clearStatus(presetStatus);
    api("/admin/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labScenario: preset.labScenario,
        controlledBug: preset.controlledBug,
        labDelayMs: preset.labDelayMs
      })
    })
      .then(function (config) {
        applyConfig(config);
        showStatus(presetStatus, "Zastosowano: " + preset.name + ".", false);
      })
      .catch(function (error) {
        showStatus(presetStatus, error.message, true);
      });
  }

  function showDashboard(config) {
    loginForm.classList.add("hidden");
    dashboard.classList.add("visible");
    applyConfig(config);
    loadParticipants();
  }

  function applyConfig(config) {
    populateSelect(labScenarioSelect, config.availableLabScenarios, SCENARIO_LABELS);
    populateSelect(controlledBugSelect, config.availableControlledBugs, BUG_LABELS);
    populateSelect(labDelayMsSelect, config.availableLabDelaysMs, LAB_DELAY_LABELS);
    labScenarioSelect.value = config.labScenario;
    controlledBugSelect.value = config.controlledBug;
    labDelayMsSelect.value = config.labDelayMs;
    updatedAtLabel.textContent = "Ostatnia zmiana: " + new Date(config.updatedAt).toLocaleString("pl-PL");

    updateBadges(config);
    renderScenarioInfo();
    renderBugInfo();
  }

  function updateBadges(config) {
    badgeScenario.textContent = "Scenariusz: " + config.labScenario;
    badgeBug.textContent = "Defekt: " + config.controlledBug;
    badgeBug.className = "badge " + (config.controlledBug === "CLEAN" ? "badge-clean" : "badge-bug");
    badgeDelay.textContent = "Wyniki: " + (LAB_DELAY_LABELS[config.labDelayMs] || config.labDelayMs + " ms");
  }

  function renderScenarioInfo() {
    var scenario = labScenarioSelect.value;
    labScenarioInfo.innerHTML = SCENARIO_DESCRIPTIONS[scenario] || "";
    labScenarioInfo.className = "infoBox";
  }

  function renderBugInfo() {
    var bug = controlledBugSelect.value;
    controlledBugInfo.innerHTML = BUG_DESCRIPTIONS[bug] || "";
    controlledBugInfo.className = "infoBox " + (bug === "CLEAN" ? "infoBox-clean" : "infoBox-bug");
  }

  function loadConfig() {
    return api("/admin/api/config", { method: "GET" }).then(showDashboard);
  }

  function loadParticipants() {
    clearStatus(participantResetStatus);
    return api("/admin/api/workspaces", { method: "GET" })
      .then(function (workspaces) {
        participantSelect.innerHTML = "";
        workspaces.forEach(function (workspace) {
          var option = document.createElement("option");
          option.value = workspace.slug;
          option.textContent = workspace.login + " — " + workspace.slug;
          participantSelect.appendChild(option);
        });

        if (workspaces.length === 0) {
          participantSelect.disabled = true;
          resetParticipantButton.disabled = true;
          showStatus(
            participantResetStatus,
            "Brak workspace\\u2019ów warsztatowych do zresetowania.",
            false
          );
          return;
        }

        participantSelect.disabled = false;
        resetParticipantButton.disabled = false;
      })
      .catch(function () {
        participantSelect.innerHTML = "";
        participantSelect.disabled = true;
        resetParticipantButton.disabled = true;
        showStatus(participantResetStatus, "Nie udało się pobrać listy uczestników.", true);
      });
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

  labScenarioSelect.addEventListener("change", renderScenarioInfo);
  controlledBugSelect.addEventListener("change", renderBugInfo);

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
      "Reset przywróci dane WSZYSTKICH workspace\\u00f3w warsztatowych do stanu początkowego, wyloguje wszystkich uczestników i przywróci czas generowania wyników do 5 minut. Kontynuować?"
    );
    if (!confirmed) {
      return;
    }
    clearStatus(fullResetStatus);
    api("/admin/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true })
    })
      .then(function (result) {
        applyConfig(result.config);
        showStatus(
          fullResetStatus,
          "Zresetowano workspace\\u2019y: " + (result.resetWorkspaceSlugs.join(", ") || "brak"),
          false
        );
      })
      .catch(function (error) {
        showStatus(fullResetStatus, error.message, true);
      });
  });

  resetParticipantButton.addEventListener("click", function () {
    var slug = participantSelect.value;
    if (!slug) {
      return;
    }
    var label = participantSelect.options[participantSelect.selectedIndex]
      ? participantSelect.options[participantSelect.selectedIndex].textContent
      : slug;
    var confirmed = window.confirm(
      "Zresetujesz dane WYŁĄCZNIE workspace\\u2019u \\"" + label + "\\". " +
      "Sesja tego uczestnika zostanie unieważniona (będzie musiał zalogować się ponownie). " +
      "Pozostali uczestnicy nie zostaną dotknięci. Kontynuować?"
    );
    if (!confirmed) {
      return;
    }
    clearStatus(participantResetStatus);
    api("/admin/api/workspaces/" + encodeURIComponent(slug) + "/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true })
    })
      .then(function (result) {
        showStatus(
          participantResetStatus,
          "Zresetowano workspace: " + result.resetWorkspaceSlug + ".",
          false
        );
      })
      .catch(function (error) {
        showStatus(participantResetStatus, error.message, true);
      });
  });

  logoutButton.addEventListener("click", function () {
    api("/admin/api/logout", { method: "POST" }).catch(function () {}).then(function () {
      dashboard.classList.remove("visible");
      loginForm.classList.remove("hidden");
      clearStatus(configStatus);
    });
  });

  renderPresets();

  // Sesja może już być aktywna (odświeżenie strony) — spróbuj wczytać
  // konfigurację od razu; brak ważnego ciasteczka po prostu zostawia
  // widoczny formularz logowania.
  loadConfig().catch(function () {});
})();
</script>
</body>
</html>
`;
