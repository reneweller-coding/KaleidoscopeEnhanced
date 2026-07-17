// EditorWindow.h — the standalone preset editor's main window.
#pragma once

#include <QtWidgets/QMainWindow>
#include "Preset.h"

class PreviewWidget;
class QComboBox;
class QSpinBox;
class QDoubleSpinBox;
class QLineEdit;
class QTableWidget;
class QLabel;

class EditorWindow : public QMainWindow
{
    Q_OBJECT
public:
    explicit EditorWindow(const QString &projectRoot, QWidget *parent = nullptr);

    // Default <bool>/<int>/<float> params for the known legacy shaders (empty for
    // the modern shaders, which read audio uniforms directly).  Shared with the
    // headless self-test.
    static QVector<ShaderParam> defaultParamsFor(const QString &fileName);

protected:
    void keyPressEvent(QKeyEvent *e) override;

private slots:
    void onTextureChanged();
    void onCombineChanged();
    void addTextureEntry();
    void addCombineEntry();
    void removeSelectedEntry();
    void onTableSelectionChanged();
    void newPreset();
    void openPreset();
    void savePreset();
    void browseImageDir();

private:
    void scanShaders();
    void refreshTable();
    void metaToUi();
    void uiToMeta();
    void stepCombo(QComboBox *c, int delta);

    QString m_root;
    Preset  m_preset;

    PreviewWidget *m_preview = nullptr;
    QComboBox *m_texCombo  = nullptr;
    QComboBox *m_combCombo = nullptr;
    QComboBox *m_musicCombo = nullptr;
    QComboBox *m_typeCombo = nullptr;
    QSpinBox  *m_minSolo = nullptr, *m_maxSolo = nullptr;
    QSpinBox  *m_minInterp = nullptr, *m_maxInterp = nullptr;
    QDoubleSpinBox *m_prob = nullptr;
    QSpinBox  *m_complex = nullptr;

    QTableWidget *m_table = nullptr;

    QLineEdit *m_nameEdit = nullptr;
    QLineEdit *m_imgDirEdit = nullptr;
    QSpinBox  *m_gSoloMin = nullptr, *m_gSoloMax = nullptr;
    QSpinBox  *m_gInterpMin = nullptr, *m_gInterpMax = nullptr;

    QLabel *m_status = nullptr;
};
