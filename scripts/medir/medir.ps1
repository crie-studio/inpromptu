param(
  [Parameter(Mandatory = $true)] [string]$Amostra,  # .wav do "Gravar amostra" (o .txt com o mesmo nome é o roteiro lido)
  [string]$Overlay = "notch",                         # notch | floating | fullscreen
  [string]$Mode = "tracking",                         # tracking | voice | classic
  [int]$Seconds = 0,                                  # 0 = duração da amostra menos 6 s
  [string]$Ajustes = ""                               # outras configurações, ex.: "readingRate=3.3;speed=3.5"
)
# Mede a rolagem com uma amostra de voz: toca a gravação no microfone simulado, inicia a leitura e
# compara, quadro a quadro, onde o app acha que você está com o gabarito (quando cada palavra foi dita).
# Roda com dados próprios (não mexe nas suas configurações) e pode rodar com o InPromptu aberto.
# Uso: pwsh -File scripts\medir\medir.ps1 -Amostra "$env:APPDATA\InPromptu\amostras\amostra-....wav" [-Overlay fullscreen] [-Ajustes "readingRate=3.3"]
$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$electron = "$root\node_modules\electron\dist\electron.exe"
$texto = [IO.Path]::ChangeExtension($Amostra, ".txt")
$gabarito = [IO.Path]::ChangeExtension($Amostra, ".gabarito.json")
$work = "$env:TEMP\inpromptu-medir"; $data = "$work\dados"
New-Item -ItemType Directory -Force "$data\modelos" | Out-Null

# 1. Gabarito: o reconhecimento guiado, sem pressa, marca quando cada palavra foi dita.
if (-not (Test-Path $gabarito)) {
  Write-Host "Gerando o gabarito (leva o tempo da gravação)…"
  & $electron "$root\scripts\asr-test.js" $Amostra $texto pt --guiado 2>&1 | Out-Null
}

# 2. Dados de teste: suas configurações + o roteiro da amostra + o modelo de voz já baixado.
if (-not (Test-Path "$data\modelos\vosk-model-small-pt-0.3.tar.gz")) {
  Copy-Item "$env:APPDATA\InPromptu\modelos\vosk-model-small-pt-0.3.tar.gz" "$data\modelos\"
}
$cfg = Get-Content "$env:APPDATA\InPromptu\settings.json" -Raw | ConvertFrom-Json -AsHashtable
$cfg.mode = $Mode; $cfg.overlay = $Overlay; $cfg.hideFromCapture = $true; $cfg.remoteEnabled = $false; $cfg.micDeviceId = ""
foreach ($pair in ($Ajustes -split ";" | Where-Object { $_ -match "=" })) {
  $k, $v = $pair -split "=", 2
  $num = 0.0
  $cfg[$k.Trim()] = if ([double]::TryParse($v, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$num)) { $num } elseif ($v -in "true", "false") { $v -eq "true" } elseif ($v -eq "null") { $null } else { $v }
}
$cfg | ConvertTo-Json -Depth 5 | Set-Content "$data\settings.json" -Encoding utf8
@{ pages = @((Get-Content $texto -Raw -Encoding utf8)); pageIndex = 0 } | ConvertTo-Json | Set-Content "$data\documento.json" -Encoding utf8
# O Chromium só toca arquivos de caminho curto no microfone simulado.
Copy-Item $Amostra "$work\amostra.wav" -Force
if ($Seconds -le 0) { $Seconds = [int]((Get-Item $Amostra).Length / 32000) - 6 }

# 3. Abre o app com o microfone simulado (áudio sem novo tratamento: a gravação já passou por ele).
$env:INPROMPTU_DADOS = $data; $env:INPROMPTU_AUDIO_CRU = "1"
$app = Start-Process -FilePath $electron -PassThru -WorkingDirectory $root -ArgumentList ".", "--remote-debugging-port=9223",
  "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=$work\amostra.wav"
$env:INPROMPTU_DADOS = $null; $env:INPROMPTU_AUDIO_CRU = $null
function Wait-Page($name) {
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    try { if ((Invoke-RestMethod "http://127.0.0.1:9223/json" -TimeoutSec 1) | Where-Object { $_.url -like "*$name" }) { return } } catch {}
  }
  throw "A página $name não abriu."
}
try {
  Wait-Page "editor.html"; Start-Sleep -Seconds 4   # deixa o modelo de voz carregar
  node "$PSScriptRoot\cdp.js" $root 9223 editor.html "inpromptu.invoke('session:start').then(r => JSON.stringify(r))" | Out-Null
  Wait-Page "overlay.html"; Start-Sleep -Milliseconds 300
  $probe = (Get-Content "$PSScriptRoot\live.js" -Raw) -replace "DURATION_MS", ($Seconds * 1000)
  node "$PSScriptRoot\cdp.js" $root 9223 overlay.html $probe | Set-Content "$work\medicao.json" -Encoding utf8
} finally {
  Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
}

# 4. Resultado (erro em palavras, quanto andou com fala, paradas, trancos).
node "$PSScriptRoot\analyze.js" "$work\medicao.json" $gabarito
Write-Host "Linha do tempo: node scripts\medir\timeline.js `"$work\medicao.json`" `"$gabarito`" 0 30"
