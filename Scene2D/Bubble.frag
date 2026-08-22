#version 330 core
out vec4 fragColor;
/**
 * @file Bubble.frag
 * @brief Soap bubbles rise and pop over a dimmed backdrop of the current photo, each one refracting the picture like a tiny lens with an iridescent rim.
 *
 * audioAdvance integrates travel so the bubbles climb faster with the music without ever jump-cutting; audioFlux (plus audioLevel and audioBeat) sets how many of the 32 bubble slots are alive at once, audioKick puffs each bubble's radius and slams the pop-ring flash, and audioLevel brightens and saturates the backdrop and refracted highlights. Colour comes from an imgPalette-style arc sampled from the photo itself, rotated by audioChromaHue and driven by audioAdvance, with audioValence controlling how saturated versus grey the iridescent tint reads. Optional negative and vigneting toggles invert the image or darken the corners.
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speed;// = 2.0; //1.0
uniform float speedColor;// = 1.0; //1.0
uniform int negative;
uniform int vigneting;
uniform float audioAdvance;   // integrated travel: bubbles rise faster with the music (jump-free)
uniform float audioKick;      // kick puff on the bubble radius
uniform float audioLevel;     // louder music = more saturated bubbles
uniform float audioFlux;      // musical complexity -> how many bubbles are alive
uniform float audioBeat;      // beat adds a few extra bubbles
uniform float audioChromaHue;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image; the arc follows the musical key, valence shapes
// saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

//void main() {

    // normalize to the center
//	vec2 p;
  //  p.x = gl_FragCoord.x;
  //  p.y = gl_FragCoord.y;
//	p.x /= resolution.x;
//	p.y /= resolution.y;

  //  fragColor = interpolation * texture(tex0,p) + (1.0-interpolation)*texture(tex1, p);

//}


// Created by inigo quilez - iq/2013 : https://www.shadertoy.com/view/4dl3zn
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// Messed up by Weyland

const int nrBubbles = 32;

// USER-FEEDBACK-REDESIGN: soap bubbles with a real LIFE CYCLE over the photo.
// - how many are alive follows the music's complexity (flux/level/beat)
// - each bubble is born small at the bottom, rises, refracts the photo like
//   a lens, wears an iridescent photo-arc rim - and POPS near the top with
//   an expanding ring (kick makes the pop flash harder)

void main(void)
{
    vec2 uv = -1.0 + 2.0 * gl_FragCoord.xy / resolution.xy;
    uv.x *= resolution.x / resolution.y;
    vec2 screenUV = gl_FragCoord.xy / resolution.xy;

    // Dim photo backdrop - the bubbles are the bright thing.
    vec3 color = img(screenUV) * (0.42 + 0.12 * audioLevel);

    // Musical complexity decides how many bubbles are alive right now.
    float nAct = 8.0 + 24.0 * clamp(1.3 * audioFlux + 0.35 * audioLevel
                                    + 0.25 * audioBeat, 0.0, 1.0);

    for (int i = 0; i < nrBubbles; i++)
    {
        float gate = clamp(nAct - float(i), 0.0, 1.0);
        if (gate <= 0.0) continue;

        // bubble seeds
        float pha = sin(float(i) * 546.13 + 1.0) * 0.5 + 0.5;
        float siz = pow(sin(float(i) * 651.74 + 5.0) * 0.5 + 0.5, 4.0);
        float pox = sin(float(i) * 321.55 + 4.1) * resolution.x / resolution.y;

        // Life phase 0..1 = the same wrap that carries the bubble bottom->top,
        // so every wrap IS a respawn: born at 0, pops just before 1.
        float ly = mod(pha + 0.1 * (speed * time / 5.0 + 0.8 * audioAdvance)
                                 * (0.2 + 0.8 * siz), 1.0);
        float bornT = smoothstep(0.0, 0.07, ly);          // scale-in at birth
        float popT  = smoothstep(0.90, 0.985, ly);        // burst near the top

        float rad = (0.09 + 0.45 * siz
                     + sin(speed * time / 60.0 + pha * 500.0 + siz) / 22.0)
                  * bornT * (1.0 + 0.55 * popT)
                  + 0.025 * audioKick * (0.3 + 0.7 * siz);
        vec2 pos = vec2(pox + sin(speed * time / 40.0 + 0.15 * audioAdvance + pha + siz),
                        -1.0 - rad + (2.0 + 2.0 * rad) * ly);

        float dis = length(uv - pos);
        float f   = dis / max(rad, 1e-4);
        if (f > 1.35) continue;

        float inside = 1.0 - smoothstep(0.92, 1.0, f);
        float rim    = smoothstep(0.62, 0.97, f) * (1.0 - smoothstep(0.97, 1.04, f));

        // The bubble is a lens: the photo refracts toward its centre.
        vec3 refr = img(clamp(screenUV - (uv - pos) * 0.16 * inside, 0.0, 1.0));
        vec3 tint = imgPalette(pha + f * 0.35);           // iridescent film

        float alive = inside * (1.0 - popT) * gate;
        color = mix(color, refr * (1.05 + 0.25 * audioLevel) + tint * 0.20, alive * 0.85);
        color += tint * rim * (0.55 + 0.45 * audioLevel) * (1.0 - popT) * gate;

        // The POP: a bright expanding ring where the skin just was.
        float ring = exp(-abs(dis - rad * 1.12) * 55.0)
                   * popT * (1.1 + 1.4 * audioKick);
        color += tint * ring * gate;
    }

    if (vigneting == 1)
        color *= sqrt(1.5 - 0.5 * length(uv));
    if (negative == 1)
        color = 1.0 - color;

    color /= 1.0 + 0.60 * max(color.r, max(color.g, color.b));   // over-bright tail (final review)
    fragColor = vec4(color, 1.0);
}
