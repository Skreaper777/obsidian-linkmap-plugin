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
const DEFAULT_SETTINGS = {
    rootFolder: "Теги",
    maxDepth: 3,
    rootLimit: 10,
    dedupe: false
};
class LinkMapPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.addCommand({
                id: "generate-link-tree",
                name: "Сгенерировать карту ссылок (links.json)",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield buildLinkTree(this.app, this.settings.rootFolder, this.settings.maxDepth, this.settings.rootLimit, this.settings.dedupe);
                    new obsidian_1.Notice(`links.json обновлён ✔️ depth=${this.settings.maxDepth}, rootLimit=${this.settings.rootLimit}, dedupe=${this.settings.dedupe}`);
                })
            });
            this.addCommand({
                id: "generate-link-tree-debug",
                name: "Сгенерировать карту ссылок (debug: dedupe=false)",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    // Передаём те же настройки, но отключаем dedupe для проверки
                    yield buildLinkTree(this.app, this.settings.rootFolder, this.settings.maxDepth, this.settings.rootLimit, false);
                    new obsidian_1.Notice(`Debug links.json готов: depth=${this.settings.maxDepth}, rootLimit=${this.settings.rootLimit}, dedupe=false`);
                })
            });
            this.addSettingTab(new LinkMapSettingTab(this.app, this));
        });
    }
    onunload() { }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
}
exports.default = LinkMapPlugin;
class LinkMapSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Настройки Link Map" });
        new obsidian_1.Setting(containerEl)
            .setName("Корневая папка")
            .setDesc("С какой папки начинать построение дерева")
            .addText(text => text
            .setPlaceholder("Теги")
            .setValue(this.plugin.settings.rootFolder)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.rootFolder = value.trim() || "Теги";
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Максимальная глубина")
            .setDesc("0 = без ограничения")
            .addText(text => text
            .setPlaceholder("0")
            .setValue(String(this.plugin.settings.maxDepth))
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const num = Number(value) || 0;
            this.plugin.settings.maxDepth = num;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Лимит корневых элементов")
            .setDesc("0 = без ограничения")
            .addText(text => text
            .setPlaceholder("0")
            .setValue(String(this.plugin.settings.rootLimit))
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const num = Number(value) || 0;
            this.plugin.settings.rootLimit = num;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Убирать дубликаты")
            .setDesc("Если отключить, страницы могут встречаться несколько раз")
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.dedupe)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.dedupe = value;
            yield this.plugin.saveSettings();
        })));
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
function buildLinkTree(app_1, rootFolder_1) {
    return __awaiter(this, arguments, void 0, function* (app, rootFolder, maxDepth = 7, rootLimit = 0, dedupe = false) {
        var _a, _b;
        const vault = app.vault;
        const cacheAny = app.metadataCache;
        // 0 означает отсутствие ограничений
        const depthLimit = maxDepth > 0 ? maxDepth : Infinity;
        const limit = rootLimit > 0 ? rootLimit : Infinity;
        // Список markdown-файлов
        const markdownFiles = vault
            .getMarkdownFiles()
            .filter((f) => f.path.startsWith(rootFolder + "/"));
        // Map<destPath, Set<srcPath>>
        const backlinksMap = new Map();
        // Собираем все обратные ссылки через неофициальный метод getBacklinksForFile
        for (const file of markdownFiles) {
            const blMeta = (_a = cacheAny.getBacklinksForFile) === null || _a === void 0 ? void 0 : _a.call(cacheAny, file);
            if (!(blMeta === null || blMeta === void 0 ? void 0 : blMeta.data))
                continue;
            // "Зелёные" ссылки — resolved
            for (const srcRaw of blMeta.data.keys()) {
                const src = (0, obsidian_1.normalizePath)(srcRaw.split("#")[0]);
                if (!backlinksMap.has(file.path))
                    backlinksMap.set(file.path, new Set());
                backlinksMap.get(file.path).add(src);
            }
            // "Красные" нерешённые ссылки
            for (const srcRaw of ((_b = blMeta.unresolved) === null || _b === void 0 ? void 0 : _b.keys()) || []) {
                const src = (0, obsidian_1.normalizePath)(srcRaw.split("#")[0]);
                if (!backlinksMap.has(file.path))
                    backlinksMap.set(file.path, new Set());
                backlinksMap.get(file.path).add(src);
            }
        }
        // Построение дерева
        const visited = new Set();
        function buildNode(path, depth) {
            var _a, _b;
            // Ограничение по глубине
            if (depth > depthLimit)
                return null;
            // Убираем дубликаты, если включено
            if (dedupe) {
                if (visited.has(path))
                    return null;
                visited.add(path);
            }
            // ✨ Лениво достраиваем карту, если этот файл не анализировался ранее
            if (!backlinksMap.has(path)) {
                const maybeFile = vault.getAbstractFileByPath(path);
                if (maybeFile instanceof obsidian_1.TFile && maybeFile.extension === "md") {
                    const blMeta = (_a = cacheAny.getBacklinksForFile) === null || _a === void 0 ? void 0 : _a.call(cacheAny, maybeFile);
                    if (blMeta === null || blMeta === void 0 ? void 0 : blMeta.data) {
                        const set = new Set();
                        for (const [srcRaw] of blMeta.data) {
                            const src = (0, obsidian_1.normalizePath)(srcRaw.split("#")[0]);
                            set.add(src);
                        }
                        // Можно добавить и нерешённые ссылки, если нужно
                        for (const [srcRaw] of (_b = blMeta.unresolved) !== null && _b !== void 0 ? _b : []) {
                            const src = (0, obsidian_1.normalizePath)(srcRaw.split("#")[0]);
                            set.add(src);
                        }
                        if (set.size)
                            backlinksMap.set(path, set);
                    }
                }
            }
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
        // Формируем корневой узел
        const root = {
            name: rootFolder,
            value: 0,
            children: markdownFiles
                .slice(0, limit)
                .map(f => buildNode(f.path, 0))
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
