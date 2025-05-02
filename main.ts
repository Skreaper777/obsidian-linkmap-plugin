import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, FileSystemAdapter, normalizePath } from 'obsidian';
import { promises as fs } from 'fs';

/** Интерфейс настроек */
interface LinkMapSettings {
  rootPathFile: string;
  maxRootDepth: number;
  rootLimit: number;
  childLimit: number;
  only_unique_page: boolean;
  sizeLimitRows: number;
  nameMaxLength: number; // Максимальная длина для name-short
  temp: string;
}

/** Значения по умолчанию */
const DEFAULT_SETTINGS: LinkMapSettings = {
  rootPathFile: "Теги/Проекты/__Проекты.md",
  temp : "Теги/Личное/Позитив 👍🏻/Успехи/_Успехи 🏆 (Я достиг успеха) (main).md",
  maxRootDepth: 8,
  rootLimit: 0,
  childLimit: 0,
  only_unique_page: false,
  sizeLimitRows: 3000,
  nameMaxLength: 40,
};

type TreeNode = {
  name: string;                              // оригинальное имя с расширением
  'name-short': string;                     // имя без расширения, укороченное
  path: string;
  'number-of-children': number;
  'total-number-of-grandchildren': number;
  'total-number-of-children-and-grandchildren': number;
  children: TreeNode[];
};

export default class LinkMapPlugin extends Plugin {
  settings!: LinkMapSettings;

  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: 'generate-link-tree',
      name: 'Generate Link Tree JSON',
      callback: () => generateLinkTree(this.app, this.settings),
    });
    this.addSettingTab(new LinkMapSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class LinkMapSettingTab extends PluginSettingTab {
  plugin: LinkMapPlugin;
  constructor(app: App, plugin: LinkMapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Start file')
      .setDesc('Path to the root markdown file')
      .addText(text => text
        .setPlaceholder('Теги/__Теги.md')
        .setValue(this.plugin.settings.rootPathFile)
        .onChange(async v => { this.plugin.settings.rootPathFile = v; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl)
      .setName('Max root depth')
      .setDesc('0 = no limit')
      .addText(text => text
        .setValue(this.plugin.settings.maxRootDepth.toString())
        .onChange(async v => { this.plugin.settings.maxRootDepth = parseInt(v) || 0; await this.plugin.saveSettings(); }));
    // остальные поля...
  }
}

async function generateLinkTree(app: App, cfg: LinkMapSettings) {
  const { vault, metadataCache } = app;
  const depthLimit = cfg.maxRootDepth > 0 ? cfg.maxRootDepth : Infinity;
  let rowsCount = 0;
  const visited = new Set<string>();

  const startAbs = vault.getAbstractFileByPath(cfg.rootPathFile);
  if (!(startAbs instanceof TFile)) {
    new Notice('Стартовая заметка не найдена: ' + cfg.rootPathFile);
    return;
  }
  const start = startAbs;

  const backlinksMap = new Map<string, Set<string>>();
  function collect(file: TFile) {
    if (backlinksMap.has(file.path)) return;
    const meta = (metadataCache as any).getBacklinksForFile?.(file) as { data: Map<string, any>; unresolved: Map<string, any> };
    if (!meta?.data) return;
    const set = new Set<string>();
    meta.data.forEach((_, raw) => set.add(raw as string));
    meta.unresolved?.forEach((_, raw) => set.add(raw as string));
    backlinksMap.set(file.path, set);
  }
  collect(start);

  function buildNode(path: string, depth: number, ancestors: Set<string>): TreeNode | null {
    if (depth > depthLimit || ancestors.has(path)) return null;
    if (cfg.only_unique_page && visited.has(path)) return null;
    if (cfg.only_unique_page) visited.add(path);

    if (!backlinksMap.has(path)) {
      const abs = vault.getAbstractFileByPath(path);
      if (abs instanceof TFile && abs.extension === 'md') collect(abs);
    }

    const refs = backlinksMap.get(path) ?? new Set<string>();
    const maxWidth = depth === 0 && cfg.rootLimit > 0 ? cfg.rootLimit : cfg.childLimit > 0 ? cfg.childLimit : Infinity;
    const children: TreeNode[] = [];
    let processed = 0;

    for (const raw of refs) {
      if (processed >= maxWidth) break;
      if (raw === path || ancestors.has(raw)) continue;
      const child = buildNode(raw, depth + 1, new Set([...ancestors, path]));
      if (child) {
        children.push(child);
        processed++;
        if (cfg.sizeLimitRows > 0 && rowsCount / 1024 > cfg.sizeLimitRows) break;
      }
    }

    const numChildren = children.length;
    const totalGrandchildren = children.reduce((sum, c) => sum + c['number-of-children'], 0);
    const totalBoth = numChildren + totalGrandchildren;

    // Вычисляем name и name-short с учётом целостности слов и "..."
    const rawName = path.split('/').pop() || path;
    const nameNoExt = rawName.replace(/\.[^/.]+$/, '');
    let nameShort = nameNoExt;
    if (cfg.nameMaxLength > 0 && nameNoExt.length > cfg.nameMaxLength) {
      const after = nameNoExt.indexOf(' ', cfg.nameMaxLength);
      const cutIndex = after > 0 ? after : nameNoExt.length;
      nameShort = nameNoExt.slice(0, cutIndex) + '...';
    }

    rowsCount += JSON.stringify({}).length;
    return {
      name: rawName,
      'name-short': nameShort,
      path,
      'number-of-children': numChildren,
      'total-number-of-grandchildren': totalGrandchildren,
      'total-number-of-children-and-grandchildren': totalBoth,
      children,
    };
  }

  const rootNode = buildNode(start.path, 0, new Set())!;
  const json = JSON.stringify(rootNode, null, 2);
  let outputPath = 'links.json';
  const adapter = vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    const base = adapter.getBasePath();
    outputPath = normalizePath(`${base}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`);
    await fs.writeFile(outputPath, json);
  } else {
    await vault.adapter.write(outputPath, json);
  }

  new Notice(`links.json создан (${(json.length/1024).toFixed(1)} KB)` +
    (cfg.sizeLimitRows>0 && rowsCount/1024>cfg.sizeLimitRows ? ' — достигнут лимит' : ''));
}
