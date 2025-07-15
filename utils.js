const utils = {
	// 顏色轉換函式：Hex -> RGB
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
    
    // 轉換 RGB 到 Hex
    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
    },
    
    // RGB轉換為HSL
    rgbToHSL(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
    
        if (max === min) {
            h = s = 0; // 無色
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
            l: Math.round(l * 100)
        };
    },
    
    // HSL轉換為RGB
    hslToRGB(h, s, l) {
        s /= 100;
        l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r, g, b;
    
        if (0 <= h && h < 60) { r = c; g = x; b = 0; }
        else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
        else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
        else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
        else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
    
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    },
    
    // HSL -> HSV 轉換
    hslToHSV(h, s, l) {
        s /= 100;
        l /= 100;
    
        let v = l + s * Math.min(l, 1 - l);
        let sv = v === 0 ? 0 : 2 * (v - l) / v;
    
        return {
            h: h,                  // 色相 (0-360)
            s: Math.round(sv * 100), // 飽和度 (0-100)
            v: Math.round(v * 100)   // 明度 (0-100)
        };
    },
    
    // HSV轉HSL
    hsvToHSL(h, s, v) {
        s /= 100;
        v /= 100;
    
        let l = (2 - s) * v / 2;
        let sv = (l !== 0 && l !== 1) ? (v - l) / Math.min(l, 1 - l) : s;
    
        return {
            h: h,                      // 色相 (0-360)
            s: Math.round(sv * 100),   // 飽和度 (0-100)
            l: Math.round(l * 100)     // 亮度 (0-100)
        };
    },
	
	// 計算顏色距離並排序，選擇前5個最接近的顏色
    findClosestBlocks(rgb, blockList, count = 5) {
        return blockList
            .map(block => ({
                ...block,
                distance: Math.hypot(
                    block.r - rgb.r,
                    block.g - rgb.g,
                    block.b - rgb.b
                )
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, count);
    }
};