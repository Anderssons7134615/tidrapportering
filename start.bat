@echo off
echo ========================================
echo TidApp - lokal utveckling
echo ========================================
echo.

echo Startar backend...
cd backend
start cmd /k "npm ci && npx prisma migrate deploy && npm run db:seed:safe && npm run dev"

echo Vantar 5 sekunder...
timeout /t 5 /nobreak > nul

echo Startar frontend...
cd ..\frontend
start cmd /k "npm ci && npm run dev"

echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
echo Kontrollera att backend\.env innehaller DATABASE_URL till PostgreSQL.
echo ========================================
