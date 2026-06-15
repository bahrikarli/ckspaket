# Buğday ikonunu PNG'den ICO'ya çevirir (Pillow gerekir: pip install pillow)
$png = Join-Path $PSScriptRoot "bugday.png"
$ico = Join-Path $PSScriptRoot "bugday.ico"
python -c @"
from PIL import Image
img = Image.open(r'$png').convert('RGBA')
img.save(r'$ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(256,256)])
print('ICO:', r'$ico')
"@
