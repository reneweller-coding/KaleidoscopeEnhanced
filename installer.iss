; installer.iss - Inno Setup script for the Kaleidoscope Enhanced visualizer.
; ---------------------------------------------------------------------------
; Builds a classic Windows setup.exe from the standalone package produced by
; deploy.ps1 (dist\KaleidoscopeVisualizer\).  The package is fully self-
; contained (Qt + MSVC runtime bundled), so the target PC needs neither Qt nor
; Visual Studio.
;
; Usage:
;   1. Run   powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -Build
;      to stage dist\KaleidoscopeVisualizer\ .
;   2. Install Inno Setup (https://jrsoftware.org/isdl.php), then run:
;        ISCC.exe installer.iss
;      (deploy.ps1 does step 2 automatically if ISCC.exe is on PATH).
;
; The app loads its shaders/configs from "..\" relative to the exe, so the
; exe lives in {app}\bin and the assets in {app}; the shortcut's working
; directory is therefore {app}\bin.
; ---------------------------------------------------------------------------

#define MyAppName "Kaleidoscope Enhanced"
#define MyAppExeName "Kaleidoscope.exe"
#define MyAppPublisher "Rene Weller"
#define MyAppVersion "1.0"
; Staged package produced by deploy.ps1:
#define SrcDir "dist\KaleidoscopeVisualizer"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\KaleidoscopeVisualizer
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=KaleidoscopeVisualizer-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\bin\{#MyAppExeName}
SetupIconFile=icon.ico
WizardStyle=modern

[Languages]
Name: "german";  MessagesFile: "compiler:Languages\German.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; The entire staged standalone package (exe + Qt/MSVC runtime + shaders + configs).
Source: "{#SrcDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; Working directory = {app}\bin so the app's "..\" asset paths resolve.
Name: "{group}\{#MyAppName}";            Filename: "{app}\bin\{#MyAppExeName}"; WorkingDir: "{app}\bin"
Name: "{group}\{#MyAppName} (Vollbild)"; Filename: "{app}\bin\{#MyAppExeName}"; WorkingDir: "{app}\bin"; Parameters: "-b"
Name: "{autodesktop}\{#MyAppName}";      Filename: "{app}\bin\{#MyAppExeName}"; WorkingDir: "{app}\bin"; Tasks: desktopicon

[Run]
Filename: "{app}\bin\{#MyAppExeName}"; WorkingDir: "{app}\bin"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
