// 📁 main.ts — основной файл плагина
import { Plugin, Notice, normalizePath, FileSystemAdapter, App, TFile, PluginSettingTab, Setting } from "obsidian";
import { promises as fs } from "fs";

interface TreeNode {
  name: string;
  value: number;
  children?: TreeNode[];
}

interface LinkMapSettings {
  rootFolder: string;
  maxDepth: number;
  rootLimit: number;
  dedupe: boolean;
}

const DEFAULT_SETTINGS: LinkMapSettings = {
  rootFolder: "Теги",
  maxDepth: 5,
  rootLimit: 0,
  dedupe: false
};



export default class LinkMapPlugin extends Plugin {
  settings: LinkMapSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();


this.addCommand({
      id: "generate-link-tree",
      name: "Сгенерировать карту ссылок (links.json)",
      callback: async () => {
        await buildLinkTree(
          this.app,
          this.settings.rootFolder,
          this.settings.maxDepth,
          this.settings.rootLimit,
          this.settings.dedupe
        );
        new Notice(`links.json обновлён ✔️ depth=${this.settings.maxDepth}, rootLimit=${this.settings.rootLimit}, dedupe=${this.settings.dedupe}`);
      }
    });



this.addCommand({
  id: "generate-link-tree-debug",
  name: "Сгенерировать карту ссылок (debug: dedupe=false)",
  callback: async () => {
    // Передаём те же настройки, но отключаем dedupe для проверки
    await buildLinkTree(
      this.app,
      this.settings.rootFolder,
      this.settings.maxDepth,
      this.settings.rootLimit,
      false
    );
    new Notice(`Debug links.json готов: depth=${this.settings.maxDepth}, rootLimit=${this.settings.rootLimit}, dedupe=false`);
  }
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
      .addText(text =>
        text
          .setPlaceholder("Теги")
          .setValue(this.plugin.settings.rootFolder)
          .onChange(async value => {
            this.plugin.settings.rootFolder = value.trim() || "Теги";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Максимальная глубина")
      .setDesc("0 = без ограничения")
      .addText(text =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.maxDepth))
          .onChange(async value => {
            const num = Number(value) || 0;
            this.plugin.settings.maxDepth = num;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Лимит корневых элементов")
      .setDesc("0 = без ограничения")
      .addText(text =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.rootLimit))
          .onChange(async value => {
            const num = Number(value) || 0;
            this.plugin.settings.rootLimit = num;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Убирать дубликаты")
      .setDesc("Если отключить, страницы могут встречаться несколько раз")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.dedupe)
          .onChange(async value => {
            this.plugin.settings.dedupe = value;
            await this.plugin.saveSettings();
          })
      );
  }
}


/**
 * Строит дерево обратных ссылок для папки rootFolder.
 * @param app Объект плагина Obsidian
 * @param rootFolder Корневая папка для сканирования
 * @param maxDepth Максимальная глубина (0 = без ограничений)
 * @param rootLimit Лимит элементов первого уровня (0 = без ограничений)
 * @param dedupe Флаг включения уникальности узлов (true = не повторять, false = разрешать повторы)
 */
export async function buildLinkTree(
  app: App,
  rootFolder: string,
  maxDepth: number = 7,
  rootLimit: number = 0,
  dedupe: boolean = false
) {
  const vault = app.vault;
  const cacheAny: any = app.metadataCache;

  // 0 означает отсутствие ограничений
  const depthLimit = maxDepth > 0 ? maxDepth : Infinity;
  const limit = rootLimit > 0 ? rootLimit : Infinity;

  // Список markdown-файлов
  const markdownFiles: TFile[] = vault
    .getMarkdownFiles()
    .filter((f: TFile) => f.path.startsWith(rootFolder + "/"));

  // Map<destPath, Set<srcPath>>
  const backlinksMap: Map<string, Set<string>> = new Map();

  // Собираем все обратные ссылки через неофициальный метод getBacklinksForFile
  for (const file of markdownFiles) {
    const blMeta = cacheAny.getBacklinksForFile?.(file);
    if (!blMeta?.data) continue;

    // "Зелёные" ссылки — resolved
    for (const srcRaw of blMeta.data.keys()) {
      const src = normalizePath((srcRaw as string).split("#")[0]);
      if (!backlinksMap.has(file.path)) backlinksMap.set(file.path, new Set());
      backlinksMap.get(file.path)!.add(src);
    }
    // "Красные" нерешённые ссылки
    for (const srcRaw of blMeta.unresolved?.keys() || []) {
      const src = normalizePath((srcRaw as string).split("#")[0]);
      if (!backlinksMap.has(file.path)) backlinksMap.set(file.path, new Set());
      backlinksMap.get(file.path)!.add(src);
    }
  }

  // Построение дерева
  const visited = new Set<string>();
  function buildNode(path: string, depth: number): TreeNode | null {
    // Ограничение по глубине
    if (depth > depthLimit) return null;

    // Убираем дубликаты, если включено
    if (dedupe) {
      if (visited.has(path)) return null;
      visited.add(path);
    }

    // ✨ Лениво достраиваем карту, если этот файл не анализировался ранее
    if (!backlinksMap.has(path)) {
      const maybeFile = vault.getAbstractFileByPath(path);
      if (maybeFile instanceof TFile && maybeFile.extension === "md") {
        const blMeta: { data: Map<string, any>; unresolved: Map<string, any> } | undefined =
          cacheAny.getBacklinksForFile?.(maybeFile);
        if (blMeta?.data) {
          const set = new Set<string>();
          for (const [srcRaw] of blMeta.data) {
            const src = normalizePath((srcRaw as string).split("#")[0]);
            set.add(src);
          }
          // Можно добавить и нерешённые ссылки, если нужно
          for (const [srcRaw] of blMeta.unresolved ?? []) {
            const src = normalizePath((srcRaw as string).split("#")[0]);
            set.add(src);
          }
          if (set.size) backlinksMap.set(path, set);
        }
      }
    }

    const children: TreeNode[] = [];
    const sources = backlinksMap.get(path);
    if (sources) {
      for (const srcPath of sources) {
        const child = buildNode(srcPath, depth + 1);
        if (child) children.push(child);
      }
    }

    return { name: path, value: 0, children };
  }


  // Формируем корневой узел
  const root: TreeNode = {
    name: rootFolder,
    value: 0,
    children: markdownFiles
      .slice(0, limit)
      .map(f => buildNode(f.path, 0))
      .filter((n): n is TreeNode => Boolean(n))
  };

  // Запись в файл
  let outputPath = "links.json";
  const adapter = vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    const basePath = adapter.getBasePath();
    outputPath = normalizePath(
      `${basePath}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`
    );
    await fs.writeFile(outputPath, JSON.stringify(root, null, 2));
  } else {
    await vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
  }
}
