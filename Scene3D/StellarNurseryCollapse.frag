#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).

in vec3 vPos;   ///< Position (from the vertex stage).
in float vTemp;
in float vSeed;   ///< Per-instance random seed (from the vertex stage).
in float vRadius;

/**
 * @file StellarNurseryCollapse.frag
 * @brief Draws the 60k-point protostellar system built in
 * StellarNurseryCollapse.vert (accretion disk, spherical halo, and bipolar
 * jets around a collapsing stellar nursery) as soft blackbody-coloured point
 * sprites.
 *
 * Point colour comes from a black -> red -> yellow -> blue-white blackbody
 * ramp driven by vTemp (cooler in the outer disk, hotter toward the core and
 * in the jets), tinted by a photo-derived dust colour sampled from the
 * slideshow image at the point's position; audioKick adds an extra white
 * flare to the hottest (core/jet) points; hueP and audioChromaHue rotate the
 * final hue. A soft-knee tone map keeps loud passages from clipping to flat
 * white.
 */

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float heatP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// Blackbody stellar temperature palette
vec3 blackbodyColor(float t) {
    vec3 colM = vec3(1.0, 0.25, 0.05); // Cool red (M-class)
    vec3 colG = vec3(1.0, 0.85, 0.40); // Solar yellow (G-class)
    vec3 colO = vec3(0.4, 0.75, 1.00); // Hot blue-white (O-class)
    vec3 col;
    if (t < 0.5) col = mix(colM, colG, t * 2.0);
    else col = mix(colG, colO, (t - 0.5) * 2.0);
    return col;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float ht  = (heatP > 0.0) ? heatP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Soft Gaussian point sprite circle
    vec2 pc = gl_PointCoord - vec2(0.5);
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;

    float alpha = exp(-r2 * 12.0);

    // Stellar temperature coloring
    vec3 starCol = blackbodyColor(clamp(vTemp * ht, 0.0, 1.0));
    
    // Photo texture modulation for dust tint
    vec2 dustUV = vPos.xz * 0.2 + 0.5;
    vec3 dustCol = img(fract(dustUV));

    vec3 col = (starCol * 2.2 + dustCol * 0.5) * alpha * glw;

    // Core thermonuclear glow
    if (vTemp > 0.8) {
        col += vec3(1.0) * pow(alpha, 2.0) * (1.0 + 2.0 * audioKick);
    }

    col = hueRot(col, audioChromaHue + hue);
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
