const utils = {

    /* ======================================================
     *  Color Format Helpers
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
     *  RGB / HSL / HSV Conversions
     * ====================================================== */

    // Convert RGB to HSL color space
    rgbToHSL(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s;
        const l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
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

    // Convert HSL to RGB
    hslToRGB(h, s, l) {
        s /= 100;
        l /= 100;

        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;

        let r, g, b;

        if (h < 60)       [r, g, b] = [c, x, 0];
        else if (h < 120) [r, g, b] = [x, c, 0];
        else if (h < 180) [r, g, b] = [0, c, x];
        else if (h < 240) [r, g, b] = [0, x, c];
        else if (h < 300) [r, g, b] = [x, 0, c];
        else              [r, g, b] = [c, 0, x];

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255),
        };
    },

    // Convert HSL to HSV
    hslToHSV(h, s, l) {
        s /= 100;
        l /= 100;

        const v = l + s * Math.min(l, 1 - l);
        const sv = v === 0 ? 0 : (2 * (v - l)) / v;

        return {
            h,
            s: Math.round(sv * 100),
            v: Math.round(v * 100),
        };
    },

    // Convert HSV to HSL
    hsvToHSL(h, s, v) {
        s /= 100;
        v /= 100;

        const l = ((2 - s) * v) / 2;
        const sv = l && l !== 1 ? (v - l) / Math.min(l, 1 - l) : s;

        return {
            h,
            s: Math.round(sv * 100),
            l: Math.round(l * 100),
        };
    },


    /* ======================================================
     *  RGB / Lab / Lch Conversions
     * ====================================================== */

    // Convert RGB to CIE Lab
    rgbToLab(r, g, b) {
        let [R, G, B] = [r, g, b].map(v => {
            v /= 255;
            return v > 0.04045
                ? Math.pow((v + 0.055) / 1.055, 2.4)
                : v / 12.92;
        });

        R *= 100; G *= 100; B *= 100;

        const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
        const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
        const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;

        const ref = { X: 95.047, Y: 100.0, Z: 108.883 };
        const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;

        const fx = f(X / ref.X);
        const fy = f(Y / ref.Y);
        const fz = f(Z / ref.Z);

        return {
            L: (116 * fy) - 16,
            A: 500 * (fx - fy),
            B: 200 * (fy - fz),
        };
    },

    // Convert RGB to Lch
    rgbToLch(r, g, b) {
        const { L, A, B } = this.rgbToLab(r, g, b);
        const C = Math.sqrt(A * A + B * B);
        let H = Math.atan2(B, A) * 180 / Math.PI;
        if (H < 0) H += 360;
        return { L, C, H };
    },

    // Convert Lch to Lab
    lchToLab(L, C, H) {
        const hRad = H * Math.PI / 180;
        return {
            L,
            A: Math.cos(hRad) * C,
            B: Math.sin(hRad) * C,
        };
    },

    // Convert Lab to RGB
    labToRgb(L, a, b) {
        const y = (L + 16) / 116;
        const x = a / 500 + y;
        const z = y - b / 200;

        const refX = 95.047, refY = 100.0, refZ = 108.883;

        const X = refX * (x ** 3 > 0.008856 ? x ** 3 : (x - 16/116) / 7.787);
        const Y = refY * (y ** 3 > 0.008856 ? y ** 3 : (y - 16/116) / 7.787);
        const Z = refZ * (z ** 3 > 0.008856 ? z ** 3 : (z - 16/116) / 7.787);

        let r = X *  0.032406 + Y * -0.015372 + Z * -0.004986;
        let g = X * -0.009689 + Y *  0.018758 + Z *  0.000415;
        let bb = X *  0.000557 + Y * -0.002040 + Z *  0.010570;

        [r, g, bb] = [r, g, bb].map(v =>
            v > 0.0031308
                ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055
                : 12.92 * v
        );

        return {
            r: Math.min(255, Math.max(0, Math.round(r * 255))),
            g: Math.min(255, Math.max(0, Math.round(g * 255))),
            b: Math.min(255, Math.max(0, Math.round(bb * 255))),
        };
    },


    /* ======================================================
     *  Color Difference
     * ====================================================== */

    // Calculate CIEDE2000 color difference
    deltaE2000(L1, a1, b1, L2, a2, b2) {
        // (Algorithm unchanged – grouped for clarity)
        const avgLp = (L1 + L2) / 2;
        const C1 = Math.hypot(a1, b1);
        const C2 = Math.hypot(a2, b2);
        const avgC = (C1 + C2) / 2;

        const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
        const a1p = a1 * (1 + G);
        const a2p = a2 * (1 + G);

        const C1p = Math.hypot(a1p, b1);
        const C2p = Math.hypot(a2p, b2);
        const avgCp = (C1p + C2p) / 2;

        const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
        const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;

        let dhp = h2p - h1p;
        if (Math.abs(dhp) > 180) dhp -= 360 * Math.sign(dhp);

        const dLp = L2 - L1;
        const dCp = C2p - C1p;
        const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI / 180) / 2);

        const avgHp = Math.abs(h1p - h2p) > 180
            ? (h1p + h2p + 360) / 2
            : (h1p + h2p) / 2;

        const T =
            1 -
            0.17 * Math.cos((avgHp - 30) * Math.PI / 180) +
            0.24 * Math.cos((2 * avgHp) * Math.PI / 180) +
            0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180) -
            0.20 * Math.cos((4 * avgHp - 63) * Math.PI / 180);

        const SL = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2);
        const SC = 1 + 0.045 * avgCp;
        const SH = 1 + 0.015 * avgCp * T;

        const deltaTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
        const RC = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
        const RT = -RC * Math.sin(2 * deltaTheta * Math.PI / 180);

        return Math.sqrt(
            (dLp / SL) ** 2 +
            (dCp / SC) ** 2 +
            (dHp / SH) ** 2 +
            RT * (dCp / SC) * (dHp / SH)
        );
    },


    /* ======================================================
     *  Image Sampling
     * ====================================================== */

    // Compute average color of a screen region using Lch averaging
    averageColor(img, rect, resolve) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;

        const data = ctx.getImageData(
            rect.left * scaleX,
            rect.top * scaleY,
            rect.width * scaleX,
            rect.height * scaleY
        ).data;

        let sumL = 0, sumC = 0, sumSin = 0, sumCos = 0;
        const total = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
            const { L, C, H } = this.rgbToLch(
                data[i],
                data[i + 1],
                data[i + 2]
            );

            sumL += L;
            sumC += C;
            sumCos += Math.cos(H * Math.PI / 180);
            sumSin += Math.sin(H * Math.PI / 180);
        }

        const avgL = sumL / total;
        const avgC = sumC / total;
        const avgH = (Math.atan2(sumSin, sumCos) * 180 / Math.PI + 360) % 360;

        const lab = this.lchToLab(avgL, avgC, avgH);
        const rgb = this.labToRgb(lab.L, lab.A, lab.B);

        resolve({
            lab,
            rgb,
            hex: this.rgbToHex(rgb.r, rgb.g, rgb.b),
        });
    },


    /* ======================================================
     *  Block Matching & Data Loading
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

    // Load block color reference data
    async loadBlockData() {
        try {
            const res = await fetch(
                'https://raw.githubusercontent.com/LonghiTW/BlockDropper/main/data/block_data.json?ts=' + Date.now()
            );

            const { meta, blocks } = await res.json();
			
			const {
                minecraftVersion,
                textureBaseUrl,
                texturePath,
            } = meta;

            return blocks.map(({ id, hex, ...rest }) => ({
                id,
                hex,
                ...rest,
                r: parseInt(hex.slice(1, 3), 16),
                g: parseInt(hex.slice(3, 5), 16),
                b: parseInt(hex.slice(5, 7), 16),
                image: `${textureBaseUrl}${minecraftVersion}${texturePath}${id}.png`,
            }));
        } catch (err) {
            console.error('Failed to load block colors:', err);
            return [];
        }
    },
};
