// 全域變數
let blocks = [];
let currentMode = 'rgb'; // 預設顏色模式為 RGB

// 讀取 blockColors.json 資料
async function loadBlockColors() {
    try {
        const response = await fetch(chrome.runtime.getURL('blockColors.json'));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

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

// 顏色模式選擇區的樣式
const modeButtons = document.querySelectorAll('#colorModeButtons button');

// 創建顯示結果的元素
const result = document.getElementById('result');
const input = document.getElementById('input');
const hexValue = document.getElementById('hexValue');
const pickedList = document.getElementById('pickedList');

// 色彩滑桿元素
let xSlider, ySlider, zSlider;
let xValue, yValue, zValue;

// 變更顏色模式按鈕的樣式，並設定選中狀態
function updateColorModeButtonStyle(mode) {
    modeButtons.forEach(button => {
        if (button.id === mode + 'Button') {
            button.classList.add('active');  // 增加 active 類別
        } else {
            button.classList.remove('active');  // 移除 active 類別
        }
    });
}

// 初始化顏色模式按鈕
modeButtons.forEach(button => {
    button.addEventListener('click', () => {
        const mode = button.id.replace('Button', ''); // 從按鈕的 id 中提取顏色模式名稱
        updateColorMode(mode);  // 更新顏色模式
        updateColorModeButtonStyle(mode);  // 更新選中按鈕的樣式
        chrome.storage.local.set({ colorMode: mode }); // 儲存選擇的顏色模式
    });
});

// 初始化時設定顏色模式
document.getElementById('rgbButton').addEventListener('click', () => updateColorMode('rgb'));
document.getElementById('hslButton').addEventListener('click', () => updateColorMode('hsl'));
document.getElementById('hsvButton').addEventListener('click', () => updateColorMode('hsv'));

// 設定顏色模式的滑桿範圍和標籤
function updateColorMode(mode) {
    // 確保 mode 是有效的顏色模式，否則設置為預設的 'rgb'
    if (!['rgb', 'hsl', 'hsv'].includes(mode)) {
        console.error(`Invalid color mode: ${mode}. Defaulting to 'rgb'.`);
        mode = 'rgb';  // 預設為 'rgb'
    }

    currentMode = mode;

    const modeSettings = {
        rgb: {
            labels: ['R:', 'G:', 'B:'],
            ranges: [255, 255, 255],
            backgroundColor: 'rgb(0, 0, 0)' // RGB 顯示的背景顏色
        },
        hsl: {
            labels: ['H:', 'S:', 'L:'],
            ranges: [359, 100, 100],
            backgroundColor: 'hsl(0, 100%, 50%)' // HSL 顯示的背景顏色
        },
        hsv: {
            labels: ['H:', 'S:', 'V:'],
            ranges: [359, 100, 100],
            backgroundColor: 'hsv(0, 100%, 50%)' // HSV 顯示的背景顏色
        }
    };

    const settings = modeSettings[mode];  // 確保 `settings` 會存在

    // 更新標籤
    document.querySelectorAll('label').forEach((label, index) => {
        label.textContent = settings.labels[index];
    });

    // 更新滑桿範圍
    xSlider.max = settings.ranges[0];
    ySlider.max = settings.ranges[1];
    zSlider.max = settings.ranges[2];

    // 更新數字框範圍
    xValue.max = settings.ranges[0];
    yValue.max = settings.ranges[1];
    zValue.max = settings.ranges[2];

    // 更新選中按鈕的樣式
    updateColorModeButtonStyle(mode);

    // 根據當前的顏色模式設置滑桿數值
    const hex = document.getElementById('input').value;
    setSlidersFromHex(hex);
}

// 設置滑桿並根據顏色模式設置對應值
function setSlidersFromHex(hex) {
    const { r, g, b } = utils.hexToRGB(hex);

    if (currentMode === 'rgb') {
        // 如果是 RGB 模式，直接設置 RGB 滑桿
        xSlider.value = r;
        ySlider.value = g;
        zSlider.value = b;
        xValue.value = r;
        yValue.value = g;
        zValue.value = b;
    } else if (currentMode === 'hsl') {
        // 如果是 HSL 模式，先將 Hex 轉為 RGB，然後再轉為 HSL
        const hsl = utils.rgbToHSL(r, g, b);
        xSlider.value = hsl.h;
        ySlider.value = hsl.s;
        zSlider.value = hsl.l;
        xValue.value = hsl.h;
        yValue.value = hsl.s;
        zValue.value = hsl.l;
    } else if (currentMode === 'hsv') {
        // 如果是 HSV 模式，先將 Hex 轉為 RGB，再轉為 HSL，然後轉為 HSV
        const hsl = utils.rgbToHSL(r, g, b);
        const hsv = utils.hslToHSV(hsl.h, hsl.s, hsl.l);
        xSlider.value = hsv.h;
        ySlider.value = hsv.s;
        zSlider.value = hsv.v;
        xValue.value = hsv.h;
        yValue.value = hsv.s;
        zValue.value = hsv.v;
    }
}

// 計算顏色距離並顯示對應圖片
function showBlocks(rgb, blocks, containerElement) {
    // 計算顏色距離
    const closestBlocks = utils.findClosestBlocks(rgb, blocks);
    // 顯示對應圖片
    closestBlocks.forEach((block) => {
        const blockContainer = document.createElement('div');
        blockContainer.classList.add('block-container');

        // 方塊圖片
        const img = document.createElement('img');
        img.src = chrome.runtime.getURL(`/${block.image}`);  // 修改為 block 資料夾中的圖片
        img.alt = block.id.replace('minecraft:', '');  // 使用 block.id 作為圖片的 alt 文字
        img.classList.add('block-image');  // 為圖片新增class

        // 方塊ID文字
        const blockId = document.createElement('div');
        blockId.textContent = img.alt;

        // 顯示顏色區塊
        const colorBlock = document.createElement('div');
        colorBlock.textContent = block.color;
        colorBlock.classList.add('block-color');  // 顏色區塊的 class

        // 組合內容
        const infoContainer = document.createElement('div');
        infoContainer.classList.add('block-info');  // 文字內容的區塊

        // 把圖片、ID和顏色加進容器
        infoContainer.appendChild(blockId);
        infoContainer.appendChild(colorBlock);

        // 在 blockContainer 裡加上圖片和信息
        blockContainer.appendChild(img);
        blockContainer.appendChild(infoContainer);
        containerElement.appendChild(blockContainer);
    });
}

// 更新顯示 RGB 的結果
function changeRGBResult(rgb) {
    result.innerHTML = '';  // 清空結果顯示
    pickedList.innerHTML = ''; // 清空 pickedList

    if (rgb && blocks.length > 0) {
        // 使用通用函數來計算顏色距離並顯示圖片
        showBlocks(rgb, blocks, result);
    }
}

// 更新顯示 HSL 的結果
function changeHSLResult(hsl) {
    result.innerHTML = '';  // 清空結果顯示
    pickedList.innerHTML = ''; // 清空 pickedList

    if (hsl && blocks.length > 0) {
        // 先將 HSL 轉為 RGB
        const rgb = utils.hslToRGB(hsl.h, hsl.s, hsl.l);

        // 使用通用函數來計算顏色距離並顯示圖片
        showBlocks(rgb, blocks, result);
    }
}

// 更新顯示 HSV 的結果
function changeHSVResult(hsv) {
    result.innerHTML = '';  // 清空結果顯示
    pickedList.innerHTML = ''; // 清空 pickedList

    if (hsv && blocks.length > 0) {
        // 先將 HSV 轉為 RGB
        const hsl = utils.hsvToHSL(hsv.h, hsv.s, hsv.v); // 先將 HSV 轉為 HSL
        const rgb = utils.hslToRGB(hsl.h, hsl.s, hsl.l); // 再將 HSL 轉為 RGB

        // 使用通用函數來計算顏色距離並顯示圖片
        showBlocks(rgb, blocks, result);
    }
}

// 更新顏色顯示
function changeResult(value) {
    const rgb = utils.hexToRGB(value);
    
    // 根據當前顏色模式顯示結果
    if (currentMode === 'rgb') {
        changeRGBResult(rgb);
    } else if (currentMode === 'hsl') {
        const hsl = utils.rgbToHSL(rgb.r, rgb.g, rgb.b);
        changeHSLResult(hsl);
    } else if (currentMode === 'hsv') {
        const hsl = utils.rgbToHSL(rgb.r, rgb.g, rgb.b);
        const hsv = utils.hslToHSV(hsl.h, hsl.s, hsl.l);
        changeHSVResult(hsv);
    }
}

// 更新顏色並顯示結果
function updateColorFromSliders() {
    const r = xSlider.value;
    const g = ySlider.value;
    const b = zSlider.value;

    // 根據當前模式（RGB, HSL, HSV）處理不同邏輯
    if (currentMode === 'rgb') {
        // 如果是 RGB 模式，直接更新 RGB
        xValue.value = r;
        yValue.value = g;
        zValue.value = b;
        const hex = utils.rgbToHex(r, g, b);
        chrome.storage.local.set({ hex });
        document.getElementById('input').value = hex;
        changeResult(hex);  // 更新結果顯示
    } 
    else if (currentMode === 'hsl') {
        // 如果是 HSL 模式，直接從 HSL 滑桿數值設定更新
        const h = xSlider.value;
        const s = ySlider.value;
        const l = zSlider.value;

        // 更新顯示的 HSL 和 Hex 值
        xValue.value = h;
        yValue.value = s;
        zValue.value = l;
        const rgb = utils.hslToRGB(h, s, l);  // 將 HSL 轉換為 RGB
        const hex = utils.rgbToHex(rgb.r, rgb.g, rgb.b);
        chrome.storage.local.set({ hex });
        document.getElementById('input').value = hex;
        changeResult(hex);  // 更新結果顯示
    } 
    else if (currentMode === 'hsv') {
        // 如果是 HSV 模式，直接從 HSV 滑桿數值設定更新
        const h = xSlider.value;
        const s = ySlider.value;
        const v = zSlider.value;

        // 更新顯示的 HSV 和 Hex 值
        xValue.value = h;
        yValue.value = s;
        zValue.value = v;
        const hsl = utils.hsvToHSL(h, s, v);  // 先將 HSV 轉為 HSL
        const rgb = utils.hslToRGB(hsl.h, hsl.s, hsl.l);  // 然後將 HSL 轉為 RGB
        const hex = utils.rgbToHex(rgb.r, rgb.g, rgb.b);
        chrome.storage.local.set({ hex });
        document.getElementById('input').value = hex;
        changeResult(hex);  // 更新結果顯示
    }
}

// 事件監聽：滑桿輸入
function initializeSliders() {
    xSlider = document.getElementById('xSlider');
    ySlider = document.getElementById('ySlider');
    zSlider = document.getElementById('zSlider');
    
    xValue = document.getElementById('xValue');
    yValue = document.getElementById('yValue');
    zValue = document.getElementById('zValue');
    
    // 為每個滑桿和數字框設定事件監聽器
    xSlider.addEventListener('input', updateColorFromSliders);
    ySlider.addEventListener('input', updateColorFromSliders);
    zSlider.addEventListener('input', updateColorFromSliders);

    // 當數字輸入框變動時，更新滑桿
    xValue.addEventListener('input', () => {
        xSlider.value = xValue.value;
        updateColorFromSliders();
    });
    yValue.addEventListener('input', () => {
        ySlider.value = yValue.value;
        updateColorFromSliders();
    });
    zValue.addEventListener('input', () => {
        zSlider.value = zValue.value;
        updateColorFromSliders();
    });
}

// 當內建顏色選擇器變更時
input.addEventListener('change', () => {
    const value = input.value;
    changeResult(value);
    setSlidersFromHex(value); // 更新滑桿顏色
});

// 當 popup 載入時，從 chrome.storage 讀取 hex 和 picked 資料
async function initialize() {
    // 先載入 blockColors.json 資料
    await loadBlockColors();

    // 讀取 chrome storage 中儲存的顏色模式
    chrome.storage.local.get(['hex', 'colorMode'], (data) => {
        const { hex, colorMode } = data;  // 從儲存資料中解構取得 hex 和 colorMode

        // 確保 colorMode 是有效的顏色模式（'rgb', 'hsl', 'hsv'），否則使用預設模式
        const validModes = ['rgb', 'hsl', 'hsv'];
        const mode = validModes.includes(colorMode) ? colorMode : 'rgb';

        // 初始化顏色模式
        updateColorMode(mode);  // 根據儲存的顏色模式來更新顏色模式

        // 更新顏色模式按鈕樣式
        updateColorModeButtonStyle(mode);

        // 設定 hex 值並更新顏色顯示
        if (hex) {
            document.getElementById('hexValue').textContent = `${hex}`;
            document.getElementById('input').value = hex;
            changeResult(hex);
            setSlidersFromHex(hex);
        }
    });

    // 初始化顏色模式按鈕
    initializeModeButtons();
}

// 初始化顏色模式按鈕事件
function initializeModeButtons() {
    // 確保 DOM 內容已經加載完成後再設置事件
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.id.replace('Button', ''); // 從按鈕的 id 中提取顏色模式名稱
            updateColorMode(mode);  // 更新顏色模式
            updateColorModeButtonStyle(mode);  // 更新選中按鈕的樣式

            // 儲存選擇的顏色模式
            chrome.storage.local.set({ colorMode: mode });
        });
    });
}

// 當 DOM 內容載入完成後，呼叫 initialize 函式
document.addEventListener('DOMContentLoaded', () => {
    initializeSliders();
    initialize();
});
