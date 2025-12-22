/* ======================================================
 *  Browser API Polyfill
 * ====================================================== */

if (typeof browser === 'undefined') {
    var browser = chrome;
}


/* ======================================================
 *  Global State
 * ====================================================== */

let blocks = [];                     // Cached block data
let currentMode = 'rgb';             // Active color mode
let currentFilters = {               // Tri-state filter state
    vertical: 'none',
    horizontal: 'none',
    translucent: 'none',
};


/* ======================================================
 *  DOM Element Cache
 * ====================================================== */

const result = document.getElementById('result');
const blocksResult = document.getElementById('blocksResult');
const decorationResult = document.getElementById('decorationResult');

const input = document.getElementById('input');
const hexValue = document.getElementById('hexValue');
const pickedList = document.getElementById('pickedList');

const modeButtons = document.querySelectorAll('#colorModeButtons button');
const filterButtons = document.querySelectorAll('.filter-button');

let xSlider, ySlider, zSlider;
let xValue, yValue, zValue;


/* ======================================================
 *  Background Communication
 * ====================================================== */

// Request cached block data from Service Worker
async function getBlocksDataFromBackground() {
    try {
        const response = await browser.runtime.sendMessage({
            action: 'getBlocksData',
        });

        if (response?.blocks) {
            console.log(
                'Popup: Successfully received blocks data from Service Worker.'
            );
            return response.blocks;
        }
    } catch (err) {
        console.error(
            'Popup: Failed to receive blocks data from background:',
            err
        );
    }

    return [];
}

// Delegate expensive color matching to Service Worker
async function getClosestBlocksFromBackground(lab) {
    try {
        const response = await browser.runtime.sendMessage({
            action: 'findClosest',
            lab,
            filters: currentFilters,
        });

        if (response?.results) {
            showBlocks(response.results.blocks, blocksResult);
            showBlocks(response.results.decorations, decorationResult);
        } else {
            blocksResult.innerHTML = '';
            decorationResult.innerHTML = '';
        }
    } catch (err) {
        console.error('Popup: Error fetching closest blocks:', err);
        blocksResult.innerHTML = '';
        decorationResult.innerHTML = '';
    }
}


/* ======================================================
 *  Initialization
 * ====================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    cacheSliderElements();
    bindSliderEvents();
    bindFilterEvents();
    bindModeButtonEvents();
    bindInputColorPicker();

    // Load cached block data from background
    blocks = await getBlocksDataFromBackground();

    await restoreStoredSettings();
    initializeFilterDisplay();

    updateColorMode(currentMode);

    // Restore last color state
    if (input.value) {
        updateColorFromHex(input.value);
    }
});


/* ======================================================
 *  Slider & Input Binding
 * ====================================================== */

function cacheSliderElements() {
    xSlider = document.getElementById('xSlider');
    ySlider = document.getElementById('ySlider');
    zSlider = document.getElementById('zSlider');

    xValue = document.getElementById('xValue');
    yValue = document.getElementById('yValue');
    zValue = document.getElementById('zValue');
}

// Sync sliders and numeric inputs bi-directionally
function bindSliderEvents() {
    const sliders = [xSlider, ySlider, zSlider];
    const values = [xValue, yValue, zValue];

    const updateFromSlider = () => updateColorFromSliders();

    sliders.forEach((slider, i) => {
        slider.addEventListener('input', () => {
            values[i].value = slider.value;
            updateFromSlider();
        });
    });

    values.forEach((inputEl, i) => {
        inputEl.addEventListener('input', () => {
            sliders[i].value = inputEl.value;
            updateFromSlider();
        });
    });
}


/* ======================================================
 *  Persistent Settings
 * ====================================================== */

async function restoreStoredSettings() {
    return new Promise((resolve) => {
        browser.storage.local.get(
            ['hex', 'colorMode', 'filters'],
            ({ hex = '#000000', colorMode = 'rgb', filters = currentFilters }) => {
                currentMode = ['rgb', 'hsl', 'hsv'].includes(colorMode)
                    ? colorMode
                    : 'rgb';

                currentFilters = filters;
                input.value = hex;
                hexValue.textContent = hex;

                resolve();
            }
        );
    });
}


/* ======================================================
 *  Color Mode Handling
 * ====================================================== */

function bindModeButtonEvents() {
    modeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const mode = button.id.replace('Button', '');
            updateColorMode(mode);
            browser.storage.local.set({ colorMode: mode });
        });
    });
}

function updateColorMode(mode) {
    currentMode = mode;

    const settings = {
        rgb: { labels: ['R:', 'G:', 'B:'], ranges: [255, 255, 255] },
        hsl: { labels: ['H:', 'S:', 'L:'], ranges: [359, 100, 100] },
        hsv: { labels: ['H:', 'S:', 'V:'], ranges: [359, 100, 100] },
    }[mode];

    // Update active button
    modeButtons.forEach((btn) =>
        btn.classList.toggle('active', btn.id === `${mode}Button`)
    );

    // Update axis labels
    document.querySelectorAll('label').forEach((label, i) => {
        if (i < settings.labels.length) {
            label.textContent = settings.labels[i];
        }
    });

    // Update slider and input ranges
    [xSlider, ySlider, zSlider].forEach(
        (slider, i) => (slider.max = settings.ranges[i])
    );
    [xValue, yValue, zValue].forEach(
        (input, i) => (input.max = settings.ranges[i])
    );

    updateColorFromHex(input.value);
}


/* ======================================================
 *  Color Update Sources
 * ====================================================== */

function updateColorFromHex(hex) {
    const { r, g, b } = utils.hexToRGB(hex);

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
            b: Number(zSlider.value),
        };
    } else if (currentMode === 'hsl') {
        rgb = utils.hslToRGB(
            xSlider.value,
            ySlider.value,
            zSlider.value
        );
    } else {
        const hsl = utils.hsvToHSL(
            xSlider.value,
            ySlider.value,
            zSlider.value
        );
        rgb = utils.hslToRGB(hsl.h, hsl.s, hsl.l);
    }

    const hex = utils.rgbToHex(rgb.r, rgb.g, rgb.b);

    input.value = hex;
    hexValue.textContent = hex;

    browser.storage.local.set({ hex });
    changeResult(hex);
}

function setSliderValues([x, y, z]) {
    [xSlider.value, ySlider.value, zSlider.value] = [x, y, z];
    [xValue.value, yValue.value, zValue.value] = [x, y, z];
}


/* ======================================================
 *  Result Rendering
 * ====================================================== */

function changeResult(hex) {
    const rgb = utils.hexToRGB(hex);
    const lab = utils.rgbToLab(rgb.r, rgb.g, rgb.b);

    // Persist current state
    browser.storage.local.set({
        hex,
        filters: currentFilters,
    });

    getClosestBlocksFromBackground(lab);
}

function showBlocks(closestBlocks, container) {
    container.innerHTML = '';
    container.style.display = 'grid';

    closestBlocks.forEach((block) => {
        const div = document.createElement('div');
        div.className = 'block-container';

        const img = document.createElement('img');
        img.className = 'block-image';
        img.src = block.image;
        img.alt = block.name;

        const tooltip = document.createElement('div');
        tooltip.className = 'block-id-tooltip';
        tooltip.textContent = block.name;

        // Copy block ID on click
        div.addEventListener('click', () => {
            copyTextToClipboard(block.id);

            const originalText = tooltip.textContent;
            tooltip.textContent = 'Copied!';
            setTimeout(() => {
                tooltip.textContent = originalText;
            }, 800);
        });

        div.append(img, tooltip);
        container.appendChild(div);
    });
}


/* ======================================================
 *  Filter Handling
 * ====================================================== */

function bindFilterEvents() {
    filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tag = button.dataset.tag;
            const mode = button.dataset.filterMode;

            const nextMode =
                mode === 'none'
                    ? 'include'
                    : mode === 'include'
                    ? 'exclude'
                    : 'none';

            updateFilterState(button, tag, nextMode);
            changeResult(input.value);
        });
    });
}

function updateFilterState(button, tag, mode) {
    currentFilters[tag] = mode;
    button.dataset.filterMode = mode;

    const label = tag.charAt(0).toUpperCase() + tag.slice(1);
    button.textContent = label;
    button.title = mode.charAt(0).toUpperCase() + mode.slice(1);
}

function initializeFilterDisplay() {
    filterButtons.forEach((button) => {
        const tag = button.dataset.tag;
        updateFilterState(button, tag, currentFilters[tag]);
    });
}


/* ======================================================
 *  Input Color Picker
 * ====================================================== */

function bindInputColorPicker() {
    input.addEventListener('change', () => {
        updateColorFromHex(input.value);
    });
}


/* ======================================================
 *  Clipboard Utility
 * ====================================================== */

async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log(`Copied block ID: ${text}`);
    } catch (err) {
        console.error('Clipboard copy failed:', err);
    }
}
