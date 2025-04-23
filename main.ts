// 📁 main.ts — основной файл плагина
import { Plugin, Notice } from "obsidian";
import { buildLinkTree } from "./treeBuilder";

export default class LinkMapPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "generate-link-tree",
      name: "Сгенерировать карту ссылок (links.json)",
      callback: async () => {
        await buildLinkTree(this.app, "Теги"); // ограничение по корневой папке
        new Notice("Файл links.json обновлён 🚀");
      }
    });
  }

  onunload() {
    // Освобождение ресурсов при отключении плагина
  }
}
