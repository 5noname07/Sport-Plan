Add-Type -AssemblyName System.Drawing
foreach ($size in @(192, 512)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#176a55'))
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#eff6ee'))
    $scale = $size / 512.0
    foreach ($rect in @(@(120,206,48,100), @(344,206,48,100), @(176,172,48,168), @(288,172,48,168), @(176,237,160,38))) {
        $graphics.FillRectangle($brush, [single]($rect[0]*$scale), [single]($rect[1]*$scale), [single]($rect[2]*$scale), [single]($rect[3]*$scale))
    }
    $bitmap.Save((Join-Path $PSScriptRoot "../public/icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
