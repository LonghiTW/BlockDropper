// ===== 全域變數 =====
let blocks = [];
let currentMode = 'rgb'; // 預設模式

// 元素快取
const result = document.getElementById('result');
const input = document.getElementById('input');
const hexValue = document.getElementById('hexValue');
const pickedList = document.getElementById('pickedList');
const modeButtons = document.querySelectorAll('#colorModeButtons button');

let xSlider, ySlider, zSlider;
let xValue, yValue, zValue;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
    cacheSliderElements();
    bindSliderEvents();
    await loadBlockColors();
    await restoreStoredSettings();
    bindModeButtonEvents();
    bindInputColorPicker();
});

// ===== DOM 元素初始化 =====
function cacheSliderElements() {
    xSlider = document.getElementById('xSlider');
    ySlider = document.getElementById('ySlider');
    zSlider = document.getElementById('zSlider');

    xValue = document.getElementById('xValue');
    yValue = document.getElementById('yValue');
    zValue = document.getElementById('zValue');
}

function bindSliderEvents() {
    const updateFromSlider = () => updateColorFromSliders();

    [xSlider, ySlider, zSlider].forEach(slider => slider.addEventListener('input', updateFromSlider));
    [xValue, yValue, zValue].forEach((inputEl, idx) => {
        const sliders = [xSlider, ySlider, zSlider];
        inputEl.addEventListener('input', () => {
            sliders[idx].value = inputEl.value;
            updateFromSlider();
        });
    });
}

// ===== 載入資料與儲存 =====
async function loadBlockColors() {
    try {
        const res = await fetch(chrome.runtime.getURL('blockColors.json'));
        const data = await res.json();
        blocks = data.map(block => ({
            ...block,
            r: parseInt(block.color.slice(1, 3), 16),
            g: parseInt(block.color.slice(3, 5), 16),
            b: parseInt(block.color.slice(5, 7), 16),
        }));
        console.log(`Loaded ${blocks.length} blocks.`);
    } catch (err) {
        console.error('Failed to load block colors:', err);
    }
}

async function restoreStoredSettings() {
    chrome.storage.local.get(['hex', 'colorMode'], ({ hex = '#000000', colorMode = 'rgb' }) => {
        currentMode = ['rgb', 'hsl', 'hsv'].includes(colorMode) ? colorMode : 'rgb';
        input.value = hex;
        hexValue.textContent = hex;
        updateColorMode(currentMode);
        updateColorFromHex(hex);
    });
}

// ===== 顏色模式處理 =====
function bindModeButtonEvents() {
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.id.replace('Button', '');
            updateColorMode(mode);
            chrome.storage.local.set({ colorMode: mode });
        });
    });
}

function updateColorMode(mode) {
    currentMode = mode;
    const settings = {
        rgb: { labels: ['R:', 'G:', 'B:'], ranges: [255, 255, 255] },
        hsl: { labels: ['H:', 'S:', 'L:'], ranges: [359, 100, 100] },
        hsv: { labels: ['H:', 'S:', 'V:'], ranges: [359, 100, 100] }
    }[mode];

    // 更新按鈕樣式
    modeButtons.forEach(btn => btn.classList.toggle('active', btn.id === mode + 'Button'));

    // 更新標籤
    document.querySelectorAll('label').forEach((label, i) => {
        label.textContent = settings.labels[i];
    });

    // 更新滑桿範圍
    [xSlider, ySlider, zSlider].forEach((slider, i) => slider.max = settings.ranges[i]);
    [xValue, yValue, zValue].forEach((val, i) => val.max = settings.ranges[i]);

    // 更新目前 hex 對應的滑桿數值
    updateColorFromHex(input.value);
}

// ===== 顏色來源更新 =====
function updateColorFromHex(hex) {
    const rgb = utils.hexToRGB(hex);
    const { r, g, b } = rgb;

    if (currentMode === 'rgb') {
        setSliderValues([r, g, b]);
    } else if (currentMode === 'hsl') {
        const hsl = utils.rgbToHSL(r, g, b);
        setSliderValues([hsl.h, hsl.s, hsl.l]);
    } else {
        const hsl = utils.rgbToHSL(r, g, b);
        const hsv = utils.hslToHSV(hsl.h, hsl.s, hsl.l);
        setSliderValues([hsv.h, hsv.s, hsv.v]);
    }

    changeResult(hex);
}

function updateColorFromSliders() {
    let rgb;

    if (currentMode === 'rgb') {
        rgb = {
            r: Number(xSlider.value),
            g: Number(ySlider.value),
            b: Number(zSlider.value)
        };
    } else if (currentMode === 'hsl') {
        rgb = utils.hslToRGB(xSlider.value, ySlider.value, zSlider.value);
    } else {
        const hsl = utils.hsvToHSL(xSlider.value, ySlider.value, zSlider.value);
        rgb = utils.hslToRGB(hsl.h, hsl.s, hsl.l);
    }

    const hex = utils.rgbToHex(rgb.r, rgb.g, rgb.b);
    input.value = hex;
    hexValue.textContent = hex;
    chrome.storage.local.set({ hex });
    changeResult(hex);
}

function setSliderValues([x, y, z]) {
    [xSlider.value, ySlider.value, zSlider.value] = [x, y, z];
    [xValue.value, yValue.value, zValue.value] = [x, y, z];
}

// ===== 結果更新邏輯 =====
function changeResult(hex) {
    const rgb = utils.hexToRGB(hex);
    result.innerHTML = '';
    pickedList.innerHTML = '';

    showBlocks(rgb, blocks, result);
}

function showBlocks(rgb, blocks, container) {
    const closest = utils.findClosestBlocks(rgb, blocks);
    closest.forEach(block => {
        const div = document.createElement('div');
        div.className = 'block-container';

        const img = document.createElement('img');
        img.src = chrome.runtime.getURL(`/${block.image}`);
        img.alt = block.id.replace('minecraft:', '');
        img.className = 'block-image';

        const idText = document.createElement('div');
        idText.textContent = img.alt;

        const colorBox = document.createElement('div');
        colorBox.textContent = block.color;
        colorBox.className = 'block-color';

        const info = document.createElement('div');
        info.className = 'block-info';
        info.append(idText, colorBox);

        div.append(img, info);
        container.appendChild(div);
    });
}

// ===== 顏色選擇器事件 =====
function bindInputColorPicker() {
    input.addEventListener('change', () => {
        const hex = input.value;
        updateColorFromHex(hex);
    });
}
