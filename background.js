console.log('Background service worker started.');

/**
 * Гарантирует, что content-script внедрён в вкладку, затем отправляет сообщение.
 * @param {number} tabId ID вкладки
 * @param {object} message Сообщение для отправки
 * @returns {Promise<any>}
 */
async function ensureAndSendMessage(tabId, message) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        console.error(`Could not execute script or send message in tab ${tabId}:`, error);
        return Promise.reject(error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.id) {
            return { status: 'error', message: 'No active tab found' };
        }

        switch (request.type) {
            case 'START_SELECTION':
                await ensureAndSendMessage(tab.id, { type: 'ACTIVATE_SELECTION_MODE' });
                return { status: 'ok' };

            case 'INSERT_TEXT':
                await ensureAndSendMessage(tab.id, {
                    type: 'EXECUTE_INSERTION',
                    text: request.text
                });
                return { status: 'ok' };

            case 'ELEMENT_SELECTED': {
                if (!sender.tab || !sender.tab.url) {
                    console.error('Received ELEMENT_SELECTED from a sender without a tab URL.');
                    return { status: 'error', message: 'Sender tab URL is missing' };
                }
                const url = new URL(sender.tab.url);
                const hostname = url.hostname;

                const { siteSelectors = {} } = await chrome.storage.local.get('siteSelectors');

                const existingData = siteSelectors[hostname];
                let selectorsForHost;

                if (Array.isArray(existingData)) {
                    selectorsForHost = existingData;
                } else if (existingData) {
                    selectorsForHost = [existingData];
                } else {
                    selectorsForHost = [];
                }

                // --- НОВАЯ ЛОГИКА: ПРОВЕРКА НА ДУБЛИКАТ ---
                const newSelectorCandidate = request.selector;
                const isDuplicate = selectorsForHost.some(
                    sel => sel.xpath === newSelectorCandidate.xpath || sel.css === newSelectorCandidate.css
                );

                if (isDuplicate) {
                    console.log(`Duplicate selector detected for ${hostname}. Not adding.`);
                    // Возвращаем специальный статус, чтобы content.js мог уведомить пользователя.
                    return { status: 'duplicate' };
                }
                // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

                const newSelector = {
                    ...newSelectorCandidate,
                    id: crypto.randomUUID()
                };

                selectorsForHost.push(newSelector);
                siteSelectors[hostname] = selectorsForHost;

                await chrome.storage.local.set({ siteSelectors });

                console.log(`Selector for ${hostname} saved. Total: ${selectorsForHost.length}`);
                return { status: 'ok' };
            }
            default:
                console.warn('Unknown message type received:', request.type);
                return { status: 'error', message: `Unknown type: ${request.type}` };
        }
    })()
        .then(sendResponse)
        .catch(error => {
            console.error("Error in message listener:", error);
            sendResponse({ status: 'error', message: error.message });
        });

    return true;
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated.');
});