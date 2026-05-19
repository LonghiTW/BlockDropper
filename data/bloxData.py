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
import time
import requests
from PIL import Image
from io import BytesIO
from urllib.parse import unquote
from colormath.color_objects import sRGBColor, LabColor, LCHabColor
from colormath.color_conversions import convert_color

# ============================================================
# CONFIGURATION & CONSTANTS
# ============================================================

MINECRAFT_VERSION = "26.1.2"
OUTPUT_FILE = 'block_data.json'
# Path where the unzipped Minecraft assets are located
ASSET_DIR = f'minecraft-assets-{MINECRAFT_VERSION}/assets/minecraft/textures/block'
ASSET_ARCHIVE_NAME = "assets.zip"

# Cache for Wiki image lookup results to prevent redundant API calls
WIKI_IMAGE_CACHE = {}

# Remote resource endpoints for metadata and textures
ASSET_DOWNLOAD_URL = f"https://github.com/InventivetalentDev/minecraft-assets/archive/refs/tags/{MINECRAFT_VERSION}.zip"
TEXTURE_LIST_URL = f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{MINECRAFT_VERSION}/assets/minecraft/textures/block/_list.json"
MODELS_LIST_URL = f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{MINECRAFT_VERSION}/assets/minecraft/models/block/_all.json"
BLOCKSTATES_LIST_URL = f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{MINECRAFT_VERSION}/assets/minecraft/blockstates/_list.json"
WIKI_API_URL = "https://minecraft.wiki/api.php"

# Keywords to exclude from the "standard block" processing
EXCLUDED_BLOCK_KEYWORDS = [
    "_cake", "_honey", "_stage",
    "active", "air", "anchor", "attached_",
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
    "wall_", "water", "waxed", "wire",
]

# Blocks that should always be categorized as a "Block" regardless of name
ALWAYS_BLOCK_LIST = [
    "bedrock", "beehive", "mushroom_block", "quartz_block", "snow_block", "suspicious_gravel", "suspicious_sand", "test_block",
]

# Classification keywords for adding metadata tags to the output items
TAG_CLASSIFICATION_KEYWORDS = {
    "vertical": [
        "_shelf",
        "bamboo_sapling", "banner", "bars",
        "candle", "chain",
        "fence",
        "pane",
        "rod",
        "sign", "stalk",
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
        "snow",
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
        "ladder", "lantern", "leaf", "lectern", "lichen", "lilac", "lily", "loom",
        "magma", "melon",
        "observer", "orchid", "oxeye",
        "peony", "petals", "pickle", "pitcher", "plant", "pointed", "poppy", "pot", "propagule", "pumpkin",
        "red_mushroom", "reinforced_deepslate", "repeater", "roots", "rose",
        "sapling", "scaffolding", "sensor", "shoot", "shrieker", "smoker", "sprouts", "stand", "stonecutter", "structure",
        "table", "target", "tnt", "torch", "tripwire", "tulip",
        "vines",
        "wart_stage", "wheat"
    ]
}

# Mapping for Wiki API redirects or specific names
WIKI_PREFIX_MAPPING = {
    "bamboo_sapling": "Bamboo_Shoot",
    "brewing_stand": "Brewing_Stand_(empty)",
    "command_block": "Impulse_Command_Block",
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
    "snow": "Snow_(layers_1)",
    "spawner": "Monster_Spawner",
    "tnt": "TNT",
    "wheat": "Wheat_Age_7"
}

# Dictionary rules to map block names and IDs (e.g. mapping _log to _wood).
# The key is the match pattern, and the value is the replacement text.
BLOCK_REPLACEMENT_RULES = {
    r"^(.*)_log$": r"\1_wood",
    r"^(.*)crimson_stem$": r"\1crimson_hyphae",
    r"^(.*)warped_stem$": r"\1warped_hyphae",
    r"^(.*)quartz_block_bottom$": r"\1smooth_quartz",
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

# Fallback suffixes used to match decoration IDs with model filenames when direct matches fail
SEARCH_SUFFIXES = [
    "1_age0",
    "_0", "_1tick", "_4",
    "_cap", "_ceiling",
    "_empty",
    "_height2", "_hydration_0",
    "_inventory",
    "_noside",
    "_one_candle",
    "_stable", "_stage0",
    "_top"
]

# Predefined colors for specific items (Beds, Banners)
PREDEFINED_COLORS = {
    "white": "#F9FFFE",
    "orange": "#F9801D",
    "magenta": "#C74EBD",
    "light_blue": "#3AB3DA",
    "yellow": "#FED83D",
    "lime": "#80C71F",
    "pink": "#F38BAA",
    "gray": "#474F52",
    "light_gray": "#9D9D97",
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

def fetch_json_resource(url, description="resource"):
    """
    Fetches and parses JSON from a remote URL with error handling.
    """
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching {description}: {e}")
        return None

def calculate_image_color_avg(image_object):
    """
    Calculates weighted average Lab and RGB from a PIL Image object.
    Uses LCH space for better hue averaging.
    """
    L_sum, C_sum, h_x, h_y, total_count = 0, 0, 0, 0, 0
    img_rgba = image_object.convert('RGBA')

    for px in img_rgba.getdata():
        if px[3] > 0:  # Ignore transparent pixels
            weight = px[3] / 255.0 # Transparent weight
            rgb = sRGBColor(px[0]/255, px[1]/255, px[2]/255)
            lab = convert_color(rgb, LabColor)
            lch = convert_color(lab, LCHabColor)
            
            L_sum += lch.lch_l * weight
            C_sum += lch.lch_c * weight
            h_rad = math.radians(lch.lch_h)
            h_x += math.cos(h_rad) * weight
            h_y += math.sin(h_rad) * weight
            total_count += weight

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

def calculate_texture_list_color_avg(texture_paths):
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
        rgb, lab, count = calculate_image_color_avg(img)
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

def filter_valid_block_textures(texture_manifest):
    """
    Fetches the list of block texture filenames and filters them based on exclusion rules.
    """
    notBlocks = EXCLUDED_BLOCK_KEYWORDS + [kw for group in TAG_CLASSIFICATION_KEYWORDS.values() for kw in group]
    block_list = []

    for filename in texture_manifest["files"]:
        if not filename.endswith(".png"):
            continue

        name = filename[:-4]

        if any(exc in name for exc in ALWAYS_BLOCK_LIST):
            block_list.append(name)
            continue
            
        if ("coral" in name and "block" not in name):
            continue
            
        if any(keyword in name for keyword in notBlocks):
            continue

        block_list.append(name)

    return block_list

def extract_strings_from_structure(val):
    """
    Recursively extracts all string values from nested dictionaries or lists.
    """
    if isinstance(val, str):
        yield val
    elif isinstance(val, dict):
        for v in val.values():
            yield from extract_strings_from_structure(v)
    elif isinstance(val, list):
        for v in val:
            yield from extract_strings_from_structure(v)

def map_textures_to_model_ids(all_textures, models_manifest):
    """
    Maps texture filenames to Minecraft block IDs using model data.
    """
    texture_to_ids = {tex: [] for tex in all_textures}

    # Iterate through all model IDs to find which textures they use
    for model_id, model_content in models_manifest.items():
        textures_dict = model_content.get("textures", {})

        for tex_val in textures_dict.values():
            for tex_path in extract_strings_from_structure(tex_val):
                # Extract name after "minecraft:block/"
                if "/" in tex_path:
                    tex_name = tex_path.split("/")[-1]
                else:
                    tex_name = tex_path.replace("minecraft:", "")

                # Link the model ID to the texture if it's in our valid list
                if tex_name in texture_to_ids:
                    if model_id not in texture_to_ids[tex_name]:
                        texture_to_ids[tex_name].append(model_id)

    return texture_to_ids

def resolve_block_identity(texture_map):
    """
    Matches texture names with the most likely Block ID.
    """
    result = []

    for name, ids_list in texture_map.items():
        # Check if texture name exactly matches a model ID
        if name in ids_list:
            final_id = name
        else:
            # Fallback: remove suffix
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

def identify_decoration_blocks(block_list, blockstates_data):
    """
    Identifies 'decoration' blocks from blockstates that aren't in the main block list.
    """
    # Extract filenames without .json suffix
    all_states = []
    if "files" in blockstates_data:
        for filename in blockstates_data["files"]:
            if filename == "fire.json" or filename == "light.json":
                continue
            if filename.endswith(".json"):
                all_states.append(filename[:-5])
    
    # Filter based on the global exclusion list
    filtered_states = []
    for state in all_states:
        should_skip = any(exc in state for exc in EXCLUDED_BLOCK_KEYWORDS)
        if not should_skip:
            filtered_states.append(state)
    
    # Exclude items already processed as standard blocks
    notDecorations = block_list + ALWAYS_BLOCK_LIST
    decoration_set = set(filtered_states) - set(notDecorations)
    
    return sorted(list(decoration_set))
 
def find_decoration_texture_paths(decoration_list, models_manifest):
    """
    Locates associated texture paths for decoration items by crawling model data.
    """
    result = {}
    color_prefixes = list(PREDEFINED_COLORS.keys())
    
    for name in decoration_list:
        textures_set = set()

        # 1. Direct model match
        model = models_manifest.get(name)
        if model and "textures" in model:
            for tex_val in model["textures"].values():
                for tex_path in extract_strings_from_structure(tex_val):
                    if "block/" in tex_path:
                        textures_set.add(tex_path)
            
        # 2. Suffix-based fallback search
        if not textures_set:
            for suffix in SEARCH_SUFFIXES:
                alt_name = f"{name}{suffix}"
                model = models_manifest.get(alt_name)
                if model and "textures" in model:
                    for tex_val in model["textures"].values():
                        for tex_path in extract_strings_from_structure(tex_val):
                            if "block/" in tex_path:
                                textures_set.add(tex_path)
                    if textures_set:
                        print(f"  [Info] Resolved '{name}' using suffix: '{suffix}' (found '{alt_name}')")
                        break
        
        # 3. Deep Resolve: search all models for any key containing the name that has a block path
        if not textures_set:
            print(f"  [Notice] '{name}' not found or lacks direct asset path. Searching all models (Deep Resolve)...")
            
            for model_key, model_val in models_manifest.items():
                if name in model_key and "textures" in model_val:
                    for tex_val in model_val["textures"].values():
                        for tex_path in extract_strings_from_structure(tex_val):
                            if "block/" in tex_path:
                                textures_set.add(tex_path)
                    if textures_set:
                        print(f"  [Deep Resolve] '{name}' fixed using model '{model_key}' -> textures: {list(textures_set)}")
                        break
        
        # 4. Handle special cases like colored Beds or Banners
        is_color_special = any(name.startswith(f"{color}_bed") or name.startswith(f"{color}_banner") for color in color_prefixes)

        # Final mapping
        if textures_set or is_color_special:
            result[name] = list(textures_set)
        else:
            # Mark for Wiki lookup later
            result[name] = []

    return result

def compute_decoration_colors(mapped_textures, ASSET_DIR, PREDEFINED_COLORS, wiki_image_data):
    """
    Calculates colors for decorations, handling special cases like Beds/Banners.
    """
    result = {}

    for name, textures in mapped_textures.items():
        # Handle predefined colors for specific item groups
        handled = False
        for color in PREDEFINED_COLORS.keys():
            if name.startswith(f"{color}_bed") or name.startswith(f"{color}_banner"):
                hex_color = PREDEFINED_COLORS[color].strip()
                # Hex to RGB
                r = int(hex_color[1:3], 16)
                g = int(hex_color[3:5], 16)
                b = int(hex_color[5:7], 16)
                
                # RGB to Lab
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

        # Color Calculation Logic
        rgb, lab = None, None
        
        # Method A: Use local assets
        existing_paths = []
        for t in textures:
            clean_name = t.split("/")[-1] if "/" in t else t
            p = os.path.join(ASSET_DIR, f"{clean_name}.png")
            if os.path.exists(p): existing_paths.append(p)

        if existing_paths:
            if len(existing_paths) == 1:
                img = Image.open(existing_paths[0])
                rgb, lab, _ = calculate_image_color_avg(img)
            else:
                rgb, lab, _ = calculate_texture_list_color_avg(existing_paths)
        
        # Method B: Use Wiki image if local assets are missing
        elif wiki_image_data.get(name):
            try:
                print(f"  [Fallback] Downloading Wiki image for color: {name}")
                response = requests.get(wiki_image_data[name], timeout=10)
                if response.status_code == 200:
                    img = Image.open(BytesIO(response.content))
                    rgb, lab, _ = calculate_image_color_avg(img)
                    print(f"  [Success] Color for '{name}' calculated using Wiki image.")
            except Exception as e:
                print(f"  [Error] Failed to process Wiki image for {name}: {e}")

        # Save result
        result[name] = {"rgb": rgb, "lab": lab}

    return result

def generate_tags_for_block(block_name):
    """
    Assigns structural or categorical tags based on keywords.
    """
    tags = []
    if block_name == "bamboo":
        tags.append("vertical")
    elif "chain_" in block_name:
        tags.append("decoration")
    else:        
        for tag, keys in TAG_CLASSIFICATION_KEYWORDS.items():
            if any(k in block_name for k in keys):
                tags.append(tag)
    return tags if tags else ["decoration"]

def fetch_wiki_images_for_decorations(decoration_list):
    """
    Scrapes the Minecraft Wiki API for high-quality item renders.
    Uses a hybrid approach:
    1. Batch queries File:<Name>.png in chunks of 50 (super fast, low request count).
    2. Falls back to sequential searches with list=allimages for any missing items.
    """
    result = {}
    
    # Map IDs to their expected Wiki file titles
    id_to_title = {}
    for b_id in decoration_list:
        if b_id in WIKI_PREFIX_MAPPING:
            api_prefix = WIKI_PREFIX_MAPPING[b_id]
        else:
            api_prefix = b_id.replace('_', ' ').title().replace(' ', '_')
            
        # Add .png suffix if it doesn't have it
        filename = api_prefix if api_prefix.endswith('.png') else f"{api_prefix}.png"
        title = f"File:{filename}"
        id_to_title[b_id] = title

    # ----------------------------------------------------
    # PHASE 1: Batch Resolve using prop=imageinfo (50 at a time)
    # ----------------------------------------------------
    print(f"  [Wiki] Batch resolving {len(decoration_list)} decoration image URLs...")
    headers = {
        "User-Agent": "BlockDropperDataConverter/2.0 (contact: github.com/LonghiTW/BlockDropper) requests/2.0"
    }
    
    b_ids = list(decoration_list)
    chunk_size = 50
    missing_ids = []
    
    for i in range(0, len(b_ids), chunk_size):
        chunk = b_ids[i:i+chunk_size]
        titles = [id_to_title[b_id] for b_id in chunk]
        
        params = {
            "action": "query",
            "titles": "|".join(titles),
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json"
        }
        
        try:
            # Respect rate limit slightly
            time.sleep(0.3)
            response = requests.get(WIKI_API_URL, params=params, headers=headers, timeout=10)
            
            if response.status_code == 429:
                print("  [Wiki Warning] Rate limited (429) during batch. Backing off for 5 seconds...")
                time.sleep(5)
                response = requests.get(WIKI_API_URL, params=params, headers=headers, timeout=10)
                
            if response.status_code != 200:
                print(f"  [Wiki Error] Batch query returned status {response.status_code}")
                missing_ids.extend(chunk)
                continue
                
            pages = response.json().get("query", {}).get("pages", {})
            for page_val in pages.values():
                title = page_val.get("title")
                # Normalize title spaces to match
                normalized_title = title.replace(" ", "_") if title else None
                
                # Find matching b_id
                b_id = None
                for t, bid in id_to_title.items():
                    if bid.replace(" ", "_") == normalized_title:
                        b_id = t
                        break
                
                if not b_id:
                    continue
                    
                imageinfo = page_val.get("imageinfo", [])
                if imageinfo and "missing" not in page_val:
                    url = imageinfo[0].get("url")
                    if url:
                        url = url.split('?')[0]  # 去除 ?8f45e 等快取雜湊值，保持網址乾淨
                    result[b_id] = unquote(url) if url else None
                else:
                    missing_ids.append(b_id)
                    
        except Exception as e:
            print(f"  [Wiki Error] Exception in batch: {e}")
            missing_ids.extend(chunk)

    # ----------------------------------------------------
    # PHASE 2: Sequential Fallback search for missing items
    # ----------------------------------------------------
    if missing_ids:
        print(f"  [Wiki] Batch resolved {len(result)} / {len(decoration_list)} images.")
        print(f"  [Wiki] Running sequential fallback searches for {len(missing_ids)} missing items...")
        
        for idx, b_id in enumerate(missing_ids):
            # Check mapping for special names or use Title Case conversion
            if b_id in WIKI_PREFIX_MAPPING:
                api_prefix = WIKI_PREFIX_MAPPING[b_id]
            else:
                api_prefix = b_id.replace('_', ' ').title().replace(' ', '_')
                
            # If we already have it in cache, skip
            if api_prefix in WIKI_IMAGE_CACHE:
                result[b_id] = WIKI_IMAGE_CACHE[api_prefix]
                continue

            params = {
                "action": "query",
                "list": "allimages",
                "aiprefix": api_prefix,
                "ailimit": "max",
                "format": "json"
            }

            try:
                # Politely delay between sequential queries
                time.sleep(1.0)
                
                response = requests.get(WIKI_API_URL, params=params, headers=headers, timeout=10)
                
                if response.status_code == 429:
                    print(f"  [Wiki Warning] Rate limited (429) during fallback for '{b_id}'. Backing off for 8 seconds...")
                    time.sleep(8)
                    response = requests.get(WIKI_API_URL, params=params, headers=headers, timeout=10)
                    
                if response.status_code != 200:
                    print(f"  [Wiki Error] Sequential API returned status code {response.status_code} for '{b_id}'")
                    continue

                all_imgs = response.json().get('query', {}).get('allimages', [])
                filtered = []

                for img in all_imgs:
                    name = img["name"]

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
                        groups = re.findall(r'\((.*?)\)', name)
                        should_continue = False
                        for content in groups:
                            api_prefix_clean = api_prefix.replace('_', ' ')
                            if f"({content})" in api_prefix_clean:
                                continue
                            if "layers" not in content and (re.search(r'[^EWNSUD0-9_]', content) or content == ""):
                                should_continue = True
                                break
                        if should_continue:
                            continue
                    filtered.append(img)

                if filtered:
                    best_pick = None
                    max_je_ver = -1
                    
                    forced_tag = next((t for t, kws in DIRECTION_TAG_MAP.items() if any(k in b_id for k in kws)), None)

                    def get_priority(img):
                        n = img["name"]
                        is_match_forced = 0 if (forced_tag and forced_tag in n) else 1
                        is_south = 0 if ("(S)" in n) else 1
                        m = re.search(r'(?<![a-zA-Z])JE(\d+)', n)
                        ver = int(m.group(1)) if m else 0
                        return (is_match_forced, is_south, -ver, len(n))

                    filtered.sort(key=get_priority)
                    best_pick = filtered[0]["name"]
                    
                    final_wiki_url = f"https://minecraft.wiki/images/{best_pick.replace(' ', '_')}"
                    decoded_wiki_url = unquote(final_wiki_url)
                    WIKI_IMAGE_CACHE[api_prefix] = decoded_wiki_url
                    result[b_id] = decoded_wiki_url
                else:
                    print(f"  [Wiki Warning] No matching .png files found for prefix: '{api_prefix}'")

            except Exception as e:
                print(f"  [Wiki Error] Exception during sequential query for '{b_id}': {e}")
                result[b_id] = None
                
    return result

# ============================================================
# INDEPENDENT PROCESSORS
# ============================================================

def process_standard_blocks(block_info_list, MINECRAFT_VERSION, ASSET_DIR):
    """
    Processes standard blocks: calculates color and generates GitHub texture URLs.
    Supports dynamic replacement rules to alter output names and IDs.
    """
    results = []
    for item in block_info_list:
        name, b_id = item["name"], item["id"]
        img_path = os.path.join(ASSET_DIR, f"{name}.png")
        if not os.path.exists(img_path): 
            continue
        try:
            with Image.open(img_path) as img:
                rgb, lab, count = calculate_image_color_avg(img)
                if count > 0 and rgb:
                    # Apply substitution rules
                    final_name = name
                    final_id = b_id
                    
                    for pattern, replacement in BLOCK_REPLACEMENT_RULES.items():
                        if re.match(pattern, name):
                            final_name = re.sub(pattern, replacement, name)
                            final_id = final_name
                            break

                    results.append({
                        "name": final_name,
                        "id": final_id,
                        "rgb": rgb,
                        "lab": lab,
                        "tags": ["block"],
                        "image": f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/{MINECRAFT_VERSION}/assets/minecraft/textures/block/{name}.png"
                    })
        except Exception as e: 
            print(f"Error processing block {name}: {e}")
    return results
    
def process_decoration_items(decoration_names, models_manifest, ASSET_DIR):
    """
    Processes decorations: links models, calculates colors, and fetches Wiki renders.
    """
    # Step A: Find local texture paths
    mapped_tex = find_decoration_texture_paths(decoration_names, models_manifest)
    # Step B: Get Wiki image URLs first (NEW ORDER)
    image_data = fetch_wiki_images_for_decorations(decoration_names)
    # Step C: Compute colors (passing image_data as fallback)
    color_data = compute_decoration_colors(mapped_tex, ASSET_DIR, PREDEFINED_COLORS, image_data)
    
    # Step D: Final assembly
    decoration_results = []
    for name in decoration_names:
        if name in color_data and color_data[name]["rgb"]:
            decoration_results.append({
                "name": name,
                "id": name,
                "rgb": color_data[name]["rgb"],
                "lab": color_data[name]["lab"],
                "tags": generate_tags_for_block(name),
                "image": image_data.get(name)
            })
    return decoration_results

# ============================================================
# MAIN EXECUTION
# ============================================================

def main():
    print('Block data converter\n')
    
    # Step 0: Download and Unzip Assets (if not exists)
    if not os.path.exists(ASSET_ARCHIVE_NAME):
        print(f"Downloading assets for {MINECRAFT_VERSION}...")
        os.system(f"wget {ASSET_DOWNLOAD_URL} -O {ASSET_ARCHIVE_NAME}")
        os.system(f"unzip -q {ASSET_ARCHIVE_NAME}")
    
    # Step 1: Load JSON manifests from GitHub
    print("Fetching remote resource manifests...")
    resources = {
        "textures": fetch_json_resource(TEXTURE_LIST_URL, "texture list"),
        "models": fetch_json_resource(MODELS_LIST_URL, "models data"),
        "blockstates": fetch_json_resource(BLOCKSTATES_LIST_URL, "blockstates list")
    }
    
    if not all(resources.values()):
        print("Error: Could not load all required remote resources. Exiting.")
        return
    
    # Step 2: Process Standard Blocks
    print(f"Processing Blocks...")
    all_textures_list = filter_valid_block_textures(resources["textures"])
    texture_map = map_textures_to_model_ids(all_textures_list, resources["models"])
    block_info_list = resolve_block_identity(texture_map)
    block_results = process_standard_blocks(block_info_list, MINECRAFT_VERSION, ASSET_DIR)
    
    # Step 3: Process Decorations
    print(f"Processing Decorations...")
    base_block_names = [b["id"] for b in block_results]
    decoration_names = identify_decoration_blocks(base_block_names, resources["blockstates"])
    decoration_results = process_decoration_items(decoration_names, resources["models"], ASSET_DIR)

    # Step 4: Save final result to JSON
    output = {
        "meta": {"minecraftVersion": MINECRAFT_VERSION},
        "blocks": block_results,
        "decorations": decoration_results
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=4, ensure_ascii=False)
    
    print(f"\nProcessing Complete! Blocks: {len(block_results)}, Decorations: {len(decoration_results)}")
    
    # Diagnostic summary
    missing_block_imgs = [b["name"] for b in block_results if not b.get("image")]
    missing_decor_imgs = [d["name"] for d in decoration_results if not d.get("image")]
    
    print(f"  - Blocks with valid image URLs: {len(block_results) - len(missing_block_imgs)} / {len(block_results)}")
    print(f"  - Decorations with valid image URLs: {len(decoration_results) - len(missing_decor_imgs)} / {len(decoration_results)}")
    
    if missing_decor_imgs:
        print(f"\n  [Notice] The following {len(missing_decor_imgs)} decorations failed to get a Wiki image URL:")
        for name in missing_decor_imgs[:15]:
            print(f"    - {name}")
        if len(missing_decor_imgs) > 15:
            print(f"    ... and {len(missing_decor_imgs) - 15} more.")
            
    print(f"\nData saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
