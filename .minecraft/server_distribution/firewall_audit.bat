@echo off
title IridescentCraft — Firewall & Network Audit
echo.
echo ==========================================
echo   IridescentCraft Firewall Audit
echo ==========================================
echo.

echo [1/6] Server IP Configuration:
echo.
ipconfig | findstr /C:"IPv4" /C:"Subnet" /C:"Default Gateway"
echo.

echo [2/6] Minecraft port (25565) listening status:
echo.
netstat -an | findstr "25565"
if %errorlevel% neq 0 echo   WARNING: Nothing listening on port 25565!
echo.

echo [3/6] Windows Firewall status:
echo.
netsh advfirewall show currentprofile | findstr /C:"State" /C:"Profile"
echo.

echo [4/6] Firewall rules for port 25565:
echo.
netsh advfirewall firewall show rule name=all dir=in | findstr /C:"25565" /C:"Minecraft" /C:"Java"
if %errorlevel% neq 0 (
    echo   WARNING: No inbound firewall rule found for port 25565 or Java!
    echo.
    echo   To fix, run this as Administrator:
    echo   netsh advfirewall firewall add rule name="Minecraft Server 25565" dir=in action=allow protocol=TCP localport=25565
    echo   netsh advfirewall firewall add rule name="Minecraft Server 25565 UDP" dir=in action=allow protocol=UDP localport=25565
)
echo.

echo [5/6] Java firewall rules:
echo.
netsh advfirewall firewall show rule name=all dir=in | findstr /I "java"
if %errorlevel% neq 0 echo   WARNING: No Java inbound rules found!
echo.

echo [6/6] Testing external connectivity:
echo.
echo   Public IP:
powershell -Command "try { (Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing -TimeoutSec 5).Content } catch { 'Could not determine public IP' }"
echo.
echo   DNS for iridescentcraft.sereneblossom.gay:
nslookup iridescentcraft.sereneblossom.gay 2>nul | findstr /C:"Address" /C:"Name"
echo.
echo   SRV record:
nslookup -type=SRV _minecraft._tcp.iridescentcraft.sereneblossom.gay 2>nul | findstr /C:"port" /C:"svr host" /C:"SRV"
echo.

echo ==========================================
echo   Audit complete.
echo ==========================================
echo.
pause
