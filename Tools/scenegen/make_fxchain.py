# -*- coding: utf-8 -*-
"""Build src/FxChain.glsl: the chain lab as an overlay (CombineShader).
Every scene becomes the input of a rolled transform chain.  The whole shader is
ChainLab2D's; only the target (FX), the description and the colour field
(optional here, so the scene keeps its own colours) differ."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
s = io.open(os.path.join(SP, "src", "ChainLab2D.glsl"), encoding="utf-8").read()
a = s.index("//@doc")
b = s.index("//@params")
DOC = r'''//@doc
 * @brief FX CHAIN: the chain laboratory as an overlay -- the finished frame of
 * whatever scene is playing flows through a rolled chain of four continuous
 * transforms (the 2D chain lab's classes: global map, symmetry, second map,
 * warp), so every scene becomes the input of a new chain.  The frame has no
 * mip chain of its own; the engine builds one while this FX is on screen
 * (EffectShader::usesSceneLod), which keeps the squeezed parts from shimmering.
 * Rendered as the frame itself, a lit relief or glowing edges (the preset keeps
 * styleP low), optionally tinted by a colour field that follows the chain.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the chain (integrated, jump-free)
 *   sceneAdvance    -> the chain morphs on to the next transform (integrated)
 *   audioPhase      -> the kaleidoscopes turn, the colour field wanders (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the edges flare (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioSwell      -> the relief light (slow)
 *
 * Knobs: chainAP / chainBP / chainCP / chainDP (the chain, rolled per start),
 * morphP (which stage, if any, morphs on with the music), styleP (frame /
 * relief / edges / contours / flow), speedP (flow speed), detailP (sharpness),
 * paletteP (the frame's own colours / colour field), hueP.
'''
s = s[:a] + DOC + s[b:]
s = s.replace("//@body\n", "//@target fx\n//@body\n", 1)
old = "photo = mix(photo, field, 0.25 + 0.7 * clamp(paletteP, 0.0, 1.0));"
assert old in s
s = s.replace(old, "photo = mix(photo, field, 0.7 * clamp(paletteP, 0.0, 1.0));   // the scene keeps its colours unless paletteP asks")
io.open(os.path.join(SP, "src", "FxChain.glsl"), "w", encoding="utf-8", newline="\n").write(s)
print("ok")
