#version 330 core
out vec4 fragColor;
/**
 * @file ReactionDiffusion.frag
 * @brief The living Gray-Scott reaction-diffusion field (simulated on the GPU into
 * "texSim") rendered as ORGANIC LIQUID METAL over the source image:
 *   * the B-concentration reveals and stains the picture where the reaction
 *     is active;
 *   * the field gradient displaces the image GENTLY (the old raw-gradient
 *     x4 displacement threw the picture around with every sim step — the
 *     "Gezappel"; now the gradient is blurred and scaled way down);
 *   * fake 3D lighting from the smoothed gradient gives the fronts glossy
 *     specular highlights — the pattern reads as embossed liquid metal;
 *   * optionally the whole field is FOLDED into an n-segment kaleidoscopic
 *     mandala (per-activation), so the reaction grows radially symmetric;
 *   * front colour comes from a drifting crop of the IMAGE (imgPal), warmed/
 *     cooled by valence, with a gentle once-per-bar hue sweep.
 * If the simulation is unavailable, texSim reads 0 -> a dim image remains.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSim;      // reaction-diffusion state (R=A, G=B)
uniform float interpolation;

uniform float audioValence;
uniform float audioCentroid;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioPhase;
uniform float audioSwell;      // slow loudness swell -> displacement breathes
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep
uniform float audioLevel;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;          // kaleido fold of the field (0/1 -> off; 2..8)
uniform float dispP;           // image displacement amount (0 -> 0.5; 0.3..0.9)
uniform float zoomP;           // field zoom                (0 -> 1.0; 0.7..1.5)

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

// Blurred B-field sample (2px cross) — low-passes the sim so per-step noise
// doesn't shake the lighting/displacement.
float bSmooth(vec2 suv, vec2 px)
{
    float b = texture(texSim, suv).g * 2.0;
    b += texture(texSim, suv + vec2( 2.0 * px.x, 0.0)).g;
    b += texture(texSim, suv - vec2( 2.0 * px.x, 0.0)).g;
    b += texture(texSim, suv + vec2(0.0,  2.0 * px.y)).g;
    b += texture(texSim, suv - vec2(0.0,  2.0 * px.y)).g;
    return b / 6.0;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Per-activation character (constant during the scene):
    float zoomV = (zoomP <= 0.01) ? 1.0 : zoomP;
    float dispV = ((dispP <= 0.001) ? 0.5 : dispP)
                * (0.8 + 0.4 * audioSwell);          // breathes slowly

    // Optional kaleidoscopic fold of the whole field (slowly spinning).
    vec2 suv;
    if (sidesP >= 2)
    {
        vec2 cp = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
        cp = rot(time * 0.015 + audioPhase * 0.05) * cp;
        suv = kaleido(cp, float(sidesP)) * 0.8 * zoomV + 0.5;
    }
    else
    {
        // Gentle drift so the fixed-grid simulation feels alive on screen.
        suv = (uv - 0.5) * zoomV + 0.5
            + 0.02 * vec2(sin(uv.y * 6.0 + audioPhase * 0.3),
                          cos(uv.x * 6.0 + audioPhase * 0.3));
    }
    vec2 px = 1.0 / resolution;

    float b = bSmooth(suv, px);

    // SMOOTHED field gradient (3px baseline) -> stable fronts for lighting
    // and displacement instead of per-pixel sim jitter.
    float bx = bSmooth(suv + vec2(3.0 * px.x, 0.0), px)
             - bSmooth(suv - vec2(3.0 * px.x, 0.0), px);
    float by = bSmooth(suv + vec2(0.0, 3.0 * px.y), px)
             - bSmooth(suv - vec2(0.0, 3.0 * px.y), px);
    vec2  grad = vec2(bx, by);
    float edge = clamp(length(grad) * 10.0, 0.0, 1.0);

    // The picture ripples gently along the reaction gradient.
    vec2 iuv = uv + grad * dispV;
    vec3 pic = img(fract(iuv));

    // Fake 3D: light the B-field like an embossed relief -> liquid metal.
    vec3 n     = normalize(vec3(-grad * 24.0, 1.0));
    vec3 ldir  = normalize(vec3(0.5, 0.6, 0.8));
    float diff = max(dot(n, ldir), 0.0);
    float spec = pow(max(dot(reflect(-ldir, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);

    // Front colour from a drifting crop of the IMAGE, warm/cool by valence,
    // hue sweeping gently once per bar (continuous at the wrap).
    vec3 frontCol = imgPal(b * 5.0) * 1.6;
    frontCol = mix(frontCol * vec3(0.75, 0.95, 1.25),
                   frontCol * vec3(1.25, 0.95, 0.65), audioValence);
    frontCol = hueRot(frontCol, 0.35 * sin(audioBarPhase * 6.28318));

    // Compose: image everywhere, stained + lit where the reaction lives.
    float m   = smoothstep(0.04, 0.35, b);
    vec3  col = pic * (0.40 + 0.85 * m) * (0.65 + 0.35 * diff);
    col = mix(col, col * frontCol * 1.6, 0.55 * m);        // stain active regions
    col += edge * (0.32 + 0.40 * audioBeat + 0.15 * audioOnset) * frontCol;
    col += spec * m * (0.35 + 0.25 * audioBeat);           // glossy highlights
    col *= 0.85 + 0.30 * audioCentroid;
    col *= 0.95 + 0.25 * audioLevel;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
