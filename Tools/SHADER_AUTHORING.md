# Shader-Autoren-Handbuch

Wie man neue Shader für Kaleidoscope schreibt, ohne in die immer gleichen
Fallen zu laufen.

**Warum es dieses Dokument gibt:** Über drei Shader-Batches (55 / 39 / 113
Dateien) sind 17, 3 und nochmal 17 Shader komplett schwarz ausgeliefert
worden. Kein einziger davon war ein „kreativer" Fehler — es waren jedes Mal
Verstöße gegen unausgesprochene Verträge der Engine. Alle scheitern **still**:
Der Shader kompiliert (oder eben nicht, ohne Meldung), rendert schwarz, und
das Log sagt kein Wort. Genau deshalb sind sie so teuer: Man findet sie nur
durch Rendern und Hinsehen.

Die Regeln unten sind in `Tools/shadercheck.py` mechanisch kodiert. **Zuerst
den Linter laufen lassen, dann rendern** — er findet in einer Sekunde, wofür
ein Render-Durchlauf eine Stunde braucht.

---

## Die Prozedur (Kurzfassung)

```bash
# 1. Statische Vertragsprüfung -- MUSS 0 errors zeigen
python Tools/shadercheck.py --new HEAD~1

# 1b. Uniform-Typen XML gegen GLSL (V6b) -- MUSS Exit-Code 0 liefern
python Tools/check_uniform_types.py Configurations/*.xml

# 2. Preset-Selbsttests (Registrierung + Parameter-Vollständigkeit)
PresetEditor\build\Release\PresetEditor.exe --validate

# 3. Optische Prüfung: jeden neuen Shader rendern und auf Schwarz prüfen
#    (siehe "Batch-Rendern" unten -- Achtung: CR-Falle!)

# 3b. Regression gegen die Grundlinie -- nur die BERÜHRTEN Szenen, nicht alle:
.\Tools\scan_scenes.ps1 -Scenes Geaendert1,Geaendert2 -Out recheck
python Tools\scene_metrics.py Release
echeck --json Release
echeck\_metrics.json
python Tools\check_scene_regression.py Release
echeck
#    Exit 1 = eine Metrik hat sich über das Messrauschen hinaus bewegt.
#    War die Änderung gewollt: nochmal mit --update, das schreibt die
#    Grundlinie für diese Szenen fort.

# 4. Erst dann committen.
```

Kein Shader gilt als „fertig", bevor er einmal **gerendert und angeschaut**
wurde. Registrierung + Kompilieren beweisen gar nichts — 17 von 58 Shadern
waren registriert, kompilierten (scheinbar) und waren trotzdem schwarz.

---

## Die Verträge der Engine

### V1 — Vertex-Attribute heißen `attrA` / `attrB`

`Scene3DShader::initUniforms()` ruft ausschließlich
`glGetAttribLocation(prog, "attrA")` und `"attrB"` auf. Jeder andere Name
(`inPos`, `inNormal`, `inTexCoord`, …) bekommt **niemals** Daten — die
Geometrie kollabiert auf einen Punkt.

```glsl
in vec4 attrA;   // Bedeutung hängt vom geom-Kind ab (siehe V2)
in vec4 attrB;   // xyzw = vier hash01-Seeds in [0,1)
```

### V2 — Was in `attrA`/`attrB` steht, je `geom`-Kind

Maßgeblich ist `Scene3DShader::buildGeometry()`:

| `geom` | `attrA.xy` | `attrA.z` | `attrA.w` | `attrB` |
|---|---|---|---|---|
| `points` / `scatter` | 0 | 0 | Punkt-Index | 4 Seeds |
| `cubes` | Würfel-Ecke (−0.5…0.5) | Ecke | **Würfel-Index** | 4 Seeds |
| `grid` | Zell-UV **[0,1]** | 0 | Zell-Index | 4 Seeds |
| `quads` | Ecken-UV **[0,1]** | 0 | **Quad-Index** | 4 Seeds |
| `patches` | Ecken-UV [0,1] | 0 | Zell-Index | 4 Seeds |
| `ribbon` | x = t [0,1], y = Seite (−1/+1) | 0 | **Ribbon-Index** | 4 Seeds |
| `indirect` | frei — der Compute-Shader schreibt alles | | | |
| `mesh` | Objekt-Position (xyz) | — | **U** | xyz = Normale, w = **V** |

`mesh` ist der einzige nicht-prozedurale Kind: `buildGeometry()` lädt eine
echte `.glb`/`.gltf`/`.obj`-Datei (config-Attribut `model="..."`, siehe
`Source/MeshImport.h`) statt ein Muster zu erzeugen. `attrA`/`attrB` tragen
deshalb keine 4 Hash-Seeds, sondern die tatsächliche Vertex-Normale — es gibt
keinen Punkt-/Würfel-/Quad-Index zum Einfärben, weil es nur EIN Objekt ist.
Ein vorhandenes Material steckt in `uniform sampler2DArray texMeshMaterial`
(Layer 0 = Basisfarbe+Opacity RGBA, Layer 1 = Metallic-Roughness im
glTF-Kanal-Layout: G=Roughness, B=Metallic — nur vorhanden, wenn die
Quelldatei ein Material hatte, sonst bleibt `texMeshMaterial` ungebunden).
`uniform int texMeshMaterialLayers` sagt, wie viele Layer wirklich befüllt
sind (1 oder 2) — `texture()` auf einem `sampler2DArray` klemmt einen
Layer-Index außerhalb des Bereichs, statt zu scheitern, d.h. ohne diese
Prüfung würde ein Mesh ohne Metallic-Roughness-Map stillschweigend seine
Basisfarbe nochmal als Rauheit/Metallgrad einlesen.

#### `mesh`: die angehängte Himmels-Schale

Hinter den Vertices des Modells hängt `buildGeometry()` im **selben** VBO eine
große umschließende Würfel-Schale an. Sie ist der Hintergrund der Szene
(Nebel, Asteroidenfeld, Planet, Unterwasser-Säule, Synthwave-Horizont …) —
ein Mesh-Shader muss beide Teile bedienen:

```glsl
uniform int meshVertexCount;          // erste Schalen-Vertex-ID
bool isBg = gl_VertexID >= meshVertexCount;
```

Auf der Schale bedeutet `attrA.xyz` **Welt**position und `attrB.xyz` die
Richtung nach außen (als „Himmelsrichtung" für prozedurales Rauschen). Der
Fragment-Shader unterscheidet über ein `vBg`-Varying. Drei Punkte, die nicht
optional sind:

- **Schalentiefe an die Far-Plane klemmen.** Die Schale ist ein WÜRFEL, ihre
  Ecken liegen also √3-mal weiter draußen als ihre Flächen — jenseits von
  `kSceneFar`. Ohne `if (isBg) gl_Position.z = gl_Position.w * 0.999999;`
  schneidet die Far-Plane sichtbare Keile aus dem Himmel.
- **Bei einem Geometry-Shader die Schale unverändert durchreichen.** Wer den
  Effekt der Szene (Shatter, Glitch …) auch auf die Schale anwendet, zerreißt
  den Himmel.
- Ein Tiefen-Nebel `mix(col, vec3(0.0), …)` auf dem Objekt ist jetzt **falsch**:
  er blendet gegen Schwarz statt gegen den sichtbaren Hintergrund.

#### `mesh`: zweites Modell und Szenen-Fortschritt

Zwei Bausteine für **inszenierte** Szenen (ein Vorbeiflug, ein Anflug, ein
Eintauchen) statt endloser Schleifen:

```glsl
uniform float sceneProgress;   // 0 bei Aktivierung -> 1 am Ende der Solo-Zeit
uniform int   mesh2VertexCount; // erste Schalen-Vertex-ID, wenn model2 gesetzt ist
```

- **`sceneProgress`** ist der einzige Weg, einen Vorgang mit Anfang, Mitte und
  Ende zu bauen: `time` ist absolut, alles andere periodisch. Die Szene füllt
  damit automatisch genau die Zeit, die ihr der Scheduler gibt. Er steht
  **jedem** Shader zur Verfügung, nicht nur `geom="mesh"`.
- **`model2="..."`** lädt ein ZWEITES Mesh in denselben VBO. Der Puffer hat
  dann drei Abschnitte, und `gl_VertexID` unterscheidet sie:

  | Bereich | Inhalt |
  |---|---|
  | `< meshVertexCount` | Modell 1 (`model=`) |
  | `< mesh2VertexCount` | Modell 2 (`model2=`) |
  | sonst | Himmels-Schale |

  Ohne `model2` ist der mittlere Abschnitt leer und `mesh2VertexCount ==
  meshVertexCount` — bestehende Ein-Modell-Shader bleiben unverändert gültig.
  Modell 2 hat sein **eigenes** Material in `texMeshMaterial2` /
  `texMeshMaterialLayers2`; wer für beide Rümpfe dieselbe Textur sampelt,
  zieht den Atlas des einen über den anderen.

#### `mesh`: Belichtung nicht fest verdrahten

Die Basisfarb-Helligkeit dieses Asset-Bestands reicht von **0,14** (dunkle
Stationsrümpfe) bis **0,67** (ein fast weißes Culture-Schiff). Eine feste
Beleuchtungsverstärkung kann beide nicht bedienen: auf die dunklen abgestimmt
brennt sie die hellen zu einem konturlosen weißen Klumpen aus. Die gröbste
Mipmap des Material-Arrays IST der Texturmittelwert und kostet einen Fetch:

```glsl
vec3 avg = textureLod(texMeshMaterial, vec3(0.5, 0.5, 0.0), 20.0).rgb;  // lod klemmt
float expose = clamp(0.20 / max(dot(avg, vec3(0.299,0.587,0.114)), 0.02), 0.30, 2.0);
```

Drei Fallen, die alle schon zugeschlagen haben:

- **Der Index steht in `attrA.w`** — nicht in `attrB.x`. `attrB` enthält
  `hash01()`-Werte in [0,1), also ist `int(attrB.x)` **immer 0**: alle 20
  Ribbons landen übereinander auf Ribbon 0.
- **`gl_InstanceID` ist immer 0.** Die Engine zeichnet mit `glDrawArrays`,
  *nicht* instanziert. Wer `gl_InstanceID` benutzt, bekommt alle Objekte an
  derselben Stelle.
- **`grid`/`quads` liefern `[0,1]`, nicht `[-1,1]`.** Wer die Mathematik auf
  einen zentrierten Bereich auslegt, schiebt die ganze Szene in einen
  Quadranten. Umrechnen: `attrA.xy * 2.0 - 1.0`.

### V3 — Die Kamera-Transformation ist Pflicht

`projM` hat `-1` in der w-Zeile, d.h. **clip-w = −z_view**. Sichtbar ist nur
Geometrie mit **negativem** view-z jenseits der Near-Plane (0.5). Rohe
Objektkoordinaten direkt in die Projektion zu geben heißt: nichts wird
gerastert.

```glsl
vec3 vp = worldPos;
vp.z += camDist;          // vom Betrachter wegschieben
vp.x -= eyeOff;           // Stereo-Versatz
gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);   // <-- das Minus!
gl_Position.x += eyeOff * 0.045 * gl_Position.w;      // Konvergenz
```

Liegt die Fläche in der XZ-Ebene (Terrain, Scheibe), vorher noch nach unten
kippen, sonst sieht man sie von der Kante:

```glsl
float c = cos(tilt), s = sin(tilt);
vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
```

*Ausnahme:* Ein `.vert`, zu dem eine `.tese` oder `.geom` gehört, ist ein
Durchreicher — dort projiziert die nachgelagerte Stufe.

### V4 — `gl_PointCoord` existiert nur bei `GL_POINTS`

Nur `geom="points"` (und `scatter`) zeichnet Punkte. Alle anderen Kinds —
insbesondere `indirect` — zeichnen `GL_TRIANGLES`. Dort ist `gl_PointCoord`
**undefiniert** (liefert praktisch (0,0)), und das übliche Sprite-Muster

```glsl
vec2 pt = gl_PointCoord * 2.0 - 1.0;
if (dot(pt, pt) > 1.0) discard;      // verwirft JEDES Fragment
```

löscht das komplette Bild. Für Dreiecke eine echte Quad-Koordinate als
Varying durchreichen (der Generator packt z.B. einen Ecken-Code in `attrA.w`).

### V5 — Indirect-Generatoren: der Draw-Count-Vertrag

`Engine/IndirectClamp.comp` läuft **nach jedem** Generator und macht:

```glsl
cmd[0] = min(cmd[4], maxVertices);
cmd[4] = 0u;
```

Daraus folgt zwingend:

- Vertices **nur** über `atomicAdd(cmd[4], n)` reservieren.
- **Niemals** `cmd[0..3]` selbst schreiben — der Wert wird überschrieben,
  und weil `cmd[4]` dann 0 ist, wird `cmd[0] = 0`: es zeichnet nichts.
- Den Puffer **unsized** deklarieren: `buffer Cmd { uint cmd[]; }` —
  `uint cmd[4]` schließt Slot 4 aus.
- `uniform uint maxVertices` nehmen und die Reservierung prüfen.
- `GL_TRIANGLES` heißt: pro Einheit ein Vielfaches von 3 Vertices. Ein
  loser Punkt pro Einheit ergibt keine Dreiecke.

```glsl
uint base = atomicAdd(cmd[4], 6u);
if (base + 6u > maxVertices) return;   // 2 Dreiecke = 1 Quad
```

Der Dispatch ist fest `16×16×16` bei `local_size 4,4,4` — den Index über
**alle drei Achsen** flachklopfen, sonst erreicht man 1/4096 der Einheiten:

```glsl
uvec3 g = gl_GlobalInvocationID;
uint idx = g.x + 64u * (g.y + 64u * g.z);
```

### V5c — Der Generator (.comp) hat seine EIGENE Uniform-Liste im Host

Die Compute-Stufe bekommt ihre Uniforms nicht aus `applyAudioFeatures()`,
sondern aus `Scene3DShader::runGenerator()` (`GenLocCache`). Eine Uniform,
die dort nicht aufgezaehlt ist, kompiliert anstandslos und liest fuer immer 0
-- ohne Warnung. So stand `sceneAdvance`/`sceneTime`/`sceneProgress` in den
Generatoren bis 03.09. still, und der Staren-Schwarm bewegte sein
Stroemungsfeld nie. Vor dem Gebrauch einer Host-Uniform in einer `.comp`:
`grep -n "m_genLocs\." Source/Scene3DShader.cpp` -- und fehlt sie, dort
nachtragen (Location holen UND setzen), nicht im Shader improvisieren.
Aktuell vorhanden: time, sceneSeed, sceneAdvance, sceneTime, sceneProgress,
audioAdvance/Level/Beat/Kick/SubBass/High/Bass/Mid/Phase/Swell,
audioChroma[12], audioSpectrum[], texSpectro/spectroHead/spectroFill,
maxVertices, frameIndex, genPass sowie alle XML-Parameter und Exprs.
`usesProgress()` (Drop-Regie) prueft nur das Vertex/Fragment-Programm: eine
gestufte Indirect-Szene deklariert `sceneProgress` deshalb AUCH im .vert.

### V5d — Zustandspuffer (stateBytes): nie dem Magic-Wort allein trauen

GPU-Speicher wird recycelt: ein neuer Puffer kann den RICHTIGEN Magic-Wert
und einen alten oder zufaelligen Zustand tragen (TidalDisruptionEvent: Stern
unsichtbar, bis verschluckte Teilchen am richtigen Ort wiedergeboren wurden).
Drei Sicherungen, alle drei: (1) Reseed in den ersten Frames jeder
Aktivierung (`sceneTime < 0.06`), (2) den Magic-Wert erst im Folge-Pass
stempeln, nachdem der Seed-Pass ein Flag gesetzt hat (Pass-Reihenfolge ist
nicht garantiert), (3) Wiedergeburt pro Teilchen bei Null, NaN oder
"verschluckt". Vorlage: Scene3D/TidalDisruptionEvent.comp.

### V5b — Nie ein lokales `fragColor` deklarieren

```glsl
out vec4 fragColor;          // die echte Ausgabe
void main() {
    vec4 fragColor = ...;    // FALSCH: verschattet das out, KEIN Compilerfehler
```

Die out-Variable bleibt ungeschrieben, die Szene rendert still schwarz.
Genau so war `MobiusOrbs` seit der Core-Migration unbemerkt komplett
schwarz (gefunden per Metrik-Scan, nicht per Log — es gibt keinen Log).
Shadertoy-Portierungen sind besonders gefährdet (dort ist fragColor ein
Parameter). Akkumulator-Variablen immer anders nennen (`acc`).

### V6 — Jede benutzte Uniform muss deklariert sein

Ein nicht deklarierter Bezeichner ist ein **harter GLSL-Compile-Fehler**. Die
Meldung geht durch den bekannten `captureStderr`/`CONOUT$`-Bug verloren, also
sieht man nur Schwarz und ein leeres Log. Das hat `ChromaAcidTrip.frag`
erwischt (`audioChromaHue`) und danach nochmal sechs Shader (`time`,
`audioPhase`, `audioLevel`, `audioChromaHue`).

Die Liste der Host-Uniforms steht in `Source/EffectShader.cpp` (`kAudioLocs`).

Seit 03.09. gibt es fuer die Songstruktur `audioSectionId`, `audioSectionPrev`,
`audioSectionAge` (Sekunden seit dem Wechsel), `audioSectionKnown` (1 =
wiedererkannte Section) und `audioSectionCount`. Die Id ist ein SLOT (8er-LRU),
wiederkehrende Sections bekommen dieselbe; Wechsel per `audioSectionAge`
weich inszenieren (Tuer voraus, Regel V7c), nie den Zustand hart umschalten.

### V6b — Der Uniform-TYP muss zwischen XML und GLSL zusammenpassen

`Uniform.cpp` lädt `<int>` und `<bool>` mit `glUniform1i`, `<float>` mit
`glUniform1f`. Zeigt eine Deklaration auf ein GLSL-Uniform der jeweils anderen
Sorte, **lehnt der Treiber den Upload ab** (`GL_INVALID_OPERATION`) und das
Uniform behält seinen Vorgabewert **0**.

```xml
<float name="sides" .../>     <!-- FALSCH gegen `uniform int sides` -->
<int   name="sides" .../>     <!-- richtig -->
```

Das ist kein Log-Rauschen, sondern ein Bildfehler — und ein unsichtbarer:
`RenderPipeline::checkGLErrors()` ist ohne `KALEIDO_GL_DEBUG` ein No-op, also
sieht man nichts. Gefunden am 21.08. in zwei Szenen: `TunnelPlain`s
Faltungszahl stand dauerhaft auf 0, `TunnelReverse` konnte nie rotieren; beide
warfen dabei **einen GL-Fehler pro Frame** (236 bzw. 245 in fünf Sekunden).

Prüfung über den ganzen Katalog, Exit-Code 1 bei Fehlpaarung:

```bash
python Tools/check_uniform_types.py Configurations/*.xml
```

**Beim Bearbeiten von Konfigurations-XML per Skript:** öffnendes UND
schließendes Tag ändern. Ein `<int ...></float>` ist für jeden XML-Parser
fatal, aber die Regex-Werkzeuge merken es nicht — genau so fiel `verify.ps1`
still auf einen synthetischen Tag mit `geom="points"` zurück und entwertete
drei Folgemessungen. `check_uniform_types.py` prüft deshalb zuerst die
Wohlgeformtheit.

### V6c — Vom Compiler gemeldete uninitialisierte Variablen initialisieren

NVIDIA meldet `warning C7050: "hitP" might be used before being initialized`.
Typisch beim Raymarching: die Trefferposition wird nur im Trefferzweig gesetzt
und danach unter `if (hitDist > 0.0)` gelesen — zur Laufzeit also korrekt
abgesichert, der Compiler kann die Korrelation zwischen den zwei Variablen nur
nicht beweisen.

Trotzdem initialisieren (`vec3 hitP = vec3(0.0);`): der tote Store kostet
nichts, GLSL lässt das Lesen einer uninitialisierten Variablen formal
undefiniert, und die Warnung verdeckt sonst echte Meldungen im Log. Am 21.08.
in sechs Shadern erledigt.

> Zur Vorsicht, weil es hier schiefging: Eine A/B-Messung schien zunächst zu
> zeigen, dass vier dieser Shader danach *anders* rendern — der Fix wäre also
> ein echter Bildfehler gewesen. Das war ein Artefakt kaputter Konfigurations-
> XML (siehe V6b), nicht die Initialisierung. Mit gültigem XML nachgemessen
> decken sich alle sechs mit dem Stand davor. **Vor jeder A/B-Aussage einen
> Kontrolllauf desselben Standes machen.**

### V6d — Reservierte GLSL-Woerter als Variablennamen: `half`, `flat`, `centroid`, ...

```glsl
vec3  half = ...;    // FALSCH - der Generator kompiliert still nicht (Szene schwarz)
float flat = ...;    // FALSCH - C7537 "does not allow 'flat' after a type specifier"
```

GLSL reserviert u. a. `half`, `flat`, `smooth`, `centroid`, `sample`, `patch`,
`input`, `output`, `filter`, `fixed`, `double`, `sizeof`, `union`, `enum`,
`class`, `template`, `this`, `goto`, `inline`, `noinline`, `volatile`,
`public`, `static`, `extern`, `external`, `interface`, `long`, `short`,
`unsigned`, `superp`, `namespace`, `using`, `cast`, `asm`, `typedef`,
`switch`-Familie, `common`, `partition`, `active`, `resource`. Ein
Fragment-Shader meldet den Fehler wenigstens (Compilation: FAILED), ein
COMPUTE-Generator faellt stumm aus. Vor dem Commit:
`grep -n "^\s*\(float\|vec[234]\|int\)\s\+\(half\|flat\|centroid\|sample\|patch\|filter\|fixed\)\b" Scene2D/*.frag Scene3D/*.{comp,vert,frag}`.

### V7 — Anti-Flimmer: `time` nie mit einem Audiowert multiplizieren

```glsl
float t = time * audioLevel;               // FALSCH - springt bei jeder Änderung
float t = time * 0.4 + audioAdvance * 0.2; // richtig - Rate ist einintegriert
```

`audioAdvance` ist eine bereits integrierte Phase. Absolute Zeit mit einem
schwankenden Faktor zu skalieren lässt die Phase bei jeder Pegeländerung
springen.

### V7b — `time` ist UNBEGRENZT: nie linear in eine Position

```glsl
vec3 ro = vec3(sin(t*0.4)*0.9, t*1.1, cos(t*0.35)*0.9);  // FALSCH - fliegt davon
```

`time` zaehlt Sekunden seit dem **Programmstart** und wird nie
zurueckgesetzt (`m_globaltime += dt`). `audioAdvance` und `audioPhase` sind
genauso Integratoren. Eine **Phase** darf beliebig wachsen -- `sin`, `cos`,
`mod`, `fract` holen sie zurueck. Eine **Position** darf es nicht: die Kamera
schiebt sich sonst aus einer Geometrie, die nur nahe dem Ursprung existiert,
und irgendwann trifft kein Strahl mehr etwas. Gemessen an
`HyperbolicTilingPolyhedralFlight`: Struktur 0.19 bei Uhr 0, **0.0005 bei Uhr
3600** -- nach zwei Minuten Laufzeit tot. Im Screening faellt das nicht auf,
weil dort jede Szene in den ersten Minuten einer Aufnahme gemessen wird.

Zwei richtige Loesungen:

```glsl
uniform float sceneTime;             // Sekunden seit DIESER Aktivierung
vec3 ro = vec3(..., sceneTime * 1.1, ...);          // Flug faengt neu an

float period = 4.0 * crv;                            // oder: Domaene wickeln
q.y = mod(q.y + 0.5*period, period) - 0.5*period;    //   im map()
vec3 ro = vec3(..., mod(t * 1.1, period), ...);      //   und die Kamera mit
```

`sceneTime` passt, wenn eine Solo-Spanne (~45 s) Flug die Geometrie nicht
verlaesst. Ist der Flug wirklich endlos gemeint, muss die Domaene periodisch
werden -- das haelt nebenbei die Koordinaten klein genug fuer `float`.

Pruefen:

```
python Tools/clock_runaway.py                       # Verdachtsliste
python Tools/screen.py --scenes <Name> --time-start 3600   # Befund
```

### V7c — Stetigkeit: Audio nie als STUFE in Bewegung oder Geometrie

```glsl
rot += floor(audioBeat * 3.0) * sector;   // FALSCH - schnappt auf dem Beat
n    = sidesP + floor(audioBeat * 1.9);   // FALSCH - Faltungszahl springt live
rot += audioBeat * 0.35;                  // richtig - Huellkurve, klingt ab
```

Jede Bewegung im Bild muss stetig sein. `audioBeat`, `audioKick`, `audioOnset`,
`audioSwell`, `audioBuildUp` sind Huellkurven: als *Rate* oder *Amplitude*
sind sie sprungfrei, durch `floor`/`step`/`round` werden sie zu Schnitten.
Diskrete Groessen (Faltungszahl, Segmentzahl, Kachelanzahl) werden EINMAL pro
Aktivierung gewuerfelt und dann nicht mehr angefasst. Ein Umschalten des
Bildzustands ist nur dort erlaubt, wo die Musik selbst schneidet (der Drop),
und dann vom Drop-Puls maskiert. Auch ein Zustandswechsel wie "Tempo bekannt /
unbekannt" ist als `smoothstep` zu ueberblenden, nicht als `step`.
Pruefen: `grep -n "floor(audio\|step([0-9.]*, *audio" Scene2D/*.frag`.

### V7d — KEINE Erschuetterungen: der Bildrahmen bewegt sich nur auf langsamen Signalen

```glsl
p -= 0.05 * vec2(sin(audioBarPhase * 6.28), 0.0);   // FALSCH - Kamera schwankt im Takt
float r = length(p) * (1.0 - 0.1 * audioBass);      // FALSCH - Tunnel pumpt mit dem Bass
zoom *= 1.0 - 0.06 * audioBeat;                       // FALSCH - Bild zoomt auf jedem Schlag
float radius = 1.0 + 0.45 * audioStereoL;             // FALSCH - Wand zittert mit der Energie
col *= 1.0 + 0.4 * audioKick * exp(-r * 4.0);         // richtig - der Kick ist LICHT
```

Rene leidet unter Gaming-Sickness: jede Bewegung des ganzen Bildes, die nicht
die eigene stetige Fahrt der Szene ist, macht ihn krank. Kameraposition,
Gesamtzoom, Gesamtdrehwinkel, Tunnelradius, Horizont, Wasserstand, Faltzentrum
bewegen sich NUR auf sceneAdvance, sceneTime, sceneProgress oder auf
Sekunden-Huellkurven (audioSwell, audioBuildUp) -- nie auf audioKick, audioBeat,
audioOnset, audioBass, audioLevel, audioStereo/L/R, audioDrop, audioMelodyPitch,
audioBarPhase, audioBeatPhase. Die schnellen Signale treiben LICHT und FARBE
(Helligkeit, Glow, Nahtblitz, Palette) oder einzelne Objekte IM Bild (ein Vogel,
ein Panel), nie den Blickpunkt. Kein Kamera-Schwanken, auch kein kleines.
Pruefen: `grep -n "p -= \|p += \|zoom.*audio\|radius.*audio\|vp\.z.*audio" Scene2D/*.frag Scene3D/*.vert`.

Der Host selbst hatte eine virtuelle Kamera (Downbeat-Punch, Kick-Shake,
Bar-Schwanken, Gate-Weave, Drop-Rewind, Bass-Schockwelle, Trail-Beat-Warp);
seit 03.09. schaltet der Settings-Schluessel `calmMotion` (Default an) all das
ab. Wer eine Szene auf Erschuetterungen prueft, prueft mit calmMotion=true --
sonst sieht man die Kamera des Hosts, nicht die Szene.

Pruefwerkzeug fuer V7c/V7d/V8e: `python Tools/shake_scan.py` (ganzer Katalog) oder `--files a.frag b.vert` (vor dem Commit). Kategorien FRAME/SHAKE/HULL/STEP/PIXEL; jeden Treffer lesen.

### V8 — Registrierung

Jeder Shader braucht einen Eintrag in `Configurations/Komplett.xml` (die
vollständige Referenzdatei) — sonst kann er nie ausgewählt werden. Jede
`Scene3D/X.frag` braucht zwingend eine `Scene3D/X.vert`. `--validate` prüft,
dass alle Stimmungs-Presets die deklarierten Parameter vollständig haben.
Ausnahme: `<expr name="audio…">`-Einträge (Audio-Mapping-Overrides, siehe V9)
sind bewusst **pro Preset optional** und werden von `--validate` übersprungen.

### V8b — Farben aus dem Bild, nicht aus der Regenbogen-Formel

Statt der generischen `0.5 + 0.5*cos(vec3(0, 2, 4) + phase)`-Palette den
Haus-Standard **imgPalette(t)** verwenden (Snippet in den umgestellten
Szenen, z. B. `Scene2D/FerrofluidSpikeForest.frag`): Farben kommen von einem
rotierenden Kreisbogen im AKTUELLEN Diashow-Bild — jede Aktivierung erbt
eine frische Palette aus den Fotos, der Bogen folgt der Tonart
(`audioChromaHue`, zirkulär geslewt = sprungfrei) mit langsamem
`advance`-Drift, `audioValence` formt die Sättigung zum Mood. Übergabe:
alter Skalar-Phasenanteil × 0.159 (= /2π) als `t`. Benötigt `img()` +
`audioChromaHue`/`audioAdvance`/`audioValence`-Deklarationen.

Seit der Palette-Kampagne (2026-08, Docs/palette_plan.md) ist das
flächendeckend umgesetzt; dabei etablierte Konventionen:

- **hue2rgb/hsv2rgb-Helfer retargetieren statt Aufrufer anfassen**: die
  HSV-Boilerplate-Helfer geben jetzt `imgPalette(h) * 1.35` zurück — alle
  fract(hue+x)-Offsets der Aufrufer werden automatisch Bogen-Positionen.
  Der 1.35-Gain kompensiert die geringere Durchschnitts-Luminanz der
  Fotofarben gegenüber dem reinen HSV-Regenbogen.
- **palTint(c, t, k)** ist der Haus-Standard für Szenen mit
  Identitätsfarbe (Feuer, Lava, Bio-Glow, Metall): biegt die Farbe
  luminanzerhaltend um `k` (0.15–0.28) Richtung Foto-Bogen — Feuer bleibt
  Feuer, der Farbton lehnt sich ans Bild an. Snippet in den
  TOENUNG-Szenen (z. B. `Scene2D/Aurora.frag`).
- Auch **Vertex-Shader** dürfen imgPalette nutzen (Vertex-Texture-Fetch,
  Beweis: VideoRelief.vert und die ganze Punkt/Ribbon-Familie) — Sampler-
  und Audio-Deklarationen dann im .vert.

### V8c — Additive Punkt-Sprites: die Fläche IST die Belichtung

Bei additiv gezeichneten Punktwolken (geom="points", 60k Sprites)
integriert der Framebuffer `Sprite-Fläche × Helligkeit × Überdeckung`.
Ein 64-px-Cap bedeutet bei 60k Sprites >100-fache Überzeichnung — dann
brennt JEDE Palette zu Weiß aus, und **Gain-Senkungen wirken nicht**,
weil sie linear sind, die Fläche aber quadratisch. Regel: erst
`gl_PointSize` klein halten (Cap 10–22 px bei 60k Punkten), ruhende
Partikel dunkel lassen (Basis ≤ 0.1), erst DANN am Gain drehen.
Lehrstück: NeuralAxonSynapseCloud (Luma 250 → 18 bei satten Farben),
LargeHadronCollision, NeuroSynapseNetwork. Zweites Lehrstück (LHC):
Teilchen-Phasen über den GANZEN Zyklus streuen — teilen fast alle
denselben `fract(time…+seed*0.1)`-Takt, fliegt alles als eine Schale
und das Zentrum ist die meiste Zeit ein schwarzes Loch.

### V8d — Kein globaler chromaHue-Dreh auf Bildfarben

Das Alt-Muster `col = hueRot(col, audioChromaHue + …)` als LETZTER Schritt
stammt aus der Zeit vor imgPalette und ist auf bildbasierten Farben
**verboten**: imgPalette folgt der Tonart bereits intern (zirkulär geslewt),
der zusätzliche globale Dreh rotiert die Fotofarben nur noch VOM Bild WEG —
bei `audioChromaHue ≈ 3` um ~172°, aus warmen Fototönen wird flaches Cyan
(so sahen PrismaticCrystalChamber und KerrNewman im Katalog-Review aus;
54 Szenen mussten bereinigt werden). Erlaubt bleibt: der
Per-Aktivierungs-Offset (`hueRot(col, hueP)`) und chromaHue-Dreh in REIN
prozeduralen Szenen ohne img()/imgPalette — dort ist er die einzige
Tonart-Kopplung und Absicht.

Und als Design-Grundsatz: **Regenbogen nur als bewusste Identität.** Neue
Szenen färben per imgPalette (VOLL) oder palTint (Identitätsfarbe bleibt);
das volle Farbrad gibt es nur, wenn das Phänomen selbst eines ist
(ChromaAcidTrip, PrismExplode, LaserArena, NeonTubes, OscilloRings,
RibbonTunnel, QuantumChromaField — dokumentierte Ausnahmen).

### V8e — Partikel sind RUND und gejittert, nie leuchtende Gitterzellen

```glsl
float snow = step(0.98, hash(floor(p)));                 // FALSCH - ganze Zelle leuchtet = Riesenpixel
vec3 c = floor(p); vec3 f = fract(p) - 0.5 - jitter(c);  // richtig - runder Punkt in der Zelle
float snow = smoothstep(sz, sz*0.3, length(f)) * step(0.98, hash(c));
```

Rene (03.09.): "solche Riesenpixel finde ich extrem haesslich." Sterne,
Meeresschnee, Staub, Funken, Koernung: immer ein Abstand zum (gejitterten)
Zellzentrum mit weicher Kante, Groesse pro Zelle variiert; die Zellgroesse
darf nie sichtbar werden. Vor dem Commit:
`grep -n "step([0-9.]*, *hash[0-9]*(floor" Scene2D/*.frag Scene3D/*.frag`
und jeden Treffer lesen.

### V10 — Belichtungsbudget: gegen REALISTISCHE Hot-Werte designen

Der Katalog-Review fand ~60 Szenen, die bei kräftiger Musik zu reinem Weiß
clippten. Die gemeinsame Ursache: Helligkeits-Terme wurden gegen einzelne
Uniforms bei 0..1 entworfen, aber live stapeln sich die Faktoren
multiplikativ (`(1 + kick*2.5) * (0.8+1.2*x) * glow*8` …). Regeln:

- **Plausibler Hot-Zustand als Designpunkt**: `kick≈1.8`, `level≈0.9`,
  `swell≈0.8`, `snare≈1.0`, `drop≈0.25` — und zwar GLEICHZEITIG. Wenn die
  Szene dann im Mittel unter ~0.8 Luminanz bleibt, überlebt die Palette.
  (Alle Extreme zugleich auf Maximum ist KEIN realer Zustand — der alte
  Scan-Hot-Vektor tat genau das und markierte den halben Katalog weiß.)
- **Soft-Knee statt Hard-Clip** am finalen Write, wo Audio die Helligkeit
  skaliert: `col *= gain; col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));`
  — unter ~0.5 praktisch neutral, oben komprimierend. In ~60 Szenen als
  `_catTone`-Block ausgerollt (Muster dort nachschlagen).
- **Audio gehört NICHT ungebremst in `gl_PointSize`**: `+ audioKick * 6.0`
  auf die Sprite-Größe verzwölffacht bei kick=2 die FLÄCHE — zusammen mit
  V8c der sichere Weg ins Weiß. Kick-Anteile klein halten (≤1.5) und die
  Caps niedrig (10-22 px bei 60k Punkten).
- Einzelne Weiß-BLITZE (Flash-Terme wie `* 8.0`) sind ok, wenn sie räumlich
  klein und zeitlich kurz sind — nie als Dauerfaktor auf der ganzen Fläche
  (SuperfluidHelium-Lektion: ×8-Flash × Kick-Faktor = weiße Liniensuppe).

### V9 — Audio-Kopplung nicht im GLSL festverdrahten

Welche Audio-Uniform ein Shader liest (`audioKick`, `audioSwell`, …) ist Teil
des Shaders — **wie** sie gespeist wird, nicht mehr zwingend. Ein Preset kann
jede skalare `audio*`-Uniform per Formel überschreiben:

```xml
<expr name="audioKick" formula="0.5*kick + 0.5*snare"/>
<expr name="audioSwell" formula="0.8"/>   <!-- auch Konstanten -->
```

Der Formel-Layer evaluiert das NACH dem Roh-Upload und überschreibt per
Namen — für die Render-Stufen **und** den Compute-Generator einer
Scene3D-Szene (beide sehen denselben Wert). Kein `<expr>` = Roh-Wert der
Engine, exakt das bisherige Verhalten.

Das gilt nicht nur für Audio-Uniforms: **jeder `<float>`-Parameter** kann per
`<expr>` mit einer Formel (inkl. Audio-Variablen) belegt werden — der Editor
bietet dafür pro Float-Param eine „Formel-Mapping"-Zeile an. Nur Floats:
der Formel-Layer lädt per `glUniform1f`, auf einer `int`-Uniform wäre das
ein GL-Fehler.

Konsequenzen fürs Autorieren:

- Im GLSL die **semantisch beste** Uniform wählen (Kick-Impuls → `audioKick`,
  langsames Atmen → `audioSwell`), nicht zwei Signale im Shader mischen —
  Mischungen sind jetzt Preset-Sache.
- Bewegung IMMER über die integrierten Phasen koppeln (`audioPhase` für
  Rotation, `audioAdvance` für Vorschub), **additiv** zur eigenen
  `time*speed`-Phase — so wurden die letzten sechs ungekoppelten
  Legacy-Szenen (Bubble, Rorschach, die vier Tunnel/Parallax-Varianten)
  nachgerüstet, ohne V7 zu verletzen.
- Der Editor zeigt pro Szene eine **Audio-Mapping-Sektion** (alle gelesenen
  `audio*`-Skalare; leer = Standard). Headless-A/B-Test:
  `--render … --expr audioKick=0.0` vs. `=6.0` (läuft im Gegensatz zu
  `--param` auch über den Scene3D-Pfad).
- V7 (Anti-Flimmer) gilt unverändert auch für Formeln: nie eine Formel auf
  eine Uniform legen, die im Shader mit `time` multipliziert wird.
- **2D-Kamera-Rig (alle 2D-Szenen):** Formeln `rig2Roll`/`rig2Zoom`/
  `rig2X`/`rig2Y` (+ integrierte `rig2…V`-Raten) — RenderPipeline schiebt das
  fertige Szenen-FBO durch `Engine/Rig2D.frag` (Spiegel-Faltung an den
  Rändern), bevor der Combine es liest. Nur aktiv, wenn eine Formel
  existiert; auf gepackten Stereo-Frames grundsätzlich aus.
- **Kamera-Rig (nur Scene3D, keine Shader-Änderung nötig):** Formeln namens
  `rigPitch`/`rigYaw`/`rigRoll` (Radiant) und `rigDolly` (Welt-Einheiten,
  >0 = näher) werden CPU-seitig ausgewertet und in `projM` komponiert;
  `rig…V`-Varianten sind RATEN, die der Host INTEGRIERT — audio-variable
  Raten sind dadurch konstruktionsbedingt flimmerfrei. Schatten bleiben
  weltverankert (Shadow-Pass rendert über `lightM`). Grenzen beachten:
  Yaw/Pitch schwenken die Szene um die KAMERA — große Winkel schieben sie
  aus dem Bild; Dauerrotation nur über `rigRollV` (Bildebene) oder mit
  gebundenen Oszillationen (`0.1*sin(…)` als Rate integriert beschränkt).

### V11 — Datei-Header: Doxygen-Format, keine freie Prosa mehr

Alle 689 Shader-Dateien (`.frag`/`.vert`/`.comp`/`.tesc`/`.tese`/`.geom`)
tragen inzwischen einen `/** @file @brief */`-Block statt der alten
`// Name.ext` / `// -----` / `// TITLE: …`-Prosa. Ein neuer Shader zieht
denselben Block:

```glsl
#version 330 core
out vec4 fragColor;
/**
 * @file MeineSzene.frag
 * @brief Ein Satz, was die Szene zeigt und wie Audio sie treibt
 * (welche audio*-Uniforms was tun).  Weitere Absätze für Kontext, den ein
 * Doxygen-Leser braucht (z.B. `Per-activation variety`-Parameter).
 */

uniform vec2 resolution;
...
```

**Platzierung:** nach `#version` (+ etwaigen `#extension`-Zeilen) und den
`in`/`out`-Varyings, vor der ersten `uniform`-Deklaration — bei `.comp`-
Dateien direkt nach `#version` (oder nach `layout(local_size…) in;`, wenn
die Datei bereits so eine Konvention von einer Nachbardatei geerbt hat).
Ein `.vert`/`.tesc`/`.tese`/`.geom`, das nur die Companion-Datei eines
bereits dokumentierten `.frag`/`.comp` ist, bekommt einen Ein-Zeiler-Stub
statt einer eigenen Beschreibung:

```glsl
/**
 * @file MeineSzene.vert
 * @brief Vertex stage companion to MeineSzene.frag -- see that file's
 * header for this scene's description.
 */
```

**Die eine echte Falle dabei:** `/* */`-Blöcke verschachteln in C/GLSL
NICHT — das ERSTE `*/`, das irgendwo in der Prosa auftaucht, schließt den
Kommentar vorzeitig. Ein Pfadbeispiel wie `"rec_*/frame.jpg"` oder
`"replay_*/replay.mp4"` in der Beschreibung reißt den Block an genau dieser
Stelle auf — alles danach wird echter (kaputter) Code. Immer mit einem
Platzhalter statt Sternchen schreiben (`rec_TIMESTAMP/frame_NNNNNN.jpg`)
oder den Pfad in Backticks setzen. Ein `#define`/`<Tag>`/`@irgendwas`/
`\irgendwas` in der Prosa löst KEINEN Compile-Fehler aus, aber eine
Doxygen-Warnung (Auto-Link- bzw. Befehls-Fehlinterpretation) — in Backticks
setzen oder mit `\@`/`\#` escapen, wenn es kein echter Verweis sein soll.

Vor dem Commit: `python Tools/find_comment_breaks.py <geänderte Dateien>`
(erkennt genau diese `*/`-Kollision, kein Teil von shadercheck.py) und,
wenn Zeit ist, `doxygen Doxyfile` im Repo-Root laufen lassen — die
Warnungsliste sollte nach einer Änderung nicht länger werden als vorher.

### V12 — Übergänge (`Transitions/`): Endpunkt-Identität ist Pflicht

Seit dem Transitions-Split gibt es zwei getrennte Shader-Sorten über der
Szene:

- **FX-Overlay** (`FX/`, `<CombineShader>`): läuft DAUERHAFT über der
  fertigen Szene, `interpolation` ist fest 1.0, tex0 und tex1 zeigen
  dasselbe Bild. Darf permanent färben/verzerren — das ist sein Zweck.
- **Übergang** (`Transitions/`, `<TransitionShader>`): läuft NUR während
  einer Szenen-Überblendung. `interpolation` läuft von 1 (alte Szene,
  tex0) nach 0 (neue Szene, tex1).

Der Vertrag für Übergänge: **bei `interpolation=1` exakt tex0 liefern, bei
`interpolation=0` exakt tex1** — der Pass wird an den Endpunkten hart zu-
bzw. abgeschaltet, jede Abweichung ist ein sichtbarer Bild-Sprung ("Pop").
`PresetEditor --transcheck` erzwingt das dateibasiert über alle
`Transitions/*.frag` (Endpunkt-Differenz ≤1.5/255 gegen Crossfade als
Referenz, kein Frame-Sprung >6× Median).

Die Falle, die beim Umzug der 55 Spektakel-Combines 55 von 83 Dateien
betraf: **jeder Term, der nicht selbst von `interpolation` abhängt, läuft
an den Endpunkten weiter.** Ein als Dauer-Combine harmloses finales
`hueRot(col.rgb, audioChromaHue)`, eine `time`-getriebene Rotation, ein
Glüh-Term — als Übergang ist jedes davon ein Pop. Deshalb: alle
Zusatz-Terme (Färbung, Glow, Warp, Zeit-Rotation) mit der Envelope
fenstern:

```glsl
float tProg = clamp(interpolation, 0.0, 1.0);
float midTransition = sin(tProg * 3.14159265);   // 0 an beiden Endpunkten
col.rgb += glow * midTransition;
col.rgb  = hueRot(col.rgb, audioChromaHue * midTransition);
```

Wipe-Fronten müssen den SICHTBAREN Wertebereich ihrer Sweep-Koordinate
vollständig überstreichen (GoldenNautilus: Spiral-Theta läuft über den
Frame ca. −15..+11 — ein 0..8-Sweep lässt an beiden Endpunkten Restzonen
der falschen Szene stehen). Im Zweifel Endpunkt-Frames rendern und
differenzieren; genau das tut `--transcheck`.

**Vorschau-Namensauflösung:** `PreviewWidget::compile()` sucht blanke
Dateinamen in der Reihenfolge `Scene2D/` → `FX/` → `Transitions/` →
`Engine/` → Root. Eine Transition, deren Name mit einer 2D-Szene
kollidiert (z.B. `VoronoiShatter.frag`), wird dann still als SZENE
kompiliert. Übergänge daher immer ordner-qualifiziert angeben:
`"Transitions/X.frag"`.

**Katalog-/Proberender eines Übergangs:** `--render <Szene>
"Transitions/X.frag" out.png 480 300 --images <ABSOLUTER Pfad zu
Tools/probe_images> --trans 0.5` — `--trans d` pinnt den Fortschritt
(0 = alte Szene, 1 = neue); ohne das Flag läuft der Combine bei
interpolation=1.0 und man sieht nur die nackte Referenzszene.
`--images` braucht hier einen ABSOLUTEN Pfad (die CWD ist
`PresetEditor/`, ein relativer Pfad läuft still ins Leere → Testkarte
statt Fotos). Zwei weitere Fallen aus dem ersten Katalog-Batch: bei
Tiefen-Sweeps (Portal) ist d=0.5 oft schon „durch" — früheren Moment
wählen (0.25–0.3); und ein Dim-Faktor gehört auf `fragColor.rgb`, NIE
auf das ganze vec4 (Alpha trägt bei 3D-Szenen die Tiefe, und ein
skaliertes Alpha macht das Katalog-PNG milchig statt dunkel).

---

## Probe-Renders: IMMER mit echten Bildern (`--images`)

`PresetEditor --render` bindet ohne Bildverzeichnis eine BUNTE prozedurale
Testkarte als tex0/tex1 — damit sieht JEDE imgPalette-Szene nach Regenbogen
aus, obwohl sie in der App korrekt die Fotofarben erbt (dieser Fehlschluss
hat ein komplettes Katalog-Review gekostet). Deshalb:

```
--images "Tools/probe_images"
```

an jeden Proberender hängen. `Tools/probe_images/` enthält zwei
deterministische Natur-Fotos (probe_a = warmer Sonnenuntergang, probe_b =
kühle Dämmerung) — eine korrekt umgestellte Szene zeigt damit kohärente
Warm-/Kalttöne, eine kaputte weiterhin das volle Farbrad. Sonnenuntergang
im A-Frame = imgPalette funktioniert; Regenbogen trotz `--images` = echter
Shader-Fehler.

## Den ganzen Katalog ansehen: `KALEIDO_SCENE_SWEEP`

Zuschauen reicht zum Pruefen nicht. Der Scheduler waehlt Szenen absichtlich
zufaellig -- richtig zum Ansehen, unbrauchbar zum Durchsehen: um N Szenen per
Zufall alle einmal zu erwischen, braucht man ein Vielfaches der Katalog-Laenge
und hat trotzdem Luecken (Sammelbilder-Problem, nicht Pech).

```
python Tools/make_sweep_config.py --match ShipFlyby --hold 8   # schreibt MeshSweep.xml
cd Release
set KALEIDO_SCENE_SWEEP=8
Kaleidoscope.exe -c MeshSweep -x <wav> -l -t 0
```

Die Config wird hier ERZEUGT und ist absichtlich nicht eingecheckt: sie ist ein
Wegwerf-Filter fuer genau eine Durchsicht. Wer den ganzen Katalog der Reihe nach
sehen will, nimmt stattdessen das eingecheckte `TestAlle` -- 2D-Block, dann
3D-Block, 8 s je Szene, ohne Overlay.

`KALEIDO_SCENE_SWEEP=<Sekunden>` schaltet per `forceScene()` der Reihe nach
durch JEDE Szene der geladenen Config und schreibt Index, Name und Zeitstempel
ins Log. Der Recorder nimmt an derselben Wanduhr auf, also liegt Szene n an
einer bekannten Stelle der Datei -- erst das macht einen Kontaktbogen
zuordenbar statt zu einem Haufen unbeschrifteter Bilder.

`Tools/make_sweep_config.py` baut die passende Config AUS dem echten Katalog
(kann also nicht davon abdriften) und pinnt zwei Dinge, die den Render sonst
unbrauchbar machen: die Solo-Zeit auf das Sweep-Intervall, damit eine auf
`sceneProgress` inszenierte Szene ihren ganzen Bogen im Fenster spielt, und
die Ueberblendung auf 1 s -- der Katalog-Standard von 15-50 s wuerde fast nur
Ueberblendungen zwischen Nachbarn zeigen.

Fürs Qualitäts-Sweeping nach einer Welle: `Tools/catalog_check.py <scandir>`
(flaggt WEISS >205 Luma, SCHWARZ-Triaden, REGENBOGEN ≥7 von 12 Hue-Bins)
und `Tools/contact_sheets.py <scandir>` (5×5-Kontaktbögen für die visuelle
Volldurchsicht — 13 Bögen statt 975 Einzelbilder).

## Batch-Rendern (und die CR-Falle)

```bash
while IFS='|' read -r name file type geom; do
  if [ -n "$geom" ]; then
    "$EXE" --render "$file" FxPlain.frag "$OUT/$name.png" 960 600 \
           --geom "$geom" > "$OUT/$name.log" 2>&1 </dev/null
  else
    "$EXE" --render "$file" FxPlain.frag "$OUT/$name.png" 960 600 \
           > "$OUT/$name.log" 2>&1 </dev/null
  fi
done < meta.txt
```

**Drei Fallen, die schon zu falschen Diagnosen geführt haben:**

1. **CR/LF.** Eine unter Windows von Python geschriebene Metadaten-Datei endet
   auf `\r\n`. Beim `IFS='|' read` landet das `\r` im **letzten** Feld. Steht
   dort `geom`, bekommen 2D-Shader ein `--geom $'\r'` (und laufen fälschlich
   über den Scene3D-Pfad), 3D-Shader ein ungültiges geom, das auf
   `GEOM_POINTS` zurückfällt. Ergebnis: „56 von 58 schwarz" — komplett falsch.
   → Metadaten immer mit `newline="\n"` schreiben oder `tr -d '\r'` vorschalten.

2. **Nicht parallel zu anderen GPU-Tests laufen lassen.** Ein Batch-Render
   gleichzeitig mit `--validate`/`--transcheck` kann in Timeouts laufen.

3. **Bei `--geom` (Scene3D) ist `$file` der BLOSSE Dateiname, kein Pfad.**
   `PreviewWidget::paintGL()` baut den echten Pfad selbst als
   `<root>/Scene3D/<file>` (und den `.comp`/`.vert`-Sibling-Pfad als
   `..\Scene3D\<file>`) — ein zusätzlich mitgegebenes `Scene3D/`- oder
   `..\Scene3D\`-Präfix verdoppelt das Segment, die Datei wird nie gefunden,
   und ohne `--geom` (2D-Pfad) sucht `compile()` ohnehin selbst in
   `Scene2D/`/`FX/`/`Transitions/`/`Engine/` — auch dort **kein** Präfix
   voranstellen (Ausnahme: Übergänge, siehe V12 — immer
   `Transitions/X.frag`, sonst gewinnt eine gleichnamige 2D-Szene). Bis
   Version 1.2.1 lief das komplett stumm auf ein schwarzes Bild hinaus (die
   Diagnose "missing X.vert" ging als Qt-Signal ins Leere, weil nur die
   Editor-GUI zuhörte); seitdem druckt `--render` sie auf stderr.

Schwarz-Erkennung: mittlere Luminanz eines heruntergerechneten Bildes; unter
~3.0 ist verdächtig. **Aber:** Ein dünner, spärlicher Effekt (z.B.
`DendriticSnowCrystal`) kann legitim darunter liegen — bei Treffern immer das
Bild ansehen, bevor man „kaputt" sagt.

---

## Bekannte Grenzen des Prüfwerkzeugs

- `PresetEditor --render` reicht `--param`-Overrides **nur an den 2D-Pfad**
  durch, nicht an Scene3D. Scene3D-Szenen rendern mit ihren zufälligen
  Per-Aktivierungs-Werten — für „schwarz oder nicht" reicht das, für
  Feinabstimmung eines bestimmten Parameterwerts nicht. **Aber:**
  `--expr name=formel` (Formel-Layer, auch `--expr camHP=3.0`) erreicht
  beide Pfade — für Scene3D ist das der Testhebel der Wahl.
- Compile-Fehler erscheinen wegen des `captureStderr`-Bugs oft **nicht** im
  Log. Ein leeres Log ist kein Beweis für einen fehlerfreien Shader.
- `KALEIDO_INDIRECT_LOG=1` schreibt die tatsächliche, von der GPU
  zurückgelesene Vertex-Anzahl nach `indirect_diag.log` — das beste Mittel,
  um „Generator kaputt" von „Generator ok, aber unsichtbar" zu trennen.

---

## Messbare Qualitätskriterien (Stand 2026-08-21)

Der ganze Katalog (528 Szenen) wird mit `Tools/scan_scenes.ps1` gerendert und
mit `Tools/scene_metrics.py` vermessen. Die Schwellen sind **an der eigenen
Verteilung des Katalogs kalibriert**, nicht an einem abstrakten Ideal — dieser
Katalog ist bewusst dunkel und filmisch (Median-Luma 0.189, Kontrast 0.158,
Bildfüllung 0.745). Ein absoluter Helligkeitsmaßstab würde ein Drittel
fälschlich anmahnen.

Zielwerte: `luma` 0.06–0.55 · `contrast` > 0.10 · `occ` > 0.55 ·
`clipHi` < 0.10 · `satHi` < 0.35 · `motion` > 0.01.

### Der mit Abstand häufigste Bildfehler

**Ein additiver Term, der über das Bild fast konstant ist.** Immer wieder in
verschiedenen Verkleidungen aufgetreten:

- ein Glühen aus dem Raymarch-`minD` — das ist per Konstruktion für *jedes*
  getroffene Pixel nahe null (es ist die Trefferschwelle, kein Abstandssignal),
  also flutet `exp(-minD*k)` die ganze Fläche mit demselben Wert;
- ein `min()`-Cap, das überall sättigt;
- `edgeGlow = smoothstep(...)` auf einer Würfel*fläche* — dort immer exakt 1.0;
- eine **Summe** vieler weicher Exponentialterme, die der zentrale Grenzwertsatz
  zu einer Konstanten glättet;
- ein Abfall-Koeffizient, der gegen die Verteilung bei *flachem* Zoom abgestimmt
  wurde und in der Tiefe fast konstant wird.

Vor dem Aufhellen prüfen, ob der Term, den man treibt, überhaupt **variiert** —
und zwar über den ganzen Animationszyklus, nicht an einem Einzelbild.

### Belichtung

- Farbige Tints wie `vec3(1.8,1.6,2.0)` überschreiten schon allein 1.0 pro
  Kanal. **Immer den fertig eingefärbten `vec3` cappen, nie nur den Skalar
  davor** — das war der häufigste Überbelichtungsfehler.
- `clamp(col,0,1)` vor dem Soft-Knee ist selbst ein sättigender Deckel. Sobald
  Pixel ihn erreichen, fügt mehr Helligkeit Luma hinzu und **entfernt Kontrast**.
  Helligkeit ist also kein Hebel für Kontrast (gemessen: contrast 0.098→0.087).
- Die Basisfarbe ist meist ein Foto-Sample, und die Bibliothek reicht von
  fast-schwarz bis fast-weiß. Wer davon abhängt, normalisiert gegen eine
  5-Punkt-Sonde, **durch `img()` gesampelt**, damit sie die tex0/tex1-Blende
  mitmacht und nicht springt:
  `col *= clamp(ziel / max(0.05, photoLevel()), lo, hi);`

### Bildfüllung (`occ`) — nicht „nicht-schwarz"

`occ` vergleicht gegen den **Modalwert des Bildes** (`q=round(luma*16)`,
interessant ab `|q-modal| > 1`, Kachel zählt ab 2 % ihrer Pixel). Folgen:

- Ein weicher Vollbild-Schleier bringt **null** — er wird selbst zum Modalwert
  und kann sogar schaden, weil echter Inhalt dann zwei Buckets überwinden muss.
  Füllmaterial braucht **Struktur** mit ≥0.10 Luma-Abstand auf Kachelgröße.
- Vor dem Messen wird ~6× herunterskaliert: Striche unter ~6 px (bei 1080p)
  verschwinden vollständig — meist ein echtes Sichtbarkeitsproblem, kein
  Messartefakt.
- Dünn-aber-überall ist *kein* Fehler: Schneefall/Glühwürmchen erreichen occ
  1.00 bei Luma 0.04. Der echte Mangel ist ein kleines Motiv auf toter Fläche.

### Geometrie-Fallen (Scene3D)

- `side = cross(dir, vec3(0,1,0))` hat immer `y == 0` — für jedes Filament in
  der Bildebene zeigt der Vektor **entlang der Blickachse** und das Quad wird
  zum nulldicken Splitter. „thickness erhöhen" hilft nie. Gegen die
  tatsächliche Blickachse billboarden.
- `vp.z += camDist` **gefolgt** von einem Tilt, der y und z mischt, dreht die
  Kameradistanz in einen Höhenversatz von `sin(tilt)·camDist` — das Motiv landet
  unter dem Bildrand. Erst tilten, dann verschieben.
- Projektion: `tan(halfFovY) = 0.5206`. Ein Motiv mit Radius R in Tiefe D deckt
  `R/(0.5206·D)` der Bildhöhe. Für gleichmäßige Verteilung in *Frustum*-Koordinaten
  platzieren (x,y mit der Tiefe skalieren) und Instanzgröße mit D mitskalieren.
- Bei `geom="grid"` Blöcke über den **Zellindex** (`attrA.w`) trennen, nie über
  `attrA.xy` — sonst spannt ein Dreieck quer durchs Bild.
- `indirect`/`grid`/`cubes`/`quads`/`patches`/`scatter`/`mesh` sind
  tiefengetestet und **opak**: ein blasses breites Quad stanzt ein dunkles
  Rechteck in alles dahinter. Nur `ribbon` und `points` sind additiv ohne
  Tiefentest.
- Die Vertex-Anzahl muss zur gelieferten passen: eine Szene deklarierte 256
  Cubes, die Engine liefert 4900 — jeder Index darüber trieb `acos()` über −1
  in NaN, 95 % des Gitters wurde nie gezeichnet.
- `pow(x,y)` mit möglicherweise negativer Basis ist in GLSL **undefiniert**
  (`exp2(y*log2(x))`) → NaN. Für Quadrate `x*x` schreiben.

### Farbe

Der Hausstil nimmt den Farbton aus dem Foto (`imgPalette`) oder aus der
Harmonie (`audioChromaHue`) — kein freier Regenbogen. Ein schmales Band um
einen festen szenen-eigenen Basiston ist die übliche Form, z.B.
`fract(0.58 + 0.22*hueP + 0.10*vTint + 0.05*sin(audioChromaHue))`.

**Achtung Gamut:** eine volle Farbkreis-Rotation (`hueRot(col, audioChromaHue)`)
treibt Kanäle **negativ**, und ein geclippter negativer Kanal *ist* ein voll
gesättigtes Pixel. Genau daher kamen die „kunterbunten" Bonbonfarben. Rotation
auf einen kleinen Anteil begrenzen (`0.20*sin(...)`).

### Zeitverhalten

Siehe „Temporal budget" in `docs/engine-internals.md` und die Tabelle je Shader
in `docs/temporal-budget.txt`; geprüft von `Tools/temporal_budget.py`.
Kurz: Vollbild-Helligkeit ≤3 Hz, Farbwechsel ≤2 Hz, Kamera/Geometrie ≤4 Hz,
feines Detail ≤8 Hz. Bei `sin(time*K)` ist die Frequenz `K/(2π)`, also
**K ≤ 25 für Globales, K ≤ 50 für feines Detail**.

- Musikalisch statt fest verdrahtet: `sin(audioBeatPhase * 6.2831853 * N)` gibt
  exakt N Zyklen pro Beat, folgt dem Tempo und ist bei ganzzahligem N über den
  0→1-Wrap **stetig**.
- `exp(mod(t, K))` als zyklischer Zoom ist ein Sägezahn — beim Wrap springt der
  Zoom um `e^K` (bis ×403). Stattdessen ein Raised-Cosine über dieselbe Periode:
  `zc = 0.5 - 0.5*cos(6.2831853 * fract(t*rate/K)); zoom = exp(zc*K);`
  stetig in Wert **und** Geschwindigkeit, kostet nichts.

### Messen: zwei Fallstricke

- Der Recorder schafft nur ~10–15 fps. Alles über ~5–7 Hz **aliast nach unten**
  und sieht dann ruhig aus — ein Render-Scan kann Flackern grundsätzlich nicht
  ausschließen. Frequenzen deshalb statisch aus dem GLSL lesen.
- `jump`/`hueJump` in `scene_metrics.py` werden **angezeigt, aber nie geflaggt**:
  dieselbe Szene zweimal gerendert ergibt völlig andere Werte, weil die App pro
  Lauf ein anderes Foto zieht und die Überblendung die Frame-Differenz
  dominiert. Auch `luma` schwankt dadurch um ±0.1 zwischen Läufen.
