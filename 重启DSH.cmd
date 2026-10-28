@echo off
setlocal
pushd "%~dp0"
call "%~dp0camera-patch\restart-dsh-camera.cmd"
popd
