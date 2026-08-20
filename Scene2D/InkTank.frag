#version 330 core
out vec4 fragColor;
/**
 * @file InkTank.frag
 * @brief Dye billowing in a real 2D Navier-Stokes fluid, pressure-solved so it can shed vortices and push back off walls, unlike a divergence-free curl-noise flow.
 *
 * texNSFluid (RGB = dye colour, A = speed, written by the compute Navier-Stokes solver) is shaded with a Schlieren-style edge from its own density gradient so the dye filaments read as sharp sheets rather than a soft cloud. audioLevel brightens a highlight glow that rides the solver's own speed output, landing exactly on the shear layers where vortices are born, audioHigh strengthens the schlieren edge glow, audioKick brightens the soft halo bloom, and audioAmbient lifts both the lit back wall of the tank and the deep water behind it, which show through wherever the ink is thin. audioAdvance drifts the caustic pattern rippling across that wall (pre-integrated, never a factor on absolute time).
 */
// InkTank.frag — dye in a REAL fluid.  Unlike the older curl-noise Fluid
// (divergence-free by construction, so it can only ever swirl), the solver
// behind texNSFluid advects, then solves the pressure Poisson equation and
// subtracts its gradient — which is what lets it shed vortices off the jet
// and push back against the walls.
//
// texNSFluid: RGB = dye, A = speed.

uniform sampler2D tex0;
uniform sampler2D texNSFluid;    // <- requests the Navier-Stokes sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float inkP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    vec4 f = texture(texNSFluid, uv);
    vec3 dye = f.rgb;
    float speed = f.a;

    // The solver injects its dye in fully-saturated primaries, and the
    // per-channel knee at the bottom of this shader is a divide, so it
    // compresses each filament's bright channel harder than its dark ones and
    // the ink comes out MORE saturated than it went in. The whole-frame pull
    // further down cannot reach that: it acts on a sum the dye dominates
    // wherever there IS ink, which is exactly where the scan found the frame
    // garish. Desaturating at the source keeps the sim's hues and its sheet
    // structure and only takes the scream out of the pigment.
    dye = mix(vec3(dot(dye, vec3(0.299, 0.587, 0.114))), dye, 0.70);

    // Schlieren-style edge: the gradient of the dye density makes the
    // filaments read as sharp sheets rather than a soft cloud.
    float gx = dot(texture(texNSFluid, uv + vec2(px.x * 2.0, 0.0)).rgb
                 - texture(texNSFluid, uv - vec2(px.x * 2.0, 0.0)).rgb, vec3(0.33));
    float gy = dot(texture(texNSFluid, uv + vec2(0.0, px.y * 2.0)).rgb
                 - texture(texNSFluid, uv - vec2(0.0, px.y * 2.0)).rgb, vec3(0.33));
    float edge = length(vec2(gx, gy)) * 9.0;

    // ---- THE TANK ITSELF -------------------------------------------------
    // The scan found the frame near-black wherever the jet has not reached yet
    // (the dye covered under half the picture) and, on top of that, garish:
    // with only saturated dye above pure black, almost every lit pixel read as
    // fully saturated.  The lit back wall of the tank fixes both — a soft
    // top-lit gradient off the photo that carries every tile of the frame,
    // partly desaturated so it reads as glass and water rather than as more
    // ink.  Slightly inset uv so the wall is a wall, not a second copy of the
    // slideshow image.
    vec3 wall  = img(uv * 0.92 + 0.04);
    float wg   = dot(wall, vec3(0.299, 0.587, 0.114));
    wall       = mix(vec3(wg), wall, 0.5);
    // Light hangs over the tank: bright at the surface, falling into the deep.
    // The gradient is deep on purpose — together with the photo's own
    // structure it is what answers the FLAT reading, not just the empty one.
    float lamp = 0.24 + 0.82 * pow(clamp(uv.y, 0.0, 1.0), 1.3);
    // Slow water caustics on the wall — more of the contrast the flat scan saw.
    float caus = 0.5 + 0.5 * sin(uv.x * 11.0 + sin(uv.y * 7.0 + audioAdvance * 0.05)
                                 + audioAdvance * 0.07);
    wall *= lamp * (0.28 + 0.13 * caus + 0.10 * audioAmbient);

    vec3 col = dye * (1.6 + 1.1 * inkP)
             + wall;            // lit tank wall — the frame is never empty

    // Fast fluid glows: speed is the solver's own output, so the highlights
    // sit exactly on the shear layers where the vortices are being born.
    vec3 hot = imgPalette(0.15) * 1.35;
    col += hot * clamp(speed, 0.0, 2.0) * (0.10 + 0.22 * glowP)
           * (0.6 + 0.8 * audioLevel);

    col += vec3(edge) * (0.18 + 0.30 * glowP) * (0.5 + audioHigh);

    // Halo
    vec3 soft = vec3(0.0);
    float r = 0.005 + 0.010 * glowP;
    for (int i = 0; i < 6; ++i)
    {
        float a = float(i) * 1.0472;
        soft += texture(texNSFluid, uv + vec2(cos(a), sin(a)) * r).rgb;
    }
    col += soft / 6.0 * 0.30 * (1.0 + audioKick);

    // Deep water behind the wall: the photo squared, so only its bright parts
    // survive, and only where the ink is thin.
    vec3 photo = texture(tex0, uv).rgb;
    float cover = clamp(dot(col, vec3(0.4)), 0.0, 1.0);
    col += photo * photo * (0.06 + 0.10 * audioAmbient) * (1.0 - cover);

    // Water is not a pigment: pull the whole frame a little off full
    // saturation (the scan flagged half the pixels as over-saturated).
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.85);

    col = col / (1.0 + col * 0.32);
    fragColor = vec4(col, interpolation);
}
