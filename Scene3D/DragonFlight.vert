#version 330 core
// DragonFlight.vert — a serpentine particle dragon undulates through the
// night, flying TOWARD the chasing camera: scaled body tube with a belly
// glow, two wing membranes beating IN TIME (locked to the beat phase), and
// a DROP makes it breathe fire.  60k points: 55 % body, 25 % wings,
// 15 % fire breath, 5 % drifting sky embers.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioBeatPhase;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioKick;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4 vCol;

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

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// The dragon's flight path (head at parameter tt).
vec3 leader(float tt)
{
    return vec3(30.0 * sin(tt * 0.50),
                12.0 * sin(tt * 0.73 + 2.0) + 6.0 * sin(tt * 0.31),
                30.0 * cos(tt * 0.41));
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float tp = time * 0.55 + audioAdvance * 0.7;

    vec3  world;
    vec3  col;
    float glow = 1.0;

    if (r1 < 0.55)
    {
        // ---- Body: tube along the spine, thick chest, whip-thin tail.
        float s = r1 / 0.55;                       // 0 head .. 1 tail tip
        vec3 spine = leader(tp - s * 2.6);
        float prof = 0.6 + 2.6 * sin(3.14159 * pow(min(s * 1.25, 1.0), 0.8));
        prof *= 1.0 + 0.12 * audioBass;
        float th = r2 * 6.2831853;
        vec3 T = normalize(leader(tp - s * 2.6 + 0.05) - spine);
        vec3 R = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
        vec3 U = cross(R, T);
        world = spine + (R * cos(th) + U * sin(th)) * prof * (0.75 + 0.3 * r3);

        // Emerald scales, golden belly, hue breathing with the key.
        col = imgPalette(0.11 * s + 0.10 * smoothstep(-0.6, -1.0, sin(th))) * 1.3;
        glow = 0.95 + 0.55 * r4;
    }
    else if (r1 < 0.80)
    {
        // ---- Wings: two membranes at the shoulders, beating on the beat.
        float side = (r2 < 0.5) ? -1.0 : 1.0;
        float span  = 0.15 + 0.85 * r3;            // along the wing
        float chord = (r4 - 0.35) * 4.5 * span;    // membrane depth
        float s = 0.22;
        vec3 spine = leader(tp - s * 2.6);
        vec3 T = normalize(leader(tp - s * 2.6 + 0.05) - spine);
        vec3 R = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
        vec3 U = cross(R, T);

        // Wingbeat locked to the beat, tip lagging the root.
        float flap = sin(6.2831853 * audioBeatPhase - span * 1.8) * 0.85
                   - 0.15;
        vec3 wing = R * side * cos(flap) + U * sin(flap);
        world = spine + wing * span * (11.0 + 3.0 * audioSwell)
              + T * chord + U * 0.6;

        col = imgPalette(0.35) * 1.3;
        glow = (0.22 + 0.35 * (1.0 - span))
             * (0.8 + 0.5 * sin(6.2831853 * audioBeatPhase));
    }
    else if (r1 < 0.95)
    {
        // ---- Fire breath: a jet from the jaws, alive on the DROP.
        vec3 head = leader(tp);
        vec3 H = normalize(leader(tp + 0.05) - head);
        float d = r2 * r2 * 22.0;
        world = head + H * (1.5 + d)
              + (vec3(r3, r4, fract(r2 * 7.7)) - 0.5) * (0.5 + d * 0.45);
        col = mix(vec3(1.0, 0.95, 0.7), vec3(1.0, 0.35, 0.05),
                  smoothstep(0.0, 16.0, d));
        glow = (0.05 + 3.0 * audioDrop + 0.5 * audioKick)
             * exp(-d * 0.10);
    }
    else
    {
        // ---- Sky embers drifting in the void.
        world = vec3((r2 - 0.5) * 130.0,
                     (r3 - 0.5) * 70.0 + sin(time * 0.2 + r4 * 40.0) * 3.0,
                     (r4 - 0.5) * 130.0);
        col = vec3(0.9, 0.5, 0.25);
        glow = 0.12 + 0.10 * audioSwell;
    }

    // Chase camera: sits close ahead on the path, the dragon filling the
    // frame as it flies at the viewer.
    vec3 camP = leader(tp + 0.9) + vec3(0.0, 4.0, 0.0);
    vec3 fwd  = normalize(leader(tp - 0.3) - camP);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - camP;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(110.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 16.0 * px);

    col *= glow * clamp(1.0 - vp.z / 110.0, 0.0, 1.0);
    vCol = vec4(col * 2.8, 1.0);
}
