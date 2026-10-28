# 第三方组件说明 · plugin/assets/mp

这个目录里的文件不是本项目写的，随包分发只为「离线可用」—— 启动动画不联网、
不访问任何 CDN，模型和运行时都从本机读。

| 文件 | 来源 | 许可证 |
|---|---|---|
| `vision_bundle.mjs` | [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) 0.10.20（`dist/vision_bundle.mjs`） | Apache-2.0 |
| `wasm/vision_wasm_internal.js` | 同上（`wasm/vision_wasm_internal.js`） | Apache-2.0 |
| `wasm/vision_wasm_internal.wasm` | 同上（`wasm/vision_wasm_internal.wasm`） | Apache-2.0 |
| `face_landmarker.task` | [MediaPipe Face Landmarker 模型](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)（float16, v1） | Apache-2.0 |

- 许可证全文见同目录 `LICENSE-APACHE-2.0.txt`（取自 https://www.apache.org/licenses/LICENSE-2.0.txt）
- MediaPipe 项目主页：https://github.com/google-ai-edge/mediapipe
- 上游没有为这两个文件单独提供 NOTICE，本文件即履行署名与来源说明

## 关于隐私

模型在本机做推理：人脸画面**不进网络、不落盘、不建模板**。
`lib/face-landmark.js` 只把「脸框 / 双眼位置 / 头部姿态」这几个几何量交给 HUD 画图，
不输出任何可识别个人的特征向量，也不做人脸比对。

## 想省掉这 13 MB

把 `faceEngine` 设为 `"skin"`，再删掉整个 `plugin/assets/mp` 目录即可：
插件会自动退回 1.5.0 的肤色追踪（功能不缺，精度回到那一版）。
