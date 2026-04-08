@echo off
:: Kiem tra xem Docker co dang ton tai khong
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay Docker trong he thong!
    echo Hay dam bao ban da cai Docker Desktop va them vao PATH.
    pause
    exit /b
)

echo [9 Trip ERP] Dang khoi dong container Qdrant...
docker start qdrant || (
    echo [Luu y] Container qdrant chua ton tai, dang tao moi...
    docker run -d -p 6333:6333 -p 6334:6334 --name qdrant qdrant/qdrant
)

echo [9 Trip ERP] Dang mo VS Code...
code . --wait

echo [9 Trip ERP] VS Code da dong. Dang dung Docker de tiet kiem RAM...
docker stop qdrant