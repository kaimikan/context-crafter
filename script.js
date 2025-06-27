document.addEventListener("DOMContentLoaded", () => {
  // --- STATE ---
  let rootDirectoryHandle = null;
  const fileHandles = new Map(); // Stores file handles by path

  // --- DOM ELEMENTS ---
  const selectDirBtn = document.getElementById("select-dir-btn");
  const generateBtn = document.getElementById("generate-btn");
  const copyBtn = document.getElementById("copy-btn");
  const fileTreeContainer = document.getElementById("file-tree-container");
  const outputContextEl = document.getElementById("output-context");
  const tokenCountEl = document.getElementById("token-count");
  const taskDescEl = document.getElementById("task-desc");

  // --- CONFIGURATION (Unchanged) ---
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
  selectDirBtn.addEventListener("click", handleSelectDirectory);
  generateBtn.addEventListener("click", handleGenerateContext);
  copyBtn.addEventListener("click", copyToClipboard);

  // Use event delegation for dynamic content in the file tree
  fileTreeContainer.addEventListener("click", handleTreeClick);
  fileTreeContainer.addEventListener("change", handleOptionChange);

  // --- FUNCTIONS ---

  async function handleSelectDirectory() {
    try {
      rootDirectoryHandle = await window.showDirectoryPicker();
      if (rootDirectoryHandle) {
        fileTreeContainer.innerHTML = "<p>Loading file tree...</p>";
        fileHandles.clear();
        const treeStructure = await traverseDirectory(
          rootDirectoryHandle,
          rootDirectoryHandle.name
        );
        renderFileTree(treeStructure, fileTreeContainer);
        generateBtn.disabled = false;
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
      alert(
        "Could not select directory. Please ensure you are using a compatible browser (like Chrome or Edge) and grant permission."
      );
    }
  }

  async function traverseDirectory(directoryHandle, path) {
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
        fileHandles.set(entryPath, entry);
        structure.children.push({
          name: entry.name,
          path: entryPath,
          type: "file",
        });
      } else if (entry.kind === "directory") {
        const childStructure = await traverseDirectory(entry, entryPath);
        if (childStructure) structure.children.push(childStructure);
      }
    }
    return structure;
  }

  function renderFileTree(structure, container) {
    container.innerHTML = "";
    const ul = document.createElement("ul");
    ul.style.listStyleType = "none";
    ul.style.paddingLeft = "0";
    createTree(structure, ul, 0);
    container.appendChild(ul);
  }

  function createTree(item, parentElement, depth) {
    const li = document.createElement("li");
    const itemDiv = document.createElement("div");
    itemDiv.className = "tree-item";

    itemDiv.style.marginLeft = `${depth * 20}px`;

    const itemName = document.createElement("span");
    itemName.className = "item-name";

    if (item.type === "directory") {
      itemName.innerHTML = `<span>&#x1F4C2;</span> ${item.name}`; // 📂 Open Folder Icon
      itemName.classList.add("folder-title");
      itemName.dataset.path = item.path;
    } else {
      itemName.innerHTML = `&#x1F4C4; ${item.name}`; // 📄 Page Icon
    }

    itemDiv.appendChild(itemName);

    // Add radio button options for both files and folders
    const optionsDiv = document.createElement("div");
    optionsDiv.className = "tree-item-options";
    const optionsId = `options-${item.path.replace(/[^a-zA-Z0-9]/g, "-")}`;

    optionsDiv.appendChild(createRadio(optionsId, "full", item.path));
    optionsDiv.appendChild(createLabel(optionsId + "-full", "Full"));
    optionsDiv.appendChild(createRadio(optionsId, "path", item.path));
    optionsDiv.appendChild(createLabel(optionsId + "-path", "Path Only"));
    const ignoreRadio = createRadio(optionsId, "ignore", item.path);
    ignoreRadio.checked = true; // Default to ignore
    optionsDiv.appendChild(ignoreRadio);
    optionsDiv.appendChild(createLabel(optionsId + "-ignore", "Ignore"));

    itemDiv.appendChild(optionsDiv);
    li.appendChild(itemDiv);
    parentElement.appendChild(li);

    if (item.type === "directory" && item.children.length > 0) {
      const childrenUl = document.createElement("ul");
      childrenUl.style.listStyleType = "none";
      childrenUl.style.paddingLeft = "0";
      // Start nested folders as collapsed for cleaner UI
      if (depth > 0) {
        childrenUl.classList.add("collapsed");
      }
      item.children.forEach((child) =>
        createTree(child, childrenUl, depth + 1)
      );
      li.appendChild(childrenUl);
    }
  }

  function createRadio(name, value, path) {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = value;
    radio.id = `${name}-${value}`;
    radio.dataset.filePath = path;
    return radio;
  }

  function createLabel(forId, text) {
    const label = document.createElement("label");
    label.htmlFor = forId;
    label.textContent = text;
    label.className = "tree-item-label";
    return label;
  }

  function handleTreeClick(event) {
    const target = event.target;
    if (target.classList.contains("folder-title")) {
      const li = target.closest("li");
      const childrenUl = li.querySelector("ul");
      if (childrenUl) {
        childrenUl.classList.toggle("collapsed");
        // Toggle folder icon
        const icon = target.querySelector("span");
        if (icon) {
          icon.innerHTML = childrenUl.classList.contains("collapsed")
            ? "&#x1F4C1;"
            : "&#x1F4C2;"; // 📁 vs 📂
        }
      }
    }
  }

  function handleOptionChange(event) {
    const targetRadio = event.target;
    if (targetRadio.type === "radio") {
      const li = targetRadio.closest("li");
      const childrenUl = li.querySelector("ul");
      // If it was a folder's option that changed, cascade it down
      if (childrenUl) {
        const descendantRadios = childrenUl.querySelectorAll(
          `input[type="radio"][value="${targetRadio.value}"]`
        );
        descendantRadios.forEach((radio) => (radio.checked = true));
      }
    }
  }

  async function handleGenerateContext() {
    // This function logic remains largely the same, as it just collects the final state
    const fullContentFiles = new Set();
    const pathOnlyFiles = new Set();

    document
      .querySelectorAll('input[type="radio"]:checked')
      .forEach((radio) => {
        const path = radio.dataset.filePath;
        // Only add files, not folders, to the final list
        if (fileHandles.has(path)) {
          if (radio.value === "full") {
            fullContentFiles.add(path);
          } else if (radio.value === "path") {
            pathOnlyFiles.add(path);
          }
        }
      });

    // Ensure a file isn't in both lists (full content takes priority)
    pathOnlyFiles.forEach((path) => {
      if (fullContentFiles.has(path)) {
        pathOnlyFiles.delete(path);
      }
    });

    const sortedFullContentFiles = [...fullContentFiles].sort();
    const sortedPathOnlyFiles = [...pathOnlyFiles].sort();

    let output = `Task: ${
      taskDescEl.value || "No task description provided."
    }\n`;
    // ... the rest of the generation logic is very similar to the previous version
    // We'll regenerate it here for completeness
    output += `Project Root: ${rootDirectoryHandle.name}\n\n`;

    // Generate and add the file tree string
    output += "--- FILE TREE ---\n";
    const allFilesInContext = [
      ...sortedFullContentFiles,
      ...sortedPathOnlyFiles,
    ].sort();
    const pathOnlySet = new Set(sortedPathOnlyFiles);

    let fileTreeString = "";
    allFilesInContext.forEach((path) => {
      const relativePath = path.substring(rootDirectoryHandle.name.length + 1);
      const parts = relativePath.split("/");
      fileTreeString +=
        "|-- ".padStart(parts.length * 4, " ") + parts[parts.length - 1];
      if (pathOnlySet.has(path)) {
        fileTreeString += " [PATH ONLY]";
      }
      fileTreeString += "\n";
    });
    output += `${rootDirectoryHandle.name}/\n${fileTreeString}\n--- FILE CONTENT ---\n`;

    let totalTokens = 0;
    for (const path of sortedFullContentFiles) {
      const handle = fileHandles.get(path);
      const relativePath = path.substring(rootDirectoryHandle.name.length + 1);
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

    const summary =
      `\n\n--- CONTEXT SUMMARY ---\n` +
      `Included ${sortedFullContentFiles.length} files with full content.\n` +
      `Included ${sortedPathOnlyFiles.length} files as path only.\n` +
      `Estimated token count for content: ~${totalTokens} tokens.`;

    output += summary;
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
