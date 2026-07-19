<#
.SYNOPSIS
    Builds KaleidoscopeRemote.apk WITHOUT Gradle / Android Studio.

.DESCRIPTION
    The app is plain framework Java (no androidx), so the whole build is just
    the SDK tools chained directly:

        aapt2 compile/link  ->  resources + R.java + base APK
        javac (JDK 17)      ->  .class files (--release 8, d8 desugars)
        d8                  ->  classes.dex
        jar --update        ->  dex into the APK
        zipalign            ->  4-byte alignment
        apksigner           ->  signed with a local debug key

    Toolchain (once): JDK 17 + Android cmdline-tools, then
        sdkmanager "platforms;android-34" "build-tools;34.0.0"

    Output:  AndroidRemote\build\KaleidoscopeRemote.apk
    Install: copy to the phone, tap it (allow "unknown sources" once).
#>
param(
    [string]$SdkRoot    = 'C:\Android-Buildtools\sdk',
    [string]$JavaHome   = 'C:\Android-Buildtools\jdk17',
    [string]$BuildTools = '34.0.0',
    [string]$Platform   = 'android-34'
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bt   = Join-Path $SdkRoot "build-tools\$BuildTools"
$aj   = Join-Path $SdkRoot "platforms\$Platform\android.jar"
$out  = Join-Path $root 'build'

if (-not (Test-Path $aj))               { throw "android.jar not found: $aj" }
if (-not (Test-Path "$bt\aapt2.exe"))   { throw "build-tools not found: $bt" }
if (-not (Test-Path "$JavaHome\bin\javac.exe")) { throw "JDK not found: $JavaHome" }

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\gen","$out\classes","$out\dex" | Out-Null
$env:JAVA_HOME = $JavaHome

Write-Host '[1/6] aapt2: resources'
& "$bt\aapt2.exe" compile --dir "$root\res" -o "$out\res.zip"
if ($LASTEXITCODE) { throw 'aapt2 compile failed' }
& "$bt\aapt2.exe" link -o "$out\base.apk" -I $aj `
    --manifest "$root\AndroidManifest.xml" --java "$out\gen" `
    --min-sdk-version 26 --target-sdk-version 34 "$out\res.zip"
if ($LASTEXITCODE) { throw 'aapt2 link failed' }

Write-Host '[2/6] javac'
# stderr redirected at CMD level: PowerShell 5.1 would otherwise turn javac's
# harmless deprecation NOTE into a terminating NativeCommandError.
& cmd /c "`"$JavaHome\bin\javac.exe`" --release 8 -encoding UTF-8 -nowarn -classpath `"$aj`" -d `"$out\classes`" `"$out\gen\de\kaleidoscope\remote\R.java`" `"$root\src\de\kaleidoscope\remote\MainActivity.java`" 2>`"$out\javac.log`""
if ($LASTEXITCODE) { Get-Content "$out\javac.log"; throw 'javac failed' }

Write-Host '[3/6] d8: dex'
$classes = Get-ChildItem "$out\classes" -Recurse -Filter *.class |
           ForEach-Object { '"' + $_.FullName + '"' }
$d8args = "--release --min-api 26 --lib `"$aj`" --output `"$out\dex`" " + ($classes -join ' ')
& cmd /c "`"$bt\d8.bat`" $d8args"
if ($LASTEXITCODE) { throw 'd8 failed' }

Write-Host '[4/6] pack dex into APK'
Copy-Item "$out\base.apk" "$out\unsigned.apk" -Force
Push-Location "$out\dex"
& "$JavaHome\bin\jar.exe" --update --file "$out\unsigned.apk" classes.dex
Pop-Location
if ($LASTEXITCODE) { throw 'jar update failed' }

Write-Host '[5/6] zipalign'
& "$bt\zipalign.exe" -f 4 "$out\unsigned.apk" "$out\aligned.apk"
if ($LASTEXITCODE) { throw 'zipalign failed' }

Write-Host '[6/6] sign'
$ks = Join-Path $root 'debug.keystore'
if (-not (Test-Path $ks)) {
    & "$JavaHome\bin\keytool.exe" -genkeypair -keystore $ks `
        -storepass android -keypass android -alias androiddebugkey `
        -dname "CN=Kaleidoscope Debug" -keyalg RSA -keysize 2048 -validity 10000
    if ($LASTEXITCODE) { throw 'keytool failed' }
}
& cmd /c "`"$bt\apksigner.bat`" sign --ks `"$ks`" --ks-pass pass:android --key-pass pass:android --out `"$out\KaleidoscopeRemote.apk`" `"$out\aligned.apk`""
if ($LASTEXITCODE) { throw 'apksigner sign failed' }
& cmd /c "`"$bt\apksigner.bat`" verify `"$out\KaleidoscopeRemote.apk`""
if ($LASTEXITCODE) { throw 'apksigner verify failed' }

$apk = Get-Item "$out\KaleidoscopeRemote.apk"
Write-Host ("OK: {0}  ({1:N0} Bytes)" -f $apk.FullName, $apk.Length)
