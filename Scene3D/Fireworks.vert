#version 120
// Fireworks.vert — a night sky of procedural fireworks at real 3D depths,
// with DISTINCT SHELL TYPES: every burst re-rolls its kind each cycle —
//   0 PEONY     classic uniform sphere
//   1 WILLOW    golden long-droop trails (heavy gravity, slow fade)
//   2 RING      a flat saturn ring at a seeded tilt
//   3 STROBE    blinking white-silver crackle
//   4 CROSSETTE the shell splits into ~12 star clusters
// Each cycle starts with a visible ROCKET RISE (a thin streak climbing from
// below, brightness fed by the kick channel), then the shell explodes; the
// explosion pop is scaled by the music's accents (downbeat/kick), and a
// drop turns the whole sky on.
//   attrA.w = particle index (24 bursts x 2500), attrB = per-particle seeds.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioDownbeat;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

varying vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float burst = floor(attrA.w / 2500.0);
    float hb1 = hash11(burst * 3.17 + 0.31);
    float hb2 = hash11(burst * 7.91 + 1.73);
    float hb3 = hash11(burst * 5.53 + 2.61);
    float hb4 = hash11(burst * 9.13 + 3.97);

    // Burst position in the sky (varied depth -> real stereo layering).
    vec3 Cb = vec3((hb1 - 0.5) * 90.0, 16.0 + hb2 * 22.0, 22.0 + hb3 * 60.0);

    // Cycle clock: music energy (integrated advance) drives the firing rate,
    // so busy passages genuinely fire more shells.
    float clockv = (time * 0.075 + audioAdvance * 0.30) * (0.8 + 0.5 * hb4)
                 + hb1 * 7.0;
    float u   = fract(clockv);
    float cyc = floor(clockv);

    // Shell TYPE re-rolls every cycle (type 5 = GLITTER: sparks that fall
    // slowly and twinkle for a long time); every shell also gets its own
    // BURN SPEED, so some flash out quickly while others linger.
    float typ  = floor(hash11(burst * 13.7 + cyc * 3.1) * 5.999);
    float burn = 0.8 + 1.6 * hash11(burst * 21.3 + cyc * 7.7);

    const float RISE = 0.10;              // first 10 % of the cycle = rocket
    vec3  world;
    float B;

    if (u < RISE)
    {
        // ---- Rocket rise: a thin climbing streak from below. ----
        if (r4 > 0.08)                    // only a few particles form the streak
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0);
            return;
        }
        float ur = u / RISE;
        float yy = mix(-14.0, Cb.y, ur * ur * (3.0 - 2.0 * ur));
        world = vec3(Cb.x + sin(ur * 9.0 + hb2 * 6.0) * 0.6,
                     yy - r1 * 2.5 * ur,          // short trail behind the head
                     Cb.z);
        B = (0.5 + 0.8 * audioKick) * (0.4 + 0.6 * ur);
    }
    else
    {
        // ---- Explosion flight. ----
        float ub = (u - RISE) / (1.0 - RISE);

        float th = r1 * 6.2831853;
        float ph = acos(2.0 * r2 - 1.0);
        if (typ == 4.0)                    // CROSSETTE: cluster the directions
        {
            th = (floor(r1 * 12.0) + 0.5) / 12.0 * 6.2831853
               + (r3 - 0.5) * 0.35;
            ph = acos(2.0 * (floor(r2 * 6.0) + 0.5) / 6.0 - 1.0)
               + (r4 - 0.5) * 0.35;
        }
        vec3 d = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        if (typ == 2.0)                    // RING: flatten, then seeded tilt
        {
            d.y *= 0.10;
            d = normalize(d);
            float t1 = hb2 * 3.14159, t2 = hb3 * 3.14159;
            d.xy = mat2(cos(t1), -sin(t1), sin(t1), cos(t1)) * d.xy;
            d.yz = mat2(cos(t2), -sin(t2), sin(t2), cos(t2)) * d.yz;
        }

        float grav = (typ == 1.0) ? 34.0 : ((typ == 5.0) ? 6.0 : 15.0);
        float sp   = (8.0 + 7.0 * r3) * ((typ == 2.0) ? 0.85 : 1.0);
        float re   = sp * (1.0 - exp(-ub * 4.0)) * 1.1;
        world = Cb + d * re + vec3(0.0, -grav * ub * ub, 0.0);
        if (typ == 5.0)                    // GLITTER: sparks drift down slowly
            world.y -= 6.0 * ub;

        // Brightness: the POP is scaled by the music's accents, then fades
        // with the shell's OWN burn speed (willow and glitter linger).
        float fade = (typ == 1.0) ? exp(-ub * 0.9 * burn)
                   : (typ == 5.0) ? exp(-ub * 0.6 * burn)
                                  : exp(-ub * 1.9 * burn);
        float pop  = smoothstep(0.0, 0.04, ub)
                   * (0.55 + 0.75 * audioDownbeat + 0.6 * audioKick);
        B = pop * fade * (0.7 + 0.3 * sin(ub * 40.0 + r4 * 20.0));
        if (typ == 3.0)
            B *= step(0.45, fract(ub * 26.0 + r4 * 9.0)) * 1.6;   // STROBE
        if (typ == 5.0)                    // GLITTER: hard fast twinkle
            B *= 0.35 + 1.5 * step(0.72, fract(sin(r4 * 91.7) * 437.5 + ub * 33.0));
        B *= 1.0 + 1.6 * audioDrop;
    }

    vec3 vp = vec3(world.x, world.y - 10.0, world.z + 12.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(110.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 24.0 * px)
                 * (0.6 + 0.7 * B);

    // Colour by type: peony = key-hued family, willow = gold, ring = cool
    // electric, strobe = white-silver, crossette = two-tone split.
    vec3 col;
    if      (typ == 5.0) col = vec3(1.0, 0.95, 0.75);     // glitter: champagne
    else if (typ == 1.0) col = vec3(1.0, 0.75, 0.30);
    else if (typ == 2.0) col = hueRot(vec3(0.30, 0.75, 1.0), audioChromaHue);
    else if (typ == 3.0) col = vec3(1.0, 0.97, 0.90);
    else if (typ == 4.0) col = hueRot(mix(vec3(1.0, 0.4, 0.2), vec3(0.3, 0.5, 1.0),
                                          step(0.5, fract(r1 * 12.0))), audioChromaHue);
    else                 col = hueRot(vec3(1.0, 0.62, 0.25), hb3 * 5.0 + audioChromaHue);
    float ub2 = max(u - RISE, 0.0) / (1.0 - RISE);
    col = mix(col, vec3(1.0, 0.35, 0.15), smoothstep(0.55, 0.85, ub2) * 0.7);

    col *= B * (0.9 + 0.4 * audioSwell) * clamp(1.0 - vp.z / 150.0, 0.0, 1.0);
    vCol = vec4(col * 3.0, 1.0);
}
