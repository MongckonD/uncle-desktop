$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot '../src/main/computer-audio.cs')
$previousAudio = [UncleAudio]::Apply('status',0)
try {
    [UncleAudio]::Apply('volume_set',0) | Out-Null
    [UncleAudio]::Apply('mute',0) | Out-Null
    $openedAudio = [UncleAudio]::Apply('unmute',0)
    if ($openedAudio.muted -or $openedAudio.level -ne 25) { throw 'Unmute from zero must become audible at 25 percent' }
    $louderAudio = [UncleAudio]::Apply('volume_up',10)
    if ($louderAudio.muted -or $louderAudio.level -ne 35) { throw 'Volume up failed' }
    $quieterAudio = [UncleAudio]::Apply('volume_down',10)
    if ($quieterAudio.level -ne 25) { throw 'Volume down failed' }
    'PASS native Windows audio: unmute zero, volume up, volume down'
} finally {
    [UncleAudio]::Apply('volume_set',$previousAudio.level) | Out-Null
    if ($previousAudio.muted) { [UncleAudio]::Apply('mute',0) | Out-Null }
    else { [UncleAudio]::Apply('unmute',0) | Out-Null }
    if ($previousAudio.level -eq 0) { [UncleAudio]::Apply('volume_set',0) | Out-Null }
}
