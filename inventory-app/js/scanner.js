/**
 * scanner.js — 扫码模块
 * 基于 html5-qrcode 库，支持摄像头扫描 EAN-13/69码条形码。
 * v2.3 修复: 移除无效的 formatsToSupport 配置项。
 */

const Scanner = {
  html5QrCode: null,
  isScanning: false,

  /**
   * 初始化扫码器
   * @param {string} elementId - 容器元素 ID
   */
  init(elementId) {
    if (this.html5QrCode) {
      this.destroy();
    }
    this.html5QrCode = new Html5Qrcode(elementId);
  },

  /**
   * 开始扫码
   * @param {Function} onSuccess - 扫描成功回调 (barcodeText)
   * @param {Function} onError - 启动失败回调 (errorMessage)
   * @returns {Promise<void>}
   */
  async start(onSuccess, onError) {
    if (!this.html5QrCode) {
      throw new Error('扫码器未初始化，请先调用 init()');
    }

    if (this.isScanning) {
      return;
    }

    const config = {
      fps: 10,
      qrbox: 250,
      aspectRatio: 1.5,
      disableFlip: false,
    };

    try {
      await this.html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (onSuccess) {
            onSuccess(decodedText);
          }
        },
        (_errorMessage) => {
          // 帧扫描中的正常失败（如模糊帧），忽略不处理
        }
      );
      this.isScanning = true;
    } catch (err) {
      console.error('启动扫码失败:', err);
      const msg = err.message || String(err);

      if (msg.includes('permission') || msg.includes('NotAllowed')) {
        throw new Error('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问');
      } else if (msg.includes('device') || msg.includes('NotFound')) {
        throw new Error('未找到摄像头设备，请确认设备有摄像头');
      } else if (msg.includes('NotReadable') || msg.includes('occupied')) {
        throw new Error('摄像头被其他应用占用，请关闭后重试');
      }
      throw err;
    }
  },

  /**
   * 停止扫码
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
      } catch (err) {
        console.warn('停止扫码时出错:', err);
      }
      this.isScanning = false;
    }
  },

  /**
   * 销毁扫码器实例
   */
  destroy() {
    if (this.html5QrCode) {
      this.stop().catch(() => {});
      try {
        this.html5QrCode.clear();
      } catch (e) {
        // ignore
      }
      this.html5QrCode = null;
      this.isScanning = false;
    }
  },
};
