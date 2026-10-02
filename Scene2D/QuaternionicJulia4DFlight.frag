#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file QuaternionicJulia4DFlight.frag
 * @brief QUATERNIONIC JULIA 4D FLIGHT: Raymarched flight through a true 4D
 * Quaternion Julia fractal (q_{n+1} = q_n^2 + C). Projected into 3D via
 * 4D hyper-rotations with metallic specular highlights, audio-reactive
 * constant morphing, and continuous photo texture refraction.
 *   audioAdvance -> rotates 4D hyper-plane slicing angles (xw, yw, zw)
 *   audioKick    -> morphs quaternion constant C & triggers metallic flashes
 *   audioBass    -> pulses 4D Julia escape radius and fractal density
 *   audioSwell   -> increases specular glossiness and iridescence
 *
 * Per-activation variety:
 *   iterP   float raymarching & fractal iteration depth (0.5..2.0)
 *   sliceP  float 4D hyperspace slice offset            (0.5..2.2)
 *   speedP  float 4D rotation velocity                 (0.5..2.0)
 *   hueP    float metallic iridescence hue offset      (0..6.28)
 *
 * The distance field itself is BAKED by the companion QuaternionicJulia4DFlight.comp
 * into texBake (a 96^3 RG32F volume: R = distance, G = orbit trap), re-baked
 * every few frames rather than evaluated live at every one of the march's 48
 * steps -- see EffectShader::stepBake(). The 9-iteration quaternion-squaring
 * formula itself now lives ONLY in the .comp file; this file just samples the
 * result, so a change to the fractal formula belongs there, not here.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float iterP;
uniform float sliceP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler3D texBake;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief 2D rotation matrix.
mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// The bake cube spans [-BAKE_EXTENT, BAKE_EXTENT] on every axis -- MUST match
// QuaternionicJulia4DFlight.comp's EXTENT constant.
const float BAKE_EXTENT = 2.2;
vec3 worldToUV(vec3 p) {
    return (p + BAKE_EXTENT) / (2.0 * BAKE_EXTENT);
}

/// Distance + orbit-trap lookup against the baked field (see the .comp file):
/// the 4D hyper-rotation and the qJulia formula itself were already applied
/// PER VOXEL when it was baked, so a lookup by plain 3D world position "p"
/// already accounts for both -- nothing here needs to know about C, wCoord,
/// or the rotation at all.
vec2 fieldAt(vec3 p) {
    return texture(texBake, worldToUV(p)).rg;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float hue = (hueP   > 0.0) ? hueP   : 0.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Only needed here for the camera ray's own rotation now -- the fractal
    // formula, its C/wCoord morph and its 4D hyper-rotation all moved into
    // QuaternionicJulia4DFlight.comp (see fieldAt() above). MUST still match
    // the .comp's own "t" so the baked rotation and this live camera stay in
    // sync (kept in step deliberately, not shared code -- see that file).
    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Raymarching setup
    vec3 ro = vec3(0.0, 0.0, -2.4);
    vec3 rd = normalize(vec3(uv, 1.2));   // was 1.2 - 0.25*audioKick: the FOV lurched on every kick

    rd.yz = rot2D(sin(t * 0.4) * 0.3) * rd.yz;
    rd.xz = rot2D(t * 0.5) * rd.xz;

    float dO = 0.0;
    float hitDist = -1.0;
    float trapMin = 1e5;
    vec3 hitP = vec3(0.0);   // guarded by hitDist, but the compiler cannot see that

    for (int i = 0; i < 48; ++i) {
        vec3 p = ro + rd * dO;

        vec2 field = fieldAt(p);
        float dS = field.r;
        // Camera clearance: the morphing set can swell right up to the
        // (fixed) camera -- keep a free bubble instead of clipping into it.
        dS = max(dS, 0.35 - length(p - ro));
        trapMin = min(trapMin, field.g);

        if (dS < 0.003) {
            hitDist = dO;
            hitP = p;
            break;
        }
        if (dO > 6.0) break;
        dO += dS * 0.7;
    }

    // Miss rays carry trapMin too: an orbit-trap AURA fills the frame with
    // the fractal's energy field instead of near-black (the metric scan
    // measured luma 6 / coverage 0 -- the set is thin at many C morphs and
    // most rays miss).  Level breathes the aura, phase spins its colour.
    vec3 col = vec3(0.02, 0.02, 0.05);
    vec3 aura = imgPalette((trapMin * 8.0 + audioPhase) * 0.159)
                * exp(-trapMin * 1.4) * (0.9 + 0.4 * audioLevel);
    col += aura * 0.85;

    if (hitDist > 0.0) {
        // Normal approximation: central differences on the baked field
        // (the voxel grid caps the achievable detail -- a softer normal than
        // the old live analytic one, in exchange for not evaluating the
        // 9-iteration formula three more times per hit pixel).
        vec3 e = vec3(0.01, 0.0, 0.0);
        vec3 n = normalize(vec3(
            fieldAt(hitP + e.xyy).r - fieldAt(hitP - e.xyy).r,
            fieldAt(hitP + e.yxy).r - fieldAt(hitP - e.yxy).r,
            fieldAt(hitP + e.yyx).r - fieldAt(hitP - e.yyx).r
        ));

        vec3 lightDir = normalize(vec3(0.6, 0.8, -0.5));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);

        // Photo mapping from surface reflection and normal
        vec2 photoUV = fract(n.xy * 0.5 + 0.5 + hitP.z * 0.1);
        vec3 photo = img(photoUV);

        // Iridescent metallic gradient
        vec3 irid = imgPalette((trapMin * 12.0 + audioPhase) * 0.159);

        col = mix(photo * 0.9, irid, 0.5);
        col = col * (0.3 + 0.7 * diff) + spec * vec3(1.0, 0.95, 0.9) * (1.2 + audioKick * 2.0);

        // Depth fog
        col = mix(col, vec3(0.02, 0.02, 0.06), 1.0 - exp(-hitDist * 0.3));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
