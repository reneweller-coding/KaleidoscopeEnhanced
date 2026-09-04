#version 330 core
out vec4 fragColor;
/**
 * @file KerrNewmanSingularity.frag
 * @brief KERR-NEWMAN SINGULARITY: a spinning black hole seen from a slow
 * orbit -- the black shadow in the middle, a thin bright accretion disk bent
 * up and over it by the lensing, the Doppler-brightened approaching side,
 * the Einstein ring where light from behind wraps round, and twin jets on
 * the spin axis.
 *
 * REBUILT compositing.  The geodesics were right and what they showed was
 * wrong (reported: "a giant sphere"): the background photo was ADDED to every
 * ray, including the rays that had already fallen through the horizon, so
 * the shadow was never black -- and at 0.35 of a full-frame photo it buried
 * the disk under an orange wash.  Now a captured ray is black, full stop;
 * the background is a starfield with the photo only faintly behind it, so
 * the lensing shows as stars smearing into arcs; the disk is thin, hot and
 * bright enough to be the picture; and the Einstein ring sits at the ray's
 * CLOSEST approach, which is where light actually wraps -- not at the ray's
 * end point, which for an escaping ray is fifteen units away.
 *
 * Rules: the horizon and the frame dragging used to breathe with the bass
 * and the mids -- geometry on fast envelopes.  Both are steady now; the
 * music is in the disk's light and the jets.
 *
 * Audio Reactivity:
 *   audioAdvance -> the orbit (slow, integrated)
 *   audioLevel   -> the disk's brightness (light)
 *   audioKick    -> the jets flare (light)
 *   audioHigh    -> the Einstein ring and the stars (light)
 *   audioSwell   -> how far the frame dragging twists the view (slow)
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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float spinP;
uniform float diskP;
uniform float jetP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// A starfield on the sphere of directions: round, jittered points, a few of
// them bright.  Lensing bends the direction, so the stars bend with it.
vec3 stars(vec3 v)
{
    vec2 sph = vec2(atan(v.z, v.x) / 6.2831853 + 0.5, acos(clamp(v.y, -1.0, 1.0)) / 3.14159);
    vec2 g = sph * vec2(160.0, 80.0);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(id);
    vec2 jit = vec2(hash21(id + 1.3), hash21(id + 7.9)) - 0.5;
    float d = length(f - jit * 0.8);
    float bright = step(0.90, h) * pow(1.0 - clamp(d * 3.0, 0.0, 1.0), 4.0);
    float big    = step(0.985, h) * pow(1.0 - clamp(d * 1.6, 0.0, 1.0), 3.0);
    vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.70), hash21(id + 3.1));
    return tint * (bright * 0.8 + big * 1.6);
}

void main() {
    float spin = (spinP > 0.0) ? spinP : 1.0;
    float disk = (diskP > 0.0) ? diskP : 1.0;
    float jet  = (jetP  > 0.0) ? jetP  : 1.0;
    float hue  = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // A slow orbit, a little above the disk plane so the far side of the disk
    // is seen lensed over the top of the shadow.
    float camAngle = time * 0.12 + audioAdvance * 0.10;
    float camPitch = 0.22 + 0.10 * sin(time * 0.09);
    // Far enough back that the whole disk, lensed top and bottom, fits the
    // frame; at 9 units the far side ran off the top.
    vec3 ro = vec3(sin(camAngle) * cos(camPitch), sin(camPitch), cos(camAngle) * cos(camPitch)) * 11.5;
    vec3 ta = vec3(0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.9 * ww);

    // The hole.  Mass and spin are CONSTANT: a horizon that pumps with the
    // bass swallows the view (and is geometry on a fast envelope).
    const float M = 1.0;
    float a = 0.90 * clamp(spin, 0.3, 1.0);
    float rHorizon = M + sqrt(max(M * M - a * a, 0.01));
    float rDiskIn  = rHorizon * 1.45;          // inner edge, just outside the ISCO-ish
    float rDiskOut = 6.5;

    vec3  col = vec3(0.0);
    vec3  p = ro;
    vec3  v = rd;
    float dt = 0.075;
    float rMin = 1e9;
    bool  captured = false;
    float drag = 0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0);

    for (int i = 0; i < 140; ++i) {
        float r = length(p);
        rMin = min(rMin, r);
        if (r < rHorizon) { captured = true; break; }
        if (r > 22.0) break;

        // Gravity bends the ray toward the centre; the spin drags it round.
        vec3 dragDir = normalize(vec3(-p.z, 0.0, p.x) + vec3(1e-5, 0.0, 0.0));
        float omega = (2.0 * M * a * r) / (r * r * r * r + a * a * (r * r + 2.0 * M * r) + 1e-4);
        vec3 accel = -1.5 * M * normalize(p) / (r * r);
        accel += dragDir * omega * drag;
        v = normalize(v + accel * dt);
        vec3 pNext = p + v * dt;

        // The disk: thin, in the equatorial plane.  Crossing it is what
        // lights a ray, and a ray can cross it more than once when it is bent
        // round the far side -- that second crossing IS the lensed disk.
        if (sign(p.y) != sign(pNext.y))
        {
            float f = p.y / (p.y - pNext.y + 1e-6);
            vec3 hitP = mix(p, pNext, f);
            float dr = length(hitP.xz);
            if (dr > rDiskIn && dr < rDiskOut)
            {
                // Keplerian speed for the Doppler beaming: the side coming
                // toward us is brighter and bluer.
                float vOrb = sqrt(M / dr);
                vec3 vDisk = normalize(vec3(-hitP.z, 0.0, hitP.x)) * vOrb;
                float doppler = clamp(1.0 / (1.0 - 0.9 * dot(vDisk, -v)), 0.35, 3.2);
                // Hot inside, cooler out; the photo rides the disk as its
                // banding, drifting round with the orbit.
                float band = fract(atan(hitP.z, hitP.x) / 6.2831853 + audioAdvance * 0.03 * vOrb + dr * 0.08);
                vec3 tex = img(vec2(band, clamp((dr - rDiskIn) / (rDiskOut - rDiskIn), 0.0, 1.0)));
                float heat = smoothstep(rDiskOut, rDiskIn, dr);
                vec3 hot  = mix(vec3(1.0, 0.55, 0.20), vec3(1.0, 0.95, 0.85), heat);
                vec3 emit = (hot * 1.4 + tex * 0.9 + imgPalette(0.2 * heat) * 0.6)
                          * pow(heat, 0.5) * doppler * disk
                          * (0.85 + 0.6 * clamp(audioLevel, 0.0, 1.0));
                float edgeIn = smoothstep(rDiskIn, rDiskIn + 0.25, dr);
                col += emit * edgeIn * 0.55;
            }
        }

        // The jets: two narrow beams on the spin axis, brightest at the base.
        float jr = length(p.xz);
        float jh = abs(p.y);
        if (jh > rHorizon * 0.9 && jr < 0.16 + 0.06 * jh)
        {
            float core = exp(-jr * 14.0) * smoothstep(10.0, 1.5, jh) * (1.0 - exp(-jh * 0.8));
            vec3 jc = mix(vec3(0.55, 0.75, 1.0), imgPalette(0.7), 0.35);
            jc += vec3(1.0) * exp(-jr * 40.0) * 0.6;
            col += jc * core * (0.35 + 1.4 * clamp(audioKick, 0.0, 1.0)) * jet * dt * 2.0;
        }

        p = pNext;
    }

    if (!captured)
    {
        // The far universe, seen along the BENT direction: stars and a faint
        // photo, so the lensing shows as arcs and the shadow reads against it.
        vec3 far = stars(v) * (0.7 + 0.5 * clamp(audioHigh * 2.0, 0.0, 1.0));
        vec2 bgUV = vec2(atan(v.z, v.x) / 6.28318 + 0.5, acos(clamp(v.y, -1.0, 1.0)) / 3.14159);
        far += img(fract(bgUV * 2.0 + vec2(audioAdvance * 0.004, 0.0))) * 0.10;
        col += far;
    }

    // The Einstein ring: light that grazed the photon sphere and wrapped.
    // It lives at the closest approach, on rays that were NOT captured.
    float ring = exp(-pow((rMin - rHorizon * 1.5) / 0.22, 2.0)) * float(!captured);
    col += vec3(1.0, 0.86, 0.62) * ring * (0.25 + 0.5 * clamp(audioHigh * 2.0, 0.0, 1.0));

    col = hueRot(col, hue * 0.35);
    col += vec3(0.02, 0.01, 0.04) * clamp(audioSwell, 0.0, 1.0);

    // Soft knee: the disk is meant to be the brightest thing, not white.
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
