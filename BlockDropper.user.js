// ==UserScript==
// @name         BlockDropper Userscript
// @namespace    https://github.com/LonghiTW
// @version      3.0.0
// @description  A web tool that can pick color from a manually loaded screenshot to find the matching Minecraft blocks.
// @author       Longhi / Converted by Gemini
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    let updateStatus = (text) => console.log(text);

    /* ======================================================
     * 1. Embedded CSS (content.css)
     * ====================================================== */
    GM_addStyle(`
        #blockDropperOverlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 999999;
            cursor: crosshair;
            background: rgba(0,0,0,0.05);
            display: none; /* Hidden by default */
        }

        #selectionBox {
            position: fixed;
            border: 2px dashed blue;
            background: rgba(0, 136, 255, 0.2);
            z-index: 1000000;
        }

        #blockResult {
            display: flex;
            position: fixed;
            background-color: #f9f9f9;
            color: black;
            width: auto;
            border: 1px solid #ccc;
            z-index: 9999999999999999999999999;
            overflow-y: auto;
            max-height: 300px;
            pointer-events: none; /* Ignore mouse events for smooth tracking */
        }

        #sideBlockResult {
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            display: flex;
            flex-direction: column;
            z-index: 999998;
        }

        .dropperBlock {
            width: 50px;
            height: 50px;
            object-fit: cover;
            object-position: top;
            border: 1px solid #ccc;
            margin: 5px;
            cursor: pointer;
        }

        /* New Control Bar Style */
        #blockDropperControlBar {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 999999999999;
            padding: 10px;
            background: #f9f9f9;
            border: 1px solid #ccc;
            border-radius: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            gap: 10px;
            font-family: sans-serif;
            font-size: 14px;
        }
        #blockDropperControlBar button {
             padding: 5px 10px;
             cursor: pointer;
        }
    `);


    /* ======================================================
     * 2. Block Data Fetcher (from GitHub JSON)
     * ====================================================== */
    const BLOCK_DATA_URL = 'https://raw.githubusercontent.com/LonghiTW/BlockDropper/main/data/block_data.json';
    let RAW_BLOCKS_DATA = [];

	// Asynchronous function to load block data
    function loadBlockData(callback) {
        updateStatus('Loading the latest block data...');

        GM_xmlhttpRequest({
            method: "GET",
            url: BLOCK_DATA_URL,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        RAW_BLOCKS_DATA = JSON.parse(response.responseText);
                        updateStatus('Block data loaded successfully!');
                        callback(); // Execute main program after successful load
                    } catch (e) {
                        updateStatus('Error: Failed to parse block data.');
                        console.error('Error parsing block data:', e);
                    }
                } else {
                    updateStatus(`Error: Failed to load block data (Status code: ${response.status}).`);
                    console.error('Failed to load block data:', response.status);
                }
            },
            onerror: function(error) {
                updateStatus('Error: Network connection failed, unable to load block data.');
                console.error('GM_xmlhttpRequest error:', error);
            }
        });
    }

    /* ======================================================
     * 3. Utility Functions (utils.js)
     * NOTE: loadBlockData modified to use embedded JSON.
     * ====================================================== */
    const utils = {

        /* ======================================================
         * Color Format Helpers
         * ====================================================== */

        // Convert HEX color string to RGB object
        hexToRGB(hex) {
            if (!hex) return null;

            let color = hex.replace('#', '');
            if (color.length === 3) {
                color = color.split('').map(c => c + c).join('');
            }

            return {
                r: parseInt(color.slice(0, 2), 16),
                g: parseInt(color.slice(2, 4), 16),
                b: parseInt(color.slice(4, 6), 16),
            };
        },

        // Convert RGB values to HEX string
        rgbToHex(r, g, b) {
            return (
                '#' +
                ((1 << 24) | (r << 16) | (g << 8) | b)
                    .toString(16)
                    .slice(1)
                    .toUpperCase()
            );
        },


        /* ======================================================
         * RGB / HSL / HSV Conversions
         * ====================================================== */

        // Convert RGB to HSL color space
        rgbToHSL(r, g, b) {
            r /= 255;
            g /= 255;
            b /= 255;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const range = max - min;
            let h = 0;
            let s = 0;
            let l = (max + min) / 2;

            if (range !== 0) {
                s = l > 0.5 ? range / (2 - max - min) : range / (max + min);

                switch (max) {
                    case r:
                        h = (g - b) / range + (g < b ? 6 : 0);
                        break;
                    case g:
                        h = (b - r) / range + 2;
                        break;
                    case b:
                        h = (r - g) / range + 4;
                        break;
                }
                h /= 6;
            }

            return {
                h: Math.round(h * 360),
                s: Math.round(s * 100),
                l: Math.round(l * 100),
            };
        },

        // Convert RGB to HSV color space
        rgbToHSV(r, g, b) {
            r /= 255;
            g /= 255;
            b /= 255;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const range = max - min;
            let h = 0;
            let s = 0;
            const v = max;

            if (range !== 0) {
                s = range / max;

                switch (max) {
                    case r:
                        h = (g - b) / range + (g < b ? 6 : 0);
                        break;
                    case g:
                        h = (b - r) / range + 2;
                        break;
                    case b:
                        h = (r - g) / range + 4;
                        break;
                }
                h /= 6;
            }

            return {
                h: Math.round(h * 360),
                s: Math.round(s * 100),
                v: Math.round(v * 100),
            };
        },


        /* ======================================================
         * RGB / Lab Conversions (for CIEDE2000)
         * ====================================================== */

        // Convert RGB to XYZ color space
        rgbToXYZ(r, g, b) {
            let var_r = r / 255;
            let var_g = g / 255;
            let var_b = b / 255;

            var_r =
                var_r > 0.04045
                    ? Math.pow((var_r + 0.055) / 1.055, 2.4)
                    : var_r / 12.92;
            var_g =
                var_g > 0.04045
                    ? Math.pow((var_g + 0.055) / 1.055, 2.4)
                    : var_g / 12.92;
            var_b =
                var_b > 0.04045
                    ? Math.pow((var_b + 0.055) / 1.055, 2.4)
                    : var_b / 12.92;

            var_r *= 100;
            var_g *= 100;
            var_b *= 100;

            // D65 reference white
            // Xn = 95.047, Yn = 100.000, Zn = 108.883
            return {
                X: var_r * 0.4124 + var_g * 0.3576 + var_b * 0.1805,
                Y: var_r * 0.2126 + var_g * 0.7152 + var_b * 0.0722,
                Z: var_r * 0.0193 + var_g * 0.1192 + var_b * 0.9505,
            };
        },

        // Convert XYZ to Lab color space
        xyzToLab(X, Y, Z) {
            let var_X = X / 95.047; // ref_X = 95.047
            let var_Y = Y / 100.0; // ref_Y = 100.000
            let var_Z = Z / 108.883; // ref_Z = 108.883

            var_X =
                var_X > 0.008856
                    ? Math.pow(var_X, 1 / 3)
                    : var_X * 7.787 + 16 / 116;
            var_Y =
                var_Y > 0.008856
                    ? Math.pow(var_Y, 1 / 3)
                    : var_Y * 7.787 + 16 / 116;
            var_Z =
                var_Z > 0.008856
                    ? Math.pow(var_Z, 1 / 3)
                    : var_Z * 7.787 + 16 / 116;

            const L = 116 * var_Y - 16;
            const A = 500 * (var_X - var_Y);
            const B = 200 * (var_Y - var_Z);

            return { L, A, B };
        },

        // Convert RGB to Lab color space
        rgbToLab(r, g, b) {
            const { X, Y, Z } = this.rgbToXYZ(r, g, b);
            return this.xyzToLab(X, Y, Z);
        },

        // Convert Lab to Lch (Cylindrical Lab)
        labToLch(L, A, B) {
            const C = Math.sqrt(A * A + B * B);
            let H = (Math.atan2(B, A) * 180) / Math.PI;
            if (H < 0) H += 360;
            return { L, C, H };
        },


        /* ======================================================
         * CIEDE2000 Color Difference
         * Implementation based on: http://www.brucelindbloom.com/index.html?Eqn_DeltaE_CIE2000.html
         * ====================================================== */

        deltaE2000(L1, A1, B1, L2, A2, B2) {
            // Calculate C1, h1, C2, h2
            const { C: C1, H: h1 } = this.labToLch(L1, A1, B1);
            const { C: C2, H: h2 } = this.labToLch(L2, A2, B2);

            const pi = Math.PI;

            // 1. Calculate L' (L Prime)
            const L_prime = L2 - L1;

            // 2. Calculate L_bar, C_bar
            const L_bar = (L1 + L2) / 2;
            const C_bar = (C1 + C2) / 2;

            // 3. Calculate a_prime
            const G =
                0.5 *
                (1 -
                    Math.sqrt(
                        Math.pow(C_bar, 7) /
                            (Math.pow(C_bar, 7) + Math.pow(25, 7))
                    ));

            const A1_prime = A1 * (1 + G);
            const A2_prime = A2 * (1 + G);

            // 4. Calculate C_prime, h_prime
            const C1_prime = Math.sqrt(A1_prime * A1_prime + B1 * B1);
            const C2_prime = Math.sqrt(A2_prime * A2_prime + B2 * B2);

            const C_prime = C2_prime - C1_prime;

            let h1_prime = (Math.atan2(B1, A1_prime) * 180) / pi;
            if (h1_prime < 0) h1_prime += 360;

            let h2_prime = (Math.atan2(B2, A2_prime) * 180) / pi;
            if (h2_prime < 0) h2_prime += 360;

            // 5. Calculate H_prime (H Prime)
            let H_prime;
            const dh_abs = Math.abs(h1_prime - h2_prime);

            if (C1_prime * C2_prime === 0) {
                H_prime = 0;
            } else if (dh_abs <= 180) {
                H_prime = h2_prime - h1_prime;
            } else if (dh_abs > 180 && h2_prime <= h1_prime) {
                H_prime = h2_prime - h1_prime + 360;
            } else {
                H_prime = h2_prime - h1_prime - 360;
            }

            // 6. Calculate Delta H_prime
            const delta_H_prime =
                2 *
                Math.sqrt(C1_prime * C2_prime) *
                Math.sin((H_prime * pi) / 360);

            // 7. Calculate h_bar_prime
            const h_bar_prime =
                C1_prime * C2_prime === 0
                    ? h1_prime + h2_prime
                    : dh_abs <= 180
                    ? (h1_prime + h2_prime) / 2
                    : dh_abs > 180 && h1_prime + h2_prime < 360
                    ? (h1_prime + h2_prime + 360) / 2
                    : (h1_prime + h2_prime - 360) / 2;

            // 8. Calculate T
            const T =
                1 -
                0.17 * Math.cos((h_bar_prime - 30) * pi / 180) +
                0.24 * Math.cos(2 * h_bar_prime * pi / 180) +
                0.32 * Math.cos((3 * h_bar_prime + 6) * pi / 180) -
                0.2 * Math.cos((4 * h_bar_prime - 63) * pi / 180);

            // 9. Calculate Sl, Sc, Sh
            const Sl =
                1 +
                (0.015 * Math.pow(L_bar - 50, 2)) /
                    Math.sqrt(20 + Math.pow(L_bar - 50, 2));
            const Sc = 1 + 0.045 * C_bar;
            const Sh = 1 + 0.015 * C_bar * T;

            // 10. Calculate Rt
            const delta_theta = 30 * Math.exp(-Math.pow((h_bar_prime - 275) / 25, 2));
            const Rc =
                2 *
                Math.sqrt(
                    Math.pow(C_bar, 7) /
                        (Math.pow(C_bar, 7) + Math.pow(25, 7))
                );
            const Rt = -Rc * Math.sin((2 * delta_theta * pi) / 180);

            // 11. Final deltaE2000 calculation
            const kl = 1.0;
            const kc = 1.0;
            const kh = 1.0;

            const delta_E = Math.sqrt(
                Math.pow(L_prime / (kl * Sl), 2) +
                    Math.pow(C_prime / (kc * Sc), 2) +
                    Math.pow(delta_H_prime / (kh * Sh), 2) +
                    Rt * (C_prime / (kc * Sc)) * (delta_H_prime / (kh * Sh))
            );

            return delta_E;
        },


        /* ======================================================
         * Image and Color Sampling
         * ====================================================== */

        // Get average color from an area of the image data
        averageColor(imageData, rect, callback) {
            const data = imageData.data;
            let r = 0;
            let g = 0;
            let b = 0;
            let count = 0;

            const xEnd = rect.left + rect.width;
            const yEnd = rect.top + rect.height;

            for (let y = rect.top; y < yEnd; y++) {
                for (let x = rect.left; x < xEnd; x++) {
                    // Check bounds to ensure we don't go out of the image data
                    if (x < imageData.width && y < imageData.height) {
                        const index = (y * imageData.width + x) * 4;

                        // RGB values are at index, index+1, index+2
                        r += data[index];
                        g += data[index + 1];
                        b += data[index + 2];
                        count++;
                    }
                }
            }

            if (count > 0) {
                const avgR = Math.round(r / count);
                const avgG = Math.round(g / count);
                const avgB = Math.round(b / count);

                callback({
                    r: avgR,
                    g: avgG,
                    b: avgB,
                    hex: this.rgbToHex(avgR, avgG, avgB),
                    lab: this.rgbToLab(avgR, avgG, avgB),
                });
            }
        },


        /* ======================================================
         * Block Data & Matching
         * ====================================================== */

        // Find closest blocks by CIEDE2000 distance
        findClosestBlocks(lab, blockList, count = 6, requiredTag = null) {
            const candidates = requiredTag
                ? blockList.filter(b => b.tags?.includes(requiredTag))
                : blockList;

            return candidates
                .map(block => ({
                    ...block,
                    distance: this.deltaE2000(
                        lab.L, lab.A, lab.B,
                        block.lab[0], block.lab[1], block.lab[2]
                    ),
                }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, count);
        },

        // Modified loadBlockData to use embedded JSON
        loadBlockData() {
            console.log('Userscript: Loading and processing embedded block data...');

            // RAW_BLOCKS_DATA is the embedded JSON array
            return RAW_BLOCKS_DATA.map(({ id, hex, ...rest }) => ({
                id,
                hex,
                ...rest,
                r: parseInt(hex.slice(1, 3), 16),
                g: parseInt(hex.slice(3, 5), 16),
                b: parseInt(hex.slice(5, 7), 16),
                // Using a remote CDN for block images, as local files are inaccessible
                image:
                    `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.11/assets/minecraft/textures/block/${id}.png`,
            }));
        },
    };


    /* ======================================================
     * 4. Main Logic (content.js - Modified for Userscript)
     * ====================================================== */

    function main() {
        /* ======================================================
         * State Management
         * ====================================================== */

        let screenImage = null;        // Captured screenshot image data (ImageData)
        let isTracking = false;        // Whether live color tracking is enabled
        let lastColor = null;          // Last tracked color (mousemove)
        let lastPicked = null;         // Last picked color (selection)
        let cancelPickColor = null;    // Cancel handler for selection mode
        let blocks = [];               // Loaded block color reference data
        let imgCanvas = null;          // Canvas element for image processing
        let imgContext = null;         // Canvas context for image processing

        /* ======================================================
         * DOM Element Creation and Helpers
         * ====================================================== */

        // Create a draggable, styled container for results
        function createTooltipBox(id) {
            const el = document.createElement('div');
            el.id = id;
            el.style.display = 'none'; // Hidden by default
            document.body.appendChild(el);
            return el;
        }

        // Create the semi-transparent overlay
        function createDropperOverlay() {
            const overlay = document.createElement('div');
            overlay.id = 'blockDropperOverlay';
            document.body.appendChild(overlay);
            return overlay;
        }

        // Create the selection box for area picking
        function createSelectionBox() {
            const selectionBox = document.createElement('div');
            selectionBox.id = 'selectionBox';
            selectionBox.style.display = 'none';
            document.body.appendChild(selectionBox);
            return selectionBox;
        }

        // Helper to update result box position
        function updateTooltipPosition(el, clientX, clientY, offset = 15) {
            const x = clientX + offset;
            const y = clientY + offset;

            // Simple boundary check: keep results visible
            let finalX = x;
            let finalY = y;
            if (x + el.offsetWidth > window.innerWidth) {
                finalX = clientX - el.offsetWidth - offset;
            }
            if (y + el.offsetHeight > window.innerHeight) {
                finalY = clientY - el.offsetHeight - offset;
            }

            el.style.left = `${finalX}px`;
            el.style.top = `${finalY}px`;
        }

        // Hide the selection box
        function hideSelectionBox() {
            selectionBox.style.display = 'none';
            selectionBox.style.left = '0';
            selectionBox.style.top = '0';
            selectionBox.style.width = '0';
            selectionBox.style.height = '0';
        }

        // Create a sampling rectangle centered at a point
        function getRectAroundPoint(x, y, size = 10) {
            const half = size / 2;
            // Adjust coordinates relative to the top-left of the captured image
            const left = Math.max(0, Math.min(x - half, imgCanvas.width - size));
            const top = Math.max(0, Math.min(y - half, imgCanvas.height - size));

            return { left, top, width: size, height: size };
        }

        function loadImageBypassCSP(url, img) {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: "blob",
                onload(res) {
                    const blobUrl = URL.createObjectURL(res.response);
                    img.src = blobUrl;
                },
                onerror() {
                    img.alt = "load failed";
                    console.log('GM_xmlhttpRequest failed for', url);
                }
            });
        }

        // Render matched blocks into a container
        function renderMatches(matches, container) {
            container.innerHTML = '';

            matches.forEach(block => {
                const img = document.createElement('img');
                img.className = 'dropperBlock';
                img.alt = block.id;
                img.title = `(${block.distance.toFixed(2)}) ${block.id}`; // Show distance on hover
                loadImageBypassCSP(block.image, img);

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

        // Render the live tracking result box
        function renderResultBox(color, matches) {
            resultBox.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    padding: 5px;
                    border-right: 1px solid #ccc;
                    align-items: center;
                ">
                    <div style="
                        width: 30px;
                        height: 30px;
                        background-color: ${color.hex};
                        border: 1px solid #000;
                    "></div>
                    <div style="font-size: 10px; margin-top: 5px; font-family: monospace;">${color.hex}</div>
                </div>
                <div id="liveMatches" style="display: flex;"></div>
            `;
            renderMatches(matches, resultBox.querySelector('#liveMatches'));
            resultBox.style.display = 'flex';
        }


        /* ======================================================
         * Manual Image Input and Processing (New for Userscript)
         * ====================================================== */

        let updateStatus = (text) => console.log(text); // Placeholder, updated in createInputUI

        /**
         * Cleans up the UI and resets the state.
         */
        function clearState() {
            if (cancelPickColor) {
                cancelPickColor();
                cancelPickColor = null;
            }

            isTracking = false;
            screenImage = null;
            lastColor = null;
            lastPicked = null;
            hideSelectionBox();
            resultBox.style.display = 'none';
            sideResultBox.innerHTML = '';

            updateStatus('Waiting for image...');

            if (overlay) {
                overlay.style.display = 'none';
                overlay.style.cursor = 'default';
                overlay.title = '';
            }
        }

        /**
         * Draws an image onto the hidden canvas and prepares the global state.
         * @param {HTMLImageElement} image - The image loaded from file/paste.
         */
        function setupCanvas(image) {
            if (!imgCanvas) {
                imgCanvas = document.createElement('canvas');
                imgContext = imgCanvas.getContext('2d', {
                    willReadFrequently: true
                });
            }
            imgCanvas.width = image.width;
            imgCanvas.height = image.height;
            imgContext.drawImage(image, 0, 0);

            // Update global state with pixel data
            screenImage = imgContext.getImageData(0, 0, image.width, image.height);

            // Start tracking immediately after image is loaded
            isTracking = true;
            lastColor = null;
            lastPicked = null;

            // Re-enable/show overlay and set status
            overlay.style.display = 'block';
            overlay.style.cursor = 'crosshair';
            overlay.title = 'Click to pick an area’s average color. Press Esc to exit';

            updateStatus(`Picking color (${image.width}x${image.height})`);
        }

        /**
         * Loads a File object (from input or paste) into an Image object.
         * @param {File} file - The image file to load.
         */
        function loadImageFile(file) {
            if (!file || !file.type.startsWith('image/')) return;

            updateStatus('Loading image...');

            const reader = new FileReader();
            reader.onload = (e) => {
                const image = new Image();
                image.onload = () => setupCanvas(image);
                image.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        /**
         * Handles paste events, looking for an image item.
         * @param {ClipboardEvent} e - The paste event.
         */
        function handlePaste(e) {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    loadImageFile(items[i].getAsFile());
                    e.preventDefault(); // Prevent paste from doing anything else
                    return;
                }
            }
        }

        /**
         * Creates the floating control UI for file input/status.
         * @returns {object} An object containing the updateStatus function.
         */
        function createInputUI() {
            const bar = document.createElement('div');
            bar.id = 'blockDropperControlBar';

            // Status Display
            const statusDiv = document.createElement('div');
            statusDiv.id = 'dropperStatus';
            statusDiv.style.fontWeight = 'bold';

            // File Input
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.marginTop = '5px';
            fileInput.title = 'Select a screenshot image';
            fileInput.addEventListener('change', (e) => loadImageFile(e.target.files[0]));

            // Paste Info
            const pasteInfo = document.createElement('div');
            pasteInfo.innerHTML = 'Or **Ctrl+V / Cmd+V** to paste a screenshot (Press Esc to cancel)';
            pasteInfo.style.fontSize = '12px';
            pasteInfo.style.color = '#555';
            pasteInfo.style.marginTop = '5px';

            bar.appendChild(statusDiv);
            bar.appendChild(fileInput);
            bar.appendChild(pasteInfo);

            document.body.appendChild(bar);

            // Bind global paste listener
            document.addEventListener('paste', handlePaste);

            // Return a function to update status
            const update = (text) => statusDiv.textContent = `Status: ${text}`;
            update('Waiting for image...');

            return { updateStatus: update };
        }


        /* ======================================================
         * Initialization
         * ====================================================== */

        // Tooltip containers for live result and final selection
        const resultBox = createTooltipBox('blockResult');
        const sideResultBox = createTooltipBox('sideBlockResult');
        const selectionBox = createSelectionBox();
        const overlay = createDropperOverlay();

        // Load block color reference data
        // NOTE: Since RAW_BLOCKS_DATA is now populated asynchronously by loadBlockData,
        // this call now processes the loaded data.
        blocks = utils.loadBlockData();

        // Initialize the new control UI and get status updater
        const controlUI = createInputUI();
        updateStatus = controlUI.updateStatus;


        /* ======================================================
         * Global Event Listeners
         * ====================================================== */

        // Track mouse movement for live color detection
        document.addEventListener('mousemove', (e) => {
            if (!isTracking || !screenImage || cancelPickColor) return;

            // We use clientX/clientY for screen coordinates, but ensure they are within the image bounds
            const x = Math.min(e.clientX, screenImage.width - 5);
            const y = Math.min(e.clientY, screenImage.height - 5);

            const rect = getRectAroundPoint(x, y, 10);

            // Update live tooltip position based on mouse position
            updateTooltipPosition(resultBox, e.clientX, e.clientY);

            utils.averageColor(screenImage, rect, (colorData) => {
                lastColor = colorData;

                // Find closest blocks (only 'block' tag for live tracking)
                const matches = utils.findClosestBlocks(
                    colorData.lab,
                    blocks,
                    6,
                    'block'
                );

                renderResultBox(colorData, matches);
            });
        });

        // Handle selection pick (mousedown/mousemove/mouseup)
        overlay.addEventListener('mousedown', (e) => {
            if (!isTracking || !screenImage || cancelPickColor) return; // Only allow one selection at a time

            // Store starting point
            const startX = e.clientX;
            const startY = e.clientY;

            // Reset selection UI
            selectionBox.style.display = 'block';

            // Lock tracking during selection
            cancelPickColor = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                hideSelectionBox();
                cancelPickColor = null;
                // Re-enable live tracking on movement
                resultBox.style.display = 'flex';
            };

            const onMove = (moveEvent) => {
                // Determine current selection rectangle
                const currentX = moveEvent.clientX;
                const currentY = moveEvent.clientY;

                const left = Math.min(startX, currentX);
                const top = Math.min(startY, currentY);
                const width = Math.abs(startX - currentX);
                const height = Math.abs(startY - currentY);

                // Draw selection box
                selectionBox.style.left = `${left}px`;
                selectionBox.style.top = `${top}px`;
                selectionBox.style.width = `${width}px`;
                selectionBox.style.height = `${height}px`;

                // Hide live result box during selection
                resultBox.style.display = 'none';
            };

            const onUp = (upEvent) => {
                cancelPickColor(); // Unlock tracking, remove listeners

                const finalX = upEvent.clientX;
                const finalY = upEvent.clientY;

                const left = Math.min(startX, finalX);
                const top = Math.min(startY, finalY);
                const width = Math.abs(startX - finalX);
                const height = Math.abs(startY - finalY);

                // Only process if a valid area was selected (e.g., area > 5x5)
                if (width * height > 25) {

                    // The bounding box might go outside the image bounds.
                    // We must clamp the sampling rectangle to the image size.
                    const samplingRect = {
                        left: Math.max(0, left),
                        top: Math.max(0, top),
                        width: Math.min(width, screenImage.width - left),
                        height: Math.min(height, screenImage.height - top)
                    };

                    updateStatus('Calculating average color...');

                    utils.averageColor(screenImage, samplingRect, (colorData) => {
                        lastPicked = colorData;

                        // Find closest blocks (Blocks & Decorations)
                        const blocksMatches = utils.findClosestBlocks(
                            colorData.lab,
                            blocks,
                            9,
                            'block'
                        );

                        const decorationsMatches = utils.findClosestBlocks(
                            colorData.lab,
                            blocks,
                            9,
                            'decoration'
                        ).filter(
                            // Filter out blocks that were already selected as 'block'
                            (d) => !blocksMatches.some(b => b.id === d.id)
                        );

                        // Render final result
                        const finalMatches = blocksMatches.concat(decorationsMatches);
                        renderMatches(finalMatches, sideResultBox);

                        sideResultBox.style.display = 'flex';
                        updateStatus(`Selection complete (Average color: ${colorData.hex})`);

                        // Re-enable live tracking UI on subsequent movement
                        resultBox.style.display = 'flex';
                    });
                } else {
                    // Clicks or tiny selections clear the side result
                    sideResultBox.innerHTML = '';
                    updateStatus('Picking color...');
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // ESC key listener to clear state
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearState();
            }
        });
    }

    // Call loadBlockData and execute the main function after data is successfully loaded
    loadBlockData(main);
})();
