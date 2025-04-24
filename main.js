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
exports.generateLinkTree = generateLinkTree;
// 📁 main.ts — плагин Link Map (полностью обновлённый)
//
// 🛈 Особенности:
//   • depth ограничивается параметром maxDepth (относительно rootFolder)
//   • rootLimit ограничивает количество ПЕРВЫХ дочерних элементов rootFolder
//   • dedupe — исключать повторное появление заметки
//   • sizeLimitKB — не создавать links.json, если итоговый размер превышает лимит
//
//   value  = количество прямых дочерних ссылок
//   total  = количество ВСЕХ потомков (рекурсивно)
//
const obsidian_1 = require("obsidian");
const fs_1 = require("fs");
const DEFAULT_SETTINGS = {
    rootFolder: "Теги",
    maxDepth: 5,
    rootLimit: 30,
    dedupe: false,
    sizeLimitKB: 0,
};
// ---------------------- Плагин ----------------------
class LinkMapPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            // Основная команда
            this.addCommand({
                id: "generate-link-tree",
                name: "Сгенерировать карту ссылок (links.json)",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield generateLinkTree(this.app, this.settings);
                }),
            });
            // Debug‑команда (dedupe=false)
            this.addCommand({
                id: "generate-link-tree-debug",
                name: "Сгенерировать карту ссылок (debug: dedupe=false)",
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    const dbg = Object.assign(Object.assign({}, this.settings), { dedupe: false });
                    yield generateLinkTree(this.app, dbg);
                }),
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
// ---------------------- UI настроек ----------------------
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
            .addText((text) => text
            .setPlaceholder("Теги")
            .setValue(this.plugin.settings.rootFolder)
            .onChange((v) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.rootFolder = v.trim() || "Теги";
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Максимальная глубина")
            .setDesc("0 = без ограничения (считается от rootFolder)")
            .addText((text) => text
            .setPlaceholder("0")
            .setValue(String(this.plugin.settings.maxDepth))
            .onChange((v) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.maxDepth = Number(v) || 0;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Лимит корневых элементов")
            .setDesc("0 = без ограничения")
            .addText((text) => text
            .setPlaceholder("0")
            .setValue(String(this.plugin.settings.rootLimit))
            .onChange((v) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.rootLimit = Number(v) || 0;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Дедупликация")
            .setDesc("Если включено – заметка появляется только один раз")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.dedupe)
            .onChange((v) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.dedupe = v;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Лимит размера файла (KB)")
            .setDesc("0 = без ограничения")
            .addText((text) => text
            .setPlaceholder("0")
            .setValue(String(this.plugin.settings.sizeLimitKB))
            .onChange((v) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.sizeLimitKB = Number(v) || 0;
            yield this.plugin.saveSettings();
        })));
    }
}
// ---------------------- Логика ----------------------
// Асинхронно строит дерево и записывает links.json
function generateLinkTree(app, cfg) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const { vault, metadataCache } = app;
        const depthLimit = cfg.maxDepth > 0 ? cfg.maxDepth : Infinity;
        const rootWidth = cfg.rootLimit > 0 ? cfg.rootLimit : Infinity;
        const dedupe = cfg.dedupe;
        // Собираем все markdown в нужной папке
        const markdownFiles = vault
            .getMarkdownFiles()
            .filter((f) => f.path.startsWith(cfg.rootFolder + "/"))
            .slice(0, rootWidth);
        // Карта обратных ссылок path -> Set<srcPath>
        const backlinksMap = new Map();
        const cacheAny = metadataCache;
        const normalize = (p) => (0, obsidian_1.normalizePath)(p.split("#")[0]);
        for (const file of markdownFiles) {
            let set;
            const meta = (_a = cacheAny.getBacklinksForFile) === null || _a === void 0 ? void 0 : _a.call(cacheAny, file);
            if (!(meta === null || meta === void 0 ? void 0 : meta.data))
                continue;
            const collect = (raw) => {
                const src = normalize(raw);
                set = backlinksMap.get(file.path);
                if (!set) {
                    set = new Set();
                    backlinksMap.set(file.path, set);
                }
                set.add(src);
            };
            meta.data.forEach((_, raw) => collect(raw));
            (_b = meta.unresolved) === null || _b === void 0 ? void 0 : _b.forEach((_, raw) => collect(raw));
        }
        // Глобальный набор «уже добавлено», если dedupe включён
        let currentSize = 0;
        const visited = new Set();
        function buildNode(path, depth, ancestors) {
            var _a, _b;
            if (depthLimit !== Infinity && depth > depthLimit)
                return null;
            currentSize += path.length + 32; // приблизительная длина
            if (cfg.sizeLimitKB > 0 && currentSize / 1024 > cfg.sizeLimitKB)
                return null;
            // запрещаем self‑loop и ссылки на любого предка
            if (ancestors.has(path))
                return null;
            if (dedupe) {
                if (visited.has(path))
                    return null;
                visited.add(path);
            }
            // ленивое пополнение карты, если path ещё не собран
            if (!backlinksMap.has(path)) {
                const abs = vault.getAbstractFileByPath(path);
                if (abs instanceof obsidian_1.TFile && abs.extension === "md") {
                    const meta = (_a = cacheAny.getBacklinksForFile) === null || _a === void 0 ? void 0 : _a.call(cacheAny, abs);
                    if (meta === null || meta === void 0 ? void 0 : meta.data) {
                        const set = new Set();
                        meta.data.forEach((_, raw) => set.add(normalize(raw)));
                        (_b = meta.unresolved) === null || _b === void 0 ? void 0 : _b.forEach((_, raw) => set.add(normalize(raw)));
                        if (set.size)
                            backlinksMap.set(path, set);
                    }
                }
            }
            const children = [];
            const direct = backlinksMap.get(path);
            if (direct) {
                for (const childPath of direct) {
                    // Пропускаем self‑link и ссылки на любого предка
                    if (childPath === path || ancestors.has(childPath))
                        continue;
                    const child = buildNode(childPath, depth + 1, new Set([...ancestors, path]));
                    if (child)
                        children.push(child);
                }
            }
            // value – прямые дети, total – все потомки
            const totalDesc = children.reduce((sum, c) => sum + c.total, 0) + children.length;
            return {
                name: path,
                value: children.length,
                total: totalDesc,
                children,
            };
        }
        // rootFolder как отдельный узел
        const root = {
            name: cfg.rootFolder,
            value: 0,
            total: 0,
            children: markdownFiles
                .map((f) => buildNode(f.path, 1, new Set()))
                .filter((n) => Boolean(n)),
        };
        root.total =
            (((_c = root.children) === null || _c === void 0 ? void 0 : _c.reduce((sum, c) => sum + c.total, 0)) || 0) +
                (((_d = root.children) === null || _d === void 0 ? void 0 : _d.length) || 0);
        // Пишем в файл
        const json = JSON.stringify(root, null, 2);
        const sizeKB = json.length / 1024;
        if (cfg.sizeLimitKB > 0 && sizeKB > cfg.sizeLimitKB) {
            new obsidian_1.Notice(`Отмена: links.json (${sizeKB.toFixed(1)} KB) превышает лимит ${cfg.sizeLimitKB} KB`);
            return;
        }
        let outputPath = "links.json";
        const adapter = vault.adapter;
        if (adapter instanceof obsidian_1.FileSystemAdapter) {
            const base = adapter.getBasePath();
            outputPath = (0, obsidian_1.normalizePath)(`${base}/.obsidian/plugins/obsidian-linkmap-plugin/visuals/links.json`);
            yield fs_1.promises.writeFile(outputPath, json);
        }
        else {
            yield vault.adapter.write(outputPath, json);
        }
        new obsidian_1.Notice(`links.json готов ✔️ depth=${cfg.maxDepth}, rootLimit=${cfg.rootLimit}, dedupe=${cfg.dedupe}`);
    });
}
