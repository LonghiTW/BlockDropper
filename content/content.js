(async () => {
    // 🔧 DOM 元素初始化
    const resultBox = createResultBox();

    // 🧱 Block 色碼資料
    const blocks = await loadBlockColors();

    // 🎨 追蹤前一次選色，避免重複處理
    let lastPicked = null;

    // 📌 滑鼠移動更新提示框位置
    document.addEventListener('mousemove', (e) => {
        updateTooltipPosition(resultBox, e.clientX, e.clientY);
    });

    // 📬 處理來自背景的訊息
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "pickColor") {
			// 當收到 "pickColor" 訊息時，執行 pickColorHandler
            pickColorHandler();
        } else if (msg.action === "clearResult") {
			// 當收到 "clearResult" 訊息時，清除結果
            resultBox.innerHTML = '';
        }
    });

    // 🎯 顏色選擇函式
    async function pickColorHandler() {
        try {
            const { sRGBHex } = await new EyeDropper().open();
            const rgb = utils.hexToRGB(sRGBHex);

            // 若顏色未變化或無效，則不做處理
            if (!rgb || isSameColor(rgb, lastPicked)) return;

            lastPicked = rgb;
            resultBox.innerHTML = '';

            const topMatches = utils.findClosestBlocks(rgb, blocks, 5);
            renderMatches(topMatches, resultBox);

            // 儲存選擇的 Hex 顏色
            chrome.storage.local.set({ hex: sRGBHex });
        } catch (err) {
			if (err instanceof DOMException && err.message.includes("EyeDropper is not available")) {
                // 忽略這個特定錯誤
                console.log("EyeDropper is not available.");
            } else {
                console.error("Error during color pick:", err);
			}
        }
    }

    // ✅ 工具函式區

    // 建立顯示結果的元素
    function createResultBox() {
        const box = document.createElement('div');
        box.id = 'result';
        document.body.appendChild(box);
        return box;
    }

    function updateTooltipPosition(el, x, y) {
        el.style.top = `${y + 10}px`;
        el.style.left = `${x + 10}px`;
    }

    function isSameColor(a, b) {
        return b && a.r === b.r && a.g === b.g && a.b === b.b;
    }

    function renderMatches(matches, container) {
        matches.forEach(block => {
            const img = document.createElement('img');
            img.classList = 'block';
            img.src = chrome.runtime.getURL(`/${block.image}`);
            img.alt = block.id.replace('minecraft:', '');
            container.appendChild(img);
        });
    }

    async function loadBlockColors() {
        try {
            const res = await fetch(chrome.runtime.getURL('blockColors.json'));
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            const data = await res.json();

            return data.map(block => ({
                ...block,
                r: parseInt(block.color.substring(1, 3), 16),
                g: parseInt(block.color.substring(3, 5), 16),
                b: parseInt(block.color.substring(5, 7), 16)
            }));
        } catch (err) {
            console.error("Failed to load blockColors.json:", err);
            return [];
        }
    }
})();
