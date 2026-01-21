# Context Crafter - Production Plan

This document outlines the implementation plan for the four major improvements.

## Overview of Changes

| Feature | Complexity | Dependencies |
|---------|------------|--------------|
| 1. Persist selections on refresh | Medium | None |
| 2. Dynamic panel system (N folders) | High | Feature 1 (shares selection state logic) |
| 3. Natural preset application flow | Medium | Feature 2 (panel count affects presets) |
| 4. Subselection presets | Medium | Features 1, 2, 3 |

---

## Feature 1: Persist File/Folder Selections After Refresh

### Current Behavior
- `handleRefreshDirectory()` calls `loadDirectoryIntoPanel()` which:
  1. Calls `clearPanelState()` - clears all state
  2. Rebuilds file tree from scratch
  3. All radio buttons default to "ignore"

### Proposed Solution
1. Before refresh, capture selection state: `Map<relativePath, 'full'|'path'|'ignore'>`
2. After tree rebuild, restore selections by matching relative paths
3. Handle edge cases: files deleted/added between refreshes

### Implementation Tasks
- [ ] Add `captureSelectionState(panelIndex)` function
- [ ] Add `restoreSelectionState(panelIndex, selectionMap)` function
- [ ] Modify `handleRefreshDirectory()` to capture before and restore after
- [ ] Handle missing files gracefully (skip restoration for deleted files)

### Key Code Changes
```javascript
// New functions needed:
function captureSelectionState(panelIndex) {
  const selections = new Map();
  document.querySelectorAll(
    `.file-tree-container[data-panel-index="${panelIndex}"] input[type="radio"]:checked`
  ).forEach(radio => {
    const relativePath = getRelativePath(radio.dataset.filePath, panelIndex);
    selections.set(relativePath, radio.value);
  });
  return selections;
}

function restoreSelectionState(panelIndex, selections) {
  const panel = panels[panelIndex];
  const rootName = panel.handle.name;
  selections.forEach((value, relativePath) => {
    const fullPath = `${rootName}/${relativePath}`;
    const radio = document.querySelector(
      `.file-tree-container[data-panel-index="${panelIndex}"] input[data-file-path="${CSS.escape(fullPath)}"][value="${value}"]`
    );
    if (radio) radio.checked = true;
  });
}
```

---

## Feature 2: Dynamic Panel System (Support N Folders)

### Current Behavior
- Hardcoded 2 panels in HTML (`#panel-left`, `#panel-right`)
- `panels` array initialized with exactly 2 objects
- Panel index references throughout code assume 0 or 1

### Proposed Solution
1. Replace hardcoded HTML panels with a single container
2. Add "Add Panel" / "Remove Panel" buttons
3. Generate panel HTML dynamically
4. Refactor `panels` array to be dynamically sized
5. Update all panel-index-dependent code

### Implementation Tasks
- [ ] Create `createPanelHTML(index)` function
- [ ] Add "Add Panel" button to UI
- [ ] Add "Remove Panel" button per panel (except when only 1 remains)
- [ ] Modify `panels` array to support dynamic add/remove
- [ ] Update `handleSaveProject()` to save variable panel count
- [ ] Update `handleLoadProject()` to load variable panel count
- [ ] Update panel ID scheme from `panel-left/right` to `panel-0`, `panel-1`, etc.

### HTML Changes
```html
<!-- Replace fixed panels with: -->
<div id="panels-wrapper">
  <div class="panels-container" id="panels-container">
    <!-- Panels generated dynamically -->
  </div>
  <button id="add-panel-btn" class="add-panel-btn">+ Add Panel</button>
</div>
```

### Key Code Changes
```javascript
// Dynamic panel creation
function createPanel(index) {
  const panel = {
    id: `panel-${index}`,
    handle: null,
    fileHandles: new Map(),
    dependencies: new Map(),
    dependents: new Map(),
    title: ""
  };
  panels.push(panel);

  const panelHTML = `
    <div class="panel" id="panel-${index}">
      <div class="panel-header">
        <input type="text" class="panel-title" placeholder="e.g., Project ${index + 1}" />
        <button class="remove-panel-btn" data-panel-index="${index}" ${panels.length <= 1 ? 'disabled' : ''}>✕</button>
      </div>
      <div class="panel-buttons">
        <button class="select-dir-btn" data-panel-index="${index}">Select Folder</button>
        <button class="refresh-dir-btn" data-panel-index="${index}" style="display: none">🔄 Refresh</button>
      </div>
      <div class="file-tree-container" data-panel-index="${index}">
        <p class="placeholder">Panel ${index + 1} is empty...</p>
      </div>
    </div>
  `;
  // Insert and attach event listeners
}

function removePanel(index) {
  // Remove from DOM and panels array
  // Re-index remaining panels
}
```

---

## Feature 3: Natural Preset Application Flow

### Current Behavior
- Presets accessible only via modal
- Multi-step process: Open modal → Select → Click action → Close modal
- Prompt preset only loads into modal textarea, not directly usable

### Proposed Solution
1. Add prompt preset dropdown directly in main UI (near task description)
2. Add quick-load project dropdown/buttons in header or panels section
3. Auto-apply prompt when selected from dropdown
4. Keep modal for advanced management (save/delete operations)

### Implementation Tasks
- [ ] Add prompt preset dropdown to main UI (above task description)
- [ ] Add project quick-load dropdown to main UI
- [ ] Create `applyPromptPreset(name)` function that sets the prompt immediately
- [ ] Add visual indicator showing which preset is active
- [ ] Keep modal for save/delete/manage operations
- [ ] Sync dropdown selection with modal selection

### HTML Changes
```html
<!-- In section 3, before task description -->
<div class="preset-quick-select">
  <label for="quick-prompt-select">Prompt Preset:</label>
  <select id="quick-prompt-select">
    <option value="">-- None --</option>
    <!-- Populated from appPresets.prompts -->
  </select>
</div>

<!-- In section 1, add project quick-load -->
<div class="project-quick-select">
  <label for="quick-project-select">Load Project:</label>
  <select id="quick-project-select">
    <option value="">-- Select Project --</option>
  </select>
  <button id="quick-load-project-btn">Load</button>
</div>
```

---

## Feature 4: Subselection Presets

### Current Behavior
- Project presets store only: `{ panelConfigs: [{ title, rootName, handleKey }] }`
- No file selection state is saved
- Loading a project gives blank selections (all "ignore")

### Proposed Solution
1. Extend project preset format to include selection state per panel
2. Store relative paths with their selection mode
3. On project load, restore selections after tree is built
4. Add option to save "selection template" that can apply across similar projects

### Implementation Tasks
- [ ] Extend preset schema to include `selections` array
- [ ] Modify `handleSaveProject()` to capture selections
- [ ] Modify `handleLoadProject()` to restore selections
- [ ] Add migration for old presets (add empty selections)
- [ ] Consider "selection templates" as separate feature (future)

### New Preset Schema
```javascript
appPresets.projects[name] = {
  panelConfigs: [
    {
      title: "Frontend",
      rootName: "my-app",
      handleKey: "project-myproject-panel-0",
      selections: {
        // Relative paths from root
        "src/index.js": "full",
        "src/components": "path",  // directory selection
        "src/utils/helpers.js": "full",
        // Files not listed default to "ignore"
      }
    },
    // ... more panels
  ]
};
```

### Key Code Changes
```javascript
async function handleSaveProject() {
  // ... existing code ...
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    if (panel.handle) {
      const handleKey = `project-${name}-panel-${i}`;
      await storeHandle(handleKey, panel.handle);

      // Capture selections
      const selections = {};
      captureSelectionState(i).forEach((value, relativePath) => {
        if (value !== 'ignore') { // Only store non-ignore selections
          selections[relativePath] = value;
        }
      });

      panelConfigs.push({
        title: panel.title,
        rootName: panel.handle.name,
        handleKey: handleKey,
        selections: selections  // NEW
      });
    }
  }
}

async function handleLoadProject() {
  // ... after loading directory into panel ...
  if (panelConfig.selections) {
    restoreSelectionState(i, new Map(Object.entries(panelConfig.selections)));
  }
}
```

---

## Implementation Order

### Phase 1: Foundation (Feature 1)
1. Implement `captureSelectionState()` and `restoreSelectionState()`
2. Integrate with refresh functionality
3. Test with various file tree configurations

### Phase 2: Dynamic Panels (Feature 2)
1. Refactor HTML to use dynamic panel generation
2. Implement add/remove panel functionality
3. Update all event listeners for dynamic panels
4. Test panel management thoroughly

### Phase 3: UX Improvements (Feature 3)
1. Add quick-select dropdowns to main UI
2. Implement auto-apply for prompt presets
3. Sync with modal selections
4. Test workflow improvements

### Phase 4: Subselection Presets (Feature 4)
1. Extend preset schema
2. Modify save/load project functions
3. Add migration logic for existing presets
4. End-to-end testing

---

## Testing Checklist

### Feature 1: Persist Selections
- [ ] Refresh preserves "full" selections
- [ ] Refresh preserves "path" selections
- [ ] Deleted files don't cause errors
- [ ] New files appear as "ignore" (default)
- [ ] Directory selections cascade correctly

### Feature 2: Dynamic Panels
- [ ] Can add panels (up to reasonable limit, e.g., 5)
- [ ] Can remove panels (minimum 1 must remain)
- [ ] Panel indices update correctly after removal
- [ ] All functionality works with N panels
- [ ] Saved projects load correct number of panels

### Feature 3: Natural Preset Flow
- [ ] Prompt dropdown shows all saved prompts
- [ ] Selecting prompt auto-applies it
- [ ] Project dropdown shows all saved projects
- [ ] Quick-load works correctly
- [ ] Modal and dropdown stay in sync

### Feature 4: Subselection Presets
- [ ] Saving project captures all selections
- [ ] Loading project restores selections
- [ ] Old presets without selections still work
- [ ] Large selection sets don't impact performance

---

## Files to Modify

| File | Changes |
|------|---------|
| `script.js` | All JavaScript logic changes |
| `index.html` | New UI elements, dynamic panel structure |
| `style.css` | Styles for new UI elements |
| `context-crafter-presets.json` | Schema update (backwards compatible) |
| `CLAUDE.md` | Update architecture documentation |

---

## Status Tracker

| Feature | Status | Notes |
|---------|--------|-------|
| 1. Persist selections on refresh | Complete | Added `captureSelectionState()` and `restoreSelectionState()` functions |
| 2. Dynamic panel system | Complete | Dynamic panel creation/removal, event delegation, max 6 panels |
| 3. Natural preset flow | Not Started | |
| 4. Subselection presets | Not Started | |
