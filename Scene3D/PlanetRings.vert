#version 330 core
// PlanetRings.vert — a pointillist gas giant with particle rings and a far
// starfield.  The rings orbit Kepler-style (inner faster), a kick sends a
// density wave rolling outward through the rings, the bass wobbles them,
// and the swell pulls the orbiting camera closer.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioBeatPhase;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioCentroid;
uniform float audioDrop;
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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    vec3  world;
    vec3  col;
    float baseSize;

    if (r1 < 0.10)
    {
        // ---- Planet body: points on a sphere, day-side lit, banded. ----
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        vec3  n  = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        float ra = time * 0.03 + audioPhase * 0.05;      // slow spin
        n.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * n.xz;
        world = n * 8.0;
        float lit  = clamp(dot(n, normalize(vec3(1.0, 0.4, 0.6))), 0.05, 1.0);
        float band = 0.5 + 0.5 * sin(ph * 11.0 + sin(th * 3.0 + ra) * 0.4);
        col = palTint(mix(vec3(0.85, 0.55, 0.30), vec3(0.95, 0.85, 0.65), band), 0.20 * band, 0.18);
        col = hueRot(col, audioChromaHue * 0.8) * lit * 1.7;
        baseSize = 110.0;
    }
    else if (r1 < 0.80)
    {
        // ---- Rings: Kepler orbits, kick density wave, bass wobble. ----
        float rad = 13.0 + 13.0 * pow(r2, 1.4);
        float om  = 9.0 * pow(rad, -1.5);
        float ang = r4 * 6.2831853 + (time + audioPhase * 1.5) * om * 2.0;
        float y   = (r3 - 0.5) * 0.5
                  + sin(ang * 2.0 + time * 0.2) * 0.35 * audioBass;
        world = vec3(cos(ang) * rad, y, sin(ang) * rad);
        float wave = exp(-abs(rad - (14.0 + audioBeatPhase * 12.0)) * 0.5)
                   * audioKick;
        float gap  = smoothstep(0.02, 0.10, abs(r2 - 0.55));    // Cassini gap
        col = hueRot(vec3(0.75, 0.65, 0.55), audioChromaHue * 0.6 + r2 * 0.5)
            * (0.45 + 0.6 * r3) * gap * (1.0 + 2.2 * wave + 1.2 * audioDrop);
        baseSize = 80.0;
    }
    else
    {
        // ---- Far starfield sphere. ----
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        world = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)) * 130.0;
        col = vec3(0.7, 0.75, 0.9) * (0.25 + 0.55 * r4);
        baseSize = 40.0;
    }

    // Orbiting camera with a gentle inclination swing; swell pulls closer.
    float ca  = time * 0.045 + audioAdvance * 0.08;
    float cr  = 46.0 - 8.0 * audioSwell;
    vec3 cam  = vec3(cos(ca) * cr, 12.0 + 8.0 * sin(time * 0.04), sin(ca) * cr);
    vec3 fwd  = normalize(-cam);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - cam;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(baseSize * (0.5 + 0.7 * r4) * px / dist,
                         1.5, 26.0 * px);

    col *= 0.75 + 0.5 * audioCentroid;
    vCol = vec4(col * 2.4, 1.0);
}
