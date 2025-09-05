if (typeof window.isInserterScriptLoaded === 'undefined') {
    window.isInserterScriptLoaded = true;

    const MESSAGE_TYPES = {
        START_SELECTION: 'START_SELECTION',
        INSERT_TEXT: 'INSERT_TEXT',
        ELEMENT_SELECTED: 'ELEMENT_SELECTED',
        ACTIVATE_SELECTION_MODE: 'ACTIVATE_SELECTION_MODE',
        EXECUTE_INSERTION: 'EXECUTE_INSERTION'
    };

    let isSelectionModeActive = false;
    let lastHighlightedElement = null;

    const INTERACTIVE_ELEMENT_SELECTORS = [
        'input:not([type="hidden"])',
        'textarea',
        '[contenteditable="true"]',
        '[data-value]',
        '[role="textbox"]'
    ];

    function generateCssSelector(el) {
        if (!(el instanceof Element)) return;
        const path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector = `#${CSS.escape(el.id)}`;
                path.unshift(selector);
                break;
            } else {
                let sib = el, nth = 1;
                while (sib.previousElementSibling) {
                    if (sib.previousElementSibling.nodeName.toLowerCase() === selector) nth++;
                    sib = sib.previousElementSibling;
                }
                if (nth !== 1) selector += `:nth-of-type(${nth})`;
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(' > ');
    }

    function generateXPath(el) {
        if (el === document.body) return '/html/body';
        const idx = (sib, name) =>
            sib ? idx(sib.previousElementSibling, name || sib.localName) +
                (sib.localName === name)
                : 1;

        const segs = [];
        for (; el && el.nodeType === 1; el = el.parentNode) {
            let name = el.localName.toLowerCase();
            if (el.id) {
                name += `[@id="${el.id}"]`;
            } else if (el.hasAttribute('name')) {
                name += `[@name="${el.getAttribute('name')}"]`;
            } else if (el.hasAttribute('placeholder')) {
                name += `[@placeholder="${el.getAttribute('placeholder')}"]`;
            } else {
                const position = idx(el);
                if (position > 1) {
                    name += `[${position}]`;
                }
            }
            segs.unshift(name);
        }
        return '/' + segs.join('/');
    }

    function findInteractiveElement(container, maxDepth = 5) {
        if (!container || maxDepth <= 0) return null;

        if (
            ['INPUT', 'TEXTAREA'].includes(container.tagName) ||
            container.isContentEditable ||
            container.getAttribute('contenteditable') === 'true' ||
            container.hasAttribute('data-value')
        ) return container;

        for (const selector of INTERACTIVE_ELEMENT_SELECTORS) {
            const found = container.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    function setElementValue(element, text) {
        const add = (current) => current ? `${current} ${text}` : text;
        let updated = false;

        if (['INPUT', 'TEXTAREA'].includes(element.tagName)) {
            const proto = element.tagName === 'INPUT'
                ? window.HTMLInputElement.prototype
                : window.HTMLTextAreaElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            setter ? setter.call(element, add(element.value)) : element.value = add(element.value);
            updated = true;
        } else if (element.isContentEditable || element.getAttribute('contenteditable') === 'true' ||
            element.getAttribute('role') === 'textbox') {
            element.textContent = add(element.textContent);
            updated = true;
        }

        const valueHolder = element.closest('[data-value]');
        if (valueHolder) {
            valueHolder.setAttribute('data-value', add(valueHolder.getAttribute('data-value')));
            if (!updated) {
                const inner = element.querySelector('input,textarea');
                if (inner) {
                    setElementValue(inner, text);
                    updated = true;
                }
            }
        }

        if (!updated) {
            element.innerText = add(element.innerText);
            updated = true;
        }

        if (updated) {
            element.focus();
            element.dispatchEvent(new Event('input',  { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            element.blur();
            element.focus();
        }
        return updated;
    }

    function showPageNotification(message, type = 'success') {
        const notificationId = 'text-inserter-notification';
        let notification = document.getElementById(notificationId);

        if (notification) {
            notification.remove();
        }

        notification = document.createElement('div');
        notification.id = notificationId;
        notification.textContent = message;

        const backgroundColor = {
            success: '#4CAF50',
            error: '#f44336',
            info: '#2196F3'
        };

        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor: backgroundColor[type] || backgroundColor.info,
            color: 'white',
            zIndex: '2147483647',
            fontSize: '16px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'opacity 0.5s ease, transform 0.5s ease'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    const clickHandler = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        deactivateSelectionMode();
        const target = findInteractiveElement(e.target);

        if (target) {
            const selector = {
                xpath : generateXPath(target),
                css   : generateCssSelector(target)
            };

            try {
                const response = await browser.runtime.sendMessage({ type: MESSAGE_TYPES.ELEMENT_SELECTED, selector });

                if (response.status === 'ok') {
                    showPageNotification('✅ Элемент для вставки сохранен!', 'success');
                } else if (response.status === 'duplicate') {
                    showPageNotification('ℹ️ Этот элемент уже был сохранен ранее.', 'info');
                } else {
                    showPageNotification(`❌ Ошибка: ${response.message}`, 'error');
                }
            } catch (error) {
                console.error("Could not send ELEMENT_SELECTED message:", error);
                showPageNotification('❌ Произошла ошибка при сохранении.', 'error');
            }

        } else {
            showPageNotification('❌ Не удалось найти подходящее поле для ввода.', 'error');
        }
    };

    const mouseOverHandler = (e) => {
        if (lastHighlightedElement) lastHighlightedElement.style.outline = '';
        const target = findInteractiveElement(e.target);
        if (target) {
            lastHighlightedElement = target;
            target.style.outline = '3px dashed #00A9FF';
            target.style.outlineOffset = '2px';
        }
    };
    const mouseOutHandler = () => {
        if (lastHighlightedElement) lastHighlightedElement.style.outline = '';
    };

    function activateSelectionMode() {
        if (isSelectionModeActive) return;
        isSelectionModeActive = true;
        document.body.style.cursor = 'crosshair';
        document.body.addEventListener('mouseover', mouseOverHandler);
        document.body.addEventListener('mouseout',  mouseOutHandler);
        document.body.addEventListener('click',     clickHandler, { capture: true });
    }

    function deactivateSelectionMode() {
        document.body.style.cursor = 'default';
        document.body.removeEventListener('mouseover', mouseOverHandler);
        document.body.removeEventListener('mouseout',  mouseOutHandler);
        document.body.removeEventListener('click',     clickHandler, { capture: true });
        if (lastHighlightedElement) {
            lastHighlightedElement.style.outline = '';
            lastHighlightedElement = null;
        }
        isSelectionModeActive = false;
    }

    browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        switch (request.type) {
            case MESSAGE_TYPES.ACTIVATE_SELECTION_MODE:
                activateSelectionMode();
                sendResponse({ status: 'ok' });
                break;

            case MESSAGE_TYPES.EXECUTE_INSERTION: {
                (async () => {
                    const host = location.hostname;
                    const { siteSelectors = {} } = await browser.storage.local.get('siteSelectors');
                    const selectors = siteSelectors[host];

                    if (!selectors || selectors.length === 0) {
                        showPageNotification('🎯 Сначала выберите элемент на странице.', 'error');
                        return;
                    }

                    let insertionSuccess = false;
                    for (const sel of selectors) {
                        let element = null;

                        if (sel.xpath) {
                            try {
                                element = document.evaluate(sel.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            } catch (e) { console.warn("XPath evaluation failed:", sel.xpath, e); }
                        }
                        if (!element && sel.css) {
                            element = document.querySelector(sel.css);
                        }

                        if (element) {
                            const isAlreadyInteractive = ['INPUT', 'TEXTAREA'].includes(element.tagName) || element.isContentEditable;
                            const target = isAlreadyInteractive ? element : findInteractiveElement(element);

                            if (target && setElementValue(target, request.text)) {
                                insertionSuccess = true;
                                break;
                            }
                        }
                    }

                    if (insertionSuccess) {
                        showPageNotification('✅ Текст вставлен!');
                    } else {
                        showPageNotification('❗️Не удалось найти ни один из сохранённых элементов. Выберите их заново.', 'error');
                    }

                })();
                sendResponse({ status: 'ok' });
                break;
            }
        }
        return true;
    });

    console.log('Text Inserter content script initialized.');
}