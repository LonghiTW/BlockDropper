const utils = {
    // ===== 顏色轉換 =====
	// Hex -> RGB
    hexToRGB(hex) {
        if (!hex) return null;
        let color = hex.replace('#', '');
        if (color.length === 3) color = color.split('').map(c => c + c).join('');
        return {
            r: parseInt(color.substring(0, 2), 16),
            g: parseInt(color.substring(2, 4), 16),
            b: parseInt(color.substring(4, 6), 16),
        };
    },

    // RGB -> Hex
    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) | (r << 16) | (g << 8) | b)
            .toString(16)
            .slice(1)
            .toUpperCase();
    },

    // RGB -> HSL
    rgbToHSL(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100),
        };
    },

    // HSL -> RGB
    hslToRGB(h, s, l) {
        s /= 100;
        l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r, g, b;

        if (0 <= h && h < 60) [r, g, b] = [c, x, 0];
        else if (h < 120) [r, g, b] = [x, c, 0];
        else if (h < 180) [r, g, b] = [0, c, x];
        else if (h < 240) [r, g, b] = [0, x, c];
        else if (h < 300) [r, g, b] = [x, 0, c];
        else [r, g, b] = [c, 0, x];

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255),
        };
    },

    // HSL -> HSV
    hslToHSV(h, s, l) {
        s /= 100;
        l /= 100;
        const v = l + s * Math.min(l, 1 - l);
        const sv = v === 0 ? 0 : 2 * (v - l) / v;
        return {
            h,
            s: Math.round(sv * 100),
            v: Math.round(v * 100),
        };
    },

    // HSV -> HSL
    hsvToHSL(h, s, v) {
        s /= 100;
        v /= 100;
        const l = (2 - s) * v / 2;
        const sv = l && l !== 1 ? (v - l) / Math.min(l, 1 - l) : s;
        return {
            h,
            s: Math.round(sv * 100),
            l: Math.round(l * 100),
        };
    },

    // 找出最接近的方塊
    findClosestBlocks(rgb, blockList, count = 5) {
        return blockList
            .map(block => ({
                ...block,
                distance: Math.hypot(block.r - rgb.r, block.g - rgb.g, block.b - rgb.b),
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, count);
    },

    // 載入 blockColors.json
    async loadBlockColors() {
        try {
            const res = await fetch(chrome.runtime.getURL('blockColors.json'));
            const data = await res.json();
            return data.map(({ color, ...rest }) => ({
                ...rest,
                color,
                r: parseInt(color.slice(1, 3), 16),
                g: parseInt(color.slice(3, 5), 16),
                b: parseInt(color.slice(5, 7), 16),
            }));
        } catch (err) {
            console.error("Failed to load block colors:", err);
            return [];
        }
    },

    // 渲染顏色對應的方塊結果
    renderBlockMatches(blocks, container, options = {}) {
        container.innerHTML = '';
        blocks.forEach(block => {
            const blockContainer = document.createElement('div');
            blockContainer.classList.add('block-container');

            const img = document.createElement('img');
            img.src = chrome.runtime.getURL(`/${block.image}`);
            img.alt = block.id.replace('minecraft:', '');
            img.classList.add('block-image');

            const blockId = document.createElement('div');
            blockId.textContent = img.alt;

            const colorBlock = document.createElement('div');
            colorBlock.textContent = block.color;
            colorBlock.classList.add('block-color');

            const infoContainer = document.createElement('div');
            infoContainer.classList.add('block-info');
            if (!options.hideId) infoContainer.appendChild(blockId);
            if (!options.hideColor) infoContainer.appendChild(colorBlock);

            blockContainer.appendChild(img);
            blockContainer.appendChild(infoContainer);
            container.appendChild(blockContainer);
        });
    }
};
