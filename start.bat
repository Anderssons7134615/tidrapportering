@echo off
echo ========================================
echo TidApp - Tidrapportering
echo ========================================
echo.

echo Startar backend...
cd backend
start cmd /k "npm install && npx prisma generate && npx prisma db push && npm run db:seed:safe && npm run dev"

echo Vantar 5 sekunder...
timeout /t 5 /nobreak > nul

echo Startar frontend...
cd ../frontend
start cmd /k "npm install && npm run dev"

echo.
echo ========================================
echo Appen startar...
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo ========================================
echo.
echo Testanvandare:
echo - rick@anderssonsisolering.se / Rick1234
echo - admin@testforetaget.se / Test1234
echo ========================================
