import { storageService } from './storage-service.js';

console.log('Background service worker started.');

const MESSAGE_TYPES = {
    START_SELECTION: 'START_SELECTION',
    INSERT_TEXT: 'INSERT_TEXT',
    ELEMENT_SELECTED: 'ELEMENT_SELECTED',
    ACTIVATE_SELECTION_MODE: 'ACTIVATE_SELECTION_MODE',
    EXECUTE_INSERTION: 'EXECUTE_INSERTION'
};

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
            case MESSAGE_TYPES.START_SELECTION: {
                await ensureAndSendMessage(tab.id, {type: MESSAGE_TYPES.ACTIVATE_SELECTION_MODE});
                return {status: 'ok'};
            }

            case MESSAGE_TYPES.INSERT_TEXT: {
                await ensureAndSendMessage(tab.id, {
                    type: MESSAGE_TYPES.EXECUTE_INSERTION,
                    text: request.text
                });

                return {status: 'ok'};
            }

            case MESSAGE_TYPES.ELEMENT_SELECTED: {
                if (!sender.tab || !sender.tab.url) {
                    return { status: 'error', message: 'Sender tab URL is missing' };
                }

                const hostname = new URL(sender.tab.url).hostname;

                return await storageService.addSelectorForHost(hostname, request.selector);
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