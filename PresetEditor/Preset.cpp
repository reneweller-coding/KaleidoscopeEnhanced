#include "Preset.h"

#include <QtCore/QFile>
#include <QtCore/QIODevice>
#include <QtCore/QXmlStreamWriter>
#include <QtXml/QDomDocument>
#include <QtXml/QDomElement>

// Strip a leading "..\" or "../" that the configs use in the file= attribute.
static QString bareFile(QString f)
{
    f.replace('\\', '/');
    int slash = f.lastIndexOf('/');
    return (slash >= 0) ? f.mid(slash + 1) : f;
}

static void readParams(const QDomElement &el, PresetEntry &e)
{
    for (QDomNode n = el.firstChild(); !n.isNull(); n = n.nextSibling())
    {
        QDomElement c = n.toElement();
        if (c.isNull()) continue;
        const QString tag = c.tagName();
        if (tag != "bool" && tag != "int" && tag != "float" && tag != "interpolator")
            continue;
        ShaderParam p;
        p.kind = tag;
        p.name = c.attribute("name");
        p.probability = c.attribute("probability");
        p.minValue = c.attribute("minValue");
        p.maxValue = c.attribute("maxValue");
        p.minMin = c.attribute("minMin");
        p.maxMin = c.attribute("maxMin");
        p.minMax = c.attribute("minMax");
        p.maxMax = c.attribute("maxMax");
        e.params.push_back(p);
    }
}

bool Preset::load(const QString &path, Preset &out, QString *err)
{
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
    {
        if (err) *err = QString("cannot open %1").arg(path);
        return false;
    }
    QDomDocument doc;
    QString msg; int line = 0, col = 0;
    if (!doc.setContent(&f, &msg, &line, &col))
    {
        if (err) *err = QString("XML parse error at %1:%2 — %3").arg(line).arg(col).arg(msg);
        return false;
    }
    QDomElement root = doc.documentElement();

    out = Preset();
    out.imageDirectory = root.attribute("ImageDirectory");
    out.name = root.attribute("ConfigurationName");
    out.timeTextureSoloMin = root.attribute("timeTextureSoloMin").toInt();
    out.timeTextureSoloMax = root.attribute("timeTextureSoloMax").toInt();
    out.timeTextureInterpolationMin = root.attribute("timeTextureInterpolationMin").toInt();
    out.timeTextureInterpolationMax = root.attribute("timeTextureInterpolationMax").toInt();

    auto readList = [&](const QString &tag, bool combine)
    {
        QDomNodeList list = root.elementsByTagName(tag);
        for (int i = 0; i < list.count(); ++i)
        {
            QDomElement el = list.at(i).toElement();
            PresetEntry e;
            e.isCombine = combine;
            e.file = bareFile(el.attribute("file"));
            e.type = el.attribute("type", "normal");
            e.minTimeSolo = el.attribute("minTimeSolo").toInt();
            e.maxTimeSolo = el.attribute("maxTimeSolo").toInt();
            e.minTimeInterpolation = el.attribute("minTimeInterpolation").toInt();
            e.maxTimeInterpolation = el.attribute("maxTimeInterpolation").toInt();
            e.probability = el.attribute("probability").toDouble();
            e.complexity = el.attribute("complexity").toInt();
            e.mood = el.attribute("mood");           // pass-through (may be empty)
            e.geom = el.attribute("geom");           // scene3d geometry kind
            readParams(el, e);
            out.entries.push_back(e);
        }
    };
    readList("TextureShader", false);
    readList("CombineShader", true);
    return true;
}

bool Preset::save(const QString &path, QString *err) const
{
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly | QIODevice::Text))
    {
        if (err) *err = QString("cannot write %1").arg(path);
        return false;
    }
    QXmlStreamWriter w(&f);
    w.setAutoFormatting(true);
    w.setAutoFormattingIndent(2);
    w.writeStartDocument();

    w.writeStartElement("configuration");
    w.writeAttribute("ImageDirectory", imageDirectory);
    w.writeAttribute("ConfigurationName", name);
    w.writeAttribute("timeTextureSoloMin", QString::number(timeTextureSoloMin));
    w.writeAttribute("timeTextureSoloMax", QString::number(timeTextureSoloMax));
    w.writeAttribute("timeTextureInterpolationMin", QString::number(timeTextureInterpolationMin));
    w.writeAttribute("timeTextureInterpolationMax", QString::number(timeTextureInterpolationMax));

    auto writeEntry = [&](const PresetEntry &e)
    {
        w.writeStartElement(e.isCombine ? "CombineShader" : "TextureShader");
        w.writeAttribute("minTimeSolo", QString::number(e.minTimeSolo));
        w.writeAttribute("maxTimeSolo", QString::number(e.maxTimeSolo));
        w.writeAttribute("minTimeInterpolation", QString::number(e.minTimeInterpolation));
        w.writeAttribute("maxTimeInterpolation", QString::number(e.maxTimeInterpolation));
        // Shaders live in Scene/, Scene3D/ and Combine/ since the 2026-07 reorg.
        w.writeAttribute("file", QString("..\\%1\\%2")
                                 .arg(e.isCombine ? "Combine"
                                     : (e.type == "scene3d" ? "Scene3D" : "Scene"))
                                 .arg(e.file));
        w.writeAttribute("type", e.type);
        if (!e.geom.isEmpty())
            w.writeAttribute("geom", e.geom);
        w.writeAttribute("probability", QString::number(e.probability));
        if (!e.mood.isEmpty())
            w.writeAttribute("mood", e.mood);
        w.writeAttribute("complexity", QString::number(e.complexity));
        for (const ShaderParam &p : e.params)
        {
            w.writeStartElement(p.kind);
            w.writeAttribute("name", p.name);
            if (p.kind == "bool")
                w.writeAttribute("probability", p.probability);
            else if (p.kind == "int" || p.kind == "float")
            {
                w.writeAttribute("minValue", p.minValue);
                w.writeAttribute("maxValue", p.maxValue);
            }
            else if (p.kind == "interpolator")
            {
                w.writeAttribute("minMin", p.minMin);
                w.writeAttribute("maxMin", p.maxMin);
                w.writeAttribute("minMax", p.minMax);
                w.writeAttribute("maxMax", p.maxMax);
            }
            w.writeEndElement();
        }
        w.writeEndElement();
    };

    // Texture entries first, then combine — matching the main app's grouping.
    for (const PresetEntry &e : entries) if (!e.isCombine) writeEntry(e);
    for (const PresetEntry &e : entries) if (e.isCombine)  writeEntry(e);

    w.writeEndElement();   // configuration
    w.writeEndDocument();
    return true;
}
