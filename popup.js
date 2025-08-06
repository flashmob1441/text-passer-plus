document.addEventListener('DOMContentLoaded', () => {
    // --- Элементы DOM ---
    const mainView = document.getElementById('main-view');
    const editView = document.getElementById('edit-view');
    const manageView = document.getElementById('manage-view');

    // Кнопки
    const addTextBtn = document.getElementById('add-text-btn');
    const selectElementBtn = document.getElementById('select-element-btn');
    const manageSelectorsBtn = document.getElementById('manage-selectors-btn');
    const backToMainBtn = document.getElementById('back-to-main-btn');
    const clearAllSelectorsBtn = document.getElementById('clear-all-selectors-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn'); // Теперь этот элемент будет найден

    // Списки и формы
    const textList = document.getElementById('text-list');
    const selectorList = document.getElementById('selector-list');
    const statusMessage = document.getElementById('status-message');
    const editForm = document.getElementById('edit-form');
    const editViewTitle = document.getElementById('edit-view-title');
    const textInput = document.getElementById('text-input');

    // --- Переменные состояния ---
    let currentHostname = null;
    let currentEditId = null;
    let statusTimeout;

    // --- Инициализация ---
    initializePopup();

    async function initializePopup() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                currentHostname = new URL(tab.url).hostname;
            }
        } catch (e) {
            console.error("Error getting current tab:", e);
        }

        await updateStatusMessage();
        await loadAndRenderTexts();
        setupEventListeners(); // Теперь эта функция отработает без ошибок
    }

    // --- Переключение между видами ---
    function showView(viewToShow) {
        [mainView, editView, manageView].forEach(view => view.classList.add('hidden'));
        viewToShow.classList.remove('hidden');
        if (viewToShow === mainView) {
            updateStatusMessage();
        }
    }

    // --- Обработчики событий ---
    function setupEventListeners() {
        // Главный экран
        addTextBtn.addEventListener('click', () => showEditView()); // Используем обертку для сброса
        selectElementBtn.addEventListener('click', handleSelectElement);
        manageSelectorsBtn.addEventListener('click', handleManageSelectors);

        // Экран редактирования текста
        editForm.addEventListener('submit', handleSaveText);
        cancelEditBtn.addEventListener('click', () => showView(mainView));

        // Экран управления селекторами
        backToMainBtn.addEventListener('click', () => showView(mainView)); // Теперь заработает
        clearAllSelectorsBtn.addEventListener('click', handleClearAllSelectors);
    }

    function showEditView(textItem = null) {
        if (textItem) {
            currentEditId = textItem.id;
            textInput.value = textItem.content;
            editViewTitle.textContent = 'Редактировать текст';
        } else {
            currentEditId = null;
            textInput.value = '';
            editViewTitle.textContent = 'Добавить новый текст';
        }
        showView(editView);
        textInput.focus();
    }


    // --- Логика обработчиков ---
    // ... (весь остальной код до updateStatusMessage остается без изменений) ...
    async function handleSelectElement() {
        if (selectElementBtn.disabled) return;
        await chrome.runtime.sendMessage({ type: 'START_SELECTION' });
        showTemporaryStatus('🎯 Выберите элемент на странице...', 'info', 1500);
        setTimeout(() => window.close(), 500);
    }

    async function handleSaveText(e) {
        e.preventDefault();
        const textContent = textInput.value.trim();
        if (textContent) {
            await saveText(textContent, currentEditId);
            showView(mainView);
        }
    }

    async function handleManageSelectors() {
        showView(manageView);
        await renderSelectorList();
    }

    async function handleClearAllSelectors() {
        if (!currentHostname) return;
        const { siteSelectors = {} } = await chrome.storage.local.get('siteSelectors');
        if (siteSelectors[currentHostname]) {
            delete siteSelectors[currentHostname];
            await chrome.storage.local.set({ siteSelectors });
            showTemporaryStatus('🧹 Все элементы для сайта удалены', 'success', 2000);
            await renderSelectorList();
        }
    }

    async function getStoredData(key) {
        const data = await chrome.storage.local.get(key);
        return data[key] || (key === 'texts' ? [] : {});
    }

    async function saveText(content, idToUpdate) {
        let texts = await getStoredData('texts');
        if (idToUpdate) {
            const textIndex = texts.findIndex(t => t.id === idToUpdate);
            if (textIndex > -1) texts[textIndex].content = content;
        } else {
            texts.push({ id: crypto.randomUUID(), content });
        }
        await chrome.storage.local.set({ texts });
        await loadAndRenderTexts();
        showTemporaryStatus('✅ Текст сохранен!', 'success', 2000);
    }

    async function deleteText(id) {
        let texts = await getStoredData('texts');
        texts = texts.filter(t => t.id !== id);
        await chrome.storage.local.set({ texts });
        await loadAndRenderTexts();
        showTemporaryStatus('🗑️ Текст удален', 'success', 2000);
    }

    async function deleteSelector(selectorId) {
        if (!currentHostname) return;
        let siteSelectors = await getStoredData('siteSelectors');
        let selectorsForHost = siteSelectors[currentHostname] || [];

        selectorsForHost = selectorsForHost.filter(s => s.id !== selectorId);

        if(selectorsForHost.length > 0) {
            siteSelectors[currentHostname] = selectorsForHost;
        } else {
            delete siteSelectors[currentHostname];
        }

        await chrome.storage.local.set({ siteSelectors });
        await renderSelectorList();
    }

    function showTemporaryStatus(message, type = 'info', duration = 3000) {
        clearTimeout(statusTimeout);
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
        statusTimeout = setTimeout(updateStatusMessage, duration);
    }


    // ИСПРАВЛЕНА ЛОГИКА В ЭТОЙ ФУНКЦИИ
    async function updateStatusMessage() {
        statusMessage.className = 'status'; // Сброс стилей
        if (!currentHostname) {
            statusMessage.textContent = 'Расширение не работает на этих страницах';
            selectElementBtn.disabled = true;
            manageSelectorsBtn.disabled = true; // Отключаем, если вкладка не подходит
            return;
        }

        // Кнопки всегда активны, если вкладка подходит
        selectElementBtn.disabled = false;
        manageSelectorsBtn.disabled = false;

        const siteSelectors = await getStoredData('siteSelectors');
        const selectorsForHost = siteSelectors[currentHostname] || [];

        if (selectorsForHost.length > 0) {
            statusMessage.textContent = `✅ Выбрано элементов для сайта: ${selectorsForHost.length}`;
        } else {
            statusMessage.textContent = `⚠️ Элементы для этого сайта не выбраны`;
        }
    }

    // ... (остальной код остается без изменений) ...
    async function loadAndRenderTexts() {
        textList.replaceChildren();
        const texts = await getStoredData('texts');

        if (texts.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'status';
            emptyMsg.textContent = 'Нет сохраненных текстов';
            textList.appendChild(emptyMsg);
            return;
        }

        texts.forEach(textItem => {
            const li = createListItem(textItem);
            textList.appendChild(li);
        });
    }

    function createListItem(textItem) {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.addEventListener('click', async () => {
            if (!currentHostname) return;
            const siteSelectors = await getStoredData('siteSelectors');
            const selectorsForHost = siteSelectors[currentHostname] || [];

            if (selectorsForHost.length > 0) {
                chrome.runtime.sendMessage({ type: 'INSERT_TEXT', text: textItem.content });
                window.close();
            } else {
                showTemporaryStatus('Сначала выберите элемент (🎯)', 'error', 3000);
            }
        });

        const textSpan = document.createElement('span');
        textSpan.className = 'list-item-text';
        textSpan.textContent = textItem.content;
        textSpan.title = textItem.content;

        const actionsDiv = createActions(textItem);

        li.append(textSpan, actionsDiv);
        return li;
    }

    function createActions(textItem) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';

        const editBtn = createButton('✏️', 'Редактировать', (e) => {
            e.stopPropagation();
            showEditView(textItem);
        });

        const deleteBtn = createButton('🗑️', 'Удалить', (e) => {
            e.stopPropagation();
            if (!deleteBtn.dataset.confirm) {
                deleteBtn.dataset.confirm = 'true';
                deleteBtn.textContent = '❓';
                deleteBtn.classList.add('confirm-delete');
                deleteBtn.addEventListener('mouseleave', () => {
                    deleteBtn.dataset.confirm = '';
                    deleteBtn.textContent = '🗑️';
                    deleteBtn.classList.remove('confirm-delete');
                }, { once: true });
            } else {
                deleteText(textItem.id);
            }
        });

        actionsDiv.append(editBtn, deleteBtn);
        return actionsDiv;
    }

    async function renderSelectorList() {
        selectorList.replaceChildren();
        if (!currentHostname) return;

        const siteSelectors = await getStoredData('siteSelectors');
        const selectorsForHost = siteSelectors[currentHostname] || [];

        if (selectorsForHost.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'status';
            emptyMsg.textContent = 'Нет сохраненных элементов';
            selectorList.appendChild(emptyMsg);
            clearAllSelectorsBtn.disabled = true;
            return;
        }

        clearAllSelectorsBtn.disabled = false;
        selectorsForHost.forEach((sel, index) => {
            const li = document.createElement('li');
            li.className = 'selector-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'selector-name';
            nameSpan.textContent = `Элемент ${index + 1} (Приоритет: ${index === 0 ? 'Высший' : 'Низший'})`;
            nameSpan.title = sel.xpath || sel.css;

            const deleteBtn = createButton('🗑️', 'Удалить этот элемент', (e) => {
                e.stopPropagation();
                deleteSelector(sel.id);
            });
            deleteBtn.classList.add('delete-btn');

            li.append(nameSpan, deleteBtn);
            selectorList.appendChild(li);
        });
    }

    function createButton(text, title, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', onClick);
        return button;
    }
});