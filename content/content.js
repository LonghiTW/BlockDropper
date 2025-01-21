// 1. 讀取 blockColor.json 資料
let blocks = [];

// 改用 async/await 載入檔案
async function loadBlockColors() {
    try {
        const response = await fetch(chrome.runtime.getURL('blockColors.json'));
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        blocks = data.map(block => ({
            ...block,
            r: parseInt(block.color.substring(1, 3), 16),
            g: parseInt(block.color.substring(3, 5), 16),
            b: parseInt(block.color.substring(5, 7), 16),
        }));
        console.log('Block colors loaded:', blocks.length);
    } catch (error) {
        console.error('Error loading blockColors.json:', error);
    }
}

// 初始化時載入
loadBlockColors();

// 2. 創建顯示結果的元素
const result = document.createElement('div');
result.id = 'result';
document.body.appendChild(result);

// 3. 預設顏色
let prev = { r: 255, g: 255, b: 255 };

// 顏色轉換函式：Hex -> RGB
function hextoRGB(hex) {
    return {
        r: parseInt(hex.substring(1, 3), 16),
        g: parseInt(hex.substring(3, 5), 16),
        b: parseInt(hex.substring(5, 7), 16),
    };
}

// 4. 鼠標移動事件，顯示顏色選擇框的位置
document.addEventListener('mousemove', async (e) => {
    const { clientX, clientY } = e;
    const result = document.getElementById('result');
    result.style.top = `${clientY + 10}px`;
    result.style.left = `${clientX + 10}px`;
});

// 5. 訊息監聽器，接收來自背景頁面的訊息
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "pickColor") {
        // 當收到 "pickColor" 訊息時，執行 handlePickColor
        handlePickColor();
    }
});

// 6. 顏色選擇函式
function handlePickColor() {
    let eyedropper = new EyeDropper();
    eyedropper.open().then((color) => {
        let hex = color.sRGBHex;
        let rgb = hextoRGB(hex);
    
        try {
            // 若顏色未變化或無效，則不做處理
            if (isNaN(rgb.r) || isNaN(rgb.g) || isNaN(rgb.b)) return;
            if (prev && prev.r === rgb.r && prev.g === rgb.g && prev.b === rgb.b) return;

            prev = rgb;
            result.innerHTML = '';

            // 計算顏色距離
            const distance = blocks.map((block) => {
                const distance = Math.sqrt(
                    Math.pow(block.r - rgb.r, 2) +
                    Math.pow(block.g - rgb.g, 2) +
                    Math.pow(block.b - rgb.b, 2),
                );
            return { ...block, distance };
            });

            // 根據顏色距離排序，選擇前5個最接近的顏色
            distance.sort((a, b) => a.distance - b.distance);
            distance.slice(0, 5).forEach(async (block) => {
                const img = document.createElement('img');
                img.classList = 'block';
                img.src = chrome.runtime.getURL(`/${block.image}`);
                img.alt = block.id.replace('minecraft:', ''); // 使用 block.id 存儲該物件的名稱
                result.appendChild(img);
            });

            // 儲存選擇的 Hex 顏色
            chrome.storage.local.set({ hex });
        } catch (e) {
            console.error("Error in handlePickColor:", e);
        }
    });
}

// 7. 按鍵事件，按下 Esc 清除結果
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        result.innerHTML = '';
    }
});
