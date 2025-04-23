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
  const markdownFiles = app.vault
    .getMarkdownFiles()
    .filter((f: TFile) => f.path.startsWith(rootFolder + "/"));

  const backlinksMap: Map<string, Set<string>> = new Map();

  // Используем неофициальный метод getBacklinksForFile, обойдя проверку типов через any
  for (const file of markdownFiles) {
    // метод getBacklinksForFile отсутствует в типах, но доступен во время выполнения
    const cache: any = app.metadataCache;
    const backlinksRaw: any = cache.getBacklinksForFile(file);
    if (!backlinksRaw) continue;
    // backlinksRaw — Map-подобный объект с методами keys() и get()
    for (const src of backlinksRaw.keys()) {
      const normalizedSrc = normalizePath(src as string);
      if (!backlinksMap.has(file.path)) backlinksMap.set(file.path, new Set());
      backlinksMap.get(file.path)!.add(normalizedSrc);
    }
  }

  const visited = new Set<string>();

  function buildNode(path: string, depth: number): TreeNode | null {
    if (visited.has(path) || depth > maxDepth) return null;
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

  const root: TreeNode = {
    name: rootFolder,
    value: 0,
    children: markdownFiles
      .slice(0, rootLimit)
      .map((f: TFile) => buildNode(f.path, 1))
      .filter((n): n is TreeNode => Boolean(n))
  };

  let outputPath = "links.json";
  const adapter = app.vault.adapter;

  if (adapter instanceof FileSystemAdapter) {
    const basePath = adapter.getBasePath();
    outputPath = normalizePath(
      `${basePath}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`
    );
    await fs.writeFile(outputPath, JSON.stringify(root, null, 2));
  } else {
    await app.vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
  }
}