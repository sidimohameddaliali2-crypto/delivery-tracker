$filePath = 'client\src\components\MenuSelection.jsx'
$content = Get-Content $filePath -Raw

# Replace min-w-max with max-w-full overflow-hidden
$content = $content -replace 'className="rounded-lg px-3 py-2 flex-1 min-w-max border"', 'className="rounded-lg px-3 py-2 flex-1 max-w-full border overflow-hidden"'

# Add whitespace-normal to text paragraphs
$content = $content -replace '(<p className="text-xs break-words)"', '$1 whitespace-normal"'

Set-Content $filePath $content
Write-Host "File updated successfully with 6 replacements"
+