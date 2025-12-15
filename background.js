/* ======================================================
 *  Imports
 * ====================================================== */

importScripts('utils.js');


/* ======================================================
 *  Browser API Polyfill
 * ====================================================== */

// Ensure `browser` API compatibility (Chrome / Firefox)
if (typeof browser === 'undefined') {
    var browser = chrome;
}


/* ======================================================
 *  Blocks Data Cache & Initialization
 * ====================================================== */

// Cached and processed block color data
let blocksDataCache = null;

/**
 * Load and cache block color data.
 * This function guarantees the data is loaded only once.
 */
async function initializeBlocksData() {
    if (blocksDataCache === null) {
        console.log(
            'Service Worker: Loading and processing block data (may take some time)...'
        );

        blocksDataCache = await utils.loadBlockData();

        console.log(
            `Service Worker: Loaded ${blocksDataCache.length} blocks successfully.`
        );
    }

    return blocksDataCache;
}

// Preload block data as soon as the Service Worker starts
initializeBlocksData();


/* ======================================================
 *  Helper Functions
 * ====================================================== */

// Send a message to the currently active tab
function sendMessageToActiveTab(message) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) return;
        browser.tabs.sendMessage(tabs[0].id, message);
    });
}


/* ======================================================
 *  Command Shortcuts Listener
 * ====================================================== */

browser.commands.onCommand.addListener((command) => {
    switch (command) {
        case 'pick-from-webpage':
            sendMessageToActiveTab({ action: 'pickColor' });
            break;

        case 'clear-result':
            sendMessageToActiveTab({ action: 'clearResult' });
            break;
    }
});


/* ======================================================
 *  Runtime Message Listener
 * ====================================================== */

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    /* ----------------------------------------------
     *  Screen Capture Request
     * ---------------------------------------------- */

    if (msg.action === 'capture') {
        browser.tabs.captureVisibleTab(
            null,
            { format: 'png' },
            (dataUrl) => {
                sendResponse({ dataUrl });
            }
        );

        // Keep the message channel open for async response
        return true;
    }


    /* ----------------------------------------------
     *  Popup: Request Block Data
     * ---------------------------------------------- */

    if (msg.action === 'getBlocksData') {
        initializeBlocksData()
            .then((blocks) => {
                sendResponse({ blocks });
            })
            .catch((err) => {
                console.error(
                    'Service Worker: Failed to provide blocks data:',
                    err
                );
                sendResponse({ blocks: [] });
            });

        return true;
    }


    /* ----------------------------------------------
     *  Popup: Find Closest Blocks by Color
     * ---------------------------------------------- */

    if (msg.action === 'findClosest') {
        const targetLab = msg.lab;
        const filters = msg.filters;

        /**
         * Apply tag filters and find closest color matches.
         */
        const filterAndFind = async () => {
            const allBlocks = await initializeBlocksData();

            // 1. Split into Blocks and Decorations
            const blocksList = allBlocks.filter(
                b => b.tags?.includes('block')
            );

            let decorationsList = allBlocks.filter(
                b => !b.tags || !b.tags.includes('block')
            );

            // 2. Apply tri-state filters to Decorations
            decorationsList = decorationsList.filter(block => {
                const tags = block.tags || [];

                for (const tag in filters) {
                    const mode = filters[tag]; // 'none' | 'include' | 'exclude'

                    if (mode === 'include' && !tags.includes(tag)) {
                        return false;
                    }

                    if (mode === 'exclude' && tags.includes(tag)) {
                        return false;
                    }
                }

                return true;
            });

            // 3. Compute color matches
            return {
                blocks: utils.findClosestBlocks(targetLab, blocksList),
                decorations: utils.findClosestBlocks(targetLab, decorationsList),
            };
        };

        filterAndFind()
            .then((results) => {
                sendResponse({ results });
            })
            .catch((err) => {
                console.error(
                    'Service Worker: Error finding closest blocks:',
                    err
                );
                sendResponse({
                    results: { blocks: [], decorations: [] },
                });
            });

        return true;
    }
});
