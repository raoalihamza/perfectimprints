# VID-100: the AUTO-204 root-page check, read only. Args: -Roots (space-separated slugs) -ExpectVideos (slugs that should carry a videos row)
param([string]$Roots, [string]$ExpectVideos = '', [string]$Site = 'https://www.perfectimprints.com')
$rootList = $Roots -split ' ' | Where-Object { $_ }
$videoRoots = @{}
foreach ($v in ($ExpectVideos -split ' ' | Where-Object { $_ })) { $videoRoots[$v] = $true }
$bad = 0; $videosSeen = 0; $blogsSeen = 0
foreach ($slug in $rootList) {
  try { $r = Invoke-WebRequest -Uri "$Site/cat/$slug" -UseBasicParsing -TimeoutSec 60 } catch { $bad++; "FAIL /cat/$slug : request failed $($_.Exception.Message)"; continue }
  $problems = @()
  if ($r.StatusCode -ne 200) { $problems += "status $($r.StatusCode)" }
  if ($r.Headers['X-Nextjs-Prerender'] -ne '1') { $problems += 'not prerendered' }
  if ("$($r.Headers['Cache-Control'])" -match 'no-store') { $problems += 'Cache-Control says no-store (dynamic)' }
  if ($r.Content -notmatch '<h1') { $problems += 'no h1' }
  if ($r.Content -match 'BAILOUT_TO_CLIENT_SIDE_RENDERING') { $problems += 'bailout marker' }
  if ($r.Headers['X-Robots-Tag']) { $problems += "X-Robots-Tag $($r.Headers['X-Robots-Tag'])" }
  $hasBlogs = $r.Content -match 'Related Blogs About'
  $hasVideos = $r.Content -match 'Related Videos About'
  if ($hasBlogs) { $blogsSeen++ }
  if ($hasVideos) { $videosSeen++ }
  if ($videoRoots.ContainsKey($slug) -and -not $hasVideos) { $problems += 'expected a Related Videos row, none in the HTML' }
  if ($problems.Count -gt 0) { $bad++; "FAIL /cat/$slug : $($problems -join '; ')" }
}
"$($rootList.Count) root category pages checked, $bad with a problem; Related Blogs row on $blogsSeen, Related Videos row on $videosSeen"
