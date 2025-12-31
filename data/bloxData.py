# ============================================================
# Block Data Converter for Minecraft Assets
# ============================================================
# Requirements:
#   !pip install Pillow colormath
# ============================================================

import os
import re
import math
import json
import requests
from PIL import Image
from io import BytesIO
from colormath.color_objects import sRGBColor, LabColor, LCHabColor
from colormath.color_conversions import convert_color

# ============================================================
# CONFIGURATION & CONSTANTS
# ============================================================

version = "1.21.11"
outputFile = 'block_data.json'
# Path where the unzipped Minecraft assets are located
asset_dir = f'minecraft-assets-{version}/assets/minecraft/textures/block'
asset_file = "assets.zip"

# Cache for Wiki image lookup results
wiki_cache = {}

# Remote resource endpoints for metadata and textures
asset_url = f"https://github.com/InventivetalentDev/minecraft-assets/archive/refs/tags/{version}.zip"
texture_url = f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{version}/assets/minecraft/textures/block/_list.json"
models_url = f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{version}/assets/minecraft/models/block/_all.json"
blockstates_url = f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{version}/assets/minecraft/blockstates/_list.json"
WIKI_API_URL = "https://minecraft.wiki/api.php"

# Keywords to exclude from the "standard block" processing
excludeBlocks = [
    "_cake", "_honey", "_stage",
    "active", "air", "anchor",
    "barrier", "bubble", "button",
    "composter_compost", "composter_ready", "composter_top", "crop",
    "debug", "destroy", "door", "dust",
    "emissive",
    "farmland", "fire_0", "fire_1",
    "gateway",
    "infested", "item",
    "kelp",
    "lava",
    "moving",
    "plate", "portal", "powder_", "potted",
    "rail",
    "seagrass", "skeleton", "slab", "soul_fire", "stairs",
    "vines_plant", "void",
    "wall_", "water", "waxed", "wire", "wood",
]

# Blocks that should always be Block
absoluteBlock = [
    "bedrock", "beehive", "mushroom_block", "suspicious_gravel", "suspicious_sand", "test_block",
]

# Classification keywords for adding metadata tags to the output
tagKeywords = {
    "vertical": [
        "_shelf",
        "bamboo_sapling", "banner", "bars",
        "candle", "chain",
        "fence",
        "pane",
        "rod",
        "sign",
        "trapdoor",
        "vein",
        "wall"
    ],
    "horizontal": [
        "_bed",
        "cake", "campfire", "carpet", "chain",
        "detector",
        "fan", "frame",
        "rod",
        "trapdoor",
        "vein"
    ],
    "translucent": [
        "cobweb",
        "glass", "grate",
        "honey_",
        "leaves",
        "slime", "spawner",
        "vault"
    ],
    "decoration": [
        "_bud", "_ore",
        "allium", "anvil", "azalea", "azure",
        "beacon", "bee_", "bell", "blossom", "bookshelf", "box", "brown_mushroom", "bush",
        "cactus", "cane", "carrots", "catalyst", "cauldron", "chest", "clump", "cluster", "cocoa", "command", "comparator", "conduit", "core", "craft",
        "dandelion", "dispenser", "dropper",
        "egg", "eyeblossom",
        "fern", "flower", "froglight", "frogspawn", "fungus",
        "ghast", "glazed", "golem", "grass", "grindstone",
        "hanging_moss", "head", "hopper",
        "jigsaw",
        "ladder", "lantern", "leaf", "lectern", "lichen", "lilac", "lily",
        "magma", "melon_stem",
        "observer", "orchid", "oxeye",
        "peony", "petals", "pickle", "pitcher", "plant", "pointed", "poppy", "pot", "propagule", "pumpkin_stem",
        "red_mushroom", "repeater", "roots", "rose",
        "sapling", "scaffolding", "sensor", "shoot", "shrieker", "sprouts", "stand", "stonecutter", "structure",
        "table", "target", "tnt", "torch", "tripwire", "tulip",
        "vines",
        "wart_stage", "wheat"
    ]
}

# Mapping for Wiki API redirects or specific names
wikiMapping = {
    "bamboo_sapling": "Bamboo_Shoot",
    "command_block": "Impulse_Command_Block",
    "quartz_block": "Block_of_Quartz",
    "chiseled_bookshelf": "Chiseled_Bookshelf_(S_0)",
    "comparator": "Redstone_Comparator",
    "deepslate_lapis_ore": "Deepslate_Lapis_Lazuli_Ore",
    "hay_block": "Hay_Bale_(UD)",
    "jack_o_lantern": "Jack_o'Lantern",
    "lapis_ore": "Lapis_Lazuli_Ore",
    "leaf_litter": "Leaf_Litter_4",
    "lily_of_the_valley": "Lily_of_the_Valley",
    "repeater": "Redstone_Repeater",
    "scaffolding": "Standing_Scaffolding",
    "spawner": "Monster_Spawner",
    "tnt": "TNT"
}

# Direction tags for Wiki image filtering
DIRECTION_TAG_MAP = {
    "(N)":   ["bell", "lichen"],
    "(EW)":  ["bars", "fence", "pane"],
    "(EWU)": ["wall"],
    "(UD)":  ["chain", "froglight"],
    "(U)":   ["bud", "cluster", "rod", "piston_head"],
    "(D)":   ["hopper"], 
}

# Predefined colors for specific items (Beds, Banners)
specific_color = {
    "white": "#F9FFFE",
    "orange": "#F9801D",
    "magenta": "#C74EBD",
    "light_blue": "#3AB3DA",
    "yellow": "#FED83D",
    "lime": "#80C71F",
    "pink": "#F38BAA",
    "gray": "#474F52",
    "light_gray": " #9D9D97",
    "cyan": "#169C9C",
    "purple": "#8932B8",
    "blue": "#3C44AA",
    "brown": "#835432",
    "green": "#5E7C16",
    "red": "#B02E26",
    "black": "#1D1D21",
}

# ============================================================
# UTILITIES
# ============================================================

def fetch_json(url, description="resource"):
    """Fetches and parses JSON from a remote URL with error handling."""
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching {description}: {e}")
        return None

def calculate_avg_rgb_lab_from_img(img_obj):
    """
    Calculates weighted average Lab and RGB from a PIL Image object.
    Uses LCH space for better hue averaging.
    """
    L_sum, C_sum, h_x, h_y, total_count = 0, 0, 0, 0, 0
    img_rgba = img_obj.convert('RGBA')

    for px in img_rgba.getdata():
        if px[3] != 0:  # Ignore transparent pixels
            rgb = sRGBColor(px[0]/255, px[1]/255, px[2]/255)
            lab = convert_color(rgb, LabColor)
            lch = convert_color(lab, LCHabColor)
            L_sum += lch.lch_l
            C_sum += lch.lch_c
            h_rad = math.radians(lch.lch_h)
            h_x += math.cos(h_rad)
            h_y += math.sin(h_rad)
            total_count += 1

    if total_count == 0:
        return None, None, 0

    L_avg, C_avg = L_sum / total_count, C_sum / total_count
    h_avg = math.degrees(math.atan2(h_y, h_x)) % 360

    avg_lab_obj = convert_color(LCHabColor(L_avg, C_avg, h_avg), LabColor)
    lab_list = [avg_lab_obj.lab_l, avg_lab_obj.lab_a, avg_lab_obj.lab_b]

    avg_rgb_obj = convert_color(avg_lab_obj, sRGBColor)
    rgb_list = [
        max(0, min(255, round(avg_rgb_obj.rgb_r * 255))),
        max(0, min(255, round(avg_rgb_obj.rgb_g * 255))),
        max(0, min(255, round(avg_rgb_obj.rgb_b * 255)))
    ]

    return rgb_list, lab_list, total_count

def calculate_avg_rgb_lab_from_textures(texture_paths):
    """
    Computes a weighted average color from multiple texture files.
    """
    if not texture_paths:
        return None, None, 0

    total_L, total_a, total_b, total_px = 0, 0, 0, 0

    for path in set(texture_paths):
        if not os.path.exists(path):
            continue
        img = Image.open(path)
        rgb, lab, count = calculate_avg_rgb_lab_from_img(img)
        if count > 0:
            total_L += lab[0] * count
            total_a += lab[1] * count
            total_b += lab[2] * count
            total_px += count

    if total_px == 0:
        return None, None, 0

    final_lab = [total_L / total_px, total_a / total_px, total_b / total_px]
    lab_obj = LabColor(*final_lab)

    rgb_obj = convert_color(lab_obj, sRGBColor)
    final_rgb = [
        max(0, min(255, round(rgb_obj.rgb_r * 255))),
        max(0, min(255, round(rgb_obj.rgb_g * 255))),
        max(0, min(255, round(rgb_obj.rgb_b * 255)))
    ]

    return final_rgb, final_lab, total_px

# ============================================================
# BLOCK DATA PROCESSING
# ============================================================

def get_block_list(texture_data):
    """
    Fetches the list of block texture filenames and filters them based on exclusion rules.
    """
    notBlocks = excludeBlocks + [kw for group in tagKeywords.values() for kw in group]
    block_list = []

    for filename in texture_data["files"]:
        if not filename.endswith(".png"):
            continue

        name = filename[:-4]

        if any(exc in name for exc in absoluteBlock):
            block_list.append(name)
            continue
            
        if ("coral" in name and "block" not in name):
            continue
            
        if any(keyword in name for keyword in notBlocks):
            continue

        block_list.append(name)

    return block_list

def map_textures_to_ids(all_textures, models_data):
    """
    Maps texture filenames to Minecraft block IDs using model data.
    """
    texture_to_ids = {tex: [] for tex in all_textures}

    # 遍歷所有模型 ID，找出它們使用的材質
    for model_id, model_content in models_data.items():
        textures_dict = model_content.get("textures", {})

        for tex_path in textures_dict.values():
            # 提取 "minecraft:block/" 之後的名字
            if "/" in tex_path:
                tex_name = tex_path.split("/")[-1]
            else:
                tex_name = tex_path.replace("minecraft:", "")

            # 如果這個材質在我們的材質列表中，建立關聯
            if tex_name in texture_to_ids:
                if model_id not in texture_to_ids[tex_name]:
                    texture_to_ids[tex_name].append(model_id)

    return texture_to_ids

def process_texture_ids(texture_map):
    """
    Matches texture names with the most likely Block ID.
    """
    result = []

    for name, ids_list in texture_map.items():
        # 判斷 value 中是否有和 key 完全相同
        if name in ids_list:
            final_id = name
        else:
            # 去掉最後一段文字，例如 "acacia_log_top" -> "acacia_log"
            parts = name.split("_")
            final_id = "_".join(parts[:-1])

        result.append({
            "name": name,
            "id": final_id
        })

    return result

# ============================================================
# DECORATION DATA PROCESSING
# ============================================================

def get_decoration_list(block_list, blockstates_data):
    """
    Identifies 'decoration' blocks from blockstates that aren't in the main block list.
    """
    # 提取檔名並去掉 .json 後綴
    all_states = []
    if "files" in blockstates_data:
        for filename in blockstates_data["files"]:
            if filename == "fire.json" or filename == "light.json":
                continue
            if filename.endswith(".json"):
                all_states.append(filename[:-5])
    
    # 排除 excludeBlocks 中的關鍵字
    filtered_states = []
    for state in all_states:
        should_skip = any(exc in state for exc in excludeBlocks)
        if not should_skip:
            filtered_states.append(state)
    
    # 扣除 block_list 中已有的項目
    notDecorations = block_list + absoluteBlock
    decoration_set = set(filtered_states) - set(notDecorations)
    
    return sorted(list(decoration_set))

def map_names_to_textures(decoration_list, models_data):
    """
    Finds associated texture paths for decoration items.
    """
    result = {}
    color_prefixes = list(specific_color.keys())
    
    for name in decoration_list:
        textures_set = set()

        # 1️⃣ 完全匹配
        model = models_data.get(name)
        if model and "textures" in model:
            textures_set.update(model["textures"].values())

        # 2️⃣ 如果完全匹配沒找到材質，再做關鍵字匹配
        if not textures_set:
            for key, val in models_data.items():
                if name in key and "textures" in val:
                    textures_set.update(val["textures"].values())
        
        # 3️⃣ 判斷是否為特例 (Bed 或 Banner)
        is_color_special = any(name.startswith(f"{color}_bed") or name.startswith(f"{color}_banner") for color in color_prefixes)

        # 如果找到材質才存結果
        if textures_set or is_color_special:
            result[name] = list(textures_set)

    return result

def process_decoration_texture(mapped_textures, asset_dir, specific_color):
    """
    Calculates colors for decorations, handling special cases like Beds/Banners.
    """
    result = {}

    for name, textures in mapped_textures.items():
        # Handle Predefined Colors
        handled = False
        for color in specific_color.keys():
            if name.startswith(f"{color}_bed") or name.startswith(f"{color}_banner"):
                hex_color = specific_color[color].strip()
                # 轉 hex -> RGB
                r = int(hex_color[1:3], 16)
                g = int(hex_color[3:5], 16)
                b = int(hex_color[5:7], 16)
                
                # 將 RGB 轉換為 Lab
                rgb_obj = sRGBColor(r/255, g/255, b/255)
                lab_obj = convert_color(rgb_obj, LabColor)
                
                result[name] = {
                    "rgb": [r, g, b],
                    "lab": [lab_obj.lab_l, lab_obj.lab_a, lab_obj.lab_b]  # Lab 可不計或之後轉換
                }
                handled = True
                break
        if handled:
            continue

        # 2️⃣ 一般材質計算
        if not textures:
            # 沒有材質就留空
            result[name] = {"rgb": None, "lab": None}
            continue

        # 判斷使用單圖或多圖計算
        existing_paths = []
        for t in textures:
            clean_name = t.split("/")[-1] if "/" in t else t
            p = os.path.join(asset_dir, f"{clean_name}.png")
            if os.path.exists(p): existing_paths.append(p)

        if not existing_paths:
            result[name] = {"rgb": None, "lab": None}
            continue
        elif len(existing_paths) == 1:
            img = Image.open(existing_paths[0])
            rgb, lab, _ = calculate_avg_rgb_lab_from_img(img)
        else:
            rgb, lab, _ = calculate_avg_rgb_lab_from_textures(existing_paths)

        result[name] = {
            "rgb": rgb,
            "lab": lab
        }

    return result

# determine tag
def get_decoration_tag(blockName):
    tags = []
    if blockName == "bamboo":
        tags.append("vertical")
    elif "chain_" in blockName:
        tags.append("decoration")
    else:        
        for tag, keys in tagKeywords.items():
            if any(k in blockName for k in keys):
                tags.append(tag)
    return tags if tags else ["decoration"]

# find image
def get_decoration_image(decoration_list):
    """
    Scrapes the Minecraft Wiki API for high-quality item renders.
    Implements complex filtering to get the correct orientation.
    """
    
    result = {}

    for b_id in decoration_list:
        # 優先檢查 wikiMapping
        if b_id in wikiMapping:
            api_prefix = wikiMapping[b_id]
        else:
            # 使用 .title() 會將所有單字首字大寫，再將底線保留
            api_prefix = b_id.replace('_', ' ').title().replace(' ', '_')
        if api_prefix in wiki_cache:
            final_wiki_url = wiki_cache[api_prefix]
            result[b_id] = final_wiki_url
            continue

        params = {
            "action": "query",
            "list": "allimages",
            "aiprefix": api_prefix,
            "ailimit": "max",
            "format": "json"
        }

        try:
            response = requests.get(WIKI_API_URL, params=params, timeout=10)
            if response.status_code != 200:
                continue

            all_imgs = response.json().get('query', {}).get('allimages', [])
            filtered = []

            for img in all_imgs:
                name = img["name"]

                # 只保留 PNG
                if not name.endswith('.png'):
                    continue
                if "pane" not in b_id and "Pane" in name: continue
                if "bee" in b_id and "Honey" in name: continue
                if "coral" in b_id and "block" not in b_id and "fan" not in b_id:
                    if "Block" in name or "Fan" in name: continue
                if "conduit" in b_id and "Power" in name: continue
                if "mushroom" in b_id and "block" not in b_id:
                    if "Block" in name: continue
                if b_id == "smithing_table" and "Hammer" in name: continue
                if "vines" in b_id and "Plant" not in name: continue
                if '(' in name and ')' in name:
                    c = re.search(r'\((.*?)\)', name)
                    if c and (re.search(r'[^EWNSUD0-9_]', c.group(1)) or c.group(1)==""): continue
                filtered.append(img)

            if filtered:
                best_pick = None
                max_je_ver = -1
                
                # 1. 檢查是否有強制指定的方向標籤 (如 Fence 必須使用 EW)
                forced_tag = next((t for t, kws in DIRECTION_TAG_MAP.items() if any(k in b_id for k in kws)), None)

                # 2. 排序權重函式
                def get_priority(img):
                    n = img["name"]
                    # 優先級分數 (越小越優先)
                    # 第一權重：是否符合強制標籤 (0 為符合, 1 為不符合)
                    is_match_forced = 0 if (forced_tag and forced_tag in n) else 1
                    # 第二權重：是否為南面圖 (0 為是, 1 為否) -> 僅在非強制模式有效
                    is_south = 0 if ("(S)" in n) else 1
                    # 第三權重：JE 版本 (取負數，讓大版本變小，排在前面)
                    # 提取版本 (排除 pJE)
                    m = re.search(r'(?<![a-zA-Z])JE(\d+)', n)
                    ver = int(m.group(1)) if m else 0
                    # 第四權重：檔名長度
                    return (is_match_forced, is_south, -ver, len(n))

                # 3. 直接排序並挑選第一名
                filtered.sort(key=get_priority)
                best_pick = filtered[0]["name"]
                
                final_wiki_url = f"https://minecraft.wiki/images/{best_pick.replace(' ', '_')}"
                wiki_cache[api_prefix] = final_wiki_url
                result[b_id] = final_wiki_url

        except Exception as e:
            # 可選: 記錄錯誤
            result[b_id] = None

    return result

# ============================================================
# INDEPENDENT PROCESSORS
# ============================================================

def process_blocks(block_info_list, version, asset_dir):
    """Processes standard blocks: calculates color and generates GitHub texture URLs."""
    results = []
    for item in block_info_list:
        name, b_id = item["name"], item["id"]
        img_path = os.path.join(asset_dir, f"{name}.png")
        if not os.path.exists(img_path): 
            continue
        try:
            with Image.open(img_path) as img:
                rgb, lab, count = calculate_avg_rgb_lab_from_img(img)
                if count > 0 and rgb:
                    results.append({
                        "name": name,
                        "id": b_id,
                        "rgb": rgb,
                        "lab": lab,
                        "tags": ["block"],
                        "image": f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{version}/assets/minecraft/textures/block/{name}.png"
                    })
        except Exception as e: 
            print(f"Error processing block {name}: {e}")
    return results
    
def process_decorations(decoration_names, models_data, asset_dir):
    """Processes decorations: links models, calculates colors, and fetches Wiki renders."""
    # 獲取模型對應的材質路徑
    mapped_tex = map_names_to_textures(decoration_names, models_data)
    # 計算平均顏色（處理特殊顏色如床、旗幟）
    color_data = process_decoration_texture(mapped_tex, asset_dir, specific_color)
    # 抓取 Wiki 圖片連結
    image_data = get_decoration_image(decoration_names)
    
    results = []
    for name in decoration_names:
        if name in color_data and color_data[name]["rgb"]:
            results.append({
                "name": name,
                "id": name,
                "rgb": color_data[name]["rgb"],
                "lab": color_data[name]["lab"],
                "tags": get_decoration_tag(name),
                "image": image_data.get(name)
            })
    return results

# ============================================================
# MAIN EXECUTION
# ============================================================

def main():
    print('Block data converter\n')
    
    # Step 0: Download and Unzip Assets (if not exists)
    if not os.path.exists(asset_file):
        print(f"Downloading assets for {version}...")
        os.system(f"wget {asset_url} -O {asset_file}")
        os.system(f"unzip -q {asset_file}")
    
    # Step 1: Load JSON manifests from GitHub
    print("Fetching remote resource manifests...")
    resources = {
        "textures": fetch_json(texture_url, "texture list"),
        "models": fetch_json(models_url, "models data"),
        "blockstates": fetch_json(blockstates_url, "blockstates list")
    }
    
    if not all(resources.values()):
        print("Error: Could not load all required remote resources. Exiting.")
        return
    
    # Step 2: Process Standard Blocks
    print(f"Processing Blocks...")
    all_textures_list = get_block_list(resources["textures"])
    texture_map = map_textures_to_ids(all_textures_list, resources["models"])
    block_info_list = process_texture_ids(texture_map)
    block_results = process_blocks(block_info_list, version, asset_dir)
    
    # Step 3: Process Decorations
    print(f"Processing Decorations...")
    base_block_names = [b["name"] for b in block_results]
    decoration_names = get_decoration_list(base_block_names, resources["blockstates"])
    decoration_results = process_decorations(decoration_names, resources["models"], asset_dir)

    # Step 4: Save final result to JSON
    output = {
        "meta": {"minecraftVersion": version},
        "blocks": block_results,
        "decorations": decoration_results
    }

    with open(outputFile, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=4, ensure_ascii=False)
    
    print(f"\nProcessing Complete! Blocks: {len(block_results)}, Decorations: {len(decoration_results)}")
    print(f"Data saved to:{outputFile}")

if __name__ == "__main__":
    main()
