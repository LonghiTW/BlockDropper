(async () => {
    // 初始化 Tooltip 容器
    const resultBox = createTooltipBox('blockResult');
    const sideResultBox = createTooltipBox('sideBlockResult');

    // 載入方塊色碼資料
    const blocks = await utils.loadBlockColors();

    let screenImage = null;
    let isTracking = false;
    let lastColor = null;
    let lastPicked = null;
    let cancelPickColor = null;

    // 當滑鼠移動時，更新 Tooltip 並即時追蹤顏色
    document.addEventListener('mousemove', (e) => {
        updateTooltipPosition(resultBox, e.clientX, e.clientY);

        if (!isTracking || !screenImage) return;

        const rect = getRectAroundPoint(e.clientX, e.clientY, 10);
        averageColor(screenImage, rect, ({ rgb }) => {
            if (!rgb || isSameColor(rgb, lastColor)) return;
            lastColor = rgb;

            const [topMatch] = utils.findClosestBlocks(rgb, blocks, 1);
            renderMatches([topMatch], resultBox);
        });
    });

    // 接收背景訊息（開始選色 / 清除結果）
    chrome.runtime.onMessage.addListener(({ action }) => {
        if (action === "pickColor") {
            pickColorHandler();
        } else if (action === "clearResult") {
            clearResults();
        }
    });

    // 處理選色邏輯
    async function pickColorHandler() {
        try {
            // 擷取整個畫面畫面作為底圖
            chrome.runtime.sendMessage({ action: "capture" }, (res) => {
                screenImage = new Image();
                screenImage.src = res.dataUrl;
                screenImage.onload = () => (isTracking = true);
            });

            // 等待使用者框選
            const { rgb, hex } = await pickColorFromSelection();
            if (!rgb || isSameColor(rgb, lastPicked)) return;

            lastPicked = rgb;
            const matches = utils.findClosestBlocks(rgb, blocks, 5);
            renderMatches(matches, sideResultBox);

            // 儲存選取顏色
            chrome.storage.local.set({ hex });
        } catch (err) {
            console.error("Error during color pick:", err);
        }
    }

    // 清除所有結果與追蹤狀態
    function clearResults() {
        resultBox.innerHTML = '';
        sideResultBox.innerHTML = '';
        isTracking = false;
        screenImage = null;
        lastColor = null;
        if (cancelPickColor) cancelPickColor();
    }

    // 處理框選邏輯
    async function pickColorFromSelection() {
        return new Promise((resolve) => {
            if (window.__blockDropperOverlay__) return;

            const overlay = createOverlay();
            let startX, startY, selectionBox, rect;

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

                    rect = (!selectionBox.style.width || !selectionBox.style.height)
                        ? getRectAroundPoint(startX, startY, 10)
                        : selectionBox.getBoundingClientRect();

                    overlay.remove();
                    selectionBox.remove();
                    delete window.__blockDropperOverlay__;

                    chrome.runtime.sendMessage({ action: "capture" }, (res) => {
                        const img = new Image();
                        img.src = res.dataUrl;
                        img.onload = () => averageColor(img, rect, resolve);
                    });
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    }

    // 🧰 工具函數區

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

    function getRectAroundPoint(x, y, size = 10) {
        const half = size / 2;
        const left = Math.max(0, Math.min(x - half, window.innerWidth - size));
        const top = Math.max(0, Math.min(y - half, window.innerHeight - size));
        return { left, top, width: size, height: size };
    }

    function averageColor(img, rect, resolve) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;
        const sx = rect.left * scaleX;
        const sy = rect.top * scaleY;
        const sw = rect.width * scaleX;
        const sh = rect.height * scaleY;

        const data = ctx.getImageData(sx, sy, sw, sh).data;
        let r = 0, g = 0, b = 0;
        const total = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }

        r = Math.round(r / total);
        g = Math.round(g / total);
        b = Math.round(b / total);
        resolve({ rgb: { r, g, b }, hex: utils.rgbToHex(r, g, b) });
    }

    function renderMatches(matches, container) {
        container.innerHTML = '';
        matches.forEach(block => {
            const img = document.createElement('img');
            img.className = 'dropperBlock';
            img.src = chrome.runtime.getURL(`/${block.image}`);
            img.alt = block.id.replace('minecraft:', '');
            img.title = img.alt;

            img.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(img.alt);
                    img.style.outline = '2px solid limegreen';
                    setTimeout(() => img.style.outline = '', 500);
                } catch (err) {
                    console.error("Clipboard error:", err);
                }
            });

            container.appendChild(img);
        });
    }

    function isSameColor(a, b) {
        return b && a.r === b.r && a.g === b.g && a.b === b.b;
    }
})();
