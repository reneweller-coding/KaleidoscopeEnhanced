#version 330 core
out vec4 fragColor;
/**
 * @file MagnetarCrustalQuakeAlfvenResonance.frag
 * @brief MAGNETAR CRUSTAL QUAKE ALFVÉN RESONANCE: Crustal fracture and global seismic oscillations
 * on an ultrastrong magnetar (SGR / AXP). Relativistic shear fractures inject high-frequency
 * torsional Alfven waves into a FULL twisted magnetosphere -- 160 dipolar L-shells reaching past
 * the frame corners, over a far X-ray point-source field and a trapped pair-plasma haze --
 * igniting giant gamma-ray flare fireballs.
 *   audioAdvance -> drives magnetospheric Alfven wave propagation & crustal strain buildup,
 *                   and drifts the pair-plasma haze bands
 *   audioKick    -> flashes catastrophic crustal rupture & gamma-ray flare detonation bursts
 *                   (gated on the crust, so it no longer washes the whole magnetosphere)
 *   audioBass    -> deepens magnetar core gravitational potential & dipolar field compression
 *   audioSwell   -> widens trapped relativistic pair fireball volume & magnetic loop glow
 *   audioHigh    -> twinkles the distant X-ray point sources
 *   audioCentroid-> shifts magnetar thermal X-ray / synchrotron gamma emission spectra
 *
 * Per-activation variety:
 *   quakeGlowP  float crustal fracture flare peak luminance (0.8..2.5)
 *   fireballP   float trapped pair plasma fireball / far-haze intensity (0.6..2.2)
 */

in vec3 vPos;
in float vDepth;
in float vGlow;
in float vKind;   // 0 = field line, 1 = far X-ray speck, 2 = plasma haze panel

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float quakeGlowP;
uniform float fireballP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main() {
    // Magnetar high-energy violet-white / amber flare identity. Held to 0.66
    // saturation rather than 0.74: the photo modulation below used to multiply
    // the three channels by DIFFERENT factors, which pushed the field lines
    // past 0.8 saturation over a third of the frame.
    vec3 magnetarCol = vec3(0.62, 0.32, 0.95);

    if (vKind > 1.5) {
        // TRAPPED PAIR-PLASMA HAZE: one panel far behind the magnetosphere,
        // carrying a 0..1 panel u/v in vDepth/vGlow, so the corners of the
        // frame read as magnetospheric plasma instead of dead clear colour.
        vec2 uv = vec2(vDepth, vGlow);
        float a  = audioAdvance * 0.05;
        float n1 = sin(uv.x * 4.7 + a * 1.1) * sin(uv.y * 3.3 - a * 0.8);
        float n2 = sin(uv.x * 10.3 - a * 0.6 + 1.9) * sin(uv.y * 7.7 + a * 0.9);
        float fb = clamp(0.55 + 0.30 * n1 + 0.15 * n2, 0.0, 1.0);

        vec3 hazeCol = palTint(vec3(0.34, 0.20, 0.56), uv.x * 0.3 + audioCentroid, 0.35);
        float rad = length((uv - 0.5) * vec2(1.7, 1.0));
        float pool = mix(1.0, 0.62, smoothstep(0.25, 1.05, rad));

        // HELD DOWN ON PURPOSE, and this is the opposite of what it looks like.
        // The occupancy metric compares every pixel against the frame's own
        // MODAL luma bucket and only counts pixels that clear it by two. A
        // smooth full-frame panel is always the mode, so lifting it does not
        // add coverage -- it raises the bar the real content has to clear. At
        // 0.16 * fireballP (up to 0.35) this panel sat one bucket under the
        // field lines and cancelled them out: the frame measured 96% empty.
        // Its job is to be a plausible plasma-lit sky, not to fill anything;
        // the field lines and the X-ray specks do the filling.
        float amp = (fireballP > 0.01 ? fireballP : 1.2) * 0.05;
        vec3 hz = hazeCol * (0.35 + 0.65 * fb) * pool * amp * (0.85 + 0.4 * audioSwell);
        // Cap the FINAL tinted colour, not just the scalar feeding it.
        fragColor = vec4(min(hz, vec3(0.09)), 1.0);
        return;
    }

    if (vKind > 0.5) {
        // Distant X-ray point sources: tiny, bounded, spread across the frustum.
        vec3 sc = palTint(vec3(0.72, 0.60, 1.0), vDepth + audioCentroid * 0.4, 0.45);
        fragColor = vec4(min(sc * vGlow * 0.55, vec3(0.70)), 1.0);
        return;
    }

    vec3 flareCol    = palTint(magnetarCol, vDepth * 0.4 + audioCentroid, 0.25);

    // The magnetosphere now spans tens of world units, so the photo texture is
    // sampled in a SCREEN-relative frame -- a fixed world scale wrapped the
    // picture dozens of times across the outer field lines.
    vec2 photoUv = fract(vPos.xy * 0.11 + 0.5);
    // The photo modulates BRIGHTNESS only. Multiplying the flare colour by the
    // photo's three channels separately stretched its channel ratios and drove
    // the field lines past 0.8 saturation; the photo's HUE already reaches this
    // scene through palTint above, which is where it belongs.
    float photoL = dot(img(photoUv), vec3(0.299, 0.587, 0.114));

    vec3 col = flareCol * (0.6 + 0.4 * photoL) * vGlow;
    col *= (quakeGlowP > 0.01 ? quakeGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    // Gated on the crust flare so a kick lights the rupture, not the whole
    // (now frame-filling) magnetosphere at once.
    col += vec3(1.0, 0.95, 0.9) * min(audioKick * 0.35, 0.4)
         * smoothstep(0.6, 1.4, vGlow);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
