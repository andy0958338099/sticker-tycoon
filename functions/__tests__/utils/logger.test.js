/**
 * Logger Tests
 * 測試日誌功能
 */

const { log, logError, logInfo, logWarn, logDebug, logSuccess } = require('../../utils/logger');

describe('logger.js', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('log', () => {
    it('應該記錄一般訊息', () => {
      log('Test message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('應該處理多個參數', () => {
      log('Test', 'multiple', 'arguments');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('應該處理物件', () => {
      log({ message: 'test', data: { id: 1 } });
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('logError', () => {
    it('應該記錄錯誤訊息', () => {
      logError('Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('應該處理 Error 物件', () => {
      const error = new Error('Test error');
      logError(error);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('應該處理帶有 stack trace 的錯誤', () => {
      const error = new Error('Test error');
      logError('Something went wrong', error);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('logInfo', () => {
    it('應該記錄資訊訊息', () => {
      logInfo('Info message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('應該包含 INFO 標記', () => {
      logInfo('Test info');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO')
      );
    });
  });

  describe('logWarn', () => {
    it('應該記錄警告訊息', () => {
      logWarn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('應該包含 WARN 標記', () => {
      logWarn('Test warning');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN')
      );
    });
  });

  describe('logDebug', () => {
    it('應該記錄調試訊息', () => {
      logDebug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('在生產環境中可能不記錄', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      consoleLogSpy.mockClear();
      logDebug('Debug in production');
      
      // 根據實現，可能會或不會記錄
      // 這個測試確保函數不會拋出錯誤
      expect(() => logDebug('test')).not.toThrow();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('logSuccess', () => {
    it('應該記錄成功訊息', () => {
      logSuccess('Success message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('應該包含成功標記', () => {
      logSuccess('Operation completed');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/✅|SUCCESS/)
      );
    });
  });

  describe('Edge Cases', () => {
    it('應該處理 undefined', () => {
      expect(() => log(undefined)).not.toThrow();
    });

    it('應該處理 null', () => {
      expect(() => log(null)).not.toThrow();
    });

    it('應該處理空字串', () => {
      expect(() => log('')).not.toThrow();
    });

    it('應該處理數字', () => {
      expect(() => log(42)).not.toThrow();
    });

    it('應該處理布林值', () => {
      expect(() => log(true)).not.toThrow();
      expect(() => log(false)).not.toThrow();
    });

    it('應該處理陣列', () => {
      expect(() => log([1, 2, 3])).not.toThrow();
    });

    it('應該處理循環引用的物件', () => {
      const obj = { name: 'test' };
      obj.self = obj;
      
      expect(() => log(obj)).not.toThrow();
    });
  });

  describe('Multiple Calls', () => {
    it('應該能夠連續記錄多條訊息', () => {
      log('Message 1');
      log('Message 2');
      log('Message 3');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    });

    it('應該能夠混合使用不同的日誌級別', () => {
      logInfo('Info');
      logWarn('Warn');
      logError('Error');
      logSuccess('Success');
      
      expect(consoleLogSpy.mock.calls.length + 
             consoleErrorSpy.mock.calls.length + 
             consoleWarnSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });
});

