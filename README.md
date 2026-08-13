# Card IDE for SillyTavern

Card IDE is a Visual Studio Code extension for editing SillyTavern-compatible CCv3 character cards as structured projects instead of raw JSON only.

## v0.1.6 — IDE Workspace UI

The visual editor has been rebuilt around an IDE-style workflow instead of a dashboard/card layout:

- **Command Bar** — project/file identity, modified indicator, Save, Validate, Preview and Export.
- **Explorer** — dense hierarchical navigation for Character, Prompts, Greetings, Lorebook, Assets and Metadata.
- **Editor Tabs** — multiple internal editor tabs with close buttons, modified indicator, `Ctrl/Cmd+W` and `Ctrl/Cmd+Tab`.
- **Editor Group** — focused editors for one field or resource at a time instead of one giant form.
- **Properties** — contextual property grid, especially for Lorebook entries and Assets.
- **Bottom Panel** — Problems, Validation, Output and Build tabs.
- **Status Bar** — CCv3 version, Lorebook count, greeting count, UTF-8 and validation status.
- **VS Code theme integration** — surfaces, selections, borders, inputs, warnings and errors use VS Code theme variables.
- **High-density layout** — 24–26px tree rows, 28–35px controls/chrome, 1px dividers and minimal 2–4px radii.

The Preview button opens a lightweight local card preview using the current Name, Description, Personality, Scenario and First Message. The Build panel reports whether validation currently blocks a clean CCv3 export; it does not pretend there is a separate compiler backend.

Long-text fields use an editor-style monospace surface prepared for a later Monaco replacement. **Monaco Editor is not bundled in v0.1.6**, so this release stays small and avoids Webview worker/runtime complexity while the IDE information architecture stabilizes.

## Core features

- Dedicated **Card IDE** Activity Bar and Card Explorer.
- Create and edit `chara_card_v3` / `3.0` cards.
- Import V1/V2-ish/V3 JSON and normalize it to CCv3 while preserving unknown fields where possible.
- Editors for character data, prompts, greetings, lorebook entries, assets, metadata and raw JSON.
- CCv3 structural validation and JSON export.
- VS Code document-backed undo/redo behavior.
- Explicit **Save** flushes current Webview changes to the document before saving to disk.
- Runtime I18n for **English**, **繁體中文**, and **简体中文**.

## Language / I18n

Card IDE supports three runtime languages:

- `en` — English
- `zh-tw` — 繁體中文
- `zh-cn` — 简体中文

The setting is **Card IDE › Language** (`cardIde.language`). Available values are:

- `auto` — follow the current VS Code display language (default)
- `en` — force English
- `zh-tw` — force 繁體中文
- `zh-cn` — force 简体中文

When `cardIde.language` changes, open Card IDE visual editors update immediately without restarting VS Code. Dynamic Explorer items, dialogs, notifications, validation summaries, errors, statuses and Webview UI use the selected Card IDE language.

VS Code-owned declarative UI such as Activity Bar titles and Command Palette command names uses the normal VS Code package NLS mechanism and therefore follows the VS Code display language. The Card IDE runtime override does not rewrite those declarative labels.

## Install the VSIX

1. Open VS Code.
2. Open **Extensions**.
3. Open the `...` menu.
4. Choose **Install from VSIX...**.
5. Select `sillytavern-card-ide-0.1.6.vsix`.
6. Reload VS Code if prompted.

CLI alternative:

```bash
code --install-extension sillytavern-card-ide-0.1.6.vsix --force
```

## Project format

Working files use:

```text
My Character.cardide.json
```

The file itself remains a normal CCv3 JSON object. The suffix tells VS Code to use the Card IDE custom editor by default.

## Run from source

1. Open the source folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Run **Card IDE: Create CCv3 Card** from the Command Palette.

The extension is plain JavaScript and has no compile step.

## Package a VSIX

```bash
npm install
npm run package
```

## Version archives

Historical source bundles and available VSIX packages are stored under `artifacts/`.

## Current scope

v0.1.6 focuses on the JSON-backed Card IDE and IDE-style authoring workspace. PNG/APNG `ccv3` metadata chunk import/export, CHARX packages, embedded asset packaging, token previews, full Monaco integration and AI-assisted authoring are not implemented yet.

## Character Card V3

The project targets:

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0"
}
```

It models V3 fields including group-only greetings, assets and V3 lorebook fields.
