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
                    // maxDepth=0 и rootLimit=0 означают отсутствие ограничений
                    yield buildLinkTree(this.app, "Теги", 0, 0);
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
        var _a, _b;
        const vault = app.vault;
        const cacheAny = app.metadataCache;
        // 0 => без ограничений
        const depthLimit = maxDepth > 0 ? maxDepth : Infinity;
        const limit = rootLimit > 0 ? rootLimit : Infinity;
        // Все markdown-файлы в корневой папке
        const markdownFiles = vault
            .getMarkdownFiles()
            .filter((f) => f.path.startsWith(rootFolder + "/"));
        // Карта: путь целевого файла -> Set путей источников
        const backlinksMap = new Map();
        // Собираем обратные ссылки через неофициальный метод getBacklinksForFile
        for (const file of markdownFiles) {
            const blMeta = (_a = cacheAny.getBacklinksForFile) === null || _a === void 0 ? void 0 : _a.call(cacheAny, file);
            if (!(blMeta === null || blMeta === void 0 ? void 0 : blMeta.data))
                continue;
            // Разрешённые (зеленые) ссылки
            for (const srcRaw of blMeta.data.keys()) {
                const src = (0, obsidian_1.normalizePath)(srcRaw.split("#")[0]);
                if (!backlinksMap.has(file.path))
                    backlinksMap.set(file.path, new Set());
                backlinksMap.get(file.path).add(src);
            }
            // Нерешённые (красные) ссылки
            for (const srcRaw of ((_b = blMeta.unresolved) === null || _b === void 0 ? void 0 : _b.keys()) || []) {
                const src = (0, obsidian_1.normalizePath)(srcRaw.split("#")[0]);
                if (!backlinksMap.has(file.path))
                    backlinksMap.set(file.path, new Set());
                backlinksMap.get(file.path).add(src);
            }
        }
        // Построение дерева ссылок
        const visited = new Set();
        function buildNode(path, depth) {
            if (visited.has(path) || depth > depthLimit)
                return null;
            visited.add(path);
            const children = [];
            const sources = backlinksMap.get(path);
            if (sources) {
                for (const srcPath of sources) {
                    const child = buildNode(srcPath, depth + 1);
                    if (child)
                        children.push(child);
                }
            }
            return { name: path, value: 0, children };
        }
        // Корневой узел
        const root = {
            name: rootFolder,
            value: 0,
            children: markdownFiles
                .slice(0, limit)
                .map((f) => buildNode(f.path, 1))
                .filter((n) => Boolean(n))
        };
        // Запись в файл
        let outputPath = "links.json";
        const adapter = vault.adapter;
        if (adapter instanceof obsidian_1.FileSystemAdapter) {
            const basePath = adapter.getBasePath();
            outputPath = (0, obsidian_1.normalizePath)(`${basePath}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`);
            yield fs_1.promises.writeFile(outputPath, JSON.stringify(root, null, 2));
        }
        else {
            yield vault.adapter.write(outputPath, JSON.stringify(root, null, 2));
        }
    });
}
