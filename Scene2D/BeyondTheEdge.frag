#version 330 core
out vec4 fragColor;
/**
 * @file BeyondTheEdge.frag
 * @brief BEYOND THE EDGE: Looking past the absolute edge of the observable 
 * universe into the Cosmic Microwave Background and the true unknown. The CMB 
 * ripples gently in ancient patterns, while audio kicks create massive, glowing 
 * anomalies that tear through the cosmic horizon.
 *   audioAdvance -> slow panning across the cosmic horizon
 *   audioKick    -> massive, glowing anomalies piercing the CMB
 *   audioSwell   -> ambient brightness of the primordial radiation
 *   audioChromaHue-> palette offset for the CMB mapping
 *
 * Per-activation variety:
 *   cmbP float contrast and detail of the cosmic microwave background (0.5..1.5)
 *   anomalyP float intensity of the unknown anomalies (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
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
uniform float audioChromaHue;

uniform float cmbP;
uniform float anomalyP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 6; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float cp = (cmbP > 0.01 ? cmbP : 1.0);
    float ap = (anomalyP > 0.01 ? anomalyP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Zoom OUT far enough that the edge of the observable universe actually
    // fits on screen: before, the sphere overfilled the frame and the scene
    // read as flat noise wallpaper with no edge anywhere.
    uv *= 1.35;

    // Slow drift across the sky
    float drift = time * 0.05 + audioAdvance * 0.1;

    float dist = length(uv);
    vec3 col;

    if (dist > 1.0) {
        // THE VOID beyond the edge: near-black, with a faint breathing mist
        // so "outside" reads as a place, not as dead letterbox.
        float mist = fbm(vec3(uv * 2.0, drift * 0.6));
        col = imgPalette(0.72) * mist * 0.10 * smoothstep(2.4, 1.02, dist);
    } else {
        // Spherical coordinates on the universe-sphere
        float z = sqrt(1.0 - dist * dist);
        vec3 p3 = vec3(uv.x, uv.y, z);

        // Two-axis rotation so the poles travel too
        float rot = drift;
        mat2 rotM = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
        p3.xz = rotM * p3.xz;
        float rot2 = drift * 0.37;
        p3.yz = mat2(cos(rot2), -sin(rot2), sin(rot2), cos(rot2)) * p3.yz;

        // CMB with DOMAIN WARP: the flow-like curl patterns of the real map,
        // instead of the flat contour mush of plain fbm.
        vec3 warp = vec3(fbm(p3 * 2.0 + drift * 0.3),
                         fbm(p3 * 2.0 + 4.7),
                         fbm(p3 * 2.0 + 9.1));
        float cmbBase = fbm(p3 * 3.0 + (warp - 0.5) * 1.8);
        float cmbDetail = fbm(p3 * 15.0 + (warp - 0.5) * 2.5);
        float cmb = mix(cmbBase, cmbDetail, 0.3) * cp;

        vec3 cmbColor = imgPalette(cmb * 0.8 + 0.1);
        col = cmbColor * (0.35 + audioSwell * 0.3);

        // Hot filaments: the brightest temperature ridges glow.
        float fil = smoothstep(0.52, 0.72, cmb);
        col += imgPalette(0.9) * fil * (0.35 + 0.5 * audioLevel);

        // Anomalies: persistent hotspot cells that IGNITE on kicks. The old
        // trigger resampled at 5 Hz (floor(time * 4.00)) and strobed; selection
        // now drifts on the slow clock, the envelope is the kick itself.
        vec3 cellP = p3 * 4.0;
        vec3 iCell = floor(cellP);
        float cellHash = hash11(iCell.x * 12.3 + iCell.y * 45.6 + iCell.z * 78.9);
        if (cellHash > 0.6) {
            vec3 center = iCell + vec3(0.5);
            float dToCenter = length(cellP - center);
            float trigger = step(0.5, hash11(cellHash * 10.0 + floor(drift * 2.0)));
            float flash = trigger * audioKick * 3.5 * ap;
            float fracture = fbm(p3 * 20.0 + drift * 3.0);
            float mask = smoothstep(0.45, 0.0, dToCenter) * fracture;
            vec3 anomalyCol = imgPalette(0.9 + audioCentroid * 0.1);
            col += anomalyCol * mask * flash * (1.0 + audioSwell);
            col += anomalyCol * exp(-dToCenter * 5.0) * flash * 0.4;
        }
    }

    // THE EDGE itself: a luminous horizon ring on both sides of dist = 1,
    // breathing with the swell and flaring on kicks -- the scene's subject,
    // finally visible.
    float rim = exp(-abs(dist - 1.0) * (16.0 - 6.0 * audioSwell));
    col += imgPalette(0.15) * rim * (0.4 + 0.5 * audioSwell + 0.6 * audioKick);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
