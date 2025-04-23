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
        // maxDepth=0 и rootLimit=0 означают отсутствие ограничений
        await buildLinkTree(this.app, "Теги", 0, 0);
        new Notice("Файл links.json обновлён 🚀");
      }
    });
  }

  onunload() {}
}

export async function buildLinkTree(
  app: App,
  rootFolder: string,
  maxDepth: number = 0,
  rootLimit: number = 0
) {
  const vault = app.vault;
  const cacheAny: any = app.metadataCache;

  // 0 => без ограничений
  const depthLimit = maxDepth > 0 ? maxDepth : Infinity;
  const limit = rootLimit > 0 ? rootLimit : Infinity;

  // Все markdown-файлы в корневой папке
  const markdownFiles: TFile[] = vault
    .getMarkdownFiles()
    .filter((f: TFile) => f.path.startsWith(rootFolder + "/"));

  // Карта: путь целевого файла -> Set путей источников
  const backlinksMap: Map<string, Set<string>> = new Map();

  // Собираем обратные ссылки через неофициальный метод getBacklinksForFile
  for (const file of markdownFiles) {
    const blMeta = cacheAny.getBacklinksForFile?.(file);
    if (!blMeta?.data) continue;

    // Разрешённые (зеленые) ссылки
    for (const srcRaw of blMeta.data.keys()) {
      const src = normalizePath((srcRaw as string).split("#")[0]);
      if (!backlinksMap.has(file.path)) backlinksMap.set(file.path, new Set());
      backlinksMap.get(file.path)!.add(src);
    }
    // Нерешённые (красные) ссылки
    for (const srcRaw of blMeta.unresolved?.keys() || []) {
      const src = normalizePath((srcRaw as string).split("#")[0]);
      if (!backlinksMap.has(file.path)) backlinksMap.set(file.path, new Set());
      backlinksMap.get(file.path)!.add(src);
    }
  }

  // Построение дерева ссылок
  const visited = new Set<string>();
  function buildNode(path: string, depth: number): TreeNode | null {
    if (visited.has(path) || depth > depthLimit) return null;
    visited.add(path);

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

  // Корневой узел
  const root: TreeNode = {
    name: rootFolder,
    value: 0,
    children: markdownFiles
      .slice(0, limit)
      .map((f: TFile) => buildNode(f.path, 1))
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