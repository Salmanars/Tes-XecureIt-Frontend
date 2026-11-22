@echo off
setlocal enabledelayedexpansion

echo Membuat struktur folder dan file awal untuk setup-frontend...

set "FOLDERS=src\app src\app\login src\app\dashboard src\app\documents\[id] src\components src\lib src\types"
for %%F in (%FOLDERS%) do (
    if not exist "%%F" (
        mkdir "%%F"
        echo [OK] Folder dibuat: %%F
    ) else (
        echo [SKIP] Folder sudah ada: %%F
    )
)

call :create_file "Dockerfile" "FROM node:20-alpine`r`nWORKDIR /app`r`nCOPY package*.json ./`r`nRUN npm install`r`nCOPY . .`r`nRUN npm run build`r`nEXPOSE 3000`r`nCMD [\"npm\", \"run\", \"start\"]"
call :create_file "package.json" "{`r`n  \"name\": \"secure-doc-frontend\",`r`n  \"version\": \"0.1.0\",`r`n  \"private\": true,`r`n  \"scripts\": {`r`n    \"dev\": \"next dev\",`r`n    \"build\": \"next build\",`r`n    \"start\": \"next start\",`r`n    \"lint\": \"next lint\"`r`n  }`r`n}"
call :create_file "tsconfig.json" "{`r`n  \"compilerOptions\": {`r`n    \"target\": \"ES2022\",`r`n    \"strict\": true,`r`n    \"moduleResolution\": \"bundler\",`r`n    \"jsx\": \"preserve\"`r`n  }`r`n}"
call :create_file ".env.local.example" "NEXT_PUBLIC_API_URL=http://localhost:4000/api`r`nNEXT_PUBLIC_WS_URL=ws://localhost:4000"
call :create_file "src\app\layout.tsx" "export default function RootLayout({ children }: { children: React.ReactNode }) { return (<html lang=\"id\"><body>{children}</body></html>); }"
call :create_file "src\app\globals.css" "/* Tailwind CSS styles */"
call :create_file "src\app\page.tsx" "export default function HomePage() { return <main>Secure Document System Frontend</main>; }"
call :create_file "src\app\login\page.tsx" "export default function LoginPage() { return <div>Login Page</div>; }"
call :create_file "src\app\dashboard\page.tsx" "export default function DashboardPage() { return <div>Dashboard Page</div>; }"
call :create_file "src\app\documents\[id]\page.tsx" "export default function DocumentDetailPage() { return <div>Document Detail Page</div>; }"
call :create_file "src\components\Navbar.tsx" "export function Navbar() { return <nav>Navbar</nav>; }"
call :create_file "src\components\UploadDocumentModal.tsx" "export function UploadDocumentModal() { return <div>Upload Document Modal</div>; }"
call :create_file "src\components\ShareDocumentModal.tsx" "export function ShareDocumentModal() { return <div>Share Document Modal</div>; }"
call :create_file "src\components\CollaborationIndicator.tsx" "export function CollaborationIndicator() { return <div>Collaboration Indicator</div>; }"
call :create_file "src\components\HashVerifyModal.tsx" "export function HashVerifyModal() { return <div>Hash Verify Modal</div>; }"
call :create_file "src\components\AuditTrailTable.tsx" "export function AuditTrailTable() { return <div>Audit Trail Table</div>; }"
call :create_file "src\lib\api.ts" "export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';"
call :create_file "src\lib\realtime.ts" "export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';"
call :create_file "src\types\document.ts" "export type DocumentRole = 'owner' | 'editor' | 'viewer';"

echo.
echo Selesai. Struktur setup-frontend siap digunakan.
pause
exit /b 0

:create_file
set "filepath=%~1"
set "content=%~2"
if not exist "%filepath%" (
    > "%filepath%" echo(!content!
    echo [OK] File dibuat: %filepath%
) else (
    echo [SKIP] File sudah ada: %filepath%
)
exit /b 0