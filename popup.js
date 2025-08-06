import { storageService } from './storage-service.js';

document.addEventListener('DOMContentLoaded', async () => {
    const MESSAGE_TYPES = {
        START_SELECTION: 'START_SELECTION',
        INSERT_TEXT: 'INSERT_TEXT'
    };

    const mainView = document.getElementById('main-view');
    const editView = document.getElementById('edit-view');
    const manageView = document.getElementById('manage-view');

    const addTextBtn = document.getElementById('add-text-btn');
    const selectElementBtn = document.getElementById('select-element-btn');
    const manageSelectorsBtn = document.getElementById('manage-selectors-btn');
    const backToMainBtn = document.getElementById('back-to-main-btn');
    const clearAllSelectorsBtn = document.getElementById('clear-all-selectors-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    const textList = document.getElementById('text-list');
    const selectorList = document.getElementById('selector-list');
    const statusMessage = document.getElementById('status-message');
    const editForm = document.getElementById('edit-form');
    const editViewTitle = document.getElementById('edit-view-title');
    const textInput = document.getElementById('text-input');

    let statusTimeout;

    let state = {
        texts: [],
        selectorsForHost: [],
        hostname: null,
        currentView: 'main',
        editingText: null,
    };

    async function updateState(newStateChanges = {}) {
        state = { ...state, ...newStateChanges };

        const hostname = await getCurrentHost();
        const texts = await storageService.getTexts();
        const allSelectors = await storageService.getSiteSelectors();

        state.hostname = hostname;
        state.texts = texts;
        state.selectorsForHost = allSelectors[hostname] || [];

        render();
    }

    function render() {
        mainView.classList.toggle('hidden', state.currentView !== 'main');
        editView.classList.toggle('hidden', state.currentView !== 'edit');
        manageView.classList.toggle('hidden', state.currentView !== 'manage');

        renderTextList(state.texts);
        renderSelectorList(state.selectorsForHost);
        renderEditView(state.editingText);
        renderStatusMessage(state.hostname, state.selectorsForHost.length);
    }

    function renderTextList(texts) {
        textList.replaceChildren(); // Очищаем старый список
        if (texts.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'status';
            emptyMsg.textContent = 'Нет сохраненных текстов. Нажмите "+", чтобы добавить.';
            textList.appendChild(emptyMsg);
            return;
        }
        texts.forEach(textItem => textList.appendChild(createListItem(textItem)));
    }

    function renderSelectorList(selectors) {
        selectorList.replaceChildren();
        clearAllSelectorsBtn.disabled = selectors.length === 0;
        if (selectors.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'status';
            emptyMsg.textContent = 'Для этого сайта нет сохраненных элементов.';
            selectorList.appendChild(emptyMsg);
            return;
        }
        selectors.forEach((sel, index) => selectorList.appendChild(createSelectorItem(sel, index)));
    }

    function renderEditView(editingText) {
        if (state.currentView !== 'edit') return;
        if (editingText) {
            textInput.value = editingText.content;
            editViewTitle.textContent = 'Редактировать текст';
        } else {
            textInput.value = '';
            editViewTitle.textContent = 'Добавить новый текст';
        }
        textInput.focus();
    }

    function renderStatusMessage(hostname, selectorCount) {
        const isEnabled = !!hostname;
        selectElementBtn.disabled = !isEnabled;
        manageSelectorsBtn.disabled = !isEnabled;

        if (!isEnabled) {
            statusMessage.textContent = 'Расширение не работает на системных страницах.';
        } else if (selectorCount > 0) {
            statusMessage.textContent = `✅ Выбрано элементов для сайта: ${selectorCount}`;
        } else {
            statusMessage.textContent = '⚠️ Элементы для этого сайта не выбраны. Нажмите 🎯';
        }
    }

    async function handleSelectElement() {
        if (selectElementBtn.disabled) return;
        await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.START_SELECTION });
        showTemporaryStatus('🎯 Выберите элемент на странице...', 'info', 2000);
        setTimeout(() => window.close(), 500);
    }

    async function handleSaveText(e) {
        e.preventDefault();
        const textContent = textInput.value.trim();
        if (textContent) {
            const idToUpdate = state.editingText ? state.editingText.id : null;
            await storageService.saveText(textContent, idToUpdate);
            await updateState({ currentView: 'main', editingText: null });
            showTemporaryStatus('✅ Текст сохранен!', 'success');
        }
    }

    async function handleDeleteText(id) {
        await storageService.deleteText(id);
        await updateState(); // Обновляем состояние, что вызовет перерисовку
        showTemporaryStatus('🗑️ Текст удален.', 'success');
    }

    async function handleClearAllSelectors() {
        if (state.hostname) {
            await storageService.clearAllSelectors(state.hostname);
            await updateState();
            showTemporaryStatus('🧹 Все элементы для сайта удалены.', 'success');
        }
    }

    async function handleDeleteSelector(id) {
        if (state.hostname) {
            await storageService.deleteSelector(state.hostname, id);
            await updateState();
        }
    }

    function createListItem(textItem) {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.addEventListener('click', async () => {
            if (!state.hostname || state.selectorsForHost.length === 0) {
                showTemporaryStatus('Сначала выберите элемент для вставки (🎯)', 'error');
                return;
            }
            await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.INSERT_TEXT, text: textItem.content });
            window.close();
        });

        const textSpan = document.createElement('span');
        textSpan.className = 'list-item-text';
        textSpan.textContent = textItem.content;
        textSpan.title = textItem.content;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';

        const editBtn = createButton('✏️', 'Редактировать', (e) => {
            e.stopPropagation();
            updateState({ currentView: 'edit', editingText: textItem });
        });

        const deleteBtn = createButton('🗑️', 'Удалить', (e) => {
            e.stopPropagation();
            handleDeleteWithConfirmation(deleteBtn, () => handleDeleteText(textItem.id));
        });

        actionsDiv.append(editBtn, deleteBtn);
        li.append(textSpan, actionsDiv);
        return li;
    }

    function createSelectorItem(sel, index) {
        const li = document.createElement('li');
        li.className = 'selector-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'selector-name';
        nameSpan.textContent = `Элемент ${index + 1} (${index === 0 ? 'Высший приоритет' : 'Низший'})`;
        nameSpan.title = sel.xpath || sel.css;

        const deleteBtn = createButton('🗑️', 'Удалить этот элемент', (e) => {
            e.stopPropagation();
            handleDeleteSelector(sel.id);
        });
        deleteBtn.classList.add('delete-btn');

        li.append(nameSpan, deleteBtn);
        return li;
    }

    function createButton(text, title, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', onClick);
        return button;
    }

    function handleDeleteWithConfirmation(deleteBtn, deleteAction) {
        if (!deleteBtn.dataset.confirm) {
            deleteBtn.dataset.confirm = 'true';
            deleteBtn.textContent = '❓';
            deleteBtn.classList.add('confirm-delete');
            const reset = () => {
                deleteBtn.dataset.confirm = '';
                deleteBtn.textContent = '🗑️';
                deleteBtn.classList.remove('confirm-delete');
            };
            deleteBtn.addEventListener('mouseleave', reset, { once: true });
            setTimeout(reset, 3000); // Сбрасываем через 3 секунды
        } else {
            deleteAction();
        }
    }

    async function getCurrentHost() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                return new URL(tab.url).hostname;
            }
        } catch (e) {
            console.error("Error getting current tab:", e);
        }
        return null;
    }

    function showTemporaryStatus(message, type = 'info', duration = 2500) {
        clearTimeout(statusTimeout);
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
        statusTimeout = setTimeout(() => {
            statusMessage.className = 'status';
            renderStatusMessage(state.hostname, state.selectorsForHost.length);
        }, duration);
    }

    function setupEventListeners() {
        addTextBtn.addEventListener('click', () => updateState({ currentView: 'edit', editingText: null }));
        manageSelectorsBtn.addEventListener('click', () => updateState({ currentView: 'manage' }));
        backToMainBtn.addEventListener('click', () => updateState({ currentView: 'main' }));
        cancelEditBtn.addEventListener('click', () => updateState({ currentView: 'main', editingText: null }));

        selectElementBtn.addEventListener('click', handleSelectElement);
        editForm.addEventListener('submit', handleSaveText);
        clearAllSelectorsBtn.addEventListener('click', handleClearAllSelectors);
    }

    setupEventListeners();
    await updateState();
});