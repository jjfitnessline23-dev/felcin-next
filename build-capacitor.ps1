# Capacitor static export build script
# Run from felcin-next directory: .\build-capacitor.ps1

$ErrorActionPreference = "Stop"

Write-Host "Patching API routes for static export..." -ForegroundColor Cyan
Get-ChildItem -Recurse -Filter "route.ts" -Path "app/api" | ForEach-Object {
    (Get-Content $_.FullName -Raw) -replace '"force-dynamic"', '"force-static"' |
        Set-Content $_.FullName -NoNewline
}

Write-Host "Patching dynamic page wrappers..." -ForegroundColor Cyan

$wrapperTemplate = @"
import PageClient from "./PageClient";

export function generateStaticParams() { return [{ PARAM: "_" }]; }
export const dynamicParams = false;

export default function Page() { return <PageClient />; }
"@

@{
    'app/(protected)/challenges/[id]/page.tsx'   = 'id'
    'app/(protected)/ghost/[id]/page.tsx'        = 'id'
    'app/(protected)/live/[id]/page.tsx'         = 'id'
    'app/(protected)/podcasts/[id]/page.tsx'     = 'id'
    'app/(protected)/podcasts/live/[id]/page.tsx'= 'id'
    'app/(protected)/subscribe/[uid]/page.tsx'   = 'uid'
    'app/(protected)/tag/[name]/page.tsx'        = 'name'
}.GetEnumerator() | ForEach-Object {
    $wrapperTemplate -replace 'PARAM', $_.Value | Set-Content $_.Key -NoNewline
}

Write-Host "Building static export..." -ForegroundColor Cyan
$env:NEXT_PUBLIC_CAPACITOR_BUILD = "true"
$env:NEXT_PUBLIC_API_URL = "https://felcin.com"
npx next build
$buildResult = $LASTEXITCODE

Write-Host "Reverting patches..." -ForegroundColor Cyan
git checkout app/api
git checkout `
    'app/(protected)/challenges/[id]/page.tsx' `
    'app/(protected)/ghost/[id]/page.tsx' `
    'app/(protected)/live/[id]/page.tsx' `
    'app/(protected)/podcasts/[id]/page.tsx' `
    'app/(protected)/podcasts/live/[id]/page.tsx' `
    'app/(protected)/subscribe/[uid]/page.tsx' `
    'app/(protected)/tag/[name]/page.tsx'

if ($buildResult -ne 0) {
    Write-Host "Build failed. All patches have been reverted." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done! Static output is in the 'out' folder." -ForegroundColor Green
Write-Host "Now run in C:\Users\johnj\felcin:" -ForegroundColor Green
Write-Host "  npx cap sync android" -ForegroundColor Green
