export const storageService = {
    async _get(key, defaultValue = null) {
        const result = await browser.storage.local.get(key);
        return result[key] === undefined ? defaultValue : result[key];
    },
    async _set(key, value) {
        return browser.storage.local.set({ [key]: value });
    },

    async getTexts() {
        return this._get('texts', []);
    },
    async saveText(content, idToUpdate) {
        const texts = await this.getTexts();
        if (idToUpdate) {
            const textIndex = texts.findIndex(t => t.id === idToUpdate);
            if (textIndex > -1) texts[textIndex].content = content;
        } else {
            texts.push({ id: crypto.randomUUID(), content });
        }
        return this._set('texts', texts);
    },
    async deleteText(id) {
        let texts = await this.getTexts();
        texts = texts.filter(t => t.id !== id);
        return this._set('texts', texts);
    },

    async getSiteSelectors() {
        return this._get('siteSelectors', {});
    },
    async saveSiteSelectors(selectors) {
        return this._set('siteSelectors', selectors);
    },
    async addSelectorForHost(hostname, selector) {
        const siteSelectors = await this.getSiteSelectors();
        const selectorsForHost = siteSelectors[hostname] || [];

        const isDuplicate = selectorsForHost.some(
            sel => sel.xpath === selector.xpath || sel.css === selector.css
        );

        if (isDuplicate) {
            return { status: 'duplicate' };
        }

        const newSelector = { ...selector, id: crypto.randomUUID() };
        selectorsForHost.push(newSelector);
        siteSelectors[hostname] = selectorsForHost;
        await this.saveSiteSelectors(siteSelectors);

        console.log(`Selector for ${hostname} saved. Total: ${selectorsForHost.length}`);
        return { status: 'ok' };
    },
    async deleteSelector(hostname, selectorId) {
        if (!hostname) return;
        const siteSelectors = await this.getSiteSelectors();
        let selectorsForHost = siteSelectors[hostname] || [];
        selectorsForHost = selectorsForHost.filter(s => s.id !== selectorId);
        if (selectorsForHost.length > 0) {
            siteSelectors[hostname] = selectorsForHost;
        } else {
            delete siteSelectors[hostname];
        }
        return this.saveSiteSelectors(siteSelectors);
    },
    async clearAllSelectors(hostname) {
        if (!hostname) return;
        const siteSelectors = await this.getSiteSelectors();
        delete siteSelectors[hostname];
        return this.saveSiteSelectors(siteSelectors);
    }
};