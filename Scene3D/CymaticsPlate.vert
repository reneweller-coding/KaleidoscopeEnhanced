#version 330 core
// CymaticsPlate.vert — Chladni figures done the physical way: 60k grains of
// "sand" on a square vibrating plate.  The plate's standing wave is the
// classic free-plate Chladni field
//     F(x,y) = cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy)
// and each grain slides DOWN the vibration gradient (a few fixed gradient-
// descent steps per frame from its random home), so the sand collects on
// the nodal lines F = 0 — exactly what real sand does on a real plate.
//
// The (n,m) mode pair advances on a music-integrated clock (audioAdvance),
// and neighbouring figures CROSS-FADE (the descent runs on the blended
// field), so the sand visibly migrates from one figure to the next instead
// of jumping.  Kicks shake the plate: grains scatter with audioKick and
// re-converge as the envelope decays.  The plate surface itself vibrates
// between the nodal lines (grains on the lines stay still — physically
// right).

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float sceneSeed;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Pick the k-th (n,m) pair from a fixed table of nicely distinct figures.
vec2 modePair(float k)
{
    float i = mod(k, 8.0);
    if (i < 0.5) return vec2(1.0, 2.0);
    if (i < 1.5) return vec2(2.0, 3.0);
    if (i < 2.5) return vec2(1.0, 4.0);
    if (i < 3.5) return vec2(3.0, 4.0);
    if (i < 4.5) return vec2(2.0, 5.0);
    if (i < 5.5) return vec2(3.0, 5.0);
    if (i < 6.5) return vec2(4.0, 5.0);
    return vec2(1.0, 3.0);
}

float chladni(vec2 p, vec2 nm)     // p in 0..1
{
    float PI = 3.1415927;
    return cos(nm.x * PI * p.x) * cos(nm.y * PI * p.y)
         - cos(nm.y * PI * p.x) * cos(nm.x * PI * p.y);
}
vec2 chladniGrad(vec2 p, vec2 nm)
{
    float PI = 3.1415927;
    float dx = -nm.x * PI * sin(nm.x * PI * p.x) * cos(nm.y * PI * p.y)
             + nm.y * PI * sin(nm.y * PI * p.x) * cos(nm.x * PI * p.y);
    float dy = -nm.y * PI * cos(nm.x * PI * p.x) * sin(nm.y * PI * p.y)
             + nm.x * PI * cos(nm.y * PI * p.x) * sin(nm.x * PI * p.y);
    return vec2(dx, dy);
}

void main()
{
    float idx = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Mode clock: advances with the music, cross-fades over the last 25 %.
    float clockv = audioAdvance * 0.22 + sceneSeed * 8.0;
    vec2 nmA = modePair(floor(clockv));
    vec2 nmB = modePair(floor(clockv) + 1.0);
    float w  = smoothstep(0.75, 1.0, fract(clockv));

    // Grain home + kick scatter (decays with the kick envelope itself).
    vec2 p = vec2(r1, r2);
    float sc = audioKick * 0.045 * (0.3 + 0.7 * r4);
    p += vec2(hash11(idx * 3.1) - 0.5, hash11(idx * 7.7) - 0.5) * sc;

    // Gradient descent of F² onto the nodal lines of the BLENDED field.
    // r3 varies the step count 5..9: most grains converge sharply, a dust
    // fraction stays diffuse for depth.
    float steps = 5.0 + floor(r3 * 4.99);
    for (int i = 0; i < 9; ++i)
    {
        if (float(i) >= steps) break;
        float FA = chladni(p, nmA), FB = chladni(p, nmB);
        float F  = mix(FA, FB, w);
        vec2  G  = mix(chladniGrad(p, nmA), chladniGrad(p, nmB), w);
        float g2 = dot(G, G) + 1e-4;
        // Newton-ish step toward F = 0, capped so grains never overshoot.
        vec2 stepv = G * (F / g2);
        stepv = clamp(stepv, vec2(-0.06), vec2(0.06));
        p -= stepv;
    }
    p = clamp(p, 0.0, 1.0);

    // Residual field at the grain -> vibration + brightness.
    float Ff = mix(chladni(p, nmA), chladni(p, nmB), w);

    // Plate space: 26x26 units in xz, gently vibrating in y BETWEEN the
    // nodal lines (fixed 7.5 Hz flutter, amplitude from the level).
    vec2 q = (p - 0.5) * 26.0;
    float vib = Ff * sin(time * 47.0) * (0.25 + 1.1 * audioLevel) * 0.55;
    vec3 world = vec3(q.x, vib + 0.15, q.y);

    // Slow orbit around the plate, camera looking down at a tilt.
    float oa = time * 0.045;
    world.xz = mat2(cos(oa), -sin(oa), sin(oa), cos(oa)) * world.xz;
    float tilt = 0.95;
    world.yz = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * world.yz;

    vec3 vp = world + vec3(0.0, 2.0, 30.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(95.0 * (0.4 + 0.5 * r4) * px / dist, 1.5, 9.0 * px);

    // Sand: warm off-white, brightest ON the nodal line (|F| small); the
    // scattered dust stays dim.  A hint of the musical hue in the shadow.
    float onLine = exp(-abs(Ff) * 6.0);
    vec3 col = mix(hueRot(vec3(0.10, 0.09, 0.14), audioChromaHue),
                   vec3(1.0, 0.94, 0.80),
                   onLine);
    col *= (0.35 + 0.85 * onLine) * (0.75 + 0.5 * audioSwell + 0.9 * audioDrop);

    vCol = vec4(col * 3.0, 1.0);
}
