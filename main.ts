
/**
 * 📁 main.ts — Link Map Plugin (полностью переработан)
 *
 * Параметры:
 *  • rootPathFile            — полный путь к стартовой заметке (MD). Строим дерево ссылок от неё.
 *  • maxRootDepth            — максимальная глубина (0 = без лимита) относительно rootPathFile
 *  • rootLimit               — лимит количества ПЕРВЫХ дочерних узлов
 *  • childLimit              — лимит количества дочерних узлов на остальных уровнях (0 = без лимита)
 *  • only_unique_page        — если true, страница встречается лишь один раз
 *  • sizeLimitRows             — максимальный размер выходного файла (0 = без лимита).
 *                              При превышении дальнейшее расширение дерева прекращается, но JSON корректен.
 *  • nameMaxLength           — максимальная длина свойства name (0 = не обрезать)
 */

import {
  Plugin,
  Notice,
  normalizePath,
  FileSystemAdapter,
  App,
  TFile,
  PluginSettingTab,
  Setting,
} from "obsidian";
import { promises as fs } from "fs";

// ------------------------------ Types ---------------------------------

interface TreeNode {
  name: string;                      // Человекочитаемое имя заметки
  path: string;                      // Полный путь к файлу
  "number-of-children": number;      // прямые дети
  "total-number-of-children": number;// все потомки
  "total-number-of-children-and-grandchildren": number;// дети + внуки
  children?: TreeNode[];
}

interface LinkMapSettings {
  rootPathFile: string;
  maxRootDepth: number;
  rootLimit: number;
  childLimit: number;
  only_unique_page: boolean;
  sizeLimitRows: number;
  nameMaxLength: number;
}

// ------------------------------ Defaults ------------------------------
const DEFAULT_SETTINGS: LinkMapSettings = {
  rootPathFile: "Теги/_Теги (main).md",
  maxRootDepth: 6,
  rootLimit: 0,
  childLimit: 0,
  only_unique_page: false,
  sizeLimitRows: 300,
  nameMaxLength: 0,
};

// ------------------------------ Plugin --------------------------------
export default class LinkMapPlugin extends Plugin {
  settings: LinkMapSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "generate-linkmap",
      name: "Сгенерировать карту ссылок (links.json)",
      callback: async () => {
        await generateLinkTree(this.app, this.settings);
      },
    });

    this.addSettingTab(new LinkMapSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// -------------------------- Settings UI -------------------------------
class LinkMapSettingTab extends PluginSettingTab {
  plugin: LinkMapPlugin;
  constructor(app: App, plugin: LinkMapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Link Map — настройки" });

    const addText = (
      name: string,
      desc: string,
      key: keyof LinkMapSettings,
      placeholder = ""
    ) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) =>
          t
            .setPlaceholder(placeholder)
            .setValue(String(this.plugin.settings[key]))
            .onChange(async (v) => {
              // @ts-ignore
              this.plugin.settings[key] =
                key === "maxRootDepth" ||
                key === "rootLimit" ||
                key === "childLimit" ||
                key === "sizeLimitRows" ||
                key === "nameMaxLength"
                  ? Number(v) || 0
                  : v.trim();
              await this.plugin.saveSettings();
            })
        );

    addText(
      "Путь к стартовой заметке",
      "Пример: Теги/_Теги (main).md",
      "rootPathFile"
    );
    addText("Максимальная глубина", "0 = без ограничения", "maxRootDepth", "0");
    addText(
      "Лимит детей первого уровня",
      "0 = без ограничения",
      "rootLimit",
      "0"
    );
    addText(
      "Лимит детей на остальных уровнях",
      "0 = без ограничения",
      "childLimit",
      "0"
    );
    new Setting(containerEl)
      .setName("Уникальные страницы")
      .setDesc("Если включено — каждая страница встречается единожды")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.only_unique_page)
          .onChange(async (v) => {
            this.plugin.settings.only_unique_page = v;
            await this.plugin.saveSettings();
          })
      );
    addText(
      "Лимит строк файла",
      "0 = без ограничения",
      "sizeLimitRows",
      "0"
    );
    addText(
      "Максимальная длина «name»",
      "0 = не обрезать",
      "nameMaxLength",
      "0"
    );
  }
}

// ----------------------------- Logic ----------------------------------

export async function generateLinkTree(app: App, cfg: LinkMapSettings) {
  const { vault, metadataCache } = app;

  const normalize = (p: string) => normalizePath(p.split("#")[0]);
  const fileName = (path: string) =>
    path.substring(path.lastIndexOf("/") + 1, path.lastIndexOf(".")) || path;

  const depthLimit = cfg.maxRootDepth > 0 ? cfg.maxRootDepth : Infinity;
  const rootWidth = cfg.rootLimit > 0 ? cfg.rootLimit : Infinity;
  const childWidth = cfg.childLimit > 0 ? cfg.childLimit : Infinity;

  // ---------- Стартовая заметка ----------
  const start = vault.getAbstractFileByPath(cfg.rootPathFile);
  if (!(start instanceof TFile)) {
    new Notice("Стартовая заметка не найдена: " + cfg.rootPathFile);
    return;
  }

  // ---------- Map ----------
  const backlinksMap: Map<string, Set<string>> = new Map();
  const cacheAny: any = metadataCache;

  const collect = (file: TFile) => {
    if (backlinksMap.has(file.path)) return;
    const meta = cacheAny.getBacklinksForFile?.(file) as
      | { data: Map<string, any>; unresolved: Map<string, any> }
      | undefined;
    if (!meta?.data) return;
    const set = new Set<string>();
    meta.data.forEach((_, raw) => set.add(normalize(raw as string)));
    meta.unresolved?.forEach((_, raw) => set.add(normalize(raw as string)));
    backlinksMap.set(file.path, set);
  };

  collect(start);

  // ---------- Дедупликация ----------
  const visited = new Set<string>();

  // ---------- Контроль размера ----------
  let rowsCount = 0;
  const limitHit = () =>
    cfg.sizeLimitRows > 0 && rowsCount / 1024 > cfg.sizeLimitRows;

  function buildNode(
    path: string,
    depth: number,
    ancestors: Set<string>
  ): TreeNode | null {
    if (depth > depthLimit) return null;
    if (ancestors.has(path)) return null;
    if (cfg.only_unique_page && visited.has(path)) return null;
    if (cfg.only_unique_page) visited.add(path);

    // ensure map
    if (!backlinksMap.has(path)) {
      const abs = vault.getAbstractFileByPath(path);
      if (abs instanceof TFile && abs.extension === "md") collect(abs);
    }

    const direct = backlinksMap.get(path) ?? new Set<string>();
    const children: TreeNode[] = [];

    const width = depth === 0 ? rootWidth : childWidth;
    let processed = 0;

    for (const childPath of direct) {
      if (childPath === path || ancestors.has(childPath)) continue;
      if (processed >= width) break;
      const child = buildNode(childPath, depth + 1, new Set([...ancestors, path]));
      if (child) {
        children.push(child);
        processed++;
        if (limitHit()) break;
      }
    }

    const numChildren = children.length;
    const totalChildren =
      children.reduce(
        (sum, c) => sum + c["total-number-of-children"],
        0
      ) + numChildren;

    const makeName = () => {
      const full = fileName(path);
      if (cfg.nameMaxLength && cfg.nameMaxLength > 0 && full.length > cfg.nameMaxLength)
        return full.slice(0, cfg.nameMaxLength) + "…";
      return full;
    };

    const node: TreeNode = {
      name: makeName(),
      path,
      "number-of-children": numChildren,
      "total-number-of-children": totalChildren,
      "total-number-of-children-and-grandchildren": totalChildren + children.reduce((s,c)=>s + c["number-of-children"],0),
      children,
    };

    rowsCount += JSON.stringify(node, null, 2).split('\n').length;
    return node;
  }

  const rootNode = buildNode(start.path, 0, new Set()) as TreeNode;
  if (!rootNode) {
    new Notice("Не удалось построить дерево");
    return;
  }

  const json = JSON.stringify(rootNode, null, 2);

  let outputPath = "links.json";
  const adapter = vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    const base = adapter.getBasePath();
    outputPath = normalizePath(
      `${base}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`
    );
    await fs.writeFile(outputPath, json);
  } else {
    await vault.adapter.write(outputPath, json);
  }

  new Notice(
    `links.json создан (${(json.length / 1024).toFixed(1)} KB)${
      limitHit() ? " — достигнут лимит" : ""
    }`
  );
}
