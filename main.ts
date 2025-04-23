// 📁 main.ts — основной файл плагина
import { Plugin, Notice, normalizePath, FileSystemAdapter, App, TFile, CachedMetadata } from "obsidian";
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
        await buildLinkTree(this.app, "Теги", 7, 20);
        new Notice("Файл links.json обновлён 🚀");
      }
    });
  }

  onunload() {}
}

export async function buildLinkTree(
  app: App,
  rootFolder: string,
  maxDepth: number = 7,
  rootLimit: number = 20
) {
  const vault = app.vault;
  const cache = app.metadataCache;

  // Все markdown-файлы в папке rootFolder
  const markdownFiles: TFile[] = vault
    .getMarkdownFiles()
    .filter((f: TFile) => f.path.startsWith(rootFolder + "/"));

  // Карта: destPath -> Set<sourcePath>
  const backlinksMap: Map<string, Set<string>> = new Map();

  for (const file of markdownFiles) {
    const sourcePath = file.path;
    // 1) Разрешённые ссылки (wiki и markdown) через resolvedLinks
    const resolved = (cache.resolvedLinks as Record<string, Record<string, number>>)[sourcePath] || {};
    for (const linkPath in resolved) {
      const dest = cache.getFirstLinkpathDest(linkPath, sourcePath);
      if (!dest) continue;
      const destPath = normalizePath(dest.path);
      if (!backlinksMap.has(destPath)) backlinksMap.set(destPath, new Set());
      backlinksMap.get(destPath)!.add(sourcePath);
    }

    // 2) Сырые ссылки из метаданных (например блок-референсы)
    const fileCache: CachedMetadata | null = cache.getFileCache(file);
    const rawLinks = fileCache?.links || [];
    for (const link of rawLinks) {
      const rawPath = link.link.split("#")[0];
      const dest = cache.getFirstLinkpathDest(rawPath, sourcePath);
      if (!dest) continue;
      const destPath = normalizePath(dest.path);
      if (!backlinksMap.has(destPath)) backlinksMap.set(destPath, new Set());
      backlinksMap.get(destPath)!.add(sourcePath);
    }
  }

  const visited = new Set<string>();
  function buildNode(path: string, depth: number): TreeNode | null {
    if (visited.has(path) || depth > maxDepth) return null;
    visited.add(path);

    const children: TreeNode[] = [];
    const sources = backlinksMap.get(path);
    if (sources) {
      for (const src of sources) {
        const child = buildNode(src, depth + 1);
        if (child) children.push(child);
      }
    }
    return { name: path, value: 0, children };
  }

  // Строим корень
  const root: TreeNode = {
    name: rootFolder,
    value: 0,
    children: markdownFiles
      .slice(0, rootLimit)
      .map(f => buildNode(f.path, 1))
      .filter((n): n is TreeNode => Boolean(n))
  };

  // Путь вывода
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
