### P1 -- the photo choice by depth

The photo loader picks among five free candidates by mood: brightness and colourfulness against the music's valence
and arousal (`score = -( |brightness - tb| + 0.7 |colourfulness - ts| )`, Source/RenderPipeline.cpp). Whether a photo
has a depth map played no part. 707 of the 1,266 photos have relief; a scene that writes the photo's depth (`//
@depth`, `EffectShader::writesDepth()`) got a flat photo in roughly half of its time and then looked as before, while
the folding scenes -- whose best material are the flat textures -- got photos with relief.

Now the render thread tells the loader (an atomic, like the mood) what the scene that will show the next photo wants:
the active scene, or the incoming one while a fade runs -- 1 a photo with relief, 0 a flat one, -1 no wish (live
input, KALEIDO_PHOTO_BY_DEPTH=0). `PhotoDepth::hasRelief()` answers from the map's existence and the table's `flat`
column without reading an image (cached per path in the loader). A candidate that matches gets a bonus of 0.3 (the
mood terms span about 0..1.7, so a matching photo wins unless it fits the mood clearly worse), and with a wish the
loader looks at ten candidates instead of five. KALEIDO_PHOTO_STATS=1 counts, frame by frame, how often a depth scene
shows a photo with a map and another scene a flat photo.

Measured on 18 exports (three real tracks of the user's, 6-8 min each, three presets, 480x270 at 15 fps, the choice
off and on, same seed):

| | off | on (bonus 0.12, 8 candidates) | on (bonus 0.3, 10 candidates) |
|---|---|---|---|
| depth scenes showing a photo with a map | 61.9 % / 55.3 % | 72.9 % | 82.1 % |
| other scenes showing a flat photo | 35.3 % / 34.6 % | 52.8 % | 73.0 % |
| different photos over the nine exports | 19 / 21 | 28 | 27 |

(The two "off" values are the two runs' baselines: the first with Allround/Psychedelic/Club -- Allround and
Psychedelic started on the same lab and kept it, so their numbers are identical -- the second with
Allround/Ambient/Club.) The plan's target of 85 % is missed by three points: a photo is loaded ahead, before it is
certain which scene will show it (photos change on phrases and outlive scene changes). The variety did not suffer;
it rose. The first, weaker setting is documented in the code.

Not verified: the mood fit itself was not measured (how far the chosen photos' brightness/colourfulness lie from the
mood's target before and after); live input and a folder without maps behave as before by construction (no wish /
no relief), not by measurement.
