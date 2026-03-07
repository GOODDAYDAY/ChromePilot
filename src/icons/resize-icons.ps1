Add-Type -AssemblyName System.Drawing

$source = Join-Path $PSScriptRoot "icon.png"

foreach ($size in @(16, 48, 128)) {
    $img = [System.Drawing.Image]::FromFile($source)
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    $out = Join-Path $PSScriptRoot "icon-$size.png"
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $img.Dispose()
    Write-Host "Created icon-$size.png"
}

Write-Host "Done."
