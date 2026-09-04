# Musik-Stimmung: Modell, Extraktion, Mapping und OSC-Ausgabe

Dieses Dokument beschreibt das komplette Stimmungs-System des Visualizers —
was die Literatur sagt, was davon hier umgesetzt ist, wie es gemessen wurde
und wie externe Software die Analyse mitbenutzen kann. Das Messprotokoll mit
allen Rohtabellen steht in [`Tools/mood_axes.md`](../Tools/mood_axes.md); der
Sprach-/Musik-Gate davor in
[`Tools/speech_gate_corpus.md`](../Tools/speech_gate_corpus.md).

---

## 1. Das Emotionsmodell

Die Musikpsychologie kennt drei Modellfamilien [Hevner 1936; Russell 1980;
Zentner et al. 2008]:

| Familie | Beispiele | Eigenschaft |
|---|---|---|
| kategorial | Hevners Adjektivkreis, fünf MIREX-Cluster | intuitiv, aber grob und semantisch überlappend |
| dimensional | **Russells Circumplex**: Valenz × Arousal | kontinuierlich, direkt auf visuelle Parameter mappbar |
| musikspezifisch | GEMS (9 Faktoren) | theoretisch fundiertest, kaum Datensätze |

Der Konsens der Praxis ist ein **Hybrid**: kontinuierliche Valenz/Arousal-Werte
als steuerndes Rückgrat plus kategoriale Tags als semantische Anker [Kang &
Herremans 2024]. Genau so arbeitet dieser Visualizer:

* **kontinuierlich:** `AudioFeatures::valence` und `::arousal` (0..1, 0.5 = neutral)
* **kategorial:** die vier Szenen-Tags, die exakt den Russell-Quadranten entsprechen:

| Quadrant | Valenz | Arousal | akustische Korrelate (Literatur) | Szenen-Tag |
|---|---|---|---|---|
| Q1 Euphorie | hoch | hoch | schnell, Dur, konsonant, hell | `bright` |
| Q2 Aggression | tief | hoch | laut, dissonant, verzerrt, perkussiv | `aggressive` |
| Q3 Melancholie | tief | tief | langsam, Moll, wenig Flux, matt | `dark` |
| Q4 Ruhe | hoch | tief | ruhig, konsonant, legato | `calm` |

Alle 866 Szenen, 29 FX und 109 von 110 Transitions sind getaggt (ungetaggt ist
nur Crossfade, die neutrale Blende). Die Tags stehen **pro Preset-Eintrag**,
gelesen wird aus dem aktiven Preset — deshalb prüft
`Tools/check_mood_tags.py` Abdeckung und Konsistenz gegen den Referenzkatalog
`Komplett.xml` und kann Drift mit `--sync` reparieren. Der Fall ist real:
`Neu.xml` trug 86 veraltete Tags aus der Zeit vor der Mess-Kampagne, der
Mood-Bias lief dort mit den bekannt falschen Werten. Zwei Shader-Paare teilen
sich einen Dateinamen über Verzeichnisse hinweg (`CrystalGrowth`,
`VoronoiShatter`) — der Abgleich schlüsselt darum über den Pfad, nicht den
Namen.

Wichtig ist die Zielgröße: visualisiert
wird die **wahrgenommene** Emotion (was die Musik ausdrückt), nicht die beim
Hörer induzierte [Gabrielsson 2002] — das ist die richtige Größe für
Visualisierung und zugleich die, die sich aus Audio allein schätzen lässt.

## 2. Die musikalischen Korrelate — und was davon hier messbar ist

Die stabilsten Struktur-Emotions-Zusammenhänge [Gabrielsson & Lindström 2010]
und ihre Entsprechung in unserer Merkmalskette:

| Parameter (Literatur) | Emotionsbezug | unser Merkmal | Zustand |
|---|---|---|---|
| Tempo | Arousal | `estimatedBPM` (Kick-Tracking) | trennt, AUC 0.849 |
| Rhythmus-Regelmäßigkeit | Arousal | `m_sRhythm` | trennt, AUC 0.885 |
| Spektralfluss | Arousal | `spectralFlux` | trennt, AUC 0.911 |
| Timbre-Schärfe | Arousal | `m_sSharpness` | trennt, AUC 0.802 |
| Harmonik konsonant/dissonant | Valenz | Roughness (Plomp-Levelt/Sethares) | trennt (invers), AUC 0.75 |
| klare Tonalität | Valenz | Key-Clarity (Krumhansl-Pearson) | trennt, AUC 0.753 |
| Modus Dur/Moll | Valenz | Terzvergleich am Grundton | **schwach**, AUC 0.458 (s.u.) |
| Lautheit | Arousal | bewusst NICHT verwendet | AGC entfernt Pegelunterschiede |

Die Werte stammen aus der Messung über 80 reale Titel mit Genre-Prioren als
Ground Truth (Death Metal IST high-arousal, eine Satie-Gymnopédie nicht) —
Methode und Tabellen in `Tools/mood_axes.md`.

**Der Dur/Moll-Sonderfall.** Modus ist der meistzitierte Valenz-Hinweis und
zugleich der widerspenstigste: drei Implementierungen (Skalarprodukt gegen
Krumhansl-Profile, echte Pearson-Korrelation nach Krumhansl-Schmuckler,
Terzvergleich am erkannten Grundton) blieben auf produziertem Pop/Rock/Metal
nahe Zufall. Der Kern ist musiktheoretisch: **C-Dur und a-Moll teilen den
Tonvorrat**, das beste Profil über alle Transpositionen ist fast immer ein
relatives Paar. Der Term bleibt mit Gewicht 0.24 drin, weil die kombinierte
Valenz damit besser misst (0.821 vs. 0.808) und nur er auf sauber tonales
Material (Klavier, Klassik) reagieren kann.

Das deckt sich mit dem zentralen Befund des Felds, der **Valenz-Lücke**: die
Meta-Analyse über 290 Modelle beziffert r ≈ 0.81 für Arousal gegen r ≈ 0.67
für Valenz [Eerola & Anderson 2026], die Valenz-Regression auf EmoMusic
stagniert seit 2021 bei R² ≈ 0.61–0.63 — trotz Foundation-Models mit
160 000 Stunden Trainingsaudio. Valenz braucht zeitlich weiträumige Strukturen
(Akkordfolgen, Auflösungen, Sprachsemantik), die ein kausales Echtzeitfenster
prinzipiell schlecht sieht [Panda et al. 2023].

## 3. Die Achsen-Formeln (gemessen, nicht geraten)

Jede Zutat musste einzeln einen AUC-Test bestehen; die Normierungsanker sind
p10/p90 der Titel-Mediane über den Korpus (`nrm(x, p10, p90)`):

    arousal = 0.30·nrm(flux, .019, .086) + 0.30·rhythm
            + 0.22·nrm(bpm, .313, .578)  + 0.18·nrm(sharpness, .279, .326)

    valence = 0.38·nrm(keyClarity, .652, .805) + 0.38·(1 − roughness)
            + 0.24·mode

Ergebnis: Arousal AUC 0.906 (Spannweite 0.08–0.90), Valenz AUC 0.821
(0.19–0.89). Die Extreme liegen richtig, ohne dass ein Titel angefasst wurde:
Sigur Rós/Eluvium/Satie am Arousal-Boden, Die Ärzte live oben; The Prodigy bei
hohem Arousal + tiefer Valenz — Q2 „Aggression", wo die Literatur ihn hinsetzt.

Drei Zutaten flogen raus, weil sie auf Zufallsniveau maßen: der AGC-normierte
Pegel für Arousal (die AGC existiert, um genau diese Unterschiede zu
entfernen), Spektral-Zentroid und 6-Band-SFM für Valenz. Die Lehre dahinter
steht dreifach im Code: **Verhältnisse nach dB-Kompression sind bedeutungslos**
— alle Spektral-Ratios kommen aus den linearen Band-RMS.

## 4. Die Zwei-Schichten-Architektur

Die Echtzeit-Literatur empfiehlt zwei Zeitskalen [alle drei STARs]: eine
schnelle Signal-Schicht (10–50 ms) für unmittelbare Reaktivität und eine
langsame semantische Schicht (1–3-s-Fenster, 1–4 Hz) für Stimmung. Genau so
ist es hier gebaut:

| Schicht | Signale | Zeitskala | Verbraucher |
|---|---|---|---|
| schnell | Beat, Onset, Bänder, Flux | 10 ms Blöcke | Shader-Uniforms, Puls-Effekte, Lightshow |
| semantisch | Valenz, Arousal, BPM, ambient | ~2.5–5 s EMA | Farbgrade, Szenenwahl, timingScale, Auto-Preset |
| Ereignis | Beat/Downbeat | sofort | Blitze, Kamera-Akzente, OSC-Events |

Zur Stabilität der diskreten Umschaltungen (Hysterese-Empfehlung der
Literatur): der Auto-Preset-Wechsel verlangt 8 s gehaltene Stimmung plus 30 s
Mindestabstand; der Sprach-/Musik-Gate hat asymmetrische Zeitkonstanten
(~2.5 s Richtung Musik, ~5 s Richtung Sprache).

## 5. Mapping auf visuelle Parameter: der empirische Kanon

Die stärkste Einzelbefundlage der gesamten Kette: Musik-Farb-Assoziationen
sind fast vollständig **emotionsvermittelt** (Korrelationen bis r ≈ 0.99,
kulturübergreifend repliziert) [Palmer et al. 2013; Whiteford et al. 2018].
Helligkeit und Sättigung tragen dabei mehr affektive Information als der
Farbton [Valdez & Mehrabian 1994]; Emotionsausdruck in Musik und Bewegung
teilt eine gemeinsame, kulturübergreifende Dynamikstruktur [Sievers et al.
2013]; scharfe Klänge ↔ spitze Formen ist über 25 Sprachen robust
[Ćwiek et al. 2022]. Daraus der Kanon — und seine Umsetzung hier:

| Kanon | Umsetzung | Ort |
|---|---|---|
| Valenz ↑ → wärmer, heller | Farbtemperatur des globalen Grades (Timbre 35 % Mitsprache), ±8 % Helligkeit | `Engine/Present.frag` |
| Valenz ↓ → bläulich, entsättigt | Kaltseite derselben Rampe | `Engine/Present.frag` |
| Arousal ↑ → Sättigung | Sättigungsterm des Grades | `Engine/Present.frag` |
| Arousal ↑ → Bewegungstempo, Ereignisrate | `timingScale`, Busyness-Ziel 1–10 der Szenenwahl | `AudioAnalyzer`, `SceneScheduler` |
| Dissonanz → Kantenschärfe | Roughness-Zuschlag auf den CAS-Sharpen (nur additiv) | `PresentPass` |
| Beats/Onsets → diskrete Ereignisse | Bloom-Akzente, Puls-Uniforms, Lightshow | `Present.frag`, Shader |
| Mood-Kategorie → Szenenwahl | Tag-Bonus/Malus in `moodAccept` (probabilistisch, nie hart) | `SceneScheduler` |

Zwei bewusste Abweichungen, beide dokumentiert: der Helligkeitsterm wird von
der Auto-Belichtung weitgehend absorbiert (Helligkeit gehört der
Photosensitivitäts-Kette, der Grade darf nicht dagegen arbeiten), und
Dissonanz macht nur schärfer, nie weicher (Weichzeichnung läse sich als
Defekt). Alles skaliert am Mood-Regler (Taste, Setup, Remote) und ist bei 0
sowie im Nicht-Musik-Modus ein No-Op — die Uniforms stehen dann auf neutral.

Verifiziert per `KALEIDO_FORCE_MOOD` (s. Abschnitt 7): Valenz-Extreme
verschieben die Bildwärme (mittleres R−B) von +8.8 auf −16.1; Arousal-Extreme
bei Regler 2.5 die mittlere Sättigung von 0.443 auf 0.060.

## 6. OSC-Ausgabe: die Analyse für andere Software

OSC über UDP ist der De-facto-Transport zwischen Analyse und Visual-Engines
(TouchDesigner, Resolume, Max/MSP, Unity, Browser). Der Visualizer sendet
seine Analyse, wenn in `kaleidoscope_settings.ini` (oder im Setup-Programm)
ein Port gesetzt ist:

```ini
oscPort=9000          ; 0 = aus (Standard)
oscHost=127.0.0.1     ; Ziel-IP
```

Adressen, Typen und Raten (implementiert in `Source/OscSender.cpp`, OSC 1.0,
Bundles mit Immediate-Timetag; verifiziert gegen einen spezifikationsstrengen
Parser):

| Adresse | Typ | Rate | Bedeutung |
|---|---|---|---|
| `/beat` | f | Ereignis | Kick erkannt; Wert = Stärke 0..1 |
| `/beat/downbeat` | f | Ereignis | die „1" des 4/4-Taktes |
| `/audio/level` | f | ~30 Hz | Gesamtpegel 0..1 |
| `/audio/onset` | f | ~30 Hz | breitbandige Onset-Stärke |
| `/audio/flux` | f | ~30 Hz | Spektralfluss |
| `/audio/bands` | ffffff | ~30 Hz | 6 Bänder: sub, bass, lowMid, mid, upperMid, high |
| `/mood/valence` | f | ~5 Hz | Valenz 0..1 (0.5 neutral) |
| `/mood/arousal` | f | ~5 Hz | Arousal 0..1 |
| `/mood/quadrant` | s | ~5 Hz | `bright` / `aggressive` / `dark` / `calm` |
| `/tempo/bpm` | f | ~5 Hz | echte BPM (0 = kein Beat erkannt) |
| `/music/presence` | f | ~5 Hz | Musik-vs-Sprache-Gate 0..1 |
| `/music/ambient` | f | ~5 Hz | Ambient-Faktor 0..1 |

Beat-Ereignisse verlassen das Programm außerhalb der Bundles, sofort bei
Erkennung — die zusätzliche Latenz ist ein Render-Frame (~7–16 ms), deutlich
unter den ~100 ms, ab denen Beat-Synchronität als „lose" wahrgenommen wird
[Lipscomb-Linie, s. STAR-Report].

Empfang in TouchDesigner: *OSC In DAT/CHOP* auf den Port richten; in Resolume:
OSC-Input aktivieren und die Adressen auf Parameter mappen; in Python reicht
`python-osc` oder ein 30-Zeilen-Parser (ein spezifikationsstrenges Beispiel
liegt der Testinfrastruktur bei).

## 7. Diagnose- und Test-Haken

| Haken | Wirkung |
|---|---|
| `KALEIDO_MOOD_DEBUG=1` | druckt 1×/s beide Achsen samt aller Zutaten auf stderr |
| `KALEIDO_FORCE_MOOD="v,a"` | pinnt beide Achsen — für A/B-Aufnahmen des Farbgrades |
| `KALEIDO_SPEECH_DEBUG=1` | dasselbe für den Sprach-/Musik-Gate |
| `KALEIDO_OFFLINE_FAST=1` | Offline-Analyse (-w) ohne Echtzeit-Taktung, Ende = Programmende |

Regel aus drei Reparaturen dieser Kette: **Zutaten loggen, nicht Urteile.**
Ein zusammengesetzter Score kann plausibel aussehen, während die Hälfte seiner
Eingänge gesättigte Konstanten sind — `musicPresence` stand konstant auf
1.000, `acConf` auf 0.000, Valenz auf ~0.28, und keiner der drei Fälle war am
Endwert erkennbar.

## 8. Einordnung und Grenzen

* Der akademische SOTA (MERT-Klasse, Transformer auf Foundation-Embeddings)
  ist nicht echtzeitfähig; der echtzeitfähige Praxis-Stack (Essentia,
  MusiCNN-Backbones) liegt unter dem akademischen SOTA. Diese Schere ist
  Stand 2026 offen [alle drei STARs]. Der handgefertigte Deskriptor-Pfad hier
  ist die „erklärbare, ressourcenschonende" Familie der Surveys — mit dem
  Bonus, dass jede Zutat gegen einen realen Korpus gemessen und die Messung
  reproduzierbar ist.
* Auf kleinen Datensätzen schlagen schlanke Modelle mit guten Features im
  Mittel neuronale Netze [Eerola & Anderson 2026] — für dieses Projekt
  (kein GPU-Budget für Inferenz neben dem Renderer, keine externen
  Abhängigkeiten) ist das der richtige Betriebspunkt.
* Wollte man die Valenz-Lücke ernsthaft angehen, wäre der nächste Schritt ein
  kausal destilliertes Foundation-Model über ONNX — ein eigenes Projekt, kein
  Patch.

## Referenzen

Primärliteratur (über die drei STAR-Reports hinaus zitierfähig):

* Russell, J. A. (1980): *A circumplex model of affect.* J. Personality and Social Psychology 39(6).
* Thayer, R. E. (1989): *The Biopsychology of Mood and Arousal.* Oxford Univ. Press.
* Hevner, K. (1936): *Experimental studies of the elements of expression in music.* Am. J. Psychology 48(2).
* Zentner, M., Grandjean, D. & Scherer, K. R. (2008): *Emotions evoked by the sound of music* (GEMS). Emotion 8(4).
* Gabrielsson, A. (2002): *Emotion perceived and emotion felt: Same or different?* Musicae Scientiae 5(1 suppl).
* Gabrielsson, A. & Lindström, E. (2010): *The Role of Structure in the Musical Expression of Emotions.* In: Handbook of Music and Emotion, OUP.
* Krumhansl, C. L. & Kessler, E. J. (1982): *Tracing the dynamic changes in perceived tonal organization.* Psychological Review 89(4). — Tonalitätsprofile; der Algorithmus verlangt Pearson-Korrelation, nicht Skalarprodukt.
* Plomp, R. & Levelt, W. J. M. (1965): *Tonal consonance and critical bandwidth.* JASA 38; Sethares, W. A. (1993): *Local consonance and the relationship between timbre and scale.* JASA 94. — Grundlage des Roughness-Merkmals.
* Palmer, S. E., Schloss, K. B., Xu, Z. & Prado-León, L. R. (2013): *Music–color associations are mediated by emotion.* PNAS 110(22).
* Whiteford, K. L. et al. (2018): *Color, music, and emotion: Bach to the blues.* i-Perception 9(6).
* Valdez, P. & Mehrabian, A. (1994): *Effects of color on emotions.* J. Experimental Psychology: General 123(4).
* Sievers, B., Polansky, L., Casey, M. & Wheatley, T. (2013): *Music and movement share a dynamic structure that supports universal expressions of emotion.* PNAS 110(1).
* Ćwiek, A. et al. (2022): *The bouba/kiki effect is robust across cultures and writing systems.* Phil. Trans. R. Soc. B 377.
* Spence, C. (2011): *Crossmodal correspondences: A tutorial review.* Attention, Perception, & Psychophysics 73.
* Panda, R., Malheiro, R. & Paiva, R. P. (2020/23): *Audio Features for Music Emotion Recognition: A Survey.* IEEE TAFFC 14(1).
* Kang, J. & Herremans, D. (2024/25): *Are We There Yet? A Brief Survey of Music Emotion Prediction Datasets, Models and Outstanding Challenges.* arXiv:2406.08809.
* Eerola, T. & Anderson, C. (2026): *A Meta-Analysis of Music Emotion Recognition Studies.* ACM Computing Surveys.

Die drei projektbegleitenden STAR-Reports (August 2026), aus denen die
Praxis-Zusammenfassungen stammen, liegen beim Projektinhaber; ihre
Kernaussagen sind oben jeweils mit den Primärquellen belegt.
