# "!pip install Pillow colormath" on colab

from PIL import Image
from colormath.color_objects import XYZColor, sRGBColor, LabColor, LCHabColor
from colormath.color_conversions import convert_color
import math
import os
import json

print('Block data converter\n')

# download block images
version = "1.21.11"
zip_url = f"https://github.com/InventivetalentDev/minecraft-assets/archive/refs/tags/{version}.zip"
zip_file = "assets.zip"

os.system(f"wget {zip_url} -O {zip_file}")

# unzip
os.system(f"unzip -q {zip_file}")

# block data
dirname = f'minecraft-assets-{version}/assets/minecraft/textures/block'
outputFile = 'block_data.json'
block_list = []

excludeBlocks = ["button","door","plate","slab","stairs","rail","barrier","head","gateway","portal","farmland","kelp","lava","wire","seagrass","skeleton","soul_fire","void","water","dust","fire_0","fire_1","emissive","anchor","active","destroy","debug","item"]

# check if the directory exists
if not os.path.isdir('./' + dirname):
    raise FileNotFoundError(f'[!] Error -- directory "{dirname}" not found. Make sure it exists in the same folder as this script.')

# get list of all .png files in the directory folder
listImgFound = [
    f for f in os.listdir('./' + dirname)
    if f.endswith('.png') and not any(key in f for key in excludeBlocks)
]
# UPD: Sort images (they used to be read last to first, but now they apparently aren't?)
listImgFound.sort(reverse=True)

# check if the list is not empty
if not listImgFound:
    raise FileNotFoundError(f'[!] Error -- no textures found in "{dirname}".')

print('[i] Found', len(listImgFound), 'textures in the "' + dirname + '" directory')

# cycle through the images starting from the LAST one until -1 is reached
for i in range(len(listImgFound)-1, -1, -1):
    imgName = listImgFound[i]
    blockName = os.path.splitext(imgName)[0]

    imgProc = Image.open('./' + dirname + '/' + imgName).convert('RGBA')
    
    # LCh accumulation
    L_sum = 0
    C_sum = 0
    h_x = 0   # for angle averaging (cos component)
    h_y = 0   # for angle averaging (sin component)
    count = 0

    for a in imgProc.getdata():
        if a[3] != 0:  # skip transparent pixels

            # convert sRGB → XYZ → LAB → LCh
            rgb = sRGBColor(a[0]/255, a[1]/255, a[2]/255)
            lab = convert_color(rgb, LabColor)
            lch = convert_color(lab, LCHabColor)

            L_sum += lch.lch_l
            C_sum += lch.lch_c

            # convert hue to radians
            h_rad = math.radians(lch.lch_h)

            # vector sum (to avoid 360° discontinuity)
            h_x += math.cos(h_rad)
            h_y += math.sin(h_rad)

            count += 1

    # average L, C, and hue
    L_avg = L_sum / count
    C_avg = C_sum / count

    # compute average hue angle
    h_avg_rad = math.atan2(h_y, h_x)
    if h_avg_rad < 0:
        h_avg_rad += math.tau  # bring back to [0, 2π)

    h_avg = math.degrees(h_avg_rad)

    # build average LCh object
    avg_lch = LCHabColor(L_avg, C_avg, h_avg)
    
    # convert from LCh to Lab
    avg_lab = convert_color(avg_lch, LabColor)
    lab_value = [avg_lab.lab_l, avg_lab.lab_a, avg_lab.lab_b]
    
    # convert from Lab to sRGB
    avg_rgb = convert_color(avg_lab, sRGBColor)
    
    r = max(0, min(255, round(avg_rgb.rgb_r * 255)))
    g = max(0, min(255, round(avg_rgb.rgb_g * 255)))
    b = max(0, min(255, round(avg_rgb.rgb_b * 255)))
    hex_value = "#{:02x}{:02x}{:02x}".format(r, g, b)

    # determine tags
    tags = []

    if any(key in blockName for key in ("mushroom_block", "bedrock")):
        tags.append("block")
    elif blockName == "bamboo":
        tags.append("vertical")
    elif "chain_" in blockName:
        tags.append("decoration")
    else:
        tagKeywords = {
            "vertical": ["fence","sign","_shelf","trapdoor","pane","wall","banner","candle","bars","chain","rod"],
            "horizontal": ["trapdoor","bed","carpet","fan","cake","campfire","chain","detector","frame","rod"],
            "translucent": ["leaves","glass","cobweb","grate","spawner","vault"],
            "decoration": ["sapling","allium","cluster","anvil","azalea","azure","shoot","beacon","roots","bell","dripleaf","glazed","box","orchid","bookshelf","coral","stand","brown_mushroom","red_mushroom","bush","cactus","sensor","carrots","cauldron","vines","command","chest","flower","plant","eyeblossom","_ore","cocoa","conduit","golem","lantern","torch","craft","fungus","dandelion","pot","dispenser","egg","ghast","dropper","table","fern","frogspawn","lichen","grindstone","core","hopper","ladder","jigsaw","_bud","litter","lectern","lilac","lily","propagule","melon_stem","pumpkin_stem","sprouts","wart_stage","observer","tulip","oxeye","hanging_moss","peony","petals","pitcher","pointed","poppy","comparator","repeater","clump","scaffolding","catalyst","shrieker","vein","pickle","grass","blossom","stonecutter","structure","cane","target","test","tnt","tripwire","wheat","rose"]
        }
        
        for tag, keys in tagKeywords.items():
            if any(k in blockName for k in keys):
                tags.append(tag)
    
    if not tags:
        tags.append("block")

    # append result to the block-storing JSON object
    block_list.append({
        "id": blockName,
        "hex": hex_value,
        "lab": lab_value,
        "tags": tags
    })
    
    print(f'Added {str(blockName)}')
    
# write to the JSON file
with open(outputFile, 'w', encoding='utf-8') as f:
    json.dump(block_list, f, indent=4, ensure_ascii=False)

print('\nConversion finished --', str(len(listImgFound)), '/', str(len(listImgFound)), 'textures converted.')
