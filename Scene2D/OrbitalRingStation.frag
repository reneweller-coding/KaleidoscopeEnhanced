#version 330 core
out vec4 fragColor;
/**
 * @file OrbitalRingStation.frag
 * @brief ORBITAL RING STATION: a rotating habitat ring turning slowly above a
 * gas-giant-sized world. The station is a raymarched torus with a hub, four
 * spokes, docking modules along its rim and a lit window band; it turns on
 * its own axis so the whole structure reads as a rotating machine. Below it
 * the planet carries a banded, domain-warped cloud deck that is advected and
 * sheared every frame -- weather that DEFORMS rather than scrolling -- plus a
 * ring system casting the shadow of its own gap, a soft terminator, and an
 * atmospheric limb that brightens toward the day/night line.
 *   audioAdvance -> station rotation and cloud advection
 *   audioSwell   -> hab-ring window brightness and limb scattering
 *   audioKick    -> docking-beacon flash on the rim modules
 *   audioBass    -> storm scale in the cloud deck (the belts breathe)
 *   audioBeatPhase-> the hub's rotating beacon
 *   audioChromaHue-> atmosphere and ring hue follow the musical key
 *
 * Per-activation variety:
 *   ringP   float station size in frame          (0.6..1.7)
 *   cloudP  float cloud deck contrast            (0.4..1.6)
 *   glowP   float window / beacon intensity      (0.6..1.8)
 *   hueP    float palette offset                 (0..6.28)
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
uniform float audioBeatPhase;
uniform float audioChromaHue;

uniform float ringP;
uniform float cloudP;
uniform float glowP;
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
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    float a = mix(hash11(n +   0.0), hash11(n +   1.0), f.x);
    float b = mix(hash11(n +  57.0), hash11(n +  58.0), f.x);
    float c = mix(hash11(n + 113.0), hash11(n + 114.0), f.x);
    float d = mix(hash11(n + 170.0), hash11(n + 171.0), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm3(vec3 p, int oct)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; ++i) {
        if (i >= oct) break;
        s += a * noise3(p); p *= 2.02; a *= 0.5;
    }
    return s;
}

float sdBox(vec3 p, vec3 b)
{
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, float R, float r)
{
    vec2 q = vec2(length(p.xz) - R, p.y);
    return length(q) - r;
}

float sdCylY(vec3 p, float h, float r)
{
    vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float iSphere(vec3 ro, vec3 rd, float r)
{
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float h = b * b - c;
    if (h < 0.0) return -1.0;
    return -b - sqrt(h);
}

// The station, in its own space: the hab ring lies in the XZ plane, the hub
// on the Y axis.  part: 0 ring, 1 spoke/hub, 2 rim module.
float stationSDF(vec3 p, out float part)
{
    // Hab ring: a torus with a squared-off outer profile.
    float ring = sdTorus(p, 3.05, 0.34);

    // Rim modules: twelve blocks spaced around the ring.
    vec3 mp = p;
    float a = atan(mp.z, mp.x);
    float seg = 6.2831853 / 12.0;
    float ai = floor(a / seg + 0.5) * seg;
    mp.xz = mat2(cos(-ai), -sin(-ai), sin(-ai), cos(-ai)) * mp.xz;
    float mods = sdBox(mp - vec3(3.05, 0.0, 0.0), vec3(0.30, 0.52, 0.46)) - 0.06;

    // Hub and its docking cone.
    float hub = sdCylY(p, 0.55, 0.62) - 0.08;
    hub = min(hub, sdCylY(p - vec3(0.0, 0.85, 0.0), 0.32, 0.28) - 0.05);

    // Four spokes from hub to ring.
    vec3 spq = p;
    float sa = atan(spq.z, spq.x);
    float sseg = 6.2831853 / 4.0;
    float si = floor(sa / sseg + 0.5) * sseg;
    spq.xz = mat2(cos(-si), -sin(-si), sin(-si), cos(-si)) * spq.xz;
    float spoke = sdBox(spq - vec3(1.7, 0.0, 0.0), vec3(1.45, 0.13, 0.13)) - 0.04;

    part = 0.0;
    float d = ring;
    if (mods  < d) { d = mods;  part = 2.0; }
    if (hub   < d) { d = hub;   part = 1.0; }
    if (spoke < d) { d = spoke; part = 1.0; }
    return d;
}

void main()
{
    float rSz = (ringP  > 0.01 ? ringP  : 1.0);
    float cld = (cloudP > 0.01 ? cloudP : 1.0);
    float glw = (glowP  > 0.01 ? glowP  : 1.0);
    float hue = (hueP   > 0.01 ? hueP   : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.030 + audioAdvance * 0.055;

    // Camera, in PLANET RADII: the world fills the lower frame, the station
    // hangs above it a little off-centre.
    vec3 ro = vec3(0.0, 1.05, -3.20);
    float pitch = -0.15 + 0.030 * sin(t * 0.47);
    float yaw   =  0.10 * sin(t * 0.33);
    vec3 fwd = normalize(vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)));
    vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(rgt, fwd);
    float roll = 0.04 * sin(t * 0.29);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * rgt + ruv.y * upv + 1.40 * fwd);

    // Over the camera's shoulder: with the sun behind the planet the probe
    // recorded a black disc and a station with nothing to reflect.
    vec3 sun = normalize(vec3(-0.50, 0.46, -0.73));

    vec3 airTint  = imgPalette(0.66);
    airTint  = mix(vec3(0.42, 0.60, 1.0), airTint, 0.35);
    vec3 bandTint = imgPalette(0.20 + 0.15 * audioCentroid);
    bandTint = mix(vec3(0.72, 0.58, 0.40), bandTint, 0.45);

    // ---------------- starfield ----------------
    vec3 col = vec3(0.004, 0.006, 0.013);
    for (int i = 0; i < 2; ++i) {
        vec3 sp = rd * (120.0 + 180.0 * float(i));
        vec3 cell = floor(sp);
        vec3 f = fract(sp) - 0.5;
        if (hash31(cell) > 0.978) {
            float b = exp(-dot(f, f) * 210.0) * (0.4 + 0.6 * hash31(cell + 5.0));
            col += mix(vec3(0.76, 0.85, 1.0), vec3(1.0, 0.9, 0.76),
                       hash31(cell + 11.0)) * b;
        }
    }

    // ---------------- planet ----------------
    const float R = 1.0;
    vec3 pc  = vec3(0.0, -0.34, 0.0);
    vec3 pro = ro - pc;

    float tHit  = iSphere(pro, rd, R);
    float planetDepth = 1e9;

    if (tHit > 0.0) {
        planetDepth = tHit;
        vec3 sp = normalize(pro + rd * tHit);
        float lam = dot(sp, sun);
        float day = smoothstep(-0.10, 0.22, lam);

        vec3 rot = sp;
        float spin = t * 0.42 + 0.05 * audioAdvance;
        rot.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * rot.xz;

        // BANDED weather.  The belts come from latitude; the shear and curl
        // come from a two-stage domain warp whose displacement field ALSO
        // drifts, which is what makes the storms deform instead of sliding.
        float sc = 3.4 * (1.0 + 0.12 * audioBass);
        vec3 w1 = vec3(fbm3(rot * sc * 0.55 +  7.0, 4),
                       fbm3(rot * sc * 0.55 + 19.0, 4),
                       fbm3(rot * sc * 0.55 + 31.0, 4)) - 0.5;
        vec3 w2 = vec3(fbm3(rot * sc * 1.30 + w1 * 2.2 + 3.0, 3),
                       fbm3(rot * sc * 1.30 + w1 * 2.2 + 9.0, 3),
                       fbm3(rot * sc * 1.30 + w1 * 2.2 + 5.0, 3)) - 0.5;

        // Latitude belts, sheared by the warp: this is the gas-giant look.
        float lat = sp.y * 7.5 + w1.x * 2.6 + w2.y * 1.1;
        float belt = 0.5 + 0.5 * sin(lat);
        float curl = fbm3(rot * sc * 2.1 + w2 * 2.4, 4);

        float deck = mix(belt, curl, 0.42);
        deck = clamp((deck - 0.5) * (1.0 + 1.1 * cld) + 0.5, 0.0, 1.0);

        vec3 lightBand = mix(bandTint * 0.55, vec3(0.96, 0.92, 0.86), deck);
        vec3 darkBand  = mix(bandTint * 0.28, bandTint * 0.80, deck);
        vec3 surf = mix(darkBand, lightBand, deck);

        // One great storm oval, the way a gas giant carries one.
        vec3 stormAxis = normalize(vec3(0.55, -0.28, 0.79));
        float sd = dot(rot, stormAxis);
        float storm = smoothstep(0.965, 0.995, sd);
        surf = mix(surf, mix(vec3(0.85, 0.42, 0.26), bandTint, 0.35), storm * 0.85);

        vec3 pcol = surf * (0.05 + 1.15 * max(lam, 0.0)) * day;
        pcol += airTint * (1.0 - day) * 0.022;
        col = pcol;
    }

    // --- atmospheric limb ---
    {
        float b = dot(pro, rd);
        float c2 = dot(pro, pro) - (R * 1.055) * (R * 1.055);
        float h = b * b - c2;
        if (h > 0.0) {
            float ta = -b - sqrt(h), tb = -b + sqrt(h);
            float seg = max(0.0, min(tb, planetDepth) - max(ta, 0.0));
            float dens = seg / (R * 0.22);
            vec3 mp = normalize(pro + rd * max(ta, 0.0));
            float lam = max(dot(mp, sun), 0.0);
            col += airTint * dens * pow(lam, 1.25) * (0.55 + 0.40 * audioSwell) * 0.60;
            col += vec3(1.0, 0.72, 0.46) * dens * pow(lam, 7.0) * 0.35;
        }
    }

    // ---------------- ring system ----------------
    // A thin plane through the planet's equator, clipped to an annulus.
    {
        float denom = rd.y;
        if (abs(denom) > 1e-4) {
            float tr = (pc.y - ro.y) / denom;
            if (tr > 0.0 && tr < planetDepth) {
                vec3 rp = ro + rd * tr - pc;
                float rr = length(rp.xz);
                if (rr > 1.32 && rr < 2.34) {
                    // Banded ring with gaps; the photo palette tints it.
                    float bandN = fbm3(vec3(rr * 26.0, 0.0, 0.0), 4);
                    float gap = smoothstep(0.42, 0.50, bandN);
                    float edge = smoothstep(1.32, 1.42, rr) * smoothstep(2.34, 2.18, rr);
                    float dens = gap * edge * 0.85;

                    // The planet's own shadow falls across the far side.
                    vec3 toSun = sun;
                    float shadow = 1.0;
                    float bb = dot(rp, toSun);
                    float cc = dot(rp, rp) - R * R;
                    if (bb < 0.0 && bb * bb - cc > 0.0) shadow = 0.18;

                    vec3 ringCol = mix(vec3(0.68, 0.63, 0.56), bandTint, 0.45);
                    col = mix(col, ringCol * (0.35 + 0.75 * shadow), clamp(dens, 0.0, 1.0));
                    planetDepth = min(planetDepth, tr);
                }
            }
        }
    }

    // ---------------- the station ----------------
    {
        float k = 0.115 * max(rSz, 0.3);        // station size in planet radii
        vec3 stPos = ro + fwd * (1.55 + 0.10 * sin(t * 0.31))
                        + rgt * (0.22 + 0.06 * sin(t * 0.43))
                        + upv * (0.30 + 0.05 * sin(t * 0.37));

        // The ring turns on its own axis -- a habitat ring has to spin.
        float spin = t * 1.35 + audioAdvance * 0.20;
        // Tilt it so we see the ring as an ellipse, not edge-on or flat.
        float tilt = 1.02;

        vec3 lro = (ro - stPos) / k;
        vec3 lrd = rd;
        // world -> station: undo tilt about X, then spin about Y.
        float ct = cos(-tilt), st = sin(-tilt);
        lro.yz = mat2(ct, -st, st, ct) * lro.yz;
        lrd.yz = mat2(ct, -st, st, ct) * lrd.yz;
        float cs2 = cos(-spin), sn2 = sin(-spin);
        lro.xz = mat2(cs2, -sn2, sn2, cs2) * lro.xz;
        lrd.xz = mat2(cs2, -sn2, sn2, cs2) * lrd.xz;

        float d = 0.0, part = 0.0, hitPart = -1.0;
        vec3 hp = vec3(0.0);
        int steps = 0;
        for (int i = 0; i < 90; ++i) {
            vec3 p = lro + lrd * d;
            float ds = stationSDF(p, part);
            steps = i;
            if (ds < 0.006 * (1.0 + d * 0.2)) { hitPart = part; hp = p; break; }
            d += ds * 0.88;
            if (d > 160.0) break;
        }

        if (hitPart >= 0.0 && d * k < planetDepth) {
            vec2 e = vec2(0.008, 0.0);
            float u;
            vec3 n = normalize(vec3(
                stationSDF(hp + e.xyy, u) - stationSDF(hp - e.xyy, u),
                stationSDF(hp + e.yxy, u) - stationSDF(hp - e.yxy, u),
                stationSDF(hp + e.yyx, u) - stationSDF(hp - e.yyx, u)));

            // Sun into station space.
            vec3 ls = sun;
            ls.yz = mat2(ct, -st, st, ct) * ls.yz;
            ls.xz = mat2(cs2, -sn2, sn2, cs2) * ls.xz;

            float dif = max(dot(n, ls), 0.0);
            float fres = pow(1.0 - max(dot(n, -lrd), 0.0), 4.0);

            // Panelled hull: seams plus a per-panel tone.
            vec2 plate = (abs(n.y) > 0.55) ? hp.xz : ((abs(n.x) > 0.55) ? hp.zy : hp.xy);
            vec2 g1 = abs(fract(plate * 3.1) - 0.5);
            float seam = smoothstep(0.44, 0.50, max(g1.x, g1.y));
            float tone = 0.82 + 0.28 * hash21(floor(plate * 3.1));
            vec3 albedo = vec3(0.52, 0.54, 0.58) * tone * (1.0 - 0.35 * seam);

            vec3 scol = albedo * (0.24 + 1.85 * dif);
            // The planet throws light back up onto the station's underside.
            float downFace = max(-n.y, 0.0);
            scol += mix(airTint, bandTint, 0.5) * albedo * downFace * 0.70;
            scol += vec3(0.72, 0.84, 1.0) * fres * 0.32;
            scol *= clamp(1.0 - float(steps) * 0.006, 0.40, 1.0);

            // Window band around the hab ring's outer face.
            if (hitPart < 0.5) {
                float ang = atan(hp.z, hp.x);
                float band = smoothstep(0.20, 0.05, abs(hp.y));
                float wf = fract(ang * 22.0 / 6.2831853 * 6.0);
                float lit = step(0.35, hash11(floor(ang * 21.0))) * smoothstep(0.5, 0.2, abs(fract(ang * 21.0) - 0.5));   // windows, not cells (V8e)
                float win = band * lit * smoothstep(0.15, 0.35, wf) * smoothstep(0.85, 0.65, wf);
                scol += vec3(1.0, 0.90, 0.68) * win
                      * (0.75 + 0.45 * audioSwell) * glw;
            }
            // Docking beacons on the rim modules.
            if (hitPart > 1.5) {
                float flash = pow(max(0.0, 1.0 - abs(fract(audioBeatPhase) - 0.10) * 7.0), 3.0);
                scol += vec3(1.0, 0.35, 0.28) * (0.25 + 1.7 * flash * (0.4 + audioKick)) * glw;
            }
            // Hub beacon.
            if (hitPart > 0.5 && hitPart < 1.5) {
                float hb = smoothstep(0.9, 1.15, hp.y);
                float flash = pow(max(0.0, 1.0 - abs(fract(audioBeatPhase * 0.5) - 0.08) * 8.0), 3.0);
                scol += vec3(0.45, 1.0, 0.75) * hb * flash * 1.2 * glw;
            }

            col = scol;
        }
    }

    if (hue > 0.001) col = hueRot(col, 0.20 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.40 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
