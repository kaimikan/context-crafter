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

  const generateBtn = document.getElementById("generate-btn");
  const copyBtn = document.getElementById("copy-btn");
  const outputContextEl = document.getElementById("output-context");
  const tokenCountEl = document.getElementById("token-count");
  const taskDescEl = document.getElementById("task-desc");
  const helpBtn = document.getElementById("help-btn");
  const helpModal = document.getElementById("help-modal");
  const modalCloseBtn = document.querySelector(".modal-close-btn");
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
  document.querySelectorAll(".file-tree-container").forEach((container) => {
    container.addEventListener("click", handleTreeClick);
    container.addEventListener("change", handleOptionChange);
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
  modalCloseBtn.addEventListener("click", () =>
    helpModal.classList.remove("visible")
  );
  window.addEventListener("click", (e) => {
    if (e.target === helpModal) helpModal.classList.remove("visible");
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

  // --- CORE LOGIC ---

  async function handleSelectDirectory(panelIndex) {
    panelIndex = parseInt(panelIndex);
    try {
      const handle = await window.showDirectoryPicker();
      if (handle) {
        const panel = panels[panelIndex];

        clearPanelState(panelIndex);

        panel.handle = handle;
        const container = document.querySelector(
          `.file-tree-container[data-panel-index="${panelIndex}"]`
        );
        container.innerHTML = "<p>Loading file tree...</p>";

        const treeStructure = await traverseDirectory(
          handle,
          handle.name,
          panelIndex
        );

        // Temporarily disable event handlers during initial render
        const tempHandler = container.onchange;
        container.onchange = null;

        renderFileTree(treeStructure, container, panelIndex);

        // Re-enable event handlers after a brief delay
        setTimeout(() => {
          container.onchange = tempHandler;
        }, 1000);

        container.innerHTML += "<p>Analyzing dependencies...</p>";
        await buildDependencyGraph(panelIndex);
        container.querySelector("p:last-child").remove();

        showOnlyHighlightedToggle.checked = false;
        showOnlyIncludedToggle.checked = false;
        applyViewFilters();

        if (!panel.title) {
          document.querySelector(`#panel-${panel.id} .panel-title`).value =
            handle.name;
          panel.title = handle.name;
        }
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
      alert(
        "Could not select directory. Please ensure you are using a compatible browser (like Chrome or Edge) and grant permission."
      );
    }
  }

  async function traverseDirectory(directoryHandle, path, panelIndex) {
    if (DEFAULT_BLACKLIST.has(directoryHandle.name)) return null;
    const structure = {
      name: directoryHandle.name,
      type: "directory",
      path: path,
      children: [],
    };
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
    return structure;
  }

  function renderFileTree(structure, container, panelIndex) {
    container.innerHTML = "";
    const ul = document.createElement("ul");
    ul.style.listStyleType = "none";
    ul.style.paddingLeft = "0";
    createTree(structure, ul, 0, panelIndex, true);
    container.appendChild(ul);
  }

  function createTree(
    item,
    parentElement,
    depth,
    panelIndex,
    isInitialRender = true
  ) {
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
      depBtn.dataset.path = item.path;
      depBtn.dataset.type = "deps";
      itemName.appendChild(depBtn);

      const dependentBtn = document.createElement("span");
      dependentBtn.className = "dep-toggle-btn dependent-btn";
      dependentBtn.title = "Toggle Dependents (files that use this file)";
      dependentBtn.textContent = "[↓U]";
      dependentBtn.dataset.path = item.path;
      dependentBtn.dataset.type = "dependents";
      itemName.appendChild(dependentBtn);

      itemName.append(` 📄 ${item.name}`);
    }
    itemDiv.appendChild(itemName);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "tree-item-options";

    // Create unique radio group name for each item
    const optionsId = `options-${panelIndex}-${item.path.replace(
      /[^a-zA-Z0-9]/g,
      "-"
    )}`;

    const fullRadio = createRadio(optionsId, "full", item.path, panelIndex);
    optionsDiv.appendChild(fullRadio);
    optionsDiv.appendChild(
      createIconLabel(optionsId + "-full", "📝", "Full Content")
    );

    const pathRadio = createRadio(optionsId, "path", item.path, panelIndex);
    optionsDiv.appendChild(pathRadio);
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

    // Don't dispatch change events during initial render
    if (!isInitialRender) {
      setTimeout(() => {
        ignoreRadio.dispatchEvent(new Event("change", { bubbles: true }));
      }, 1000);
    }

    parentElement.appendChild(li);

    if (item.type === "directory" && item.children.length > 0) {
      const childrenUl = document.createElement("ul");
      childrenUl.style.listStyleType = "none";
      childrenUl.style.paddingLeft = "0";
      if (depth > 0) childrenUl.classList.add("collapsed");
      item.children.forEach((child) =>
        createTree(child, childrenUl, depth + 1, panelIndex, isInitialRender)
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

  function handleTreeClick(event) {
    const target = event.target;
    if (target.classList.contains("folder-title")) {
      const li = target.closest("li");
      const childrenUl = li.querySelector("ul");
      if (childrenUl) {
        childrenUl.classList.toggle("collapsed");
        const icon = target.querySelector("span");
        if (icon)
          icon.innerHTML = childrenUl.classList.contains("collapsed")
            ? "&#x1F4C1;"
            : "&#x1F4C2;";
      }
    }

    if (target.classList.contains("dep-toggle-btn")) {
      const path = target.dataset.path;
      const type = target.dataset.type;

      if (!fileHighlightStates.has(path)) {
        fileHighlightStates.set(path, {
          showDeps: false,
          showDependents: false,
        });
      }
      const state = fileHighlightStates.get(path);

      if (type === "deps") {
        state.showDeps = !state.showDeps;
        target.classList.toggle("active", state.showDeps);
      } else if (type === "dependents") {
        state.showDependents = !state.showDependents;
        target.classList.toggle("active", state.showDependents);
      }
      updateAllHighlights();
    }
  }

  function handleOptionChange(event) {
    const targetRadio = event.target;
    if (targetRadio.type === "radio") {
      const li = targetRadio.closest("li");
      const childrenUl = li.querySelector("ul");

      // Only propagate to children if this is a directory
      if (childrenUl && li.querySelector(".folder-title")) {
        const descendantRadios = childrenUl.querySelectorAll(
          `input[type="radio"][value="${targetRadio.value}"]`
        );
        descendantRadios.forEach((radio) => {
          radio.checked = true;
        });
      }
    }
  }

  function expandAll(shouldExpand) {
    document.querySelectorAll(".file-tree-container ul").forEach((ul) => {
      if (ul.parentElement.classList.contains("file-tree-container")) return;

      ul.classList.toggle("collapsed", !shouldExpand);
      const folderIcon =
        ul.previousElementSibling.querySelector(".folder-title span");
      if (folderIcon) {
        folderIcon.innerHTML = shouldExpand ? "&#x1F4C2;" : "&#x1F4C1;";
      }
    });
  }

  function revealTreeItem(treeItemEl) {
    let parentLi = treeItemEl.closest(".tree-item-li");
    while (parentLi) {
      const parentUl = parentLi.parentElement;
      if (parentUl && parentUl.classList.contains("collapsed")) {
        parentUl.classList.remove("collapsed");
        const folderTitleDiv = parentUl.previousElementSibling;
        const folderIcon = folderTitleDiv.querySelector(".folder-title span");
        if (folderIcon) folderIcon.innerHTML = "&#x1F4C2;";
      }
      parentLi = parentUl.parentElement.closest(".tree-item-li");
    }
  }

  function applyViewFilters() {
    const shouldFilterByHighlight = showOnlyHighlightedToggle.checked;
    const shouldFilterByInclusion = showOnlyIncludedToggle.checked;

    document.querySelectorAll(".tree-item-li").forEach((li) => {
      li.classList.remove("hidden-by-filter");
    });

    if (!shouldFilterByHighlight && !shouldFilterByInclusion) return;

    let highlightKeepers = new Set();
    if (shouldFilterByHighlight) {
      const highlightedItems = document.querySelectorAll(
        ".highlighted, .highlight-dependency, .highlight-dependent"
      );
      const activeToggleButtons = document.querySelectorAll(
        ".dep-toggle-btn.active"
      );
      const allSources = [...highlightedItems, ...activeToggleButtons];

      allSources.forEach((item) => {
        let currentLi = item.closest(".tree-item-li");
        while (currentLi) {
          highlightKeepers.add(currentLi);
          currentLi = currentLi.parentElement.closest(".tree-item-li");
        }
      });
    }

    let inclusionKeepers = new Set();
    if (shouldFilterByInclusion) {
      document
        .querySelectorAll(
          'input[type="radio"][value="full"]:checked, input[type="radio"][value="path"]:checked'
        )
        .forEach((radio) => {
          let currentLi = radio.closest(".tree-item-li");
          while (currentLi) {
            inclusionKeepers.add(currentLi);
            currentLi = currentLi.parentElement.closest(".tree-item-li");
          }
        });
    }

    let finalKeepers;
    if (shouldFilterByHighlight && shouldFilterByInclusion) {
      finalKeepers = new Set(
        [...highlightKeepers].filter((i) => inclusionKeepers.has(i))
      );
    } else if (shouldFilterByHighlight) {
      finalKeepers = highlightKeepers;
    } else {
      finalKeepers = inclusionKeepers;
    }

    document.querySelectorAll(".tree-item-li").forEach((li) => {
      if (!finalKeepers.has(li)) {
        li.classList.add("hidden-by-filter");
      }
    });
  }

  function resolveRelativePath(basePath, relativePath) {
    const baseParts = basePath.split("/").slice(0, -1);
    const relativeParts = relativePath.split("/");

    for (const part of relativeParts) {
      if (part === "..") {
        baseParts.pop();
      } else if (part !== ".") {
        baseParts.push(part);
      }
    }
    return baseParts.join("/");
  }

  async function buildDependencyGraph(panelIndex) {
    const panel = panels[panelIndex];
    const importRegex =
      /(?:from|require|import)\s*\(?\s*['"]((?:\.\/|\.\.\/|\/)?[\w@/.-]+)['"]/g;

    const pathLookup = new Map();
    for (const path of panel.fileHandles.keys()) {
      const pathWithoutExt = path.replace(/\.\w+$/, "");
      pathLookup.set(path, path);
      pathLookup.set(pathWithoutExt, path);
    }

    for (const [filePath, handle] of panel.fileHandles.entries()) {
      panel.dependencies.set(filePath, new Set());
      if (!panel.dependents.has(filePath)) {
        panel.dependents.set(filePath, new Set());
      }

      const content = await (await handle.getFile()).text();
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        const resolvedPath = resolveRelativePath(filePath, importPath);

        const targetPath = pathLookup.get(resolvedPath);

        if (targetPath) {
          panel.dependencies.get(filePath).add(targetPath);
          if (!panel.dependents.has(targetPath)) {
            panel.dependents.set(targetPath, new Set());
          }
          panel.dependents.get(targetPath).add(filePath);
        }
      }
    }
  }

  function updateAllHighlights() {
    document
      .querySelectorAll(".highlight-dependency, .highlight-dependent")
      .forEach((el) => {
        el.classList.remove("highlight-dependency", "highlight-dependent");
      });

    for (const [filePath, state] of fileHighlightStates.entries()) {
      const [panel] = findPanelAndHandleForPath(filePath);
      if (!panel) continue;

      if (state.showDeps && panel.dependencies.has(filePath)) {
        for (const depPath of panel.dependencies.get(filePath)) {
          const el = document.querySelector(
            `.tree-item[data-path="${CSS.escape(depPath)}"]`
          );
          if (el) {
            revealTreeItem(el);
            el.classList.add("highlight-dependency");
          }
        }
      }

      if (state.showDependents && panel.dependents.has(filePath)) {
        for (const depPath of panel.dependents.get(filePath)) {
          const el = document.querySelector(
            `.tree-item[data-path="${CSS.escape(depPath)}"]`
          );
          if (el) {
            revealTreeItem(el);
            el.classList.add("highlight-dependent");
          }
        }
      }
    }
    applyViewFilters();
  }

  function clearPanelState(panelIndex) {
    const panel = panels[panelIndex];
    if (!panel || !panel.handle) return;

    const rootPath = panel.handle.name;

    const statesToDelete = [];
    for (const path of fileHighlightStates.keys()) {
      if (path.startsWith(rootPath)) {
        statesToDelete.push(path);
      }
    }
    statesToDelete.forEach((path) => fileHighlightStates.delete(path));

    document
      .querySelectorAll(
        `.file-tree-container[data-panel-index="${panelIndex}"] .tree-item-li`
      )
      .forEach((li) => {
        li.querySelector(".dep-toggle-btn.active")?.classList.remove("active");
        const item = li.querySelector(".tree-item");
        if (item) {
          item.classList.remove(
            "highlighted",
            "highlight-dependency",
            "highlight-dependent"
          );
        }
      });

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

  async function handleSearch() {
    document
      .querySelectorAll(".tree-item.highlighted")
      .forEach((el) => el.classList.remove("highlighted"));

    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
      applyViewFilters();
      return;
    }

    for (const panel of panels) {
      if (!panel.handle) continue;
      for (const [path, handle] of panel.fileHandles.entries()) {
        if (handle.kind !== "file") continue;
        try {
          const file = await handle.getFile();
          if (file.size > 10 * 1024 * 1024) continue;
          const content = await file.text();
          if (content.toLowerCase().includes(searchTerm.toLowerCase())) {
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
    const highlightedItems = document.querySelectorAll(
      ".tree-item.highlighted, .tree-item.highlight-dependency, .tree-item.highlight-dependent"
    );
    const activeToggleItems = document.querySelectorAll(
      ".dep-toggle-btn.active"
    );

    const elementSet = new Set();
    highlightedItems.forEach((item) => elementSet.add(item));
    activeToggleItems.forEach((btn) =>
      elementSet.add(btn.closest(".tree-item"))
    );

    if (elementSet.size === 0) {
      alert(
        "No files are highlighted or toggled. Please search or use the dependency toggles first."
      );
      return;
    }

    elementSet.forEach((itemEl) => {
      const radioToSelect = itemEl.querySelector(
        `input[type="radio"][value="${actionType}"]`
      );
      if (radioToSelect) {
        radioToSelect.checked = true;
        radioToSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  async function handleGenerateContext() {
    let output = `Task: ${
      taskDescEl.value || "No task description provided."
    }\n\n`;
    let totalTokens = 0;

    for (const [index, panel] of panels.entries()) {
      if (!panel.handle) continue;
      const fullContentFiles = new Set();
      const pathOnlyFiles = new Set();
      const container = document.querySelector(
        `.file-tree-container[data-panel-index="${index}"]`
      );

      container
        .querySelectorAll('input[type="radio"]:checked')
        .forEach((radio) => {
          if (radio.value === "ignore") return;

          const path = radio.dataset.filePath;
          const [filePanel] = findPanelAndHandleForPath(path) || [];
          if (
            filePanel &&
            panels[index].handle.name === filePanel.handle.name
          ) {
            if (radio.value === "full") fullContentFiles.add(path);
            else if (radio.value === "path") pathOnlyFiles.add(path);
          }
        });

      if (fullContentFiles.size === 0 && pathOnlyFiles.size === 0) continue;

      const panelTitle = panel.title || panel.handle.name;
      output += `--- PROJECT: ${panelTitle} ---\n`;

      const allFilesInContext = [...fullContentFiles, ...pathOnlyFiles].sort();

      const fileTree = {};
      allFilesInContext.forEach((path) => {
        const relativePath = path.substring(panel.handle.name.length + 1);
        let currentNode = fileTree;
        const parts = relativePath.split("/");
        parts.forEach((part, i) => {
          if (i === parts.length - 1) {
            currentNode[part] = { _isFile: true, _path: path };
          } else {
            currentNode[part] = currentNode[part] || {};
            currentNode = currentNode[part];
          }
        });
      });

      let fileTreeString = "";
      function printTree(node, prefix = "") {
        const entries = Object.keys(node).sort((a, b) => {
          const aIsFile = node[a]?._isFile;
          const bIsFile = node[b]?._isFile;
          if (a === "_isFile" || a === "_path") return 1;
          if (b === "_isFile" || b === "_path") return -1;
          if (aIsFile && !bIsFile) return 1;
          if (!aIsFile && bIsFile) return -1;
          return a.localeCompare(b);
        });
        entries.forEach((entry, i) => {
          if (entry === "_isFile" || entry === "_path") return;

          const isLast =
            i ===
            entries.filter((e) => e !== "_isFile" && e !== "_path").length - 1;

          const newPrefix = prefix + (isLast ? "    " : "│   ");
          const connector = isLast ? "└── " : "├── ";

          if (node[entry]._isFile) {
            fileTreeString += prefix + connector + entry;
            if (pathOnlyFiles.has(node[entry]._path)) {
              fileTreeString += " [PATH ONLY]";
            }
            fileTreeString += "\n";
          } else {
            fileTreeString += prefix + connector + entry + "/\n";
            printTree(node[entry], newPrefix);
          }
        });
      }

      printTree(fileTree);
      output += fileTreeString;

      output += `\n--- FILE CONTENT for ${panelTitle} ---\n`;
      for (const path of fullContentFiles) {
        const handle = panel.fileHandles.get(path);
        const relativePath = path.substring(panel.handle.name.length + 1);
        output += `\n${"=".repeat(10)} File: ${relativePath} ${"=".repeat(
          10
        )}\n\n`;
        try {
          const file = await handle.getFile();
          const content = await file.text();
          output += content;
          totalTokens += Math.ceil(content.length / CHARS_PER_TOKEN);
        } catch (e) {
          output += `[Could not read file: ${e.message}]\n`;
        }
      }
      output += "\n";
    }
    outputContextEl.value = output;
    tokenCountEl.textContent = `Tokens: ~${totalTokens}`;
  }

  function copyToClipboard() {
    if (!outputContextEl.value) return;
    navigator.clipboard
      .writeText(outputContextEl.value)
      .then(() => alert("Context copied to clipboard!"))
      .catch((err) => console.error("Failed to copy text: ", err));
  }
});
