// 📁 main.ts — основной файл плагина
import { Plugin, Notice, normalizePath, FileSystemAdapter, App, TFile } from "obsidian";
import { promises as fs } from "fs";

interface TreeNode {
  name: string;
  value: number;
  children?: TreeNode[];
}

export default class LinkMapPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "generate-link-tree",
      name: "Сгенерировать карту ссылок (links.json)",
      callback: async () => {
        // Последний параметр dedupe: true — исключаем дубли, false — отключаем проверку повторов
        await buildLinkTree(this.app, "Теги", 0, 0, true);
        new Notice("Файл links.json обновлён 🚀");
      }
    });
  }

  onunload() {}
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
  maxDepth: number = 0,
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
    // Обрезаем по глубине
    if (depth > depthLimit) return null;
    // Проверка дублирования
    if (dedupe) {
      if (visited.has(path)) return null;
      visited.add(path);
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
      .map(f => buildNode(f.path, 1))
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
