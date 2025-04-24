
// 📁 main.ts — плагин Link Map (полностью обновлённый)
//
// 🛈 Особенности:
//   • depth ограничивается параметром maxDepth (относительно rootFolder)
//   • rootLimit ограничивает количество ПЕРВЫХ дочерних элементов rootFolder
//   • dedupe — исключать повторное появление заметки
//   • sizeLimitKB — не создавать links.json, если итоговый размер превышает лимит
//
//   value  = количество прямых дочерних ссылок
//   total  = количество ВСЕХ потомков (рекурсивно)
//
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

interface TreeNode {
  name: string;
  value: number;           // прямые дети
  total: number;           // все потомки
  children?: TreeNode[];
}

// ---------------------- Настройки ----------------------
interface LinkMapSettings {
  rootFolder: string;
  maxDepth: number;     // 0 = без лимита
  rootLimit: number;    // лимит прямых детей rootFolder (0 = без лимита)
  dedupe: boolean;      // убирать дубли
  sizeLimitKB: number;  // максимальный размер links.json (0 = без лимита)
}

const DEFAULT_SETTINGS: LinkMapSettings = {
  rootFolder: "Теги",
  maxDepth: 5,
  rootLimit: 5,
  dedupe: false,
  sizeLimitKB: 0,
};

// ---------------------- Плагин ----------------------
export default class LinkMapPlugin extends Plugin {
  settings: LinkMapSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // Основная команда
    this.addCommand({
      id: "generate-link-tree",
      name: "Сгенерировать карту ссылок (links.json)",
      callback: async () => {
        await generateLinkTree(
          this.app,
          this.settings,
        );
      },
    });

    // Debug‑команда (dedupe=false)
    this.addCommand({
      id: "generate-link-tree-debug",
      name: "Сгенерировать карту ссылок (debug: dedupe=false)",
      callback: async () => {
        const dbg = { ...this.settings, dedupe: false };
        await generateLinkTree(this.app, dbg);
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

// ---------------------- UI настроек ----------------------
class LinkMapSettingTab extends PluginSettingTab {
  plugin: LinkMapPlugin;
  constructor(app: App, plugin: LinkMapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Настройки Link Map" });

    new Setting(containerEl)
      .setName("Корневая папка")
      .setDesc("С какой папки начинать построение дерева")
      .addText((text) =>
        text
          .setPlaceholder("Теги")
          .setValue(this.plugin.settings.rootFolder)
          .onChange(async (v) => {
            this.plugin.settings.rootFolder = v.trim() || "Теги";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Максимальная глубина")
      .setDesc("0 = без ограничения (считается от rootFolder)")
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.maxDepth))
          .onChange(async (v) => {
            this.plugin.settings.maxDepth = Number(v) || 0;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Лимит корневых элементов")
      .setDesc("0 = без ограничения")
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.rootLimit))
          .onChange(async (v) => {
            this.plugin.settings.rootLimit = Number(v) || 0;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Дедупликация")
      .setDesc("Если включено – заметка появляется только один раз")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.dedupe)
          .onChange(async (v) => {
            this.plugin.settings.dedupe = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Лимит размера файла (KB)")
      .setDesc("0 = без ограничения")
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.sizeLimitKB))
          .onChange(async (v) => {
            this.plugin.settings.sizeLimitKB = Number(v) || 0;
            await this.plugin.saveSettings();
          })
      );
  }
}

// ---------------------- Логика ----------------------

// Асинхронно строит дерево и записывает links.json
export async function generateLinkTree(app: App, cfg: LinkMapSettings) {
  const { vault, metadataCache } = app;
  const depthLimit = cfg.maxDepth > 0 ? cfg.maxDepth : Infinity;
  const rootWidth = cfg.rootLimit > 0 ? cfg.rootLimit : Infinity;
  const dedupe = cfg.dedupe;

  // Собираем все markdown в нужной папке
  const markdownFiles: TFile[] = vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(cfg.rootFolder + "/"))
    .slice(0, rootWidth);

  // Карта обратных ссылок path -> Set<srcPath>
  const backlinksMap: Map<string, Set<string>> = new Map();
  const cacheAny: any = metadataCache;

  const normalize = (p: string) => normalizePath(p.split("#")[0]);

  for (const file of markdownFiles) {
    let set: Set<string> | undefined;
    const meta = cacheAny.getBacklinksForFile?.(file) as
      | { data: Map<string, any>; unresolved: Map<string, any> }
      | undefined;
    if (!meta?.data) continue;

    const collect = (raw: string) => {
      const src = normalize(raw);
      set = backlinksMap.get(file.path);
if (!set) {
  set = new Set<string>();
  backlinksMap.set(file.path, set);
}
set.add(src);
    };

    meta.data.forEach((_, raw) => collect(raw as string));
    meta.unresolved?.forEach((_, raw) => collect(raw as string));
  }

  // Глобальный набор «уже добавлено», если dedupe включён

  let currentSize = 0;
const visited = new Set<string>();

  function buildNode(
    path: string,
    depth: number,
    ancestors: Set<string>
  ): TreeNode | null {
    if (depthLimit !== Infinity && depth > depthLimit) return null;
currentSize += path.length + 32; // приблизительная длина
if (cfg.sizeLimitKB > 0 && currentSize / 1024 > cfg.sizeLimitKB) return null;

    // запрещаем self‑loop и ссылки на любого предка
    if (ancestors.has(path)) return null;

    if (dedupe) {
      if (visited.has(path)) return null;
      visited.add(path);
    }

    // ленивое пополнение карты, если path ещё не собран
    if (!backlinksMap.has(path)) {
      const abs = vault.getAbstractFileByPath(path);
      if (abs instanceof TFile && abs.extension === "md") {
        const meta = cacheAny.getBacklinksForFile?.(abs) as
          | { data: Map<string, any>; unresolved: Map<string, any> }
          | undefined;
        if (meta?.data) {
          const set = new Set<string>();
          meta.data.forEach((_, raw) => set.add(normalize(raw as string)));
          meta.unresolved?.forEach((_, raw) =>
            set.add(normalize(raw as string))
          );
          if (set.size) backlinksMap.set(path, set);
        }
      }
    }

    const children: TreeNode[] = [];
    const direct = backlinksMap.get(path);

    if (direct) {
      for (const childPath of direct) {
        // Пропускаем self‑link и ссылки на любого предка
        if (childPath === path || ancestors.has(childPath)) continue;

        const child = buildNode(
          childPath,
          depth + 1,
          new Set([...ancestors, path])
        );
        if (child) children.push(child);
      }
    }

    // value – прямые дети, total – все потомки
    const totalDesc =
      children.reduce((sum, c) => sum + c.total, 0) + children.length;

    return {
      name: path,
      value: children.length,
      total: totalDesc,
      children,
    };
  }

  // rootFolder как отдельный узел
  const root: TreeNode = {
    name: cfg.rootFolder,
    value: 0,
    total: 0,
    children: markdownFiles
      .map((f) => buildNode(f.path, 1, new Set()))
      .filter((n): n is TreeNode => Boolean(n)),
  };
  root.total =
    (root.children?.reduce((sum, c) => sum + c.total, 0) || 0) +
    (root.children?.length || 0);

  // Пишем в файл
  const json = JSON.stringify(root, null, 2);
  const sizeKB = json.length / 1024;

  if (cfg.sizeLimitKB > 0 && sizeKB > cfg.sizeLimitKB) {
    new Notice(
      `Отмена: links.json (${sizeKB.toFixed(
        1
      )} KB) превышает лимит ${cfg.sizeLimitKB} KB`
    );
    return;
  }

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
    `links.json готов ✔️ depth=${cfg.maxDepth}, rootLimit=${cfg.rootLimit}, dedupe=${cfg.dedupe}`
  );
}
