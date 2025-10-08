document.addEventListener("DOMContentLoaded", () => {
  // --- STATE & DOM ELEMENTS ---
  const panels = [
    {
      id: "left",
      handle: null,
      fileHandles: new Map(),
      dependencies: new Map(),
      dependents: new Map(),
    },
    {
      id: "right",
      handle: null,
      fileHandles: new Map(),
      dependencies: new Map(),
      dependents: new Map(),
    },
  ];
  const fileHighlightStates = new Map();
  let additionalFileHandles = new Map();
  let presetsFileHandle = null;
  let appPresets = { prompts: {}, projects: {} };

  // --- IndexedDB SETUP & HELPERS ---
  const DB_NAME = "ContextCrafterDB";
  const STORE_NAME = "DirectoryHandles";
  let db;

  async function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject("Error opening IndexedDB.");
      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async function storeHandle(key, handle) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(handle, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) =>
        reject(`Error storing handle: ${event.target.error}`);
    });
  }

  async function getHandle(key) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) =>
        reject(`Error getting handle: ${event.target.error}`);
    });
  }

  async function verifyHandlePermission(handle) {
    if (!handle) return false;
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") {
      return true;
    }
    if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") {
      return true;
    }
    return false;
  }

  // Core UI
  const generateBtn = document.getElementById("generate-btn");
  const copyBtn = document.getElementById("copy-btn");
  const outputContextEl = document.getElementById("output-context");
  const tokenCountEl = document.getElementById("token-count");
  const taskDescEl = document.getElementById("task-desc");
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const expandAllBtn = document.getElementById("expand-all-btn");
  const collapseAllBtn = document.getElementById("collapse-all-btn");
  const showOnlyHighlightedToggle = document.getElementById(
    "show-only-highlighted-toggle"
  );
  const showOnlyIncludedToggle = document.getElementById(
    "show-only-included-toggle"
  );
  const massActionFullBtn = document.getElementById("mass-action-full");
  const massActionPathBtn = document.getElementById("mass-action-path");
  const massActionIgnoreBtn = document.getElementById("mass-action-ignore");
  const addFilesBtn = document.getElementById("add-files-btn");
  const additionalFilesList = document.getElementById("additional-files-list");

  // Modals
  const helpBtn = document.getElementById("help-btn");
  const helpModal = document.getElementById("help-modal");
  const presetsBtn = document.getElementById("presets-btn");
  const presetsModal = document.getElementById("presets-modal");

  // Presets UI
  const loadPresetsBtn = document.getElementById("load-presets-btn");
  const savePresetsBtn = document.getElementById("save-presets-btn");
  const presetsFileStatus = document.getElementById("presets-file-status");
  const presetPromptSelect = document.getElementById("preset-prompt-select");
  const presetPromptText = document.getElementById("preset-prompt-text");
  const savePromptBtn = document.getElementById("save-prompt-btn");
  const deletePromptBtn = document.getElementById("delete-prompt-btn");
  const projectPresetSelect = document.getElementById("project-preset-select");
  const saveProjectBtn = document.getElementById("save-project-btn");
  const loadProjectBtn = document.getElementById("load-project-btn");
  const deleteProjectBtn = document.getElementById("delete-project-btn");

  const DEFAULT_BLACKLIST = new Set([
    ".git",
    ".svn",
    ".hg",
    ".vscode",
    ".idea",
    ".DS_Store",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    ".env",
    "dist",
    "build",
    "node_modules",
    "package-lock.json",
    "yarn.lock",
  ]);
  const CHARS_PER_TOKEN = 4;

  // --- EVENT LISTENERS ---
  document.querySelectorAll(".select-dir-btn").forEach((btn) => {
    btn.addEventListener("click", (e) =>
      handleSelectDirectory(e.target.dataset.panelIndex)
    );
  });
  document.querySelectorAll(".refresh-dir-btn").forEach((btn) => {
    btn.addEventListener("click", (e) =>
      handleRefreshDirectory(e.target.dataset.panelIndex)
    );
  });
  document.querySelectorAll(".file-tree-container").forEach((container) => {
    container.addEventListener("click", handleTreeClick);
    container.addEventListener("change", handleOptionChange);
    container.addEventListener("click", handleIconToggle);
  });
  document.querySelectorAll(".panel-title").forEach((input) => {
    input.addEventListener("change", (e) => {
      const panelIndex = e.target.closest(".panel").id === "panel-left" ? 0 : 1;
      panels[panelIndex].title = e.target.value;
    });
  });

  generateBtn.addEventListener("click", handleGenerateContext);
  copyBtn.addEventListener("click", copyToClipboard);
  helpBtn.addEventListener("click", () => helpModal.classList.add("visible"));
  presetsBtn.addEventListener("click", () =>
    presetsModal.classList.add("visible")
  );
  document.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".modal").classList.remove("visible");
    });
  });
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.classList.remove("visible");
    }
  });

  searchBtn.addEventListener("click", handleSearch);
  clearSearchBtn.addEventListener("click", clearAllHighlights);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
  expandAllBtn.addEventListener("click", () => expandAll(true));
  collapseAllBtn.addEventListener("click", () => expandAll(false));
  showOnlyHighlightedToggle.addEventListener("change", applyViewFilters);
  showOnlyIncludedToggle.addEventListener("change", applyViewFilters);
  massActionFullBtn.addEventListener("click", () => applyMassAction("full"));
  massActionPathBtn.addEventListener("click", () => applyMassAction("path"));
  massActionIgnoreBtn.addEventListener("click", () =>
    applyMassAction("ignore")
  );

  addFilesBtn.addEventListener("click", handleAddFiles);
  additionalFilesList.addEventListener("click", handleRemoveAdditionalFile);

  loadPresetsBtn.addEventListener("click", handleLoadPresetsFromFile);
  savePresetsBtn.addEventListener("click", handleSavePresetsToFile);
  savePromptBtn.addEventListener("click", handleSavePrompt);
  deletePromptBtn.addEventListener("click", handleDeletePrompt);
  presetPromptSelect.addEventListener("change", handleLoadPrompt);
  saveProjectBtn.addEventListener("click", handleSaveProject);
  loadProjectBtn.addEventListener("click", handleLoadProject);
  deleteProjectBtn.addEventListener("click", handleDeleteProject);

  // --- INITIALIZATION ---
  async function initializeApp() {
    await initDB();
    console.log("Database initialized.");
    await tryAutoLoadPresets();
    updateAllPresetUI();
  }
  initializeApp();

  // --- PRESETS FILE MANAGEMENT ---
  async function tryAutoLoadPresets() {
    try {
      const response = await fetch("./context-crafter-presets.json");
      if (response.ok) {
        const loadedPresets = await response.json();
        if (!loadedPresets.prompts || !loadedPresets.projects) {
          throw new Error("Invalid preset file format.");
        }
        appPresets = loadedPresets;
        presetsFileStatus.textContent = `Auto-loaded local presets file.`;
        console.log("Successfully auto-loaded local presets file.");
      }
    } catch (err) {
      console.log(
        "Local presets file not found or failed to load, starting fresh.",
        err
      );
      presetsFileStatus.textContent = `No presets file loaded.`;
    }
  }

  // --- PRESETS FILE MANAGEMENT ---
  async function handleLoadPresetsFromFile() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "JSON Files",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const file = await handle.getFile();
      const content = await file.text();
      const loadedPresets = JSON.parse(content);
      if (!loadedPresets.prompts || !loadedPresets.projects) {
        throw new Error("Invalid preset file format.");
      }
      appPresets = loadedPresets;
      presetsFileHandle = handle;
      presetsFileStatus.textContent = `Loaded: ${handle.name}`;
      updateAllPresetUI();
      alert(
        "Presets loaded successfully! Note: Folder permissions are stored locally and are not part of this file."
      );
    } catch (err) {
      console.error("Error loading presets file:", err);
      alert("Could not load or parse the presets file.");
    }
  }

  async function handleSavePresetsToFile() {
    try {
      if (!presetsFileHandle) {
        presetsFileHandle = await window.showSaveFilePicker({
          suggestedName: "context-crafter-presets.json",
          types: [
            {
              description: "JSON Files",
              accept: { "application/json": [".json"] },
            },
          ],
        });
      }
      const writable = await presetsFileHandle.createWritable();
      await writable.write(JSON.stringify(appPresets, null, 2));
      await writable.close();
      presetsFileStatus.textContent = `Saved: ${presetsFileHandle.name}`;
      alert("Presets saved successfully!");
    } catch (err) {
      console.error("Error saving presets file:", err);
      alert(
        "Could not save presets file. You may need to load a file first to grant permission."
      );
    }
  }

  function updateAllPresetUI() {
    presetPromptSelect.innerHTML =
      '<option value="">-- Select a prompt --</option>';
    Object.keys(appPresets.prompts).forEach((name) => {
      presetPromptSelect.add(new Option(name, name));
    });
    presetPromptText.value = "";

    projectPresetSelect.innerHTML =
      '<option value="">-- Select a project --</option>';
    Object.keys(appPresets.projects).forEach((name) => {
      projectPresetSelect.add(new Option(name, name));
    });
  }

  // --- PRESETS LOGIC ---
  function handleSavePrompt() {
    const name = prompt("Enter a name for this preset prompt:");
    if (!name || !name.trim()) return;
    const text = presetPromptText.value;
    if (!text || !text.trim()) return alert("Prompt text cannot be empty.");

    appPresets.prompts[name] = text;
    updateAllPresetUI();
    presetPromptSelect.value = name;
    alert('Prompt saved. Click "Save Presets to File" to make it permanent.');
  }

  function handleDeletePrompt() {
    const name = presetPromptSelect.value;
    if (!name) return alert("Please select a prompt to delete.");
    if (confirm(`Are you sure you want to delete the "${name}" prompt?`)) {
      delete appPresets.prompts[name];
      updateAllPresetUI();
      alert(
        'Prompt deleted. Click "Save Presets to File" to make it permanent.'
      );
    }
  }

  function handleLoadPrompt() {
    const name = presetPromptSelect.value;
    presetPromptText.value = name ? appPresets.prompts[name] || "" : "";
  }

  async function handleSaveProject() {
    if (panels.every((p) => !p.handle)) {
      return alert(
        "Please select at least one folder before saving a project."
      );
    }
    const name = prompt("Enter a name for this project setup:");
    if (!name || !name.trim()) return;

    const panelConfigs = [];
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      if (panel.handle) {
        const handleKey = `project-${name}-panel-${i}`;
        await storeHandle(handleKey, panel.handle);
        panelConfigs.push({
          title: panel.title,
          rootName: panel.handle.name,
          handleKey: handleKey,
        });
      } else {
        panelConfigs.push(null);
      }
    }

    appPresets.projects[name] = { panelConfigs };
    updateAllPresetUI();
    projectPresetSelect.value = name;
    alert(
      `Project "${name}" saved. The folder permissions are now stored in your browser.`
    );
  }

  async function handleLoadProject() {
    const name = projectPresetSelect.value;
    if (!name) return alert("Please select a project to load.");

    const projectConfig = appPresets.projects[name];
    if (!projectConfig) return alert("Could not find project data.");

    let allPermissionsGranted = true;
    for (let i = 0; i < projectConfig.panelConfigs.length; i++) {
      const panelConfig = projectConfig.panelConfigs[i];
      if (panelConfig && panelConfig.handleKey) {
        const handle = await getHandle(panelConfig.handleKey);
        if (handle) {
          const permissionGranted = await verifyHandlePermission(handle);
          if (permissionGranted) {
            await loadDirectoryIntoPanel(i, handle);
          } else {
            allPermissionsGranted = false;
            alert(
              `Permission denied for folder "${handle.name}" in Panel ${
                i + 1
              }. You may need to manually select it.`
            );
            // Clear the panel as access was denied
            clearPanelState(i);
            document.querySelector(
              `.file-tree-container[data-panel-index="${i}"]`
            ).innerHTML = `<p class="placeholder">Access denied.</p>`;
          }
        } else {
          allPermissionsGranted = false;
          alert(
            `Could not find the saved folder for Panel ${
              i + 1
            }. Please select it manually to re-link.`
          );
        }
      } else {
        // If there's no saved config for this panel, clear it
        clearPanelState(i);
        document.querySelector(
          `.file-tree-container[data-panel-index="${i}"]`
        ).innerHTML = `<p class="placeholder">Panel is empty...</p>`;
      }
    }

    if (allPermissionsGranted) {
      alert(`Project "${name}" loaded successfully.`);
    }
  }

  function handleDeleteProject() {
    const name = projectPresetSelect.value;
    if (!name) return alert("Please select a project to delete.");
    if (confirm(`Are you sure you want to delete the "${name}" project?`)) {
      // Note: This only deletes the entry from the JSON, not the handle from IndexedDB.
      // That's generally fine, as it will just become orphaned data.
      delete appPresets.projects[name];
      updateAllPresetUI();
      alert(
        'Project deleted. Click "Save Presets to File" to make it permanent.'
      );
    }
  }

  // --- ADDITIONAL FILES LOGIC ---
  async function handleAddFiles() {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      handles.forEach((handle) =>
        additionalFileHandles.set(handle.name, handle)
      );
      renderAdditionalFiles();
    } catch (err) {
      console.log("File selection cancelled.");
    }
  }

  function renderAdditionalFiles() {
    additionalFilesList.innerHTML = "";
    for (const name of additionalFileHandles.keys()) {
      const li = document.createElement("li");
      li.textContent = name;
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✖";
      removeBtn.dataset.fileName = name;
      li.appendChild(removeBtn);
      additionalFilesList.appendChild(li);
    }
  }

  function handleRemoveAdditionalFile(event) {
    if (event.target.tagName === "BUTTON") {
      const fileName = event.target.dataset.fileName;
      additionalFileHandles.delete(fileName);
      renderAdditionalFiles();
    }
  }

  // --- DIRECTORY & REFRESH LOGIC ---
  async function handleSelectDirectory(panelIndex) {
    try {
      const handle = await window.showDirectoryPicker();
      await loadDirectoryIntoPanel(panelIndex, handle);
    } catch (error) {
      console.log("Directory selection cancelled.");
    }
  }

  async function handleRefreshDirectory(panelIndex) {
    const panel = panels[panelIndex];
    if (panel.handle) {
      await loadDirectoryIntoPanel(panelIndex, panel.handle);
    } else {
      alert("No folder selected to refresh. Please select a folder first.");
    }
  }

  async function loadDirectoryIntoPanel(panelIndex, directoryHandle) {
    panelIndex = parseInt(panelIndex);
    const panel = panels[panelIndex];
    clearPanelState(panelIndex);
    panel.handle = directoryHandle;
    const container = document.querySelector(
      `.file-tree-container[data-panel-index="${panelIndex}"]`
    );
    container.innerHTML = "<p>Loading file tree...</p>";

    const treeStructure = await traverseDirectory(
      directoryHandle,
      directoryHandle.name,
      panelIndex
    );
    renderFileTree(treeStructure, container, panelIndex);
    container.innerHTML += "<p>Analyzing dependencies...</p>";
    await buildDependencyGraph(panelIndex);
    container.querySelector("p:last-child")?.remove();

    showOnlyHighlightedToggle.checked = false;
    showOnlyIncludedToggle.checked = false;
    applyViewFilters();

    const panelTitleInput = document.querySelector(
      `#panel-${panel.id} .panel-title`
    );
    panelTitleInput.value = directoryHandle.name;
    panel.title = directoryHandle.name;
    document.querySelector(
      `.refresh-dir-btn[data-panel-index="${panelIndex}"]`
    ).style.display = "inline-block";
  }

  async function traverseDirectory(directoryHandle, path, panelIndex) {
    if (DEFAULT_BLACKLIST.has(directoryHandle.name)) return null;
    const structure = {
      name: directoryHandle.name,
      type: "directory",
      path: path,
      children: [],
    };
    try {
      for await (const entry of directoryHandle.values()) {
        const entryPath = `${path}/${entry.name}`;
        if (DEFAULT_BLACKLIST.has(entry.name)) continue;
        if (entry.kind === "file") {
          panels[panelIndex].fileHandles.set(entryPath, entry);
          structure.children.push({
            name: entry.name,
            path: entryPath,
            type: "file",
          });
        } else if (entry.kind === "directory") {
          const childStructure = await traverseDirectory(
            entry,
            entryPath,
            panelIndex
          );
          if (childStructure) structure.children.push(childStructure);
        }
      }
    } catch (err) {
      console.error(
        "Permission error traversing directory. You may need to re-select the folder.",
        err
      );
      const container = document.querySelector(
        `.file-tree-container[data-panel-index="${panelIndex}"]`
      );
      container.innerHTML = `<p class="placeholder">Error: Permission denied to read folder contents. Please re-select the folder.</p>`;
      return null;
    }
    return structure;
  }

  // --- UI RENDERING & INTERACTION ---
  function renderFileTree(structure, container, panelIndex) {
    container.innerHTML = "";
    if (!structure) return;
    const ul = document.createElement("ul");
    ul.style.listStyleType = "none";
    ul.style.paddingLeft = "0";
    createTree(structure, ul, 0, panelIndex, true);
    container.appendChild(ul);
  }

  function createTree(item, parentElement, depth, panelIndex) {
    const li = document.createElement("li");
    li.className = "tree-item-li";
    const itemDiv = document.createElement("div");
    itemDiv.className = "tree-item";
    itemDiv.style.marginLeft = `${depth * 20}px`;
    itemDiv.dataset.path = item.path;
    const itemName = document.createElement("span");
    itemName.className = "item-name";

    if (item.type === "directory") {
      itemName.innerHTML = `<span>&#x1F4C2;</span> ${item.name}`;
      itemName.classList.add("folder-title");
    } else {
      const depBtn = document.createElement("span");
      depBtn.className = "dep-toggle-btn dep-btn";
      depBtn.title = "Toggle Dependencies (files this file uses)";
      depBtn.textContent = "[D↑]";
      itemName.appendChild(depBtn);

      const dependentBtn = document.createElement("span");
      dependentBtn.className = "dep-toggle-btn dependent-btn";
      dependentBtn.title = "Toggle Dependents (files that use this file)";
      dependentBtn.textContent = "[↓U]";
      itemName.appendChild(dependentBtn);

      itemName.append(` 📄 ${item.name}`);
    }
    itemDiv.appendChild(itemName);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "tree-item-options";
    const optionsId = `options-${panelIndex}-${item.path.replace(
      /[^a-zA-Z0-9]/g,
      "-"
    )}`;

    optionsDiv.appendChild(
      createRadio(optionsId, "full", item.path, panelIndex)
    );
    optionsDiv.appendChild(
      createIconLabel(optionsId + "-full", "📝", "Full Content")
    );
    optionsDiv.appendChild(
      createRadio(optionsId, "path", item.path, panelIndex)
    );
    optionsDiv.appendChild(
      createIconLabel(optionsId + "-path", "🔗", "Path Only")
    );
    const ignoreRadio = createRadio(optionsId, "ignore", item.path, panelIndex);
    ignoreRadio.checked = true;
    optionsDiv.appendChild(ignoreRadio);
    optionsDiv.appendChild(
      createIconLabel(optionsId + "-ignore", "❌", "Ignore")
    );

    itemDiv.appendChild(optionsDiv);
    li.appendChild(itemDiv);
    parentElement.appendChild(li);

    if (item.type === "directory" && item.children.length > 0) {
      const childrenUl = document.createElement("ul");
      childrenUl.style.listStyleType = "none";
      childrenUl.style.paddingLeft = "0";
      if (depth > 0) childrenUl.classList.add("collapsed");
      item.children.forEach((child) =>
        createTree(child, childrenUl, depth + 1, panelIndex)
      );
      li.appendChild(childrenUl);
    }
  }

  function createRadio(name, value, path, panelIndex) {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = value;
    radio.id = `${name}-${value}`;
    radio.dataset.filePath = path;
    radio.dataset.panelIndex = panelIndex;
    return radio;
  }

  function createIconLabel(forId, icon, titleText) {
    const label = document.createElement("label");
    label.htmlFor = forId;
    label.className = "icon-label";
    label.textContent = icon;
    label.title = titleText;
    return label;
  }

  function handleIconToggle(event) {
    const target = event.target;
    if (target.classList.contains("icon-label")) {
      const associatedRadio = document.getElementById(target.htmlFor);
      if (
        associatedRadio &&
        associatedRadio.value !== "ignore" &&
        associatedRadio.checked
      ) {
        event.preventDefault();
        const ignoreRadio = associatedRadio
          .closest(".tree-item-options")
          .querySelector('input[value="ignore"]');
        if (ignoreRadio) {
          ignoreRadio.checked = true;
          ignoreRadio.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
  }

  function handleTreeClick(event) {
    const target = event.target;
    if (target.classList.contains("folder-title")) {
      const childrenUl = target.closest("li").querySelector("ul");
      if (childrenUl) {
        childrenUl.classList.toggle("collapsed");
        target.querySelector("span").innerHTML = childrenUl.classList.contains(
          "collapsed"
        )
          ? "&#x1F4C1;"
          : "&#x1F4C2;";
      }
    } else if (target.classList.contains("dep-toggle-btn")) {
      const path = target.closest(".tree-item").dataset.path;
      const type = target.textContent.includes("D↑") ? "deps" : "dependents";
      if (!fileHighlightStates.has(path))
        fileHighlightStates.set(path, {
          showDeps: false,
          showDependents: false,
        });
      const state = fileHighlightStates.get(path);
      if (type === "deps") state.showDeps = !state.showDeps;
      else state.showDependents = !state.showDependents;
      target.classList.toggle(
        "active",
        type === "deps" ? state.showDeps : state.showDependents
      );
      updateAllHighlights();
    }
  }

  function handleOptionChange(event) {
    const targetRadio = event.target;
    if (targetRadio.type === "radio") {
      const childrenUl = targetRadio.closest("li").querySelector("ul");
      if (childrenUl) {
        childrenUl
          .querySelectorAll(`input[type="radio"][value="${targetRadio.value}"]`)
          .forEach((radio) => {
            radio.checked = true;
          });
      }
    }
  }

  function expandAll(shouldExpand) {
    document.querySelectorAll(".file-tree-container ul").forEach((ul) => {
      if (!ul.parentElement.classList.contains("tree-item-li")) return;
      ul.classList.toggle("collapsed", !shouldExpand);
      const icon =
        ul.previousElementSibling.querySelector(".folder-title span");
      if (icon) icon.innerHTML = shouldExpand ? "&#x1F4C2;" : "&#x1F4C1;";
    });
  }

  // --- HIGHLIGHTING & FILTERING ---
  function updateAllHighlights() {
    document
      .querySelectorAll(".highlight-dependency, .highlight-dependent")
      .forEach((el) => {
        el.classList.remove("highlight-dependency", "highlight-dependent");
      });

    for (const [filePath, state] of fileHighlightStates.entries()) {
      const [panel] = findPanelAndHandleForPath(filePath);
      if (!panel) continue;
      const highlightPaths = (paths, className) => {
        for (const depPath of paths) {
          const el = document.querySelector(
            `.tree-item[data-path="${CSS.escape(depPath)}"]`
          );
          if (el) {
            revealTreeItem(el);
            el.classList.add(className);
          }
        }
      };
      if (state.showDeps)
        highlightPaths(
          panel.dependencies.get(filePath) || [],
          "highlight-dependency"
        );
      if (state.showDependents)
        highlightPaths(
          panel.dependents.get(filePath) || [],
          "highlight-dependent"
        );
    }
    applyViewFilters();
  }

  function applyViewFilters() {
    const shouldFilterByHighlight = showOnlyHighlightedToggle.checked;
    const shouldFilterByInclusion = showOnlyIncludedToggle.checked;
    document
      .querySelectorAll(".tree-item-li")
      .forEach((li) => li.classList.remove("hidden-by-filter"));
    if (!shouldFilterByHighlight && !shouldFilterByInclusion) return;

    const getKeepers = (selector) => {
      const keepers = new Set();
      document.querySelectorAll(selector).forEach((item) => {
        let currentLi = item.closest(".tree-item-li");
        while (currentLi) {
          keepers.add(currentLi);
          currentLi = currentLi.parentElement.closest(".tree-item-li");
        }
      });
      return keepers;
    };

    const highlightKeepers = shouldFilterByHighlight
      ? getKeepers(
          ".highlighted, .highlight-dependency, .highlight-dependent, .dep-toggle-btn.active"
        )
      : null;
    const inclusionKeepers = shouldFilterByInclusion
      ? getKeepers(
          'input[type="radio"][value="full"]:checked, input[type="radio"][value="path"]:checked'
        )
      : null;

    let finalKeepers;
    if (highlightKeepers && inclusionKeepers) {
      finalKeepers = new Set(
        [...highlightKeepers].filter((i) => inclusionKeepers.has(i))
      );
    } else {
      finalKeepers = highlightKeepers || inclusionKeepers;
    }

    document.querySelectorAll(".tree-item-li").forEach((li) => {
      if (!finalKeepers.has(li)) {
        li.classList.add("hidden-by-filter");
      }
    });
  }

  async function handleSearch() {
    document
      .querySelectorAll(".tree-item.highlighted")
      .forEach((el) => el.classList.remove("highlighted"));
    const searchTerm = searchInput.value.trim().toLowerCase();
    if (!searchTerm) return applyViewFilters();

    for (const panel of panels) {
      if (!panel.handle) continue;
      for (const [path, handle] of panel.fileHandles.entries()) {
        if (handle.kind !== "file") continue;
        try {
          const file = await handle.getFile();
          if (file.size > 10 * 1024 * 1024) continue;
          const content = await file.text();
          if (content.toLowerCase().includes(searchTerm)) {
            const el = document.querySelector(
              `.tree-item[data-path="${CSS.escape(path)}"]`
            );
            if (el) {
              revealTreeItem(el);
              el.classList.add("highlighted");
            }
          }
        } catch (e) {
          console.error(`Could not read file ${path} for search:`, e);
        }
      }
    }
    applyViewFilters();
  }

  function applyMassAction(actionType) {
    const elementSet = new Set();
    document
      .querySelectorAll(
        ".tree-item.highlighted, .tree-item.highlight-dependency, .tree-item.highlight-dependent"
      )
      .forEach((item) => elementSet.add(item));
    document
      .querySelectorAll(".dep-toggle-btn.active")
      .forEach((btn) => elementSet.add(btn.closest(".tree-item")));
    if (elementSet.size === 0)
      return alert(
        "No files are highlighted. Please search or use dependency toggles first."
      );
    elementSet.forEach((itemEl) => {
      const radio = itemEl.querySelector(
        `input[type="radio"][value="${actionType}"]`
      );
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  // --- DEPENDENCY & UTILITY ---
  async function buildDependencyGraph(panelIndex) {
    const panel = panels[panelIndex];
    const importRegex =
      /(?:from|require|import)\s*\(?\s*['"]((?:\.\/|\.\.\/|\/)?[\w@/.-]+)['"]/g;
    const pathLookup = new Map(
      Array.from(panel.fileHandles.keys()).flatMap((p) => [
        [p, p],
        [p.replace(/\.\w+$/, ""), p],
      ])
    );

    for (const [filePath, handle] of panel.fileHandles.entries()) {
      panel.dependencies.set(filePath, new Set());
      if (!panel.dependents.has(filePath))
        panel.dependents.set(filePath, new Set());
      try {
        const content = await (await handle.getFile()).text();
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const resolvedPath = resolveRelativePath(filePath, match[1]);
          const targetPath =
            pathLookup.get(resolvedPath) ||
            pathLookup.get(`${resolvedPath}/index`);
          if (targetPath) {
            panel.dependencies.get(filePath).add(targetPath);
            if (!panel.dependents.has(targetPath))
              panel.dependents.set(targetPath, new Set());
            panel.dependents.get(targetPath).add(filePath);
          }
        }
      } catch (e) {
        console.warn(`Could not read ${filePath} for dependency analysis.`, e);
      }
    }
  }

  function resolveRelativePath(basePath, relativePath) {
    const baseParts = basePath.split("/").slice(0, -1);
    const relativeParts = relativePath.split("/");
    for (const part of relativeParts) {
      if (part === "..") baseParts.pop();
      else if (part !== ".") baseParts.push(part);
    }
    return baseParts.join("/");
  }

  function revealTreeItem(treeItemEl) {
    let parentLi = treeItemEl.closest(".tree-item-li");
    while (parentLi) {
      const parentUl = parentLi.parentElement;
      if (parentUl && parentUl.classList.contains("collapsed")) {
        parentUl.classList.remove("collapsed");
        const icon =
          parentUl.previousElementSibling.querySelector(".folder-title span");
        if (icon) icon.innerHTML = "&#x1F4C2;";
      }
      parentLi = parentUl.parentElement.closest(".tree-item-li");
    }
  }

  function clearPanelState(panelIndex) {
    const panel = panels[panelIndex];
    if (!panel) return;
    if (panel.handle) {
      const rootPath = panel.handle.name;
      const statesToDelete = Array.from(fileHighlightStates.keys()).filter(
        (path) => path.startsWith(rootPath)
      );
      statesToDelete.forEach((path) => fileHighlightStates.delete(path));
    }
    panel.handle = null;
    panel.dependencies.clear();
    panel.dependents.clear();
    panel.fileHandles.clear();
    panel.title = "";
  }

  function clearAllHighlights() {
    fileHighlightStates.clear();
    document
      .querySelectorAll(".dep-toggle-btn.active")
      .forEach((btn) => btn.classList.remove("active"));
    document
      .querySelectorAll(
        ".highlighted, .highlight-dependency, .highlight-dependent"
      )
      .forEach((el) => {
        el.classList.remove(
          "highlighted",
          "highlight-dependency",
          "highlight-dependent"
        );
      });
    searchInput.value = "";
    applyViewFilters();
  }

  function findPanelAndHandleForPath(path) {
    for (const panel of panels) {
      if (panel.fileHandles.has(path)) {
        return [panel, panel.fileHandles.get(path)];
      }
    }
    return [null, null];
  }

  // --- CONTEXT GENERATION ---
  async function handleGenerateContext() {
    const presetPrompt = presetPromptText.value.trim();
    let output = "";
    if (presetPrompt) output += `${presetPrompt}\n\n---\n\n`;
    output += `Task: ${
      taskDescEl.value || "No task description provided."
    }\n\n`;
    let totalTokens = 0;

    for (const [index, panel] of panels.entries()) {
      if (!panel.handle) continue;
      const fullContentFiles = new Set();
      const pathOnlyFiles = new Set();
      document
        .querySelectorAll(
          `.file-tree-container[data-panel-index="${index}"] input[type="radio"]:checked`
        )
        .forEach((radio) => {
          if (radio.value === "full")
            fullContentFiles.add(radio.dataset.filePath);
          else if (radio.value === "path")
            pathOnlyFiles.add(radio.dataset.filePath);
        });

      if (fullContentFiles.size === 0 && pathOnlyFiles.size === 0) continue;
      const panelTitle = panel.title || panel.handle.name;
      output += `--- PROJECT: ${panelTitle} ---\n`;
      output += await buildFileTreeString(panel, [
        ...fullContentFiles,
        ...pathOnlyFiles,
      ]);

      if (fullContentFiles.size > 0) {
        output += `\n--- FILE CONTENT for ${panelTitle} ---\n`;
        for (const path of [...fullContentFiles].sort()) {
          const handle = panel.fileHandles.get(path);
          const relativePath = path.substring(panel.handle.name.length + 1);
          output += `\n${"=".repeat(10)} File: ${relativePath} ${"=".repeat(
            10
          )}\n\n`;
          try {
            const file = await handle.getFile();
            const content = await file.text();
            output += content + "\n";
            totalTokens += Math.ceil(content.length / CHARS_PER_TOKEN);
          } catch (e) {
            output += `[Could not read file: ${e.message}]\n`;
          }
        }
      }
      output += "\n";
    }

    if (additionalFileHandles.size > 0) {
      output += `--- ADDITIONAL FILES ---\n`;
      for (const [name, handle] of additionalFileHandles.entries()) {
        output += `\n${"=".repeat(10)} File: ${name} ${"=".repeat(10)}\n\n`;
        try {
          const file = await handle.getFile();
          const content = await file.text();
          output += content + "\n";
          totalTokens += Math.ceil(content.length / CHARS_PER_TOKEN);
        } catch (e) {
          output += `[Could not read file: ${e.message}]\n`;
        }
      }
    }

    outputContextEl.value = output;
    totalTokens += Math.ceil(output.length / CHARS_PER_TOKEN);
    tokenCountEl.textContent = `Tokens: ~${totalTokens}`;
  }

  async function buildFileTreeString(panel, paths) {
    const root = {};
    // Build the hierarchical object representation of the file tree
    paths.forEach((path) => {
      const relativePath = path.substring(panel.handle.name.length + 1);
      let current = root;
      relativePath.split("/").forEach((part) => {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      });
    });

    let str = "";
    // Recursively print the tree object into a string
    function printTree(node, prefix = "") {
      const entries = Object.keys(node);
      // Sort entries to have directories before files, then alphabetically
      const sortedEntries = entries.sort((a, b) => {
        const aIsDir = Object.keys(node[a]).length > 0;
        const bIsDir = Object.keys(node[b]).length > 0;
        if (aIsDir && !bIsDir) return -1; // a (directory) comes first
        if (!aIsDir && bIsDir) return 1; // b (directory) comes first
        return a.localeCompare(b); // Alphabetical sort for same types
      });

      sortedEntries.forEach((entry, i) => {
        const isLast = i === sortedEntries.length - 1;
        const isDir = Object.keys(node[entry]).length > 0;

        // Append the current entry to the string
        str += `${prefix}${isLast ? "└── " : "├── "}${entry}${
          isDir ? "/" : ""
        }\n`;

        // If it's a directory, recurse into it with an updated prefix
        if (isDir) {
          printTree(node[entry], prefix + (isLast ? "    " : "│   "));
        }
      });
    }

    printTree(root);
    return str;
  }

  function copyToClipboard() {
    if (!outputContextEl.value) return;
    navigator.clipboard
      .writeText(outputContextEl.value)
      .then(() => alert("Context copied to clipboard!"))
      .catch((err) => console.error("Failed to copy text: ", err));
  }
});
