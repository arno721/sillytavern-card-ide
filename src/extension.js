'use strict';

const vscode = require('vscode');
const path = require('path');
const {
  createEmptyCard,
  normalizeCard,
  validateCard,
  safeFileName,
  nowUnix
} = require('./core');
const {
  resolveLanguage,
  getMessages,
  t,
  translateValidationMessage
} = require('./i18n');
const { getWebviewHtml } = require('./webview');

class CardLanguageService {
  get language() {
    const configured = vscode.workspace.getConfiguration('cardIde').get('language', 'auto');
    return resolveLanguage(configured, vscode.env.language);
  }

  get messages() {
    return getMessages(this.language);
  }

  text(key, vars) {
    return t(this.language, key, vars);
  }

  validationMessage(message) {
    return translateValidationMessage(this.language, message);
  }
}

class CardExplorerProvider {
  constructor(language) {
    this.language = language;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() { this._onDidChangeTreeData.fire(); }
  getTreeItem(element) { return element; }

  async getChildren(element) {
    if (!vscode.workspace.workspaceFolders?.length) return [];
    if (!element) {
      const files = await vscode.workspace.findFiles('**/*.cardide.json', '**/{node_modules,.git}/**');
      return Promise.all(files.sort((a, b) => a.fsPath.localeCompare(b.fsPath)).map(uri => this._cardItem(uri)));
    }
    if (element.kind === 'card') return this._sectionItems(element.resourceUri);
    return [];
  }

  async _cardItem(uri) {
    let label = path.basename(uri.fsPath, '.cardide.json');
    let description = 'CCv3';
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(raw).toString('utf8'));
      if (json?.data?.name) label = json.data.name;
      description = `${json?.spec_version || '?'} · ${path.basename(uri.fsPath)}`;
    } catch (_) {}
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    item.kind = 'card';
    item.resourceUri = uri;
    item.contextValue = 'cardIdeCard';
    item.description = description;
    item.iconPath = new vscode.ThemeIcon('account');
    item.command = {
      command: 'cardIde.openVisualEditor',
      title: this.language.text('action.openCard'),
      arguments: [uri]
    };
    return item;
  }

  _sectionItems(uri) {
    const sections = [
      ['section.general', 'person'],
      ['section.prompts', 'comment-discussion'],
      ['section.greetings', 'quote'],
      ['section.lorebook', 'book'],
      ['section.assets', 'file-media'],
      ['section.metadata', 'json']
    ];
    return sections.map(([key, icon], index) => {
      const label = this.language.text(key);
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'cardIdeSection';
      item.iconPath = new vscode.ThemeIcon(icon);
      item.command = {
        command: 'cardIde.openVisualEditor',
        title: `${this.language.text('action.openCard')}: ${label}`,
        arguments: [uri, index]
      };
      return item;
    });
  }
}

class CardEditorProvider {
  static viewType = 'cardIde.editor';

  constructor(context, explorer, language) {
    this.context = context;
    this.explorer = explorer;
    this.language = language;
    this.lastUri = undefined;
    this.panels = new Set();
  }

  async broadcastLocale() {
    const payload = {
      type: 'locale',
      language: this.language.language,
      messages: this.language.messages
    };
    await Promise.all([...this.panels].map(panel => panel.webview.postMessage(payload).catch(() => false)));
  }

  async resolveCustomTextEditor(document, webviewPanel) {
    this.lastUri = document.uri;
    this.panels.add(webviewPanel);
    webviewPanel.webview.options = { enableScripts: true };
    let webviewReady = false;

    const sendDocument = async () => {
      if (document.isClosed || !webviewReady) return;
      try {
        const parsed = JSON.parse(document.getText());
        await webviewPanel.webview.postMessage({ type: 'document', card: parsed, uri: document.uri.toString(), isDirty: document.isDirty });
      } catch (error) {
        await webviewPanel.webview.postMessage({ type: 'parseError', message: error.message, isDirty: document.isDirty });
      }
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === document.uri.toString()) {
        void sendDocument();
        this.explorer.refresh();
      }
    });

    const saveSubscription = vscode.workspace.onDidSaveTextDocument(savedDocument => {
      if (savedDocument.uri.toString() === document.uri.toString()) {
        void sendDocument();
      }
    });

    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async message => {
      switch (message.type) {
        case 'ready':
          webviewReady = true;
          await webviewPanel.webview.postMessage({
            type: 'locale',
            language: this.language.language,
            messages: this.language.messages
          });
          await sendDocument();
          break;
        case 'update': {
          try {
            const next = normalizeCard(message.card);
            const cfg = vscode.workspace.getConfiguration('cardIde');
            if (cfg.get('updateModificationDateOnEdit', true)) next.data.modification_date = nowUnix();
            await replaceDocument(document, JSON.stringify(next, null, 2));
          } catch (error) {
            vscode.window.showErrorMessage(this.language.text('message.updateFailed', { message: error.message }));
          }
          break;
        }
        case 'validate': {
          try {
            const issues = validateCard(JSON.parse(document.getText()));
            await webviewPanel.webview.postMessage({ type: 'validation', issues });
            showValidationSummary(issues, this.language);
          } catch (error) {
            vscode.window.showErrorMessage(this.language.text('message.invalidJson', { message: error.message }));
          }
          break;
        }
        case 'save': {
          try {
            if (message.card) {
              const next = normalizeCard(message.card);
              const cfg = vscode.workspace.getConfiguration('cardIde');
              if (cfg.get('updateModificationDateOnEdit', true)) next.data.modification_date = nowUnix();
              await replaceDocument(document, JSON.stringify(next, null, 2));
            }
            await document.save();
            await webviewPanel.webview.postMessage({ type: 'saved' });
          } catch (error) {
            vscode.window.showErrorMessage(this.language.text('message.updateFailed', { message: error.message }));
          }
          break;
        }
        case 'export':
          await vscode.commands.executeCommand('cardIde.exportJson', document.uri);
          break;
        case 'openRaw':
          await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
          break;
      }
    });

    webviewPanel.onDidDispose(() => {
      this.panels.delete(webviewPanel);
      changeSubscription.dispose();
      saveSubscription.dispose();
      messageSubscription.dispose();
    });

    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, this.language.language, this.language.messages);
  }
}

async function replaceDocument(document, text) {
  if (document.getText() === text) return;
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, text);
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) throw new Error('VS Code rejected the workspace edit.');
}

function uriFromArg(arg, editorProvider) {
  if (arg instanceof vscode.Uri) return arg;
  if (arg?.resourceUri instanceof vscode.Uri) return arg.resourceUri;
  if (arg?.uri instanceof vscode.Uri) return arg.uri;
  return editorProvider.lastUri;
}

async function createProject(explorer, language) {
  const name = await vscode.window.showInputBox({
    title: language.text('dialog.createTitle'),
    prompt: language.text('dialog.characterName'),
    value: language.text('dialog.newCharacter'),
    validateInput: value => value.trim() ? undefined : language.text('dialog.nameRequired')
  });
  if (!name) return;

  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  const defaultUri = root ? vscode.Uri.joinPath(root, `${safeFileName(name)}.cardide.json`) : undefined;
  const target = await vscode.window.showSaveDialog({
    title: language.text('dialog.saveProject'),
    defaultUri,
    filters: {
      [language.text('dialog.cardProject')]: ['cardide.json'],
      [language.text('dialog.json')]: ['json']
    }
  });
  if (!target) return;

  const uri = target.fsPath.endsWith('.cardide.json') ? target : vscode.Uri.file(`${target.fsPath}.cardide.json`);
  const card = createEmptyCard(name.trim());
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(card, null, 2), 'utf8'));
  explorer.refresh();
  await vscode.commands.executeCommand('vscode.openWith', uri, CardEditorProvider.viewType);
}

async function importJson(explorer, language) {
  const chosen = await vscode.window.showOpenDialog({
    title: language.text('dialog.importTitle'),
    canSelectMany: false,
    filters: { [language.text('dialog.characterJson')]: ['json'] }
  });
  if (!chosen?.length) return;

  let parsed;
  try {
    const raw = await vscode.workspace.fs.readFile(chosen[0]);
    parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch (error) {
    return vscode.window.showErrorMessage(language.text('message.importFailed', { message: error.message }));
  }

  const card = normalizeCard(parsed);
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  const defaultUri = root ? vscode.Uri.joinPath(root, `${safeFileName(card.data.name)}.cardide.json`) : undefined;
  const target = await vscode.window.showSaveDialog({
    title: language.text('dialog.saveImported'),
    defaultUri,
    filters: { [language.text('dialog.cardProject')]: ['cardide.json'] }
  });
  if (!target) return;

  const uri = target.fsPath.endsWith('.cardide.json') ? target : vscode.Uri.file(`${target.fsPath}.cardide.json`);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(card, null, 2), 'utf8'));
  explorer.refresh();

  const issues = validateCard(card);
  const warnings = issues.filter(item => item.severity !== 'error').length;
  const warningText = warnings ? language.text('message.importWarnings', { count: warnings }) : '';
  vscode.window.showInformationMessage(language.text('message.imported', { warnings: warningText }));
  await vscode.commands.executeCommand('vscode.openWith', uri, CardEditorProvider.viewType);
}

async function exportJson(arg, editorProvider, language) {
  const source = uriFromArg(arg, editorProvider);
  if (!source) return vscode.window.showWarningMessage(language.text('message.openFirst'));

  try {
    const doc = await vscode.workspace.openTextDocument(source);
    const card = normalizeCard(JSON.parse(doc.getText()));
    card.data.modification_date = nowUnix();
    const issues = validateCard(card);
    const errors = issues.filter(item => item.severity === 'error');

    if (errors.length) {
      const exportAnyway = language.text('action.exportAnyway');
      const choice = await vscode.window.showWarningMessage(
        language.text('validation.exportPrompt', { errors: errors.length }),
        { modal: true },
        exportAnyway
      );
      if (choice !== exportAnyway) return;
    }

    const defaultUri = vscode.Uri.file(path.join(path.dirname(source.fsPath), `${safeFileName(card.data.name)}.json`));
    const target = await vscode.window.showSaveDialog({
      title: language.text('dialog.exportTitle'),
      defaultUri,
      filters: { [language.text('dialog.ccv3Json')]: ['json'] }
    });
    if (!target) return;

    const pretty = vscode.workspace.getConfiguration('cardIde').get('prettyPrint', true);
    await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(card, null, pretty ? 2 : 0), 'utf8'));
    vscode.window.showInformationMessage(language.text('message.exported', { file: path.basename(target.fsPath) }));
  } catch (error) {
    vscode.window.showErrorMessage(language.text('message.exportFailed', { message: error.message }));
  }
}

async function validateCurrent(arg, editorProvider, language) {
  const uri = uriFromArg(arg, editorProvider);
  if (!uri) return vscode.window.showWarningMessage(language.text('message.openFirst'));
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    showValidationSummary(validateCard(JSON.parse(doc.getText())), language);
  } catch (error) {
    vscode.window.showErrorMessage(language.text('message.invalidCardJson', { message: error.message }));
  }
}

function showValidationSummary(issues, language) {
  const errors = issues.filter(item => item.severity === 'error');
  const warnings = issues.filter(item => item.severity === 'warning');
  if (!issues.length) {
    vscode.window.showInformationMessage(language.text('validation.passed'));
    return;
  }

  if (errors.length) {
    const first = errors[0];
    vscode.window.showErrorMessage(language.text('validation.errorSummary', {
      errors: errors.length,
      warnings: warnings.length,
      path: first.path,
      message: language.validationMessage(first.message)
    }));
    return;
  }

  vscode.window.showWarningMessage(language.text('validation.warningSummary', {
    warnings: warnings.length,
    path: warnings[0].path,
    message: language.validationMessage(warnings[0].message)
  }));
}

async function openVisualEditor(arg, section = 0, editorProvider, language) {
  const uri = uriFromArg(arg, editorProvider);
  if (!uri) return vscode.window.showWarningMessage(language.text('message.selectFirst'));
  editorProvider.lastUri = uri;
  await vscode.commands.executeCommand('vscode.openWith', uri, CardEditorProvider.viewType);
  void section;
}

function activate(context) {
  const language = new CardLanguageService();
  const explorer = new CardExplorerProvider(language);
  const editorProvider = new CardEditorProvider(context, explorer, language);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('cardIde.explorer', explorer),
    vscode.window.registerCustomEditorProvider(CardEditorProvider.viewType, editorProvider, { supportsMultipleEditorsPerDocument: true }),
    vscode.commands.registerCommand('cardIde.createProject', () => createProject(explorer, language)),
    vscode.commands.registerCommand('cardIde.importJson', () => importJson(explorer, language)),
    vscode.commands.registerCommand('cardIde.exportJson', arg => exportJson(arg, editorProvider, language)),
    vscode.commands.registerCommand('cardIde.validate', arg => validateCurrent(arg, editorProvider, language)),
    vscode.commands.registerCommand('cardIde.refresh', () => explorer.refresh()),
    vscode.commands.registerCommand('cardIde.openVisualEditor', (arg, section) => openVisualEditor(arg, section, editorProvider, language)),
    vscode.commands.registerCommand('cardIde.openRaw', arg => {
      const uri = uriFromArg(arg, editorProvider);
      if (uri) return vscode.commands.executeCommand('vscode.openWith', uri, 'default');
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('cardIde.language')) return;
      explorer.refresh();
      void editorProvider.broadcastLocale();
    })
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.cardide.json');
  watcher.onDidCreate(() => explorer.refresh());
  watcher.onDidDelete(() => explorer.refresh());
  watcher.onDidChange(() => explorer.refresh());
  context.subscriptions.push(watcher);
}

function deactivate() {}

module.exports = { activate, deactivate };
