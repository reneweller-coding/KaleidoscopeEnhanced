#version 330 core
// NeuroSynapseNetwork.vert — 60,000 synaptic nodes forming a 3D neural connectome.
// Action potential electrical spikes race across axonal pathways on beat transients.
//   attrA.w = point index, attrB = random seeds (4 channels)
// True stereo: eyeOff shifts view; convergence re-centres after proj.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioPhase;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioSpectrum[32];

uniform float densityP;
uniform float sparkP;
uniform float camDistP;
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioValence;

out vec4  vCol;
out float vLife;

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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float idx  = attrA.w;
    vec4 seeds = attrB;

    float dens = (densityP > 0.0) ? densityP : 1.0;
    float sprk = (sparkP   > 0.0) ? sparkP   : 1.0;
    float cDst = (camDistP > 0.0) ? camDistP : 1.0;
    float hue  = (hueP     > 0.0) ? hueP     : 0.0;

    // Connectome structure: 2 Brain Hemispheres + Neural Axon Traces
    float hemisphere = (seeds.x > 0.5) ? 1.0 : -1.0;
    
    // Ellipsoidal brain lobe coordinate
    float phi   = seeds.y * 6.2831853;
    float theta = (seeds.z - 0.5) * 3.14159;
    float rLobe = 6.5 * pow(seeds.w, 0.45) * dens;

    vec3 lobePos = vec3(
        cos(theta) * cos(phi) * 4.5 * hemisphere + hemisphere * 2.5,
        sin(theta) * 5.0,
        cos(theta) * sin(phi) * 7.0
    );

    // Axonal pathway filament tracing (Fibonacci spiral nerve bundles)
    float axonPhase = fract(seeds.x * 20.0 + time * 0.15 + audioAdvance * 0.1);
    vec3 axonPos = mix(lobePos, lobePos * 0.2, axonPhase);

    // Dynamic neural wave propagation (depolarization waves)
    float brainDist = length(lobePos);
    float brainWave = sin(brainDist * 1.5 - time * 4.0 - audioPhase * 6.0);

    // Action potential electrical discharge
    float actionPotential = pow(sin(seeds.x * 100.0 - time * 8.0 - audioKick * 6.0) * 0.5 + 0.5, 12.0) * sprk;

    vec3 finalPos = mix(lobePos, axonPos, 0.5);
    finalPos += vec3(0.0, sin(time + seeds.y * 6.28) * 0.3, 0.0);
    finalPos += (seeds.xyz - 0.5) * audioSubBass * 1.5;

    // Orbiting 3D camera
    float camAngle = time * 0.12 + audioAdvance * 0.04;
    float camDist = (16.0 * cDst) - audioSwell * 3.0;
    vec3 camPos = vec3(sin(camAngle) * camDist, 4.0 + 3.0 * sin(time * 0.15), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = finalPos - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point sprite size by depth and action potential — capped low: the
    // additive network integrates sprite AREA, the old 64 px cap was the
    // real reason the palette washed to white.
    float pSize = (2.0 + actionPotential * 9.0 + audioHigh * 2.0) * (16.0 / max(viewP.z, 1.0));
    gl_PointSize = clamp(pSize, 1.0, 16.0);

    // Synaptic colour from the photo arc (house standard); action potentials
    // still flash the classic gold so spikes read as events.
    vec3 baseCol = imgPalette(0.30 * (brainWave * 0.5 + 0.5)) * 1.35;
    baseCol = mix(baseCol, vec3(1.0, 0.95, 0.4), actionPotential);

    if (hue > 0.001) baseCol = hueRot(baseCol, hue);

    vCol = vec4(baseCol, 1.0);
    vLife = actionPotential;
}
