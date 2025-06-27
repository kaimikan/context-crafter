document.addEventListener("DOMContentLoaded", () => {
  // --- STATE & DOM ELEMENTS (No changes here) ---
  const panels = [
    { id: "left", handle: null, fileHandles: new Map(), title: "" },
    { id: "right", handle: null, fileHandles: new Map(), title: "" },
  ];
  const generateBtn = document.getElementById("generate-btn");
  const copyBtn = document.getElementById("copy-btn");
  const outputContextEl = document.getElementById("output-context");
  const tokenCountEl = document.getElementById("token-count");
  const taskDescEl = document.getElementById("task-desc");
  const helpBtn = document.getElementById("help-btn");
  const helpModal = document.getElementById("help-modal");
  const modalCloseBtn = document.querySelector(".modal-close-btn");

  // --- CONFIGURATION (No changes here) ---
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

  // --- EVENT LISTENERS (No changes here) ---
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

  // --- CORE FUNCTIONS (Only createTree and its helpers are modified) ---

  // No changes to handleSelectDirectory, traverseDirectory, handleTreeClick, handleOptionChange, handleGenerateContext, copyToClipboard

  async function handleSelectDirectory(panelIndex) {
    panelIndex = parseInt(panelIndex);
    try {
      const handle = await window.showDirectoryPicker();
      if (handle) {
        panels[panelIndex].handle = handle;
        const container = document.querySelector(
          `.file-tree-container[data-panel-index="${panelIndex}"]`
        );
        container.innerHTML = "<p>Loading file tree...</p>";
        panels[panelIndex].fileHandles.clear();
        const treeStructure = await traverseDirectory(
          handle,
          handle.name,
          panelIndex
        );
        renderFileTree(treeStructure, container, panelIndex);
        if (!panels[panelIndex].title) {
          document.querySelector(
            `#panel-${panels[panelIndex].id} .panel-title`
          ).value = handle.name;
          panels[panelIndex].title = handle.name;
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
    createTree(structure, ul, 0, panelIndex);
    container.appendChild(ul);
  }

  /**
   * MODIFIED FUNCTION
   * Renders icons instead of text labels.
   * Defaults to 'path-only' instead of 'ignore'.
   */
  function createTree(item, parentElement, depth, panelIndex) {
    const li = document.createElement("li");
    const itemDiv = document.createElement("div");
    itemDiv.className = "tree-item";
    itemDiv.style.marginLeft = `${depth * 20}px`;
    const itemName = document.createElement("span");
    itemName.className = "item-name";
    if (item.type === "directory") {
      itemName.innerHTML = `<span>&#x1F4C2;</span> ${item.name}`;
      itemName.classList.add("folder-title");
      itemName.dataset.path = item.path;
    } else {
      itemName.innerHTML = `&#x1F4C4; ${item.name}`;
    }
    itemDiv.appendChild(itemName);

    // --- Start of Modified Block ---
    const optionsDiv = document.createElement("div");
    optionsDiv.className = "tree-item-options";
    const optionsId = `options-${panelIndex}-${item.path.replace(
      /[^a-zA-Z0-9]/g,
      "-"
    )}`;

    // Full Content Radio
    optionsDiv.appendChild(
      createRadio(optionsId, "full", item.path, panelIndex)
    );
    optionsDiv.appendChild(
      createIconLabel(optionsId + "-full", "📝", "Full Content")
    );

    // Path Only Radio (now the default)
    const pathRadio = createRadio(optionsId, "path", item.path, panelIndex);
    pathRadio.checked = true; // Set "Path Only" as the default
    optionsDiv.appendChild(pathRadio);
    optionsDiv.appendChild(
      createIconLabel(optionsId + "-path", "🔗", "Path Only")
    );

    // Ignore Radio (no longer the default)
    const ignoreRadio = createRadio(optionsId, "ignore", item.path, panelIndex);
    optionsDiv.appendChild(ignoreRadio);
    optionsDiv.appendChild(
      createIconLabel(optionsId + "-ignore", "❌", "Ignore")
    );

    itemDiv.appendChild(optionsDiv);
    // --- End of Modified Block ---

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

  /**
   * NEW FUNCTION
   * Creates the icon label with a hover tooltip (title).
   */
  function createIconLabel(forId, icon, titleText) {
    const label = document.createElement("label");
    label.htmlFor = forId;
    label.className = "icon-label";
    label.textContent = icon;
    label.title = titleText; // This creates the native hover tooltip
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
  }

  function handleOptionChange(event) {
    const targetRadio = event.target;
    if (targetRadio.type === "radio") {
      const li = targetRadio.closest("li");
      const childrenUl = li.querySelector("ul");
      if (childrenUl) {
        const descendantRadios = childrenUl.querySelectorAll(
          `input[type="radio"][value="${targetRadio.value}"]`
        );
        descendantRadios.forEach((radio) => (radio.checked = true));
      }
    }
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
          const path = radio.dataset.filePath;
          if (panel.fileHandles.has(path)) {
            if (radio.value === "full") fullContentFiles.add(path);
            else if (radio.value === "path") pathOnlyFiles.add(path);
          }
        });
      if (fullContentFiles.size === 0 && pathOnlyFiles.size === 0) continue;
      const panelTitle = panel.title || panel.handle.name;
      output += `--- PROJECT: ${panelTitle} ---\n`;
      const sortedFullContentFiles = [...fullContentFiles].sort();
      const sortedPathOnlyFiles = [...pathOnlyFiles].sort();
      const pathOnlySet = new Set(sortedPathOnlyFiles);
      const allFilesInContext = [
        ...sortedFullContentFiles,
        ...sortedPathOnlyFiles,
      ].sort();
      let fileTreeString = "";
      allFilesInContext.forEach((path) => {
        const relativePath = path.substring(panel.handle.name.length + 1);
        const parts = relativePath.split("/");
        fileTreeString +=
          "|-- ".padStart(parts.length * 4, " ") + parts[parts.length - 1];
        if (pathOnlySet.has(path)) fileTreeString += " [PATH ONLY]";
        fileTreeString += "\n";
      });
      output += `/${fileTreeString}\n--- FILE CONTENT for ${panelTitle} ---\n`;
      for (const path of sortedFullContentFiles) {
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
