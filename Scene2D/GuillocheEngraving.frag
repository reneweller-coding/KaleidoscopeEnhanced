#version 330 core
out vec4 fragColor;
/**
 * @file GuillocheEngraving.frag
 * @brief GUILLOCHE ENGRAVING: the banknote rosette.  Nested guilloche
 * curves -- r(theta) = sum of cosines whose amplitudes come from the twelve
 * chroma classes -- engraved as fine ink lines over the photo, so the
 * harmony of the moment literally draws the rosette.  The rosette turns
 * steadily on the scene clock; the chroma shapes it (smoothly, as the
 * chroma itself is smooth); the kick brightens the ink; the treble adds
 * the micro-hatching.  Camera still.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> curve amplitudes (shape, continuous)
 *   sceneAdvance    -> rotation (continuous)
 *   audioKick       -> ink brightness (light)
 *   audioHigh       -> hatching (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: layersP, inkP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float layersP;
uniform float inkP;
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

// The guilloche radius function for layer l at angle th.
float rose(float th, float l)
{
    float r = 0.0;
    for (int k = 0; k < 12; ++k)
    {
        float fk = float(k);
        float amp = 0.04 + 0.12 * clamp(audioChroma[k], 0.0, 1.0);
        float harm = 2.0 + fk + l;                // harmonic per class, offset per layer
        r += amp * cos(harm * th + fk * 0.7 + l * 1.3);
    }
    return r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float layers = floor(3.0 + 4.0 * clamp(layersP, 0.0, 1.0));   // once per activation
    float inkW = 0.0035 + 0.003 * clamp(inkP, 0.0, 1.0);
    float rot = sceneAdvance * 0.08 + sceneTime * 0.015;

    float r = length(p);
    float th = atan(p.y, p.x) + rot;
    // The paper: the photo, bleached like a banknote, with a faint tint.
    vec3 paper = img(gl_FragCoord.xy / resolution);
    paper = mix(vec3(dot(paper, vec3(0.333))), paper, 0.5) * 0.8 + 0.3;
    paper *= mix(vec3(1.0), imgPalette(hue * 0.159 + 0.5), 0.35);

    // Ink: for each layer, a family of concentric rosettes r_i(th) = base_i
    // + rose(th, l); the line is where |r - r_i| is small.  Several
    // concentric copies per layer make the woven band.
    float ink = 0.0;
    for (int l = 0; l < 7; ++l)
    {
        if (float(l) >= layers) break;
        float fl = float(l);
        float ro = rose(th * (1.0 + fl * 0.5), fl);
        float base = 0.12 + fl * 0.11;
        for (int i = 0; i < 5; ++i)
        {
            float ri = base + float(i) * 0.014 + ro;
            float d = abs(r - ri);
            ink += smoothstep(inkW, inkW * 0.3, d) * (1.0 - fl / layers * 0.4);
        }
    }
    ink = clamp(ink, 0.0, 1.0);
    // Hatching between the bands: fine radial lines, brought up by the treble.
    float hatch = pow(0.5 + 0.5 * sin(th * 240.0), 12.0) * smoothstep(0.1, 0.4, r) * (1.0 - smoothstep(0.55, 0.9, r));
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    vec3 inkCol = imgPalette(hue * 0.159 + 0.0) * 0.5;
    inkCol = mix(inkCol, vec3(0.05, 0.08, 0.2), 0.5);
    vec3 col = paper;
    col = mix(col, inkCol, ink * 0.85);
    col = mix(col, inkCol, hatch * (0.1 + 0.4 * hi));
    // The ink catches the light on the kick (the intaglio relief).
    col += imgPalette(hue * 0.159 + 0.9) * ink * (0.1 + 0.6 * audioKick);
    // Corner ornaments: the rosette echoed small in the corners.
    vec2 cp = abs(p) - vec2(aspect * 0.5 - 0.2, 0.3);
    float cr = length(cp);
    float cth = atan(cp.y, cp.x) - rot * 2.0;
    float cink = 0.0;
    for (int i = 0; i < 4; ++i) cink += smoothstep(inkW, inkW * 0.3, abs(cr - (0.05 + float(i) * 0.02 + rose(cth * 2.0, 1.0) * 0.4)));
    col = mix(col, inkCol, clamp(cink, 0.0, 1.0) * 0.8 * step(cr, 0.16));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
