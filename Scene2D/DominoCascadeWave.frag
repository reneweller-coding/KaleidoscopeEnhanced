#version 330 core
out vec4 fragColor;
/**
 * @file DominoCascadeWave.frag
 * @brief DOMINO CASCADE WAVE: a field of dominoes seen from a low angle,
 * and the wave of toppling running across it on the scene clock -- each
 * tile a smooth rotation from standing to fallen as the front passes
 * (never a snap), the tiles' faces the photo, the front lit by the kick,
 * the fallen tiles' pips glowing with their spectrum band, the standing
 * ones catching the swell's light.  The wave loops: far behind the front
 * the tiles stand again (a slow smooth reset, out of sight of the front).
 * Camera fixed at table height.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> the toppling front (continuous)
 *   audioKick         -> front light (light)
 *   audioSpectrum[32] -> pip glow by column (light)
 *   audioSwell        -> table light (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: densP, curveP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float curveP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dens = 14.0 + 10.0 * clamp(densP, 0.0, 1.0);
    float curve = 0.3 + 0.7 * clamp(curveP, 0.0, 1.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.35 + sceneTime * 0.07;
    float horizon = 0.15;

    // Table: the photo as a wooden surface in perspective; the sky above dim.
    vec3 col = mix(vec3(0.08, 0.07, 0.08), imgPalette(hue * 0.159 + 0.6) * 0.15, 0.5);
    if (p.y < horizon)
    {
        float d = horizon - p.y;
        float persp = 1.0 / max(d * 3.5, 0.12);
        vec2 f = vec2(p.x * persp * 1.5, persp * 1.2);                   // table coordinates
        vec3 wood = img(fract(f * 0.08)) * mix(vec3(0.6, 0.45, 0.3), imgPalette(hue * 0.159 + 0.1), 0.25) * light;
        col = wood * (0.7 + 0.5 * exp(-d * 1.5));
        // The domino grid in table space: a tile per cell in a row/column
        // lattice; the toppling front is a curved line sweeping in +y
        // (away from the camera... toward the camera) on the clock.
        vec2 g = f * dens * 0.08;
        vec2 cell = floor(g);
        vec2 cf = fract(g) - 0.5;
        float frontPos = fract(clock * 0.5) * 30.0 - 5.0;                 // the front's y in grid units
        float frontY = frontPos + curve * 3.0 * sin(cell.x * 0.4);
        float since = frontY - cell.y;                                     // >0 after the front passed
        float fallen = smoothstep(0.0, 1.5, since);                        // the smooth topple
        float standAgain = smoothstep(18.0, 24.0, since);                  // far behind: reset smoothly (out of view)
        fallen *= (1.0 - standAgain);
        // The tile: standing = a tall dark bar on the cell (its face toward
        // us), fallen = a flat bright plank along +y.  Drawn as height above
        // the table in screen terms: standing tiles rise above their cell.
        float tileH = 1.6 * (1.0 - fallen);                                // height (in cell units) of the standing part
        float tileW = 0.32;
        float inCol = step(abs(cf.x), tileW);
        // Standing part: screen y between the cell's base and base + tileH (in table units projected: approximate by cf.y offset).
        float standing = inCol * step(-0.45, cf.y) * step(cf.y, -0.45 + tileH * 0.45) * (1.0 - fallen);   // a gap between tiles: they must read as single stones
        float flat_ = inCol * step(-0.45, cf.y) * step(cf.y, -0.45 + 0.85 * fallen) * fallen;
        int band = int(mod(cell.x + 8.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 face = img(fract(cell * 0.11 + cf * 0.1)) * 1.2;
        face = mix(face, imgPalette(hue * 0.159 + fract(cell.x * 0.07)), 0.25);
        vec3 standCol = mix(vec3(0.9, 0.86, 0.78), face, 0.45) * light * (0.6 + 0.4 * (cf.y + 0.5));   // cream stones with the photo as tint
        vec3 flatCol = face * 0.9 * light;
        // Pips glow on the fallen tiles with their band.
        float pip = smoothstep(0.08, 0.04, length(cf - vec2(0.0, -0.2 + 0.3 * fract(cell.y * 0.37)))) * flat_;
        flatCol += imgPalette(hue * 0.159 + float(band) / 32.0) * pip * e * 1.0;
        col = mix(col, standCol, standing);
        col = mix(col, flatCol, flat_);
        float topEdge = inCol * smoothstep(0.05, 0.0, abs(cf.y - (-0.45 + tileH * 0.45))) * (1.0 - fallen);
        col = mix(col, vec3(0.05), topEdge * 0.8);
        // The front lit by the kick: the tiles mid-topple glow at their edge.
        float mid = fallen * (1.0 - fallen) * 4.0;
        col += imgPalette(hue * 0.159 + 0.9) * mid * max(standing, flat_) * (0.3 + 0.6 * audioKick);
        // Distance haze.
        col = mix(col, vec3(0.1, 0.09, 0.1), smoothstep(0.35, 0.0, d) * 0.5);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
