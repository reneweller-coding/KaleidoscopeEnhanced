// Preset.h — the preset data model + XML load/save, shared by the editor GUI and
// the headless --roundtrip self-test.  Matches the schema read by the main app's
// Configuration.cpp exactly:
//
//   <configuration ImageDirectory=".." ConfigurationName=".."
//                  timeTextureSoloMin/Max timeTextureInterpolationMin/Max>
//     <TextureShader minTimeSolo maxTimeSolo minTimeInterpolation
//                    maxTimeInterpolation file type probability complexity>
//       <bool  name= probability=/>
//       <int   name= minValue= maxValue=/>
//       <float name= minValue= maxValue=/>
//       <interpolator name= minMin= maxMin= minMax= maxMax=/>
//     </TextureShader>
//     <CombineShader .../>  (type="normal" only)
//   </configuration>
#pragma once

#include <QtCore/QString>
#include <QtCore/QVector>

// One <bool>/<int>/<float>/<interpolator> child of a shader entry.  Stored as raw
// attribute strings so an existing preset round-trips losslessly.
struct ShaderParam
{
    QString kind;     // "bool" | "int" | "float" | "interpolator" | "expr"
    QString name;
    QString probability;                 // bool
    QString minValue, maxValue;          // int / float
    QString minMin, maxMin, minMax, maxMax;  // interpolator
    QString formula;                     // expr (formula layer)
};

struct PresetEntry
{
    bool     isCombine = false;
    QString  file;         // bare filename, e.g. "Kaleidoscope.frag"
    QString  type = "normal";   // "normal" | "KaleidoscopeBase" | "scene3d"
    QString  geom;         // scene3d only: "points" | "cubes" | "ribbon" | ...
    // scene3d only, both optional (0 = attribute omitted, matching Configuration.cpp):
    int      stateBytes   = 0;    // persistent generator state buffer size
    double   shadowExtent = 0.0;  // shadow-box half-width; 0 = engine default
    int      minTimeSolo = 20, maxTimeSolo = 80;
    int      minTimeInterpolation = 15, maxTimeInterpolation = 50;
    double   probability = 0.5;
    int      complexity = 1;
    QString  mood;         // optional mood tags ("dark,calm", ...) — passed through
    QVector<ShaderParam> params;
};

struct Preset
{
    QString name = "MyPreset";
    QString imageDirectory;
    int     timeTextureSoloMin = 10,  timeTextureSoloMax = 40;
    int     timeTextureInterpolationMin = 20, timeTextureInterpolationMax = 80;
    QVector<PresetEntry> entries;   // texture + combine, in insertion order

    // Load from an XML file; returns false + fills *err on failure.
    static bool load(const QString &path, Preset &out, QString *err = nullptr);
    // Save to an XML file; returns false + fills *err on failure.
    bool save(const QString &path, QString *err = nullptr) const;
};
