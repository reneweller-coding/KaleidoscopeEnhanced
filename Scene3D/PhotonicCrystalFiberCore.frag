#version 330 core
out vec4 fragColor;
/**
 * @file PhotonicCrystalFiberCore.frag
 * @brief PHOTONIC CRYSTAL FIBER CORE: the cross-section lattice of a holey fiber
 * (hexagonal cladding, hollow core) slowly rolling; LIGHT PULSES race down
 * the guided core on the kick, supercontinuum colours from the photo arc.
 *   audioKick -> guided light pulse    audioPhase -> supercontinuum drift
 *   audioSwell -> brightness of the bulk glass behind the cladding
 *   time -> slow roll around the fiber axis
 *
 * vKind = 1 marks the single slab that stands in for the fibre's BULK GLASS,
 * shaded as the guided light diffusing outward from the axis; without it the
 * gaps between the capillaries were simply black.
 */

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;
in float vCoreDist;
in float vKind;     // 0 = capillary, 1 = the bulk glass slab behind the lattice

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float time;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float pcfP;
uniform float coreP;
uniform float speedP;
uniform float hueP;

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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping onto fiber microstructure
    vec3 photo = img(vTexCoord);

    // Supercontinuum rainbow laser core emission
    vec3 supercontinuum = imgPalette((vWorldPos.z * 2.0 + audioPhase) * 0.159);

    // Silica glass cladding palette
    vec3 silicaCyan = vec3(0.2, 0.85, 1.0);

    if (vKind > 0.5)
    {
        // ---- BULK GLASS ------------------------------------------------
        // What the guided light looks like diffusing through the rod behind
        // the cladding: brightest on the fibre axis, dying out toward the
        // rod's edge.  This is the surface that keeps the frame from being
        // black between the capillaries.
        float rr = length(vWorldPos.xy) / 15.0;
        vec3 back = mix(silicaCyan * 0.135, vec3(0.010, 0.016, 0.032),
                        smoothstep(0.0, 0.85, rr));
        back += supercontinuum * exp(-rr * 3.0) * (0.10 + 0.30 * audioKick);
        back *= 0.75 + 0.5 * audioSwell;
        if (hue > 0.001) back = hueRot(back, hue);
        // Cap the TINTED colour, not the scalar that fed it.
        fragColor = vec4(min(max(back, vec3(0.0)), vec3(1.0)), 1.0);
        return;
    }

    vec3 col = mix(photo, silicaCyan, 0.4);
    // LIGHT PULSES race down the fiber core on the kick — the point of a
    // photonic crystal fiber is guided light, so SHOW the light.
    float pz = fract(vWorldPos.z * 0.06 - time * 0.9 - audioAdvance * 0.4);
    float pulse = exp(-pz * 7.0) * (0.5 + 1.1 * audioKick);
    // Falloffs re-scaled with the lattice: at the old rates the whole
    // cladding sat past exp(-3r) and the guided glow never reached it.
    float coreDist = length(vWorldPos.xy);
    col += supercontinuum * pulse * exp(-coreDist * 0.16) * 2.2;
    col += exp(-vCoreDist * 0.9) * supercontinuum * (1.5 + audioKick * 3.0);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.02, 0.03, 0.06), 1.0 - exp(-dist * 0.06));

    if (hue > 0.001) col = hueRot(col, hue);

    // Cap the TINTED colour, not the scalar that fed it.
    fragColor = vec4(min(max(col, vec3(0.0)), vec3(1.0)), 1.0);
}
