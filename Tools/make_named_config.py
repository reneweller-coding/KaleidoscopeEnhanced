# -*- coding: utf-8 -*-
"""Baut eine Sweep-Config aus einer Namensliste.
  python make_named_config.py <namen.txt> <ZZDatei.xml> <ConfigName>
"""
import io, os, re, sys

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
names_file, out_file, cfg_name = sys.argv[1], sys.argv[2], sys.argv[3]
names = [n.strip() for n in io.open(names_file, encoding="utf-8").read().split() if n.strip()]

src = io.open("Presets/Komplett.xml", encoding="utf-8").read()
BLOCK = re.compile(r"[ \t]*<(TextureShader|CombineShader|TransitionShader)\b[^>]*>.*?</\1>[ \t]*\n", re.S)
by, plain, cross = {}, None, None
for m in BLOCK.finditer(src):
    tag, blk = m.group(1), m.group(0)
    fm = re.search(r'file="[^"]*[\\/](\w+)\.frag"', blk.split(">", 1)[0])
    nm = fm.group(1) if fm else "?"
    if tag == "TextureShader":
        by.setdefault(nm, blk)
    elif nm == "FxPlain":
        plain = blk
    elif nm == "Crossfade":
        cross = blk

sel = [n for n in names if n in by]
missing = [n for n in names if n not in by]
xml = ('<?xml version="1.0" encoding="utf-8" ?>\n'
       '<configuration ImageDirectory="..\\Images" ConfigurationName="%s" hidden="true" >\n\n'
       '%s%s%s\n</configuration>\n' % (cfg_name, "".join(by[n] for n in sel), plain, cross))
io.open(out_file, "w", encoding="utf-8", newline="\n").write(xml)
import xml.etree.ElementTree as ET
ET.parse(out_file)
print("%d/%d Szenen -> %s (%s)" % (len(sel), len(names), out_file, cfg_name))
if missing:
    print("  nicht im Katalog:", ", ".join(missing[:10]), "..." if len(missing) > 10 else "")
