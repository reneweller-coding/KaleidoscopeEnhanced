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

# 2. Preset-Selbsttests (Registrierung + Parameter-Vollständigkeit)
PresetEditor\build\Release\PresetEditor.exe --validate

# 3. Optische Prüfung: jeden neuen Shader rendern und auf Schwarz prüfen
#    (siehe "Batch-Rendern" unten -- Achtung: CR-Falle!)

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

`Blend/IndirectClamp.comp` läuft **nach jedem** Generator und macht:

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

### V7 — Anti-Flimmer: `time` nie mit einem Audiowert multiplizieren

```glsl
float t = time * audioLevel;               // FALSCH - springt bei jeder Änderung
float t = time * 0.4 + audioAdvance * 0.2; // richtig - Rate ist einintegriert
```

`audioAdvance` ist eine bereits integrierte Phase. Absolute Zeit mit einem
schwankenden Faktor zu skalieren lässt die Phase bei jeder Pegeländerung
springen.

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
Szenen, z. B. `Scene/FerrofluidSpikeForest.frag`): Farben kommen von einem
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
  TOENUNG-Szenen (z. B. `Scene/Aurora.frag`).
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
  `rig2X`/`rig2Y` (+ integrierte `rig2…V`-Raten) — FilterShader schiebt das
  fertige Szenen-FBO durch `Blend/Rig2D.frag` (Spiegel-Faltung an den
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

---

## Batch-Rendern (und die CR-Falle)

```bash
while IFS='|' read -r name file type geom; do
  if [ -n "$geom" ]; then
    "$EXE" --render "$file" CombinePlain.frag "$OUT/$name.png" 960 600 \
           --geom "$geom" > "$OUT/$name.log" 2>&1 </dev/null
  else
    "$EXE" --render "$file" CombinePlain.frag "$OUT/$name.png" 960 600 \
           > "$OUT/$name.log" 2>&1 </dev/null
  fi
done < meta.txt
```

**Zwei Fallen, die schon zu falschen Diagnosen geführt haben:**

1. **CR/LF.** Eine unter Windows von Python geschriebene Metadaten-Datei endet
   auf `\r\n`. Beim `IFS='|' read` landet das `\r` im **letzten** Feld. Steht
   dort `geom`, bekommen 2D-Shader ein `--geom $'\r'` (und laufen fälschlich
   über den Scene3D-Pfad), 3D-Shader ein ungültiges geom, das auf
   `GEOM_POINTS` zurückfällt. Ergebnis: „56 von 58 schwarz" — komplett falsch.
   → Metadaten immer mit `newline="\n"` schreiben oder `tr -d '\r'` vorschalten.

2. **Nicht parallel zu anderen GPU-Tests laufen lassen.** Ein Batch-Render
   gleichzeitig mit `--validate`/`--transcheck` kann in Timeouts laufen.

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
