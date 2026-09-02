#version 330 core
out vec4 fragColor;
/**
 * @file CryosleepChamber.frag
 * @brief CRYOSLEEP CHAMBER: Flight down an endless, monumental hallway lined with 
 * thousands of cryosleep pods aboard a generation ship. The pods pulse with 
 * vital signs and life-support lights synchronized to the beat.
 *   audioAdvance -> camera flight speed down the hallway
 *   audioKick    -> flashes of alarm/activation lights
 *   audioSwell   -> ambient corridor lighting and fog
 *   audioChromaHue-> palette offset for the pod lights
 *
 * Per-activation variety:
 *   podP float complexity and layout of the pods (0.5..1.5)
 *   glowP float intensity of the life-support lights (0.5..1.5)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
// Beide zaehlen ab DIESER Aktivierung statt ab Programmstart.
uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float podP;
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

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float hitMat = 0.0;
float hitGlow = 0.0;

float map(vec3 p, float pp)
{
    float d = 1e10;
    float mat = 0.0;
    float glow = 0.0;
    
    // Hallway boundaries
    float floorDist = p.y + 3.0;
    float ceilDist = 3.0 - p.y;
    float wallDist = 4.0 - abs(p.x);
    
    float hall = min(min(floorDist, ceilDist), wallDist);
    if (hall < d) { d = hall; mat = 1.0; }
    
    // Repetition for the pods
    vec3 q = p;
    q.z = mod(q.z, 2.0) - 1.0;
    
    // Pods along the walls
    vec3 leftWall = p;
    leftWall.x += 3.5;
    leftWall.z = mod(leftWall.z, 2.0) - 1.0;
    
    vec3 rightWall = p;
    rightWall.x -= 3.5;
    rightWall.z = mod(rightWall.z, 2.0) - 1.0;
    
    // Create racks of pods vertically
    float yId = floor((p.y + 2.5) / 1.5);
    vec3 lwq = leftWall;
    lwq.y = mod(lwq.y + 2.5, 1.5) - 0.75;
    
    vec3 rwq = rightWall;
    rwq.y = mod(rwq.y + 2.5, 1.5) - 0.75;
    
    // Box for the pod
    if (p.y > -2.5 && p.y < 2.5) {
        float lPod = sdBox(lwq, vec3(0.5, 0.6, 0.8));
        float rPod = sdBox(rwq, vec3(0.5, 0.6, 0.8));
        
        float pods = min(lPod, rPod);
        
        // Window on the pod
        float windowL = sdBox(lwq - vec3(0.5, 0.0, 0.0), vec3(0.1, 0.4, 0.6));
        float windowR = sdBox(rwq - vec3(-0.5, 0.0, 0.0), vec3(0.1, 0.4, 0.6));
        
        if (windowL < lPod || windowR < rPod) {
            glow = 1.0; // Life support glass
        }
        
        if (pods < d) { d = pods; mat = 2.0; }
        
        // Status lights
        float lightL = sdBox(lwq - vec3(0.5, 0.5, 0.0), vec3(0.1, 0.05, 0.1));
        float lightR = sdBox(rwq - vec3(-0.5, 0.5, 0.0), vec3(0.1, 0.05, 0.1));
        float lights = min(lightL, lightR);
        
        if (lights < d) { d = lights; mat = 3.0; glow = 2.0; } // Status light
    }
    
    // Support pillars
    float pz = mod(p.z, 10.0) - 5.0;
    float pillL = length(max(abs(vec2(p.x + 3.9, pz)) - vec2(0.2, 0.5), 0.0));
    float pillR = length(max(abs(vec2(p.x - 3.9, pz)) - vec2(0.2, 0.5), 0.0));
    float pillars = min(pillL, pillR);
    if (pillars < d) { d = pillars; mat = 1.0; glow = 0.0; }
    
    hitMat = mat;
    hitGlow = glow;
    return d;
}

vec3 calcNormal(vec3 p, float pp)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, pp) - map(p - e.xyy, pp),
        map(p + e.yxy, pp) - map(p - e.yxy, pp),
        map(p + e.yyx, pp) - map(p - e.yyx, pp)
    ));
}

void main()
{
    float pp = (podP > 0.01 ? podP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Die Flugstrecke ist die Koordinate, mit der das Rauschfeld
    // abgetastet wird -- sie MUSS pro Auftritt bei 0 anfangen.  Mit
    // `time` stand hier nach einer Stunde 7200, und `sin(n * 12.9898)`
    // hat bei solchen Argumenten keine Aufloesung mehr fuer benachbarte
    // Zellen: das Rauschen wird konstant und das Bild flach bis schwarz.
    // Der Musikschub bleibt, er zaehlt nur ebenfalls ab dem Auftritt.
    float drift = sceneTime * 2.0 + sceneAdvance * 5.0;
    
    vec3 ro = vec3(0.0, 0.0, drift);
    
    // Camera shake on kick
    ro.x += (hash11(time * 10.0) - 0.5) * audioKick * 0.1;
    ro.y += (hash11(time * 10.0 + 1.0) - 0.5) * audioKick * 0.1;
    
    vec3 ta = ro + vec3(0.0, 0.0, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    vec2 ruv = uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    float g = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 90; ++i) {
        p = ro + rd * d;
        float ds = map(p, pp);
        m = hitMat;
        g = hitGlow;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 60.0) { m = 0.0; break; }
    }

    vec3 col = vec3(0.0);
    
    vec3 podColor = max(imgPalette(0.3), vec3(0.14, 0.26, 0.34));   // cool blue/cyan for cryo
    vec3 alertColor = max(imgPalette(0.9), vec3(0.55, 0.20, 0.10)); // warm red/orange for alert

    if (m > 0.5) {
        vec3 n = calcNormal(p, pp);
        
        // Simple lighting from corridor center
        float dif = max(dot(n, normalize(vec3(0.0, 0.0, p.z - ro.z + 5.0) - p)), 0.0);
        
        vec3 albedo = vec3(0.3); // clinical white/grey
        
        if (m == 1.0) {
            // Walls/floor
            albedo *= 0.5 + 0.5 * hash21(floor(p.xz * 2.0)); // tiles
            col = albedo * (0.05 + dif * 0.5 * (1.0 + audioSwell));
            
            // Floor guide lights
            if (p.y < -2.9 && abs(p.x) < 1.0 && mod(p.z, 2.0) < 1.0) {
                col += podColor * (1.0 + audioSwell) * gp;
            }
        } 
        else if (m == 2.0) {
            // Pod bodies
            col = albedo * (0.1 + dif * 0.5);
            
            // Pod window glow
            if (g == 1.0) {
                float vitals = step(0.5, sin(p.z * 10.0 - time * 5.0) + audioLevel);
                col += podColor * vitals * gp * (0.5 + audioSwell);
                
                // Reflection on glass
                float spec = pow(max(dot(reflect(-normalize(vec3(0.0, 0.0, p.z) - p), n), -rd), 0.0), 16.0);
                col += vec3(1.0) * spec * 0.5;
            }
            // Status lights
            else if (g == 2.0) {
                float zId = floor(p.z / 2.0);
                float yId = floor((p.y + 2.5) / 1.5);
                float isAwake = step(0.95, hash21(vec2(zId, yId + time * 0.1))); // some pods randomly wake/alarm
                
                vec3 lCol = mix(podColor, alertColor, isAwake + audioKick);
                float blink = isAwake > 0.0 ? step(0.5, fract(time * 5.0)) : 1.0;
                
                col += lCol * blink * (2.0 + audioKick * 3.0) * gp;
            }
        }
        
        col *= clamp(1.0 - float(steps) * 0.015, 0.1, 1.0);
    }
    
    // Cryo-fog (volumetric)
    float fog = exp(-d * 0.05);
    vec3 fogCol = mix(vec3(0.02, 0.05, 0.1), podColor, 0.2) * (0.5 + audioSwell * 1.5);
    col = mix(fogCol, col, fog);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
