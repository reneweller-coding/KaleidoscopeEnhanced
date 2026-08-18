#version 330 core
out vec4 fragColor;
// Blueprint.frag — the body as a drafting drawing rather than a lit object.
// Almost nothing here is shading: the surface is a dark wash and everything
// legible is line work, which is what makes the look read as a print.

flat in vec3 vEdgeMask;
in float vKind;
in vec3  vBary;
in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in vec2  vUV;
in float vMorph;

/**
 * @file Blueprint.frag
 * @brief Renders the morphing body as a cyanotype drafting drawing rather
 * than a lit object: a dark blue paper wash with a screen-space plate grid,
 * a fwidth-based wireframe traced from barycentric coordinates, a silhouette
 * rim, periodic section lines, and a plotter-style measuring sweep.
 *
 * audioAmbient brightens the paper wash and its grid; audioBeat adds an
 * overall brightness pulse to both paper and body; audioLevel strengthens
 * the wireframe lines and the body's final brightness; audioHigh whitens the
 * ink tone slightly; audioSubBass brightens the periodic section lines;
 * audioKick both intensifies the body's final brightness and drives the
 * time-scrolling measuring sweep that races around the body on every hit;
 * audioChromaHue applies a small bounded blue-channel hue rotation (kept
 * subtle since blueprints are meant to stay blue). lineP scales wireframe
 * line thickness and glowP scales both wireframe and rim glow strength.
 */

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;
uniform vec2  resolution;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float lineP;
uniform float glowP;

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    // Paper.  Cyanotype blue, with a faint plate grid that stays put in SCREEN
    // space — a drawing's grid belongs to the sheet, not to the object.
    vec3 paper = vec3(0.055, 0.135, 0.265) * (1.0 + 0.35 * audioAmbient);
    vec2 sp = gl_FragCoord.xy / max(resolution.y, 1.0);
    float plate = step(0.985, max(fract(sp.x * 26.0), fract(sp.y * 26.0)));
    paper += vec3(0.05, 0.10, 0.16) * plate * 0.6;

    vec3 ink = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), 0.25 * audioHigh);

    if (vKind < 0.5)
    {
        // The sheet behind everything, with a vignette so it reads as paper
        // under a lamp rather than as a flat fill.
        float vig = 1.0 - 0.55 * length(sp - vec2(0.5 * resolution.x / resolution.y, 0.5));
        vec3 col = paper * vig;
        col += ink * 0.02 * plate;
        col *= 1.0 + 0.10 * audioBeat;
        fragColor = vec4(col / (1.0 + col * 0.22), interpolation);
        return;
    }

    // The body itself: barely there, just enough to hide the far side.
    float facing = clamp(dot(n, V), 0.0, 1.0);
    vec3 col = paper * 0.75 + vec3(0.02, 0.06, 0.10) * facing;

    // ---- wireframe from the barycentric coordinates ----
    // fwidth turns "distance to the edge" into "distance in pixels", so the
    // line keeps one constant width no matter how the triangle is foreshortened
    // — without it the edges facing away thicken into blobs.
    //
    // Diagonals are pushed out of the running by raising their distance: the
    // grid splits each quad into two triangles, and drawing the shared
    // hypotenuse turns a clean lattice into a herringbone.
    vec3 bary = vBary + (1.0 - vEdgeMask) * 10.0;
    vec3 d = fwidth(vBary);
    vec3 e = smoothstep(vec3(0.0), d * (1.4 + 2.6 * lineP), bary);
    float wire = 1.0 - min(min(e.x, e.y), e.z);

    col += ink * wire * (0.16 + 0.28 * glowP) * (0.65 + 0.7 * audioLevel);

    // ---- silhouette: the heavy outline of a technical drawing ----
    float rim = pow(1.0 - facing, 3.0);
    col += ink * rim * (0.35 + 0.7 * glowP);

    // ---- section lines every few units around the tube ----
    // Drawn on the parameter grid, so they follow the body through the morph
    // instead of sliding across it.
    float sec = min(abs(fract(vUV.x * 24.0) - 0.5), abs(fract(vUV.y * 12.0) - 0.5));
    col += vec3(0.35, 0.75, 1.0)
         * smoothstep(0.5, 0.46, sec) * 0.28 * (0.5 + 0.8 * audioSubBass);

    // A measuring sweep runs around the body on every kick, the way a plotter
    // would trace it.
    float sweep = fract(vUV.x - time * 0.09);
    col += vec3(0.9, 1.0, 0.75)
         * pow(max(1.0 - abs(sweep - 0.5) * 22.0, 0.0), 2.0)
         * (0.35 + 1.5 * audioKick);

    // Bounded hue nudge — blueprints are blue, so this stays small.
    float hr = 0.07 * sin(audioChromaHue);
    col.rb = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * col.rb;

    col *= 1.0 + 0.16 * audioBeat;
    col = col / (1.0 + col * 0.22);
    col *= (0.85 + 0.30 * audioLevel + 0.35 * audioKick);
    fragColor = vec4(col, interpolation);
}
