/* ======================================================
 *  browserAPI API Polyfill
 * ====================================================== */

// Ensure `browserAPI` API compatibility (Chrome / Firefox)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;


/* ======================================================
 *  Imports
 * ====================================================== */

if (typeof utils === 'undefined') {
    importScripts('utils.js');
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
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) return;
        browserAPI.tabs.sendMessage(tabs[0].id, message);
    });
}


/* ======================================================
 *  Command Shortcuts Listener
 * ====================================================== */

browserAPI.commands.onCommand.addListener((command) => {
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

browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    /* ----------------------------------------------
     *  Screen Capture Request
     * ---------------------------------------------- */

    if (msg.action === 'capture') {
        const capturing = browserAPI.tabs.captureVisibleTab(null, { format: 'png' });
    
        // 兼容 Promise (Firefox) 與 Callback (Chrome)
        if (capturing && capturing.then) {
            capturing.then(dataUrl => sendResponse({ dataUrl }));
        } else {
            // Chrome 走法
            browserAPI.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                sendResponse({ dataUrl });
            });
        }

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
            const { blocks, decorations } = await initializeBlocksData();
        
            // 1. Blocks 直接用，不需要 filter
            const blocksList = blocks; 
        
            // 2. 僅針對 Decorations 進行標籤過濾
            const filteredDecorations = decorations.filter(item => {
                const tags = item.tags || [];
                for (const tag in filters) {
                    const mode = filters[tag];
                    if (mode === 'include' && !tags.includes(tag)) return false;
                    if (mode === 'exclude' && tags.includes(tag)) return false;
                }
                return true;
            });
        
            return {
                blocks: utils.findClosestBlocks(targetLab, blocksList),
                decorations: utils.findClosestBlocks(targetLab, filteredDecorations),
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
