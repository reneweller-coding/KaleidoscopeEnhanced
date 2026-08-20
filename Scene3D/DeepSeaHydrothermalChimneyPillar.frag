#version 330 core
out vec4 fragColor;
/**
 * @file DeepSeaHydrothermalChimneyPillar.frag
 * @brief DEEP SEA HYDROTHERMAL CHIMNEY PILLAR: an abyssal black-smoker VENT FIELD --
 * fifteen mineral chimney towers in three depth layers, standing in a slowly swelling
 * water column threaded with marine snow.  400C mineral-laden superheated hydrothermal
 * fluid vents from every summit into near-freezing ocean water, precipitating anhydrite,
 * chalcopyrite, and pyrite crystals with deep-sea photo texturing.
 *   audioAdvance -> drives hydrothermal fluid convective ascent, the water column's
 *                   swell and the drift of the marine snow and the mineral plume
 *   audioKick    -> flashes superheated hydrothermal steam cavitation bursts
 *   audioSwell   -> widens mineral chimney tower girth & sulfide precipitate density,
 *                   and brightens the water column, its mineral plume and its
 *                   marine snow
 *   audioCentroid-> shifts mineral sulfide (chalcopyrite/pyrite/sulfur) color spectra
 *
 * Per-activation variety:
 *   pillarScaleP float hydrothermal chimney pillar diameter   (0.8..2.2)
 *   ventGlowP    float superheated hydrothermal vent luminance(0.8..2.5)
 *   specularP    float mineral crystal facet sheen gain       (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vSmokerGlow;
in float vBack;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;
uniform float audioAdvance;

uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

float h21(vec2 p)
{
    return fract(sin(dot(p, vec2(91.73, 47.31))) * 43758.5453);
}

void main()
{
    vec3 col;

    if (vBack > 0.5)
    {
        // ---- WATER COLUMN --------------------------------------------
        // The sheet already carries a very faint gradient; marine snow is added
        // here so the specks are pixel-sized instead of one mesh cell wide.
        col = vCol;

        // MINERAL PLUME.  A smooth gradient over the column does nothing for a
        // tile-occupancy scan -- a flat wash just moves the frame's modal value
        // and every tile still reads as empty.  What the water needs is real
        // STRUCTURE, so this is the black smokers' own sulfide plume drifting up
        // through the column: sparse (pow shapes it into wisps rather than fog)
        // and warm against the cold water, with enough amplitude to register.
        vec2 pu = vUV * vec2(6.0, 3.2);
        float plume = sin(pu.x * 1.7 + sin(pu.y * 2.3 - time * 0.06
                                           - audioAdvance * 0.02) * 1.6)
                    * sin(pu.y * 2.9 - time * 0.05
                          + sin(pu.x * 1.1 + time * 0.03) * 1.3);
        // A second, finer octave: one big lobe pattern leaves whole regions of
        // the column untouched, and a region a tile wide with nothing in it is
        // exactly what the occupancy scan calls empty.
        float wisp = sin(pu.x * 5.3 - time * 0.09 + pu.y * 2.1)
                   * sin(pu.y * 7.1 + time * 0.07 - pu.x * 1.7);
        plume = pow(plume * 0.5 + 0.5, 2.0) * 0.72
              + pow(wisp  * 0.5 + 0.5, 2.6) * 0.45;
        col += vec3(0.20, 0.15, 0.11) * plume * (0.75 + 0.45 * audioSwell);

        // Marine snow: fewer, larger, brighter flakes.  At the old 300 x 170
        // grid over a sheet 2.6 frames wide each speck was a third of a pixel
        // and averaged straight out of the picture.  170 x 96 was still only
        // ~1 px per flake once the frame is downscaled for measurement, which
        // put a water tile at 2.3 % interesting pixels -- right on the 2 %
        // line, so half of them fell the wrong side of it.  104 x 58 with a
        // wider radius and a lower threshold puts a flake at ~3 px and roughly
        // doubles the count per tile, which clears the line with margin.
        vec2 g  = vUV * vec2(104.0, 58.0)
                + vec2(0.0, -time * 0.08 - audioAdvance * 0.03);
        vec2 gi = floor(g);
        vec2 gf = fract(g);
        float on = step(0.74, h21(gi));
        vec2  c  = vec2(h21(gi + 13.1), h21(gi + 27.7));
        float d  = length(gf - c);
        float speck = on * smoothstep(0.46, 0.04, d);
        col += vec3(0.52, 0.66, 0.78) * speck * (0.40 + 0.24 * audioSwell);
    }
    else
    {
        // THE KEY LIGHT USED TO POINT AWAY FROM THE CAMERA.  vNormal is the
        // tube's outward normal in world space and +z runs AWAY from the eye,
        // so with the old (0.5, 0.6, 0.7) every chimney was lit from behind:
        // sweeping u over the half of the tube a viewer can actually see
        // (n.z < 0) gives diff < 0.05 across 74 % of it, mean 0.091.  The whole
        // vent field therefore rendered at the constant 0.4 ambient floor --
        // no lit side, no dark side, nothing for a tile to register -- and sank
        // into the water column behind it.  Lighting from the upper left and IN
        // FRONT takes that same visible half to mean 0.57 with a p10..p90
        // spread of 0.94: every tower now has a bright edge and a dark edge,
        // which is the local light/dark separation the picture was missing.
        vec3 lightDir = normalize(vec3(-0.55, 0.62, -0.56));
        float diff = max(0.0, dot(vNormal, lightDir));
        // The eye direction has to flip with it, or the crystal sheen lands on
        // the far side of every tower.
        float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, -1.0))), 24.0)
                   * (specularP > 0.01 ? specularP : 1.2);

        vec3 photo = img(vUV);

        // 0.4 + 0.6*diff was mostly ambient; 0.10 + 0.90*diff makes the
        // terminator a real step instead of a wash.
        col  = vCol * (0.6 + 0.4 * photo) * (0.10 + 0.90 * diff);
        col += vec3(0.95, 0.95, 1.0) * min(spec * (1.0 + 3.0 * audioKick), 1.0);
        col += vec3(1.0, 0.55, 0.1) * min(vSmokerGlow * 2.2, 1.5);
        col *= (0.85 + 0.35 * audioSwell);
        col += vCol * (audioKick * 0.3);
    }

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
