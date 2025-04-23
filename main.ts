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
        // Не передаём параметры — по умолчанию maxDepth=0 и rootLimit=0 => без ограничений
        await buildLinkTree(this.app, "Теги");
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
  const cache = app.metadataCache;

  // 0 означает отсутствие ограничений
  const depthLimit = maxDepth > 0 ? maxDepth : Infinity;
  const limit = rootLimit > 0 ? rootLimit : Infinity;

  const markdownFiles: TFile[] = vault
    .getMarkdownFiles()
    .filter((f: TFile) => f.path.startsWith(rootFolder + "/"));

  // Карта обратных ссылок
  const backlinksMap: Map<string, Set<string>> = new Map();
  const cacheAny: any = cache;

  // Собираем обратные ссылки через неофициальный getBacklinksForFile
  for (const file of markdownFiles) {
    const rawBacklinks: Map<string, any> | undefined = cacheAny.getBacklinksForFile?.(file);
    if (!rawBacklinks) continue;
    for (const srcRaw of rawBacklinks.keys()) {
      const src = normalizePath(srcRaw as string);
      if (!backlinksMap.has(file.path)) backlinksMap.set(file.path, new Set());
      backlinksMap.get(file.path)!.add(src);
    }
  }

  const visited = new Set<string>();
  function buildNode(path: string, depth: number): TreeNode | null {
    if (visited.has(path) || depth > depthLimit) return null;
    visited.add(path);
    const children: TreeNode[] = [];
    const sources = backlinksMap.get(path);
    if (sources) {
      for (const src of sources) {
        const node = buildNode(src, depth + 1);
        if (node) children.push(node);
      }
    }
    return { name: path, value: 0, children };
  }

  const root: TreeNode = {
    name: rootFolder,
    value: 0,
    children: markdownFiles
      .slice(0, limit)
      .map(f => buildNode(f.path, 1))
      .filter((n): n is TreeNode => Boolean(n))
  };

  let outputPath = "links.json";
  const adapter = vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    const base = adapter.getBasePath();
    outputPath = normalizePath(
      `${base}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`
    );
    await fs.writeFile(outputPath, JSON.stringify(root, null, 2));
  } else {
    await vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
  }
}
