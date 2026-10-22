Add-Type -AssemblyName System.Drawing

$assets = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 34, 36))
$body = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(121, 221, 162))
$belly = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(179, 241, 202))
$face = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(39, 65, 55))
$spark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(248, 213, 128))
$mouth = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(39, 65, 55), 7)
$mouth.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$mouth.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$graphics.FillEllipse($background, 2, 2, 252, 252)
$graphics.FillEllipse($body, 43, 40, 170, 176)
$graphics.FillEllipse($belly, 80, 123, 96, 76)
$graphics.FillEllipse($face, 84, 102, 12, 18)
$graphics.FillEllipse($face, 160, 102, 12, 18)
$graphics.DrawArc($mouth, 105, 119, 47, 29, 8, 164)
$points = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(198, 32), [System.Drawing.Point]::new(204, 52),
  [System.Drawing.Point]::new(224, 58), [System.Drawing.Point]::new(204, 64),
  [System.Drawing.Point]::new(198, 84), [System.Drawing.Point]::new(192, 64),
  [System.Drawing.Point]::new(172, 58), [System.Drawing.Point]::new(192, 52)
)
$graphics.FillPolygon($spark, $points)
$bitmap.Save((Join-Path $assets 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$images = @()
foreach ($size in @(16, 32, 48, 256)) {
  $resized = [System.Drawing.Bitmap]::new($size, $size)
  $resizedGraphics = [System.Drawing.Graphics]::FromImage($resized)
  $resizedGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $resizedGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizedGraphics.DrawImage($bitmap, 0, 0, $size, $size)
  $memory = [System.IO.MemoryStream]::new()
  $dib = [System.IO.BinaryWriter]::new($memory)
  $dib.Write([uint32]40)
  $dib.Write([int32]$size)
  $dib.Write([int32]($size * 2))
  $dib.Write([uint16]1)
  $dib.Write([uint16]32)
  $dib.Write([uint32]0)
  $dib.Write([uint32]($size * $size * 4))
  foreach ($unused in 1..4) { $dib.Write([uint32]0) }
  for ($y = $size - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $size; $x++) {
      $pixel = $resized.GetPixel($x, $y)
      $dib.Write([byte]$pixel.B)
      $dib.Write([byte]$pixel.G)
      $dib.Write([byte]$pixel.R)
      $dib.Write([byte]$pixel.A)
    }
  }
  $maskWidth = [int][Math]::Ceiling($size / 32) * 4
  for ($y = $size - 1; $y -ge 0; $y--) {
    $mask = [byte[]]::new($maskWidth)
    for ($x = 0; $x -lt $size; $x++) {
      if ($resized.GetPixel($x, $y).A -lt 128) {
        $index = [int][Math]::Floor($x / 8)
        $mask[$index] = [byte]($mask[$index] -bor (128 -shr ($x % 8)))
      }
    }
    $dib.Write($mask)
  }
  $dib.Flush()
  $images += @{ Size = $size; Bytes = $memory.ToArray() }
  $dib.Dispose()
  $resizedGraphics.Dispose()
  $resized.Dispose()
}

$stream = [System.IO.File]::Create((Join-Path $assets 'icon.ico'))
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$images.Count)
$offset = 6 + 16 * $images.Count
foreach ($image in $images) {
  $writer.Write([byte]($image.Size % 256))
  $writer.Write([byte]($image.Size % 256))
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$image.Bytes.Length)
  $writer.Write([uint32]$offset)
  $offset += $image.Bytes.Length
}
foreach ($image in $images) { $writer.Write([byte[]]$image.Bytes) }
$writer.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$background.Dispose()
$body.Dispose()
$belly.Dispose()
$face.Dispose()
$spark.Dispose()
$mouth.Dispose()
