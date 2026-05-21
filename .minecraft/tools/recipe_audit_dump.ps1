# =============================================================================
# RECIPE AUDIT DUMP -- Windows-side jar walker for T1 leak audit
# Place in: .minecraft/tools/recipe_audit_dump.ps1
# =============================================================================
#
# Purpose: extract every mod jar's data/<modid>/recipes/*.json into a flat
# TSV so we can grep for T2+ ingredient leaks in T1-accessible recipes.
# Companion to the 2026-05-20 in-game audit finding (Apoth withdrawal/
# removal sigils were using blaze_rod canonically) -- that was caught by
# the user noticing in-game, this script makes the audit systematic.
#
# Output schema (recipes.tsv, tab-separated):
#   recipe_id            <modid>:<recipe_path>
#   recipe_type          minecraft:crafting_shaped / create:mixing / etc
#   output_item          first result item id; for tagged outputs, the tag
#   output_count         result count if specified, else 1
#   ingredients          comma-separated list of item/tag IDs from the
#                        ingredient field (deduplicated)
#   source_jar           jar filename for traceability
#
# Usage (PowerShell, run from the modpack root):
#   cd <modpack_root>
#   .\.minecraft\tools\recipe_audit_dump.ps1 -OutFile recipes.tsv
#
# Then on Linux side (or PowerShell with Select-String), filter for T2+
# ingredients in T1-accessible (no stage check) recipes:
#   T2_MATS = thermal:steel_ingot, botania:manasteel_ingot, botania:mana_diamond,
#             botania:mana_pearl, twilightforest:steeleaf/ironwood/fiery/
#             knightmetal_ingot, aether:zanite_gemstone/gravitite_ingot,
#             blueskies:aquite/diopside/charoite/horizonite
#   T3_MATS = minecraft:diamond, minecraft:netherite_ingot/scrap/ancient_debris,
#             mekanism:osmium_*, thermal:enderium_ingot,
#             botania:terrasteel_ingot/elementium_ingot/dragonstone,
#             forbidden_arcanus:arcane_crystal*, occultism:iesnium*
#   T4_MATS = aether:aethersteel*, mekanism:atomic_alloy/antimatter_pellet/
#             ultimate_control_circuit, botania:gaia_ingot, cataclysm:bulwark*/
#             void_forge*/ignitium*/cursium*
#
# Filter command (PowerShell, after dump):
#   Get-Content recipes.tsv |
#     Select-String -Pattern "thermal:steel_ingot|botania:manasteel_ingot|botania:mana_diamond|minecraft:diamond\b|minecraft:netherite_ingot|mekanism:osmium_ingot" |
#     Out-File t2_t3_leaks.tsv
#
# Then visually verify each hit -- some are intentional tier-skip recipes
# (in kubejs/server_scripts/recipes/tier_skip.js), most should be in a
# tier_gated block. Cross-reference with kubejs/server_scripts/recipes/
# tier_gated_recipes.js to see what we've already gated.
#
# IMPORTANT: this script does NOT distinguish between "T1-accessible by
# stage" vs "T1-accessible by ingredients-already-present." That filter
# is manual. The script only dumps the raw recipe corpus.
# =============================================================================

param(
    [string]$ModsDir = ".\.minecraft\mods",
    [string]$OutFile = ".\recipes.tsv",
    [int]$BatchLog = 10
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path $ModsDir)) {
    Write-Error "Mods dir not found: $ModsDir"
    exit 1
}

$tempBase = Join-Path $env:TEMP "icraft_recipe_audit"
if (Test-Path $tempBase) {
    Remove-Item -Path $tempBase -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $tempBase -Force | Out-Null

$jars = Get-ChildItem -Path $ModsDir -Filter "*.jar"
Write-Host "[recipe_audit_dump] Walking $($jars.Count) jars in $ModsDir"

# Header
"recipe_id`trecipe_type`toutput_item`toutput_count`tingredients`tsource_jar" | Out-File -Encoding UTF8 -FilePath $OutFile

$jarIndex = 0
foreach ($jar in $jars) {
    $jarIndex += 1
    if ($jarIndex % $BatchLog -eq 0) {
        Write-Host "  [$jarIndex/$($jars.Count)] $($jar.Name)"
    }

    $jarUnpack = Join-Path $tempBase $jar.BaseName
    New-Item -ItemType Directory -Path $jarUnpack -Force | Out-Null

    try {
        # Extract only data/*/recipes/ to save time + disk
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($jar.FullName)
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -match '^data/[^/]+/recipes/.+\.json$') {
                $dest = Join-Path $jarUnpack $entry.FullName.Replace('/', '\')
                $destDir = Split-Path $dest -Parent
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
            }
        }
        $zip.Dispose()
    } catch {
        Write-Warning "Failed to extract $($jar.Name): $_"
        continue
    }

    # Walk extracted JSONs
    $recipes = Get-ChildItem -Path $jarUnpack -Filter "*.json" -Recurse -ErrorAction SilentlyContinue
    foreach ($r in $recipes) {
        try {
            # data\<modid>\recipes\<path>.json
            $rel = $r.FullName.Substring($jarUnpack.Length + 1)
            $parts = $rel.Split('\')
            if ($parts.Count -lt 3 -or $parts[0] -ne "data" -or $parts[2] -ne "recipes") { continue }
            $modid = $parts[1]
            $recipePath = ($parts[3..($parts.Count-1)] -join '/').Replace('.json', '')
            $recipeId = "${modid}:${recipePath}"

            $content = Get-Content -Path $r.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop

            $type = if ($content.type) { $content.type } else { "unknown" }

            # Output extraction varies by recipe type; cover the common shapes.
            $output = ""
            $count = 1
            if ($content.result) {
                if ($content.result -is [string]) {
                    $output = $content.result
                } elseif ($content.result.item) {
                    $output = $content.result.item
                    if ($content.result.count) { $count = $content.result.count }
                } elseif ($content.result.tag) {
                    $output = "#" + $content.result.tag
                }
            } elseif ($content.results) {
                # Mod-shipped multi-output (Create, Thermal, Mekanism)
                $first = $content.results | Select-Object -First 1
                if ($first.item) { $output = $first.item }
                elseif ($first.tag) { $output = "#" + $first.tag }
            }

            # Ingredients -- traverse common keys
            $ingredients = New-Object System.Collections.Generic.HashSet[string]
            function Add-Ing($obj) {
                if ($null -eq $obj) { return }
                if ($obj -is [string]) { return }
                if ($obj.item) { [void]$ingredients.Add($obj.item) }
                elseif ($obj.tag) { [void]$ingredients.Add("#" + $obj.tag) }
                elseif ($obj.fluid) { [void]$ingredients.Add("fluid:" + $obj.fluid) }
                if ($obj -is [array] -or $obj.PSObject.Properties.Name -contains 'count') { return }
            }

            if ($content.ingredients) {
                foreach ($i in $content.ingredients) {
                    if ($i -is [array]) {
                        foreach ($alt in $i) { Add-Ing $alt }
                    } else {
                        Add-Ing $i
                    }
                }
            }
            if ($content.ingredient) { Add-Ing $content.ingredient }
            if ($content.key) {
                foreach ($prop in $content.key.PSObject.Properties) {
                    $v = $prop.Value
                    if ($v -is [array]) {
                        foreach ($alt in $v) { Add-Ing $alt }
                    } else {
                        Add-Ing $v
                    }
                }
            }
            # Smelting / blasting / smoking
            if ($content.input) { Add-Ing $content.input }

            $ingList = ($ingredients | Sort-Object) -join ','

            $line = "$recipeId`t$type`t$output`t$count`t$ingList`t$($jar.Name)"
            Add-Content -Path $OutFile -Value $line -Encoding UTF8
        } catch {
            # Bad JSON or unexpected shape -- skip
        }
    }

    # Cleanup per-jar extraction to keep disk usage bounded
    Remove-Item -Path $jarUnpack -Recurse -Force -ErrorAction SilentlyContinue
}

Remove-Item -Path $tempBase -Recurse -Force -ErrorAction SilentlyContinue
$total = (Get-Content $OutFile | Measure-Object -Line).Lines - 1
Write-Host "[recipe_audit_dump] Done. $total recipes captured in $OutFile"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Filter for T2+ ingredient leaks:"
Write-Host '       Get-Content recipes.tsv | Select-String "thermal:steel_ingot|botania:manasteel_ingot|botania:mana_diamond|minecraft:diamond\b|minecraft:netherite_ingot|mekanism:osmium_ingot" > t2_t3_leaks.tsv'
Write-Host "  2. Cross-reference each hit against tier_gated_recipes.js + tier_skip.js"
Write-Host "  3. For each unaccounted recipe, decide: gate via stageItems, remove, or override."
