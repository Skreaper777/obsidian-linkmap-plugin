"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLinkTree = buildLinkTree;
// 📁 main.ts — основной файл плагина
const obsidian_1 = require("obsidian");
const fs_1 = require("fs");
class LinkMapPlugin extends obsidian_1.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.addCommand({
                id: "generate-link-tree",
                name: "Сгенерировать карту ссылок (links.json)",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    // Не передаём параметры — по умолчанию maxDepth=0 и rootLimit=0 => без ограничений
                    yield buildLinkTree(this.app, "Теги");
                    new obsidian_1.Notice("Файл links.json обновлён 🚀");
                })
            });
        });
    }
    onunload() { }
}
exports.default = LinkMapPlugin;
function buildLinkTree(app_1, rootFolder_1) {
    return __awaiter(this, arguments, void 0, function* (app, rootFolder, maxDepth = 0, rootLimit = 0) {
        var _a;
        const vault = app.vault;
        const cache = app.metadataCache;
        // 0 означает отсутствие ограничений
        const depthLimit = maxDepth > 0 ? maxDepth : Infinity;
        const limit = rootLimit > 0 ? rootLimit : Infinity;
        const markdownFiles = vault
            .getMarkdownFiles()
            .filter((f) => f.path.startsWith(rootFolder + "/"));
        // Карта обратных ссылок
        const backlinksMap = new Map();
        const cacheAny = cache;
        // Собираем обратные ссылки через неофициальный getBacklinksForFile
        for (const file of markdownFiles) {
            const rawBacklinks = (_a = cacheAny.getBacklinksForFile) === null || _a === void 0 ? void 0 : _a.call(cacheAny, file);
            if (!rawBacklinks)
                continue;
            for (const srcRaw of rawBacklinks.keys()) {
                const src = (0, obsidian_1.normalizePath)(srcRaw);
                if (!backlinksMap.has(file.path))
                    backlinksMap.set(file.path, new Set());
                backlinksMap.get(file.path).add(src);
            }
        }
        const visited = new Set();
        function buildNode(path, depth) {
            if (visited.has(path) || depth > depthLimit)
                return null;
            visited.add(path);
            const children = [];
            const sources = backlinksMap.get(path);
            if (sources) {
                for (const src of sources) {
                    const node = buildNode(src, depth + 1);
                    if (node)
                        children.push(node);
                }
            }
            return { name: path, value: 0, children };
        }
        const root = {
            name: rootFolder,
            value: 0,
            children: markdownFiles
                .slice(0, limit)
                .map(f => buildNode(f.path, 1))
                .filter((n) => Boolean(n))
        };
        let outputPath = "links.json";
        const adapter = vault.adapter;
        if (adapter instanceof obsidian_1.FileSystemAdapter) {
            const base = adapter.getBasePath();
            outputPath = (0, obsidian_1.normalizePath)(`${base}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`);
            yield fs_1.promises.writeFile(outputPath, JSON.stringify(root, null, 2));
        }
        else {
            yield vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
        }
    });
}
