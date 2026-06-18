const MODULE_NAME = 'quickReplyBindings';
const DISPLAY_NAME = 'Quick Reply Bindings';
const TOOLBAR_ID = 'qrb-toolbar';
const SUMMARY_ID = 'qrb-summary';
const WORLD_METADATA_KEY = 'world_info';
const SYNC_INTERVAL_MS = 2000;

const defaultSettings = Object.freeze({
    bindings: [],
    syncGlobalWorld: true,
    syncChatWorld: true,
    enableQuickReplyGlobally: true,
});

let lastActivePreset = '';
let lastChatWorld = '';
let lastGlobalWorlds = '';
let syncTimer = null;
let booted = false;
let renderedClickPatched = false;
let toolbarTimer = null;
let lastSummaryHtml = '';

function getContext() {
    return SillyTavern.getContext();
}

function getSettings() {
    const context = getContext();
    const settings = context.extensionSettings;
    if (!settings[MODULE_NAME]) {
        settings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(settings[MODULE_NAME], key)) {
            settings[MODULE_NAME][key] = structuredClone(defaultSettings[key]);
        }
    }

    if (!Array.isArray(settings[MODULE_NAME].bindings)) {
        settings[MODULE_NAME].bindings = [];
    }

    return settings[MODULE_NAME];
}

function saveSettings() {
    getContext().saveSettingsDebounced();
}

function getQuickReplyApi() {
    return globalThis.quickReplyApi;
}

function getQrIdentity() {
    const editor = document.querySelector('#qr--modalEditor');
    const id = editor?.dataset?.qrbQrId;
    const setName = editor?.dataset?.qrbSetName;

    if (id && setName) {
        return { id, setName };
    }

    const label = document.querySelector('#qr--modal-label')?.value?.trim() ?? '';
    const title = document.querySelector('#qr--modal-title')?.value?.trim() ?? '';
    const message = document.querySelector('#qr--modal-message')?.value ?? '';
    const resolved = findQrByFields(label, title, message);
    if (resolved) {
        return {
            id: String(resolved.qr.id),
            setName: resolved.setName,
        };
    }

    return {
        id: [label, title, message].join('\n'),
        setName: '',
    };
}

function findQrByFields(label, title, message) {
    const api = getQuickReplyApi();
    if (!api) return null;

    const matches = [];
    for (const setName of api.listSets()) {
        const set = api.getSetByName(setName);
        for (const qr of set?.qrList ?? []) {
            if ((qr.label ?? '') === label && (qr.title ?? '') === title && (qr.message ?? '') === message) {
                matches.push({ qr, setName });
            }
        }
    }

    return matches.length === 1 ? matches[0] : null;
}

function findQrByIdentity(identity) {
    const api = getQuickReplyApi();
    if (!api || !identity?.id) return null;

    for (const setName of api.listSets()) {
        const set = api.getSetByName(setName);
        const qr = set?.qrList?.find(item => String(item.id) === String(identity.id));
        if (qr) {
            return { qr, setName };
        }
    }

    if (identity.setName) {
        const set = api.getSetByName(identity.setName);
        const qr = set?.qrList?.find(item => String(item.id) === String(identity.id));
        if (qr) {
            return { qr, setName: identity.setName };
        }
    }

    return null;
}

function getBindingFor(setName, qrId) {
    const settings = getSettings();
    const normalizedQrId = String(qrId ?? '');
    const normalizedSetName = String(setName ?? '');

    let binding = settings.bindings.find(item => String(item.qrId) === normalizedQrId && item.setName === normalizedSetName);
    if (!binding) {
        binding = {
            qrId: normalizedQrId,
            setName: normalizedSetName,
            worldBooks: [],
            presets: [],
        };
        settings.bindings.push(binding);
    }

    binding.qrId = normalizedQrId;
    binding.setName = normalizedSetName;
    return binding;
}

function getCurrentSetName() {
    return document.querySelector('#qr--set')?.value ?? '';
}

function getCurrentSetBinding() {
    const setName = getCurrentSetName();
    return setName ? getBindingFor(setName, '__set__') : null;
}

function getCurrentQrBinding() {
    return getCurrentSetBinding() ?? getBindingFor('', '__set__');
}

function describeBinding(binding) {
    const worlds = binding.worldBooks?.length ? binding.worldBooks.join(', ') : '未绑定世界书';
    const presets = binding.presets?.length ? binding.presets.join(', ') : '未绑定预设';
    return { worlds, presets };
}

function updateSummary() {
    const summary = document.getElementById(SUMMARY_ID);
    if (!summary) return;

    const setName = getCurrentSetName();
    const binding = getCurrentSetBinding();
    let html;
    if (!setName || !binding) {
        html = '请选择要编辑的快速回复集';
    } else {
        const text = describeBinding(binding);
        html = `
            <div>当前快速回复集：${escapeHtml(setName)}</div>
            <div>世界书：${escapeHtml(text.worlds)}</div>
            <div>预设：${escapeHtml(text.presets)}</div>
        `;
    }

    if (html !== lastSummaryHtml) {
        summary.innerHTML = html;
        lastSummaryHtml = html;
    }
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

function mountToolbar() {
    document.querySelectorAll('.qrb-row-actions').forEach(element => element.remove());

    const setSelect = document.querySelector('#qr--set');
    if (!setSelect) return;

    let wrapper = document.getElementById(TOOLBAR_ID);
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = TOOLBAR_ID;
        wrapper.className = 'qrb-toolbar qrb-set-toolbar';
        wrapper.innerHTML = `
            <div id="${SUMMARY_ID}" class="qrb-binding-summary"></div>
            <button type="button" id="qrb-bind-world" class="menu_button">
                <i class="fa-solid fa-book"></i>
                <span>绑定世界书</span>
            </button>
            <button type="button" id="qrb-bind-preset" class="menu_button">
                <i class="fa-solid fa-sliders"></i>
                <span>绑定预设</span>
            </button>
            <button type="button" id="qrb-clear" class="menu_button">
                <i class="fa-solid fa-link-slash"></i>
                <span>清除绑定</span>
            </button>
        `;

        const editorRoot = setSelect.closest('#qr--settings') ?? setSelect.parentElement;
        const anchor = editorRoot?.querySelector('#qr--set-qrList') ?? setSelect;
        anchor.before(wrapper);

        wrapper.querySelector('#qrb-bind-world')?.addEventListener('click', () => openBindingPicker('world'));
        wrapper.querySelector('#qrb-bind-preset')?.addEventListener('click', () => openBindingPicker('preset'));
        wrapper.querySelector('#qrb-clear')?.addEventListener('click', clearCurrentBinding);
        setSelect.addEventListener('change', updateSummary);
    }

    updateSummary();
}

function observeQuickReplyEditor() {
    if (toolbarTimer) return;

    mountToolbar();
    toolbarTimer = setInterval(() => {
        try {
            mountToolbar();
        } catch (error) {
            console.error('[' + DISPLAY_NAME + '] toolbar mount failed', error);
        }
    }, 1000);
}

async function getWorldOptions() {
    const api = window.ST_API;
    if (!api?.worldBook?.list) {
        throw new Error('ST_API.worldBook.list 未就绪');
    }
    const result = await api.worldBook.list({ scope: 'global' });
    return (result.worldBooks ?? [])
        .filter(item => item.scope === 'global')
        .map(item => item.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

async function getPresetOptions() {
    const api = window.ST_API;
    if (!api?.preset?.list) {
        throw new Error('ST_API.preset.list 未就绪');
    }
    const result = await api.preset.list();
    return (result.presets ?? [])
        .map(item => item.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function getSetLink(config, setName) {
    return config?.setList?.find(link => link.set?.name === setName) ?? null;
}

function ensureSetVisible(config, setName) {
    const link = getSetLink(config, setName);
    if (!link) return false;
    if (!link.isVisible) {
        link.isVisible = true;
        link.update?.();
        config.update?.();
    }
    return true;
}

function removeSetIfPresent(config, setName) {
    const api = getQuickReplyApi();
    const set = api?.getSetByName?.(setName);
    if (config && set && getSetLink(config, setName)) {
        config.removeSet(set);
        return true;
    }
    return false;
}
async function openBindingPicker(type, binding = getCurrentSetBinding(), afterSave = updateSummary) {
    if (!binding) {
        toastr.warning('请先选择一个快速回复集', DISPLAY_NAME);
        return;
    }

    try {
        const options = type === 'world' ? await getWorldOptions() : await getPresetOptions();
        const selected = new Set(type === 'world' ? binding.worldBooks : binding.presets);
        const title = type === 'world' ? '选择绑定世界书' : '选择绑定预设';
        const result = await showPicker(title, options, selected);

        if (!result) return;

        if (type === 'world') {
            binding.worldBooks = result;
        } else {
            binding.presets = result;
        }

        saveSettings();
        afterSave?.();
        await syncFromPresetAndWorld(true);
        toastr.success('绑定已保存', DISPLAY_NAME);
    } catch (error) {
        console.error('[' + DISPLAY_NAME + '] picker failed', error);
        toastr.error(error.message ?? String(error), DISPLAY_NAME);
    }
}

function showPicker(title, options, selected) {
    return new Promise(resolve => {
        const root = document.createElement('div');
        root.className = 'qrb-modal';
        root.innerHTML = `
            <input type="search" class="text_pole qrb-modal__search" placeholder="搜索...">
            <div class="qrb-modal__list"></div>
        `;

        const search = root.querySelector('.qrb-modal__search');
        const list = root.querySelector('.qrb-modal__list');

        function render() {
            const query = search.value.trim().toLowerCase();
            const visible = options.filter(item => item.toLowerCase().includes(query));
            list.innerHTML = '';

            if (!visible.length) {
                const empty = document.createElement('div');
                empty.className = 'qrb-modal__empty';
                empty.textContent = '没有匹配项';
                list.append(empty);
                return;
            }

            for (const name of visible) {
                const label = document.createElement('label');
                label.className = 'menu_button qrb-modal__item';
                label.innerHTML = `
                    <span class="qrb-modal__itemName"></span>
                    <input type="checkbox">
                `;
                label.querySelector('.qrb-modal__itemName').textContent = name;
                const checkbox = label.querySelector('input');
                checkbox.checked = selected.has(name);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) selected.add(name);
                    else selected.delete(name);
                });
                list.append(label);
            }
        }

        search.addEventListener('input', render);
        render();

        callPopup(root, title).then(ok => {
            resolve(ok ? Array.from(selected).sort((a, b) => a.localeCompare(b)) : null);
        });
    });
}

async function callPopup(content, title) {
    const context = getContext();
    if (context.Popup && context.POPUP_TYPE) {
        const header = document.createElement('h3');
        header.textContent = title;
        const wrapper = document.createElement('div');
        wrapper.append(header, content);
        const popup = new context.Popup(wrapper, context.POPUP_TYPE.CONFIRM, null, {
            okButton: '保存',
            cancelButton: '取消',
            wide: true,
            large: true,
        });
        const result = await popup.show();
        return result === context.POPUP_RESULT.AFFIRMATIVE;
    }

    return window.confirm(title);
}

function clearCurrentBinding() {
    const binding = getCurrentSetBinding();
    if (!binding) {
        toastr.warning('请先选择一个快速回复集', DISPLAY_NAME);
        return;
    }

    binding.worldBooks = [];
    binding.presets = [];
    saveSettings();
    updateSummary();
    toastr.info('绑定已清除', DISPLAY_NAME);
}

async function applyQuickReplyBinding(binding) {
    const api = getQuickReplyApi();
    if (!api || !binding?.setName) return;

    const settings = getSettings();
    const config = settings.enableQuickReplyGlobally ? api.settings?.config : api.settings?.chatConfig;
    const set = api.getSetByName?.(binding.setName);
    if (!set || !config) return;

    if (!ensureSetVisible(config, binding.setName)) {
        config.addSet(set, true);
    }
}

async function switchPreset(name) {
    const context = getContext();
    const presetManager = context.getPresetManager?.();
    if (!presetManager) {
        throw new Error('PresetManager 未就绪');
    }

    const current = presetManager.getSelectedPresetName();
    if (current === name) return;

    const value = presetManager.findPreset(name);
    if (!value) {
        throw new Error(`找不到预设：${name}`);
    }

    presetManager.selectPreset(value);
}

async function enableWorldBook(name) {
    const settings = getSettings();
    const context = getContext();

    if (settings.syncGlobalWorld) {
        const select = document.querySelector('#world_info');
        if (select) {
            const option = Array.from(select.options).find(item => item.text === name);
            if (option && !option.selected) {
                option.selected = true;
                $(select).trigger('change');
            }
        }
    }

    if (settings.syncChatWorld) {
        const metadata = context.chatMetadata;
        if (metadata && metadata[WORLD_METADATA_KEY] !== name) {
            metadata[WORLD_METADATA_KEY] = name;
            await context.saveMetadata();
        }
    }
}

async function applyBindingFromQuickReply(binding) {
    for (const worldName of binding.worldBooks ?? []) {
        await enableWorldBook(worldName);
    }

    const presetName = binding.presets?.[0];
    if (presetName) {
        await switchPreset(presetName);
    }
}

async function syncFromPresetAndWorld(force = false) {
    const settings = getSettings();
    const api = window.ST_API;
    const qrApi = getQuickReplyApi();
    const context = getContext();

    let activePreset = '';
    if (api?.preset?.list) {
        const presetResult = await api.preset.list();
        activePreset = presetResult.active ?? '';
    }

    const chatWorld = context.chatMetadata?.[WORLD_METADATA_KEY] ?? '';
    const activeWorlds = new Set(Array.from(document.querySelector('#world_info')?.selectedOptions ?? [])
        .map(item => item.text)
        .filter(Boolean));
    if (chatWorld) activeWorlds.add(chatWorld);

    const globalWorlds = Array.from(activeWorlds).sort((a, b) => a.localeCompare(b)).join('\n');
    const changed = force || activePreset !== lastActivePreset || chatWorld !== lastChatWorld || globalWorlds !== lastGlobalWorlds;
    if (!changed) return;

    lastActivePreset = activePreset;
    lastChatWorld = chatWorld;
    lastGlobalWorlds = globalWorlds;

    const matchedSetNames = new Set();
    const boundSetNames = new Set();

    for (const binding of settings.bindings) {
        if (!binding?.setName || binding.qrId !== '__set__') continue;
        boundSetNames.add(binding.setName);

        const presetMatches = Boolean(activePreset && binding.presets?.includes(activePreset));
        const worldMatches = Boolean(binding.worldBooks?.some(name => activeWorlds.has(name)));
        if (presetMatches || worldMatches) {
            matchedSetNames.add(binding.setName);
            await applyQuickReplyBinding(binding);
        }
    }

    if (!qrApi) return;
    for (const setName of boundSetNames) {
        if (matchedSetNames.has(setName)) continue;
        removeSetIfPresent(qrApi.settings?.config, setName);
        removeSetIfPresent(qrApi.settings?.chatConfig, setName);
    }
}

function patchQuickReplyExecution() {
    const api = getQuickReplyApi();
    if (!api || api.__qrbPatched) return;

    const originalExecute = api.executeQuickReply.bind(api);
    api.executeQuickReply = async function patchedExecuteQuickReply(setName, label, args = {}, options = {}) {
        const result = await originalExecute(setName, label, args, options);
        const binding = getBindingFor(setName, '__set__');
        if (binding) {
            await applyBindingFromQuickReply(binding);
        }
        return result;
    };

    const patchSetActivator = (methodName) => {
        const original = api[methodName]?.bind(api);
        if (!original) return;
        api[methodName] = function patchedSetActivator(setName, ...args) {
            const result = original(setName, ...args);
            const isActive = [
                ...(api.listGlobalSets?.() ?? []),
                ...(api.listChatSets?.() ?? []),
            ].includes(setName);
            if (!isActive) return result;

            const binding = getBindingFor(setName, '__set__');
            applyBindingFromQuickReply(binding).catch(error => console.error(`[${DISPLAY_NAME}] set activation sync failed`, error));
            return result;
        };
    };

    patchSetActivator('addGlobalSet');
    patchSetActivator('addChatSet');
    patchSetActivator('toggleGlobalSet');
    patchSetActivator('toggleChatSet');

    api.__qrbPatched = true;
}

function patchRenderedQuickReplies() {
    if (renderedClickPatched) return;
    renderedClickPatched = true;

    document.addEventListener('click', async event => {
        const button = event.target.closest?.('.qr--button');
        if (!button) return;

        setTimeout(async () => {
            try {
                const api = getQuickReplyApi();
                if (!api) return;
                for (const setName of api.listSets()) {
                    const set = api.getSetByName(setName);
                    if (set?.qrList?.some(qr => qr.dom === button)) {
                        await applyBindingFromQuickReply(getBindingFor(setName, '__set__'));
                        return;
                    }
                }
            } catch (error) {
                console.error(`[${DISPLAY_NAME}] quick reply sync failed`, error);
            }
        }, 0);
    }, true);
}

function startSyncLoop() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
        syncFromPresetAndWorld().catch(error => console.error(`[${DISPLAY_NAME}] sync failed`, error));
    }, SYNC_INTERVAL_MS);
}

function boot() {
    if (booted) return;
    booted = true;

    observeQuickReplyEditor();
    patchRenderedQuickReplies();
    startSyncLoop();
    syncFromPresetAndWorld().catch(error => console.error(`[${DISPLAY_NAME}] initial sync failed`, error));

    const patchTimer = setInterval(() => {
        patchQuickReplyExecution();
        if (getQuickReplyApi()?.__qrbPatched) {
            clearInterval(patchTimer);
        }
    }, 500);

    setTimeout(() => clearInterval(patchTimer), 15000);
    console.log(`[${DISPLAY_NAME}] ready`);
}

function init() {
    const context = getContext();
    getSettings();

    boot();
    context.eventSource.on(context.event_types.APP_READY, boot);
}

init();
