#version 330 core
out vec4 fragColor;
/**
 * @file GeomagneticDynamoCore.frag
 * @brief GEOMAGNETIC DYNAMO CORE: the flux-tube strings of a planetary dynamo -
 * gold and teal filament ropes coiling in four concentric shells around the
 * core's vertical rotation axis, camera orbiting close with a slow pitch, the
 * whole thing suspended in a faint fog of dissolved field.
 *   audioKick -> field-line surge    audioAdvance -> orbit + convection + fog drift
 *   audioBass/audioHigh -> flux-blob girth   audioSwell -> fog brightness
 *   (opaque sprite strings, source-level gains)
 */

in vec3 vWorldPos;
in float vDynamoPhase;
in float vHaze;
in vec2 vQuadUV;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float dynamoP;
uniform float coriolisP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Sprite profile
    vec2 pt = vQuadUV;   // quad-local [-1,1]; see .vert
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    // These sprites are OPAQUE (geom="indirect" draws depth-tested, unblended),
    // so a steep falloff does not add up into a glow -- it just leaves a dark
    // occluding rim.  A gentle profile keeps each blob a solid speck.
    float glow = exp(-r2 * 2.0);

    // Photo texture mapping from world coords
    vec2 photoUV = fract(vWorldPos.xy * 0.25 + 0.5);
    vec3 photo = img(photoUV);

    // Molten iron dynamo gold & electric magnetic cyan palette
    vec3 ironGold = vec3(1.0, 0.75, 0.2);
    vec3 fieldCyan = vec3(0.1, 0.9, 1.0);
    vec3 coreColor = mix(ironGold, fieldCyan, sin(vDynamoPhase * 12.56 + audioPhase) * 0.5 + 0.5);

    vec3 col;
    if (vHaze > 0.5)
    {
        // Dissolved field: the same palette, far dimmer, no hot core -- a
        // background layer that carries the empty corners without lifting the
        // picture toward grey.
        photoUV = fract(vWorldPos.xy / max(vWorldPos.z, 1.0) * 0.7 + 0.5);
        photo = img(photoUV);
        col = mix(coreColor, photo, 0.35) * glow
            * (0.075 + 0.055 * audioSwell + 0.045 * audioKick);
    }
    else
    {
        col = mix(photo, coreColor, 0.6) * glow;
        // Hot core TINTED by the palette (the white additive term drowned the
        // gold/cyan; metric scan: saturation 0.00).
        col += glow * mix(coreColor, vec3(1.0, 0.98, 0.85), 0.35)
                   * min(0.35 + audioKick * 0.55, 1.0);
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Soft-knee exposure — hot audio compresses instead of clipping the whole
    // frame to white.  The old (col * 0.9) * 0.55 pre-gain was a leftover from
    // an earlier exposure pass: it halved an already sparse picture and was
    // most of why this scene measured at luma 0.013.
    vec3 _catTone = col;
    _catTone /= 1.0 + 0.42 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
