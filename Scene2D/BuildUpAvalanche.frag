#version 330 core
out vec4 fragColor;
/**
 * @file BuildUpAvalanche.frag
 * @brief BUILD-UP AVALANCHE: a mountain face of the photo under snow.  As
 * the music builds, the snow gathers on the slope -- the cornice grows and
 * the load creeps down (slow, on the build-up envelope); at the drop the
 * slab releases and the avalanche runs down the face as a wall of round
 * snow grains and powder cloud.  The drop is the one allowed cut, and it
 * moves objects, not the camera, which is fixed on the mountain.  After
 * the run the slope is bare rock and the snow begins again.
 *
 * Audio Reactivity:
 *   audioBuildUp -> snow load and cornice (slow)
 *   audioDrop    -> the release (the drop: the avalanche runs)
 *   sceneAdvance -> the run itself and the powder drift (continuous)
 *   audioBass    -> the rumble as light in the powder (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: slopeP, grainP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBuildUp;
uniform float audioDrop;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float slopeP;
uniform float grainP;
uniform float hueP;

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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float slope = 0.5 + 0.5 * clamp(slopeP, 0.0, 1.0);
    float grain = 30.0 + 40.0 * clamp(grainP, 0.0, 1.0);
    float build = clamp(audioBuildUp, 0.0, 1.0);
    float drop = clamp(audioDrop, 0.0, 1.0);          // 1 at the drop, decaying

    // The mountain face: the photo as rock, the slope rising to the right.
    float ridge = 0.15 + slope * 0.5 * p.x + 0.08 * fbm(vec2(p.x * 3.0, 1.0));
    float onFace = step(p.y, ridge);
    vec3 rock = img(gl_FragCoord.xy / resolution) * mix(vec3(0.45), imgPalette(hue * 0.159 + 0.55), 0.4);
    // Sky above the ridge: the palette as a cold sky, brighter as it builds.
    vec3 sky = mix(vec3(0.35, 0.45, 0.65), imgPalette(hue * 0.159 + 0.6), 0.5) * (0.6 + 0.4 * build);
    sky *= 0.8 + 0.4 * (p.y + 0.5);
    vec3 col = mix(sky, rock, onFace);

    // Snow load on the face: a layer whose depth grows with the build-up,
    // thicker near the ridge (the cornice).  Snow is white with the
    // photo's tint; its lower edge creeps down as the load grows.
    float depthBelowRidge = ridge - p.y;
    float loadEdge = 0.05 + 0.5 * build;
    float snowMask = onFace * smoothstep(loadEdge + 0.05, loadEdge - 0.05, depthBelowRidge + 0.04 * fbm(p * 8.0));
    // The run: after the drop the slab slides down the face -- the snow
    // mask moves down at a run distance that advances on the scene clock
    // from the drop instant, and the released slab leaves bare rock above.
    // The drop envelope decays; the run distance is its integral in spirit:
    // we use (1 - drop) as the progress of the run (0 at the drop, 1 later).
    float run = (1.0 - drop);
    float runDist = run * 1.4;
    float slab = snowMask * step(0.02, drop);
    float slabMoved = onFace * smoothstep(loadEdge + 0.05, loadEdge - 0.05, depthBelowRidge - runDist + 0.04 * fbm(p * 8.0 + 3.0)) * step(0.02, drop) * (1.0 - smoothstep(0.7, 1.0, run));
    float staticSnow = snowMask * (1.0 - step(0.02, drop));
    float snow = max(staticSnow, slabMoved);
    vec3 snowCol = mix(vec3(0.92, 0.95, 1.0), imgPalette(hue * 0.159 + 0.9), 0.15);
    snowCol *= 0.7 + 0.3 * fbm(p * 12.0);
    col = mix(col, snowCol, snow);
    // The cornice: a bright lip along the ridge, growing with the build.
    float cornice = onFace * smoothstep(0.03 + 0.04 * build, 0.0, depthBelowRidge) * (0.3 + 0.7 * build);
    col = mix(col, snowCol * 1.15, cornice);
    // Powder cloud during the run: round grains and a haze below the
    // moving slab, drifting on the scene clock; the bass lights it.
    float running = step(0.02, drop) * (1.0 - smoothstep(0.75, 1.0, run));
    if (running > 0.0)
    {
        vec2 cp = p + vec2(0.1 * sceneAdvance, runDist * 0.8);
        float haze = fbm(cp * 4.0 + vec2(0.0, sceneAdvance * 0.5)) * smoothstep(0.4, 0.0, abs(depthBelowRidge - runDist) - 0.1) * onFace;
        vec2 gu = cp * grain; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        float grains = smoothstep(0.25, 0.05, length(f - off * 0.6)) * step(0.85, hash21(cell)) * smoothstep(0.5, 0.0, abs(depthBelowRidge - runDist) - 0.05) * onFace;
        vec3 powder = snowCol * (0.8 + 0.6 * clamp(audioBass, 0.0, 1.0));
        col = mix(col, powder, clamp(haze * 1.5, 0.0, 0.9) * running);
        col += powder * grains * running;
    }
    // Wind-blown spindrift off the cornice as it builds: round flakes.
    vec2 su = (p - vec2(sceneAdvance * 0.3, -sceneAdvance * 0.1)) * 50.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    float flakes = smoothstep(0.2, 0.05, length(sf - so * 0.6)) * step(0.96, hash21(sc)) * (1.0 - onFace) * build;
    col += snowCol * flakes * 0.8;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
