@echo off
echo ========================================
echo TidApp - Tidrapportering
echo ========================================
echo.

echo Startar backend...
cd backend
start cmd /k "npm install && npx prisma generate && npx prisma db push && npm run db:seed && npm run dev"

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
echo - admin@byggab.se / password123
echo - lars@byggab.se / password123
echo - erik@byggab.se / password123
echo ========================================
