#version 330 core
out vec4 fragColor;
/**
 * @file PrismaticMirrorHexTunnel.frag
 * @brief PRISMATIC MIRROR HEX TUNNEL: 3D Hexagonal infinity mirror tunnel with
 * recursive multi-bounce reflections, chromatic dispersion spectral fringe,
 * dynamic iris aperture contractions, and high-energy laser strut pulses.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight progression through the hex tunnel
 *   audioKick    -> flashes interior laser nodes & iris aperture contraction burst
 *   audioCentroid-> sharpens reflection dispersion fringe
 *   audioSubBass -> expands hexagonal tunnel radius breathing
 *   audioChromaHue-> rotates the prismatic mirror reflection spectrum
 *   audioLevel   -> brightness of the prismatic dust haze filling the tube
 *   audioPhase   -> phase of the haze's slow radial ripple (pre-integrated)
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

// Per-activation variety
uniform float speedP;
uniform float radiusP;
uniform float bounceP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. Every mirror face here is photo-derived and FOUR of them are
// summed per pixel, so a bright photo left the laser struts no headroom at
// all. The probe rides the tex0/tex1 crossfade, so the gain it feeds can never
// pop, and being one number for the whole frame it rescales exposure without
// touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// 2D Hexagonal SDF.  `r` is the APOTHEM (centre to edge); the six vertices
// therefore sit at radius r / cos(30 deg) = r * 1.1547, at angles k * 60 deg.
float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

// Distance from a point in the tunnel cross-section to the nearest STRUT --
// the six laser cords running down the hexagon's vertices.  This used to be
// taken as the distance to the wall SURFACE, which of course falls to the hit
// epsilon at every single wall hit: the strut glow then evaluated to ~0.92
// for every pixel that saw a wall, the tint clamped to vec3(0.95), and the
// whole tunnel was painted over with a flat near-white wash (measured
// luma 0.82 at contrast 0.06).  The struts are corners, not surface.
float strutDist(vec2 pRot, float r) {
    float ang = atan(pRot.y, pRot.x);
    float sec = ang * 0.954929659;                 // ang / 60 deg
    float da  = (sec - floor(sec + 0.5)) * 1.047197551;  // offset to nearest vertex ray
    float rr  = length(pRot);
    float Rv  = r * 1.154700538;                   // vertex radius
    return length(vec2(rr * cos(da) - Rv, rr * sin(da)));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rHex = (radiusP > 0.01) ? radiusP : 1.35;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Flight camera position in center of hex tunnel.  The focal length is
    // shorter than it was: a wider cone puts tunnel WALL under nearly every
    // pixel instead of leaving a broad soft centre with nothing in it.
    vec3 ro = vec3(0.0, 0.0, t * 2.5);
    vec3 rd = normalize(vec3(uv, 0.95 + 0.12 * sin(audioSwell * 2.0)));

    // Hexagonal mirror tunnel radius with audio breathing
    float hexRadius = rHex * (1.0 + 0.15 * sin(audioSwell * 2.5) + 0.1 * audioSubBass);

    vec3 colAcc = vec3(0.0);
    vec3 rayColor = vec3(1.0);
    vec3 p = ro;
    float strutAcc = 0.0;
    float tTot = 0.0;
    float missed = 0.0;

    // Multi-bounce mirror reflection loop (up to 4 reflections)
    for (int bounce = 0; bounce < 4; bounce++) {
        // The hexagon is a 2D section, but the ray runs mostly along Z: a
        // step of `d` in the plane costs d / |rd.xy| along the ray.  Without
        // that division the march crawled and most rays simply ran out of
        // iterations somewhere in mid-air.
        float lat = max(length(rd.xy), 1e-3);
        float tHit = 0.0;
        float hit  = 0.0;

        for (int i = 0; i < 40; i++) {
            vec3 pCur = p + rd * tHit;
            // Twist along Z
            float rotZ = pCur.z * 0.15 + t * 0.1;
            float cs = cos(rotZ), sn = sin(rotZ);
            vec2 pRot = mat2(cs, -sn, sn, cs) * pCur.xy;

            float d = -sdHexagon(pRot, hexRadius);   // positive INSIDE

            if (d < 0.0025) { hit = 1.0; break; }
            if (tHit > 34.0) break;
            tHit += max(0.02, d * 0.9 / lat);
        }

        p += rd * tHit;
        tTot += tHit;

        // Only a PRIMARY miss is the vanishing point.  A later bounce running
        // out of range is just a reflection that escaped down the tube, and
        // stamping the iris there would paint a ring on top of a wall.
        if (hit < 0.5) { missed = (bounce == 0) ? 1.0 : 0.0; break; }

        // Compute normal of hexagonal wall
        float rotZ = p.z * 0.15 + t * 0.1;
        float cs = cos(rotZ), sn = sin(rotZ);
        vec2 pRot = mat2(cs, -sn, sn, cs) * p.xy;

        float eps = 0.005;
        float dC = sdHexagon(pRot, hexRadius);
        float dX = sdHexagon(pRot + vec2(eps, 0.0), hexRadius);
        float dY = sdHexagon(pRot + vec2(0.0, eps), hexRadius);
        vec2 n2D = normalize(vec2(dX - dC, dY - dC));
        vec3 n3D = vec3(mat2(cs, sn, -sn, cs) * n2D, 0.0);

        // Sample texture on wall face
        vec2 sampleUV = fract(vec2(atan(pRot.y, pRot.x) / 6.2831853 + 0.5, p.z * 0.15));
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(float(bounce) * 0.25 + p.z * 0.05);

        vec3 wallCol = mix(texCol, palCol, 0.5);

        // Facet shading: the six mirror planes take visibly different light,
        // so the hexagon reads as a hexagon all the way down the tunnel
        // instead of as one continuous smear of photograph.
        float facet = 0.62 + 0.38 * abs(dot(n3D, vec3(0.6, 0.8, 0.0)));

        // Distance shading: the far tunnel falls away towards the vanishing
        // point.  This is where the frame's contrast comes from.
        float fog = 0.22 + 0.78 * exp(-tTot * 0.060);

        // Add to accumulated color with reflection attenuation
        colAcc += wallCol * rayColor * 0.45 * facet * fog;

        // Laser struts glowing along the six hexagon vertices, gathered at
        // each bounce so reflected struts show up in the mirror walls too.
        strutAcc += exp(-strutDist(pRot, hexRadius)
                        * (20.0 + 12.0 * audioCentroid))
                  * dot(rayColor, vec3(0.3333)) * fog;

        // Prismatic dispersion on bounce (R, G, B reflections deviate slightly)
        rayColor *= vec3(0.85, 0.88, 0.92);

        // Reflect ray, then step clear of the wall along BOTH the new
        // direction and the inward normal -- a purely tangential nudge left
        // grazing rays sitting on the surface and re-hitting at t = 0.
        rd = reflect(rd, -n3D);
        p += rd * 0.03 - n3D * 0.02;
    }

    // Hold the mirror walls back to a fixed exposure. Four bounces are ADDED
    // together at 0.45 each, so the accumulated wall colour alone reaches ~1.5x
    // the photo's own level -- with a light photo that is a white tunnel before
    // a single strut is drawn.
    float expGain = clamp(0.30 / max(0.05, photoLevel()), 0.30, 2.4);
    colAcc *= expGain;

    // Glowing laser strut lines along hexagon vertices. The tint constant
    // exceeds 1.0 on two channels, so the TINTED vector carries the cap --
    // bounding only strutGlow left vec3(1.3,1.1,1.8) * it free to reach 7.2.
    float strutGlow = strutAcc * glw;
    vec3 strutTint = min(vec3(1.3, 1.1, 1.8) * strutGlow * (1.0 + 3.0 * audioKick), vec3(0.85));

    colAcc += strutTint;

    // ---- The vanishing point ------------------------------------------
    // Rays that run almost parallel to the tunnel axis never meet a wall.
    // That is the aperture the scene is named for: give it the iris rather
    // than leaving a dead hole in the middle of the picture.
    if (missed > 0.5) {
        float ir = t * 0.4;
        vec2  pr = mat2(cos(ir), -sin(ir), sin(ir), cos(ir)) * uv;
        float irisR = 0.034 * (1.0 - 0.45 * audioKick);
        float ring  = exp(-abs(sdHexagon(pr, irisR)) * 210.0);
        colAcc += min(vec3(1.2, 1.0, 1.7) * ring * (0.7 + 1.8 * audioKick), vec3(0.85));
        colAcc += imgPalette(0.5) * exp(-length(pr) * 34.0) * 0.30 * expGain;
    }

    // A faint prismatic haze over the whole frame: the dust the lasers light
    // up inside the tube.  Bounded and low, purely so that nothing in the
    // picture is ever literally nothing.
    float haze = 0.055 + 0.030 * sin(length(uv) * 9.0 - t * 0.7 + audioPhase);
    colAcc += imgPalette(0.18 + 0.1 * length(uv)) * haze * (0.7 + 0.5 * audioLevel);

    colAcc = pow(colAcc, vec3(0.88));
    vec3 _catTone = clamp(colAcc, 0.0, 1.0);
    _catTone /= 1.0 + 0.28 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
