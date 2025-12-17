/* ======================================================
 *  browserAPI API Polyfill
 * ====================================================== */

// Ensure `browserAPI` API compatibility (Chrome / Firefox)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;


(async () => {
    /* ======================================================
     *  State Management
     * ====================================================== */

    let screenImage = null;        // Captured screenshot image
    let isTracking = false;        // Whether live color tracking is enabled
    let lastColor = null;          // Last tracked color (mousemove)
    let lastPicked = null;         // Last picked color (selection)
    let cancelPickColor = null;    // Cancel handler for selection mode


    /* ======================================================
     *  Initialization
     * ====================================================== */

    // Tooltip containers for live result and final selection
    const resultBox = createTooltipBox('blockResult');
    const sideResultBox = createTooltipBox('sideBlockResult');

    // Load block color reference data
    const blocks = await utils.loadBlockData();


    /* ======================================================
     *  Global Event Listeners
     * ====================================================== */

    // Track mouse movement for live color detection
    document.addEventListener('mousemove', (e) => {
        updateTooltipPosition(resultBox, e.clientX, e.clientY);

        if (!isTracking || !screenImage) return;

        const rect = getRectAroundPoint(e.clientX, e.clientY, 10);

        utils.averageColor(screenImage, rect, (colorData) => {
            if (!colorData.rgb || isSameColor(colorData.rgb, lastColor)) return;

            lastColor = colorData.rgb;
            const [topMatch] = utils.findClosestBlocks(
                colorData.lab,
                blocks,
                1,
                'block'
            );

            renderMatches([topMatch], resultBox);
        });
    });

    // Listen for messages from background script
    browserAPI.runtime.onMessage.addListener(({ action }) => {
        if (action === 'pickColor') {
            pickColorHandler();
        } else if (action === 'clearResult') {
            clearResults();
        }
    });


    /* ======================================================
     *  Core Logic
     * ====================================================== */

    // Handle color picking workflow
    async function pickColorHandler() {
        try {
            // Capture current screen as reference image
            browserAPI.runtime.sendMessage({ action: 'capture' }, (res) => {
                screenImage = new Image();
                screenImage.src = res.dataUrl;
                screenImage.onload = () => (isTracking = true);
            });

            // Wait for user selection
            const colorData = await pickColorFromSelection();
            if (!colorData.rgb || isSameColor(colorData.rgb, lastPicked)) return;

            lastPicked = colorData.rgb;

            const matches = utils.findClosestBlocks(
                colorData.lab,
                blocks,
                5,
                'block'
            );

            renderMatches(matches, sideResultBox);

            // Persist selected color
            browserAPI.storage.local.set({ hex: colorData.hex });
        } catch (err) {
            console.error('Error during color pick:', err);
        }
    }

    // Reset UI state and tracking
    function clearResults() {
        resultBox.innerHTML = '';
        sideResultBox.innerHTML = '';
        isTracking = false;
        screenImage = null;
        lastColor = null;

        if (cancelPickColor) cancelPickColor();
    }


    /* ======================================================
     *  Selection Logic
     * ====================================================== */

    // Handle drag selection or click-based color picking
    function pickColorFromSelection() {
        return new Promise((resolve) => {
            if (window.__blockDropperOverlay__) return;

            const overlay = createOverlay();
            let startX, startY;
            let selectionBox, rect;

            // Allow external cancellation
            cancelPickColor = () => {
                overlay.remove();
                selectionBox?.remove();
                delete window.__blockDropperOverlay__;
                cancelPickColor = null;
            };

            overlay.addEventListener('mousedown', (e) => {
                startX = e.clientX;
                startY = e.clientY;

                selectionBox = createSelectionBox();
                document.body.appendChild(selectionBox);

                const onMouseMove = (e) => {
                    const x = Math.min(e.clientX, startX);
                    const y = Math.min(e.clientY, startY);
                    const w = Math.abs(e.clientX - startX);
                    const h = Math.abs(e.clientY - startY);

                    Object.assign(selectionBox.style, {
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${w}px`,
                        height: `${h}px`,
                    });
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    // Use click-based sampling if no drag size exists
                    rect = (!selectionBox.style.width || !selectionBox.style.height)
                        ? getRectAroundPoint(startX, startY, 10)
                        : selectionBox.getBoundingClientRect();

                    overlay.remove();
                    selectionBox.remove();
                    delete window.__blockDropperOverlay__;

                    utils.averageColor(screenImage, rect, resolve);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    }


    /* ======================================================
     *  Utility Functions
     * ====================================================== */

    function createTooltipBox(id) {
        const el = document.createElement('div');
        el.id = id;
        document.body.appendChild(el);
        return el;
    }

    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'blockDropperOverlay';
        document.body.appendChild(overlay);
        window.__blockDropperOverlay__ = overlay;
        return overlay;
    }

    function createSelectionBox() {
        const box = document.createElement('div');
        box.id = 'selectionBox';
        return box;
    }

    // Position tooltip while keeping it inside viewport
    function updateTooltipPosition(el, x, y) {
        const padding = 10;
        const width = el.offsetWidth || 150;
        const height = el.offsetHeight || 50;

        let left = x + padding;
        let top = y + padding;

        if (left + width > window.innerWidth) left = x - width - padding;
        if (top + height > window.innerHeight) top = y - height - padding;

        el.style.position = 'fixed';
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    // Create a sampling rectangle centered at a point
    function getRectAroundPoint(x, y, size = 10) {
        const half = size / 2;
        const left = Math.max(0, Math.min(x - half, window.innerWidth - size));
        const top = Math.max(0, Math.min(y - half, window.innerHeight - size));

        return { left, top, width: size, height: size };
    }

    // Render matched blocks into a container
    function renderMatches(matches, container) {
        container.innerHTML = '';

        matches.forEach(block => {
            const img = document.createElement('img');
            img.className = 'dropperBlock';
            img.src = block.image;
            img.alt = block.id;
            img.title = block.id;

            // Copy block ID on click
            img.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(block.id);
                    img.style.outline = '2px solid limegreen';
                    setTimeout(() => (img.style.outline = ''), 500);
                } catch (err) {
                    console.error('Clipboard error:', err);
                }
            });

            container.appendChild(img);
        });
    }

    // Compare two RGB colors for equality
    function isSameColor(a, b) {
        return b && a.r === b.r && a.g === b.g && a.b === b.b;
    }
})();
