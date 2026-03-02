/**
 * Image Processor Module Tests
 * 測試圖片處理功能
 */

const sharp = require('sharp');
const axios = require('axios');
const {
  downloadImage,
  processImage,
  getStickerSpecs
} = require('../image-processor');

// Mock dependencies
jest.mock('axios');
jest.mock('sharp');

// 輔助函數（從 image-processor.js 複製用於測試）
function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function avgColor(samples) {
  if (samples.length === 0) return { r: 255, g: 255, b: 255 };
  const sum = samples.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 }
  );
  return {
    r: sum.r / samples.length,
    g: sum.g / samples.length,
    b: sum.b / samples.length,
  };
}

function scaleImageToFit(width, height, maxWidth, maxHeight) {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }
  
  const ratioW = maxWidth / width;
  const ratioH = maxHeight / height;
  const ratio = Math.min(ratioW, ratioH);
  
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  };
}

describe('image-processor.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('clampByte', () => {
    it('應該將數值限制在 0-255 範圍內', () => {
      expect(clampByte(100)).toBe(100);
      expect(clampByte(255)).toBe(255);
      expect(clampByte(0)).toBe(0);
    });

    it('應該將超過 255 的值限制為 255', () => {
      expect(clampByte(300)).toBe(255);
      expect(clampByte(1000)).toBe(255);
    });

    it('應該將小於 0 的值限制為 0', () => {
      expect(clampByte(-10)).toBe(0);
      expect(clampByte(-100)).toBe(0);
    });

    it('應該將小數四捨五入', () => {
      expect(clampByte(100.4)).toBe(100);
      expect(clampByte(100.6)).toBe(101);
    });
  });

  describe('colorDistance', () => {
    it('應該計算兩個相同顏色的距離為 0', () => {
      const color1 = { r: 255, g: 100, b: 50 };
      const color2 = { r: 255, g: 100, b: 50 };
      expect(colorDistance(color1, color2)).toBe(0);
    });

    it('應該計算黑白之間的距離', () => {
      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };
      const distance = colorDistance(black, white);
      // sqrt(255^2 + 255^2 + 255^2) = sqrt(195075) ≈ 441.67
      expect(distance).toBeCloseTo(441.67, 1);
    });

    it('應該計算相近顏色的距離較小', () => {
      const color1 = { r: 100, g: 100, b: 100 };
      const color2 = { r: 105, g: 105, b: 105 };
      const distance = colorDistance(color1, color2);
      expect(distance).toBeLessThan(10);
    });

    it('應該返回正數', () => {
      const color1 = { r: 50, g: 100, b: 150 };
      const color2 = { r: 200, g: 50, b: 25 };
      expect(colorDistance(color1, color2)).toBeGreaterThan(0);
    });
  });

  describe('avgColor', () => {
    it('應該計算單一顏色的平均值', () => {
      const samples = [{ r: 100, g: 150, b: 200 }];
      const result = avgColor(samples);
      expect(result).toEqual({ r: 100, g: 150, b: 200 });
    });

    it('應該計算多個顏色的平均值', () => {
      const samples = [
        { r: 100, g: 100, b: 100 },
        { r: 200, g: 200, b: 200 }
      ];
      const result = avgColor(samples);
      expect(result).toEqual({ r: 150, g: 150, b: 150 });
    });

    it('應該正確處理小數結果', () => {
      const samples = [
        { r: 100, g: 100, b: 100 },
        { r: 150, g: 150, b: 150 },
        { r: 200, g: 200, b: 200 }
      ];
      const result = avgColor(samples);
      expect(result.r).toBeCloseTo(150, 1);
      expect(result.g).toBeCloseTo(150, 1);
      expect(result.b).toBeCloseTo(150, 1);
    });

    it('空陣列應該返回白色', () => {
      const result = avgColor([]);
      expect(result).toEqual({ r: 255, g: 255, b: 255 });
    });
  });

  describe('downloadImage', () => {
    it('應該處理 base64 格式的圖片', async () => {
      const base64Data = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const dataUrl = `data:image/png;base64,${base64Data}`;

      const result = await downloadImage(dataUrl);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('Hello World');
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('應該從 URL 下載圖片', async () => {
      const mockImageData = Buffer.from('fake-image-data');
      axios.get.mockResolvedValue({
        data: mockImageData
      });

      const result = await downloadImage('https://example.com/image.jpg');

      expect(axios.get).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({
          responseType: 'arraybuffer',
          timeout: 60000
        })
      );
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('應該在失敗時重試', async () => {
      const mockImageData = Buffer.from('fake-image-data');
      axios.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: mockImageData });

      const result = await downloadImage('https://example.com/image.jpg', 3);

      expect(axios.get).toHaveBeenCalledTimes(3);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('重試次數用盡後應該拋出錯誤', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(
        downloadImage('https://example.com/image.jpg', 2)
      ).rejects.toThrow('Network error');

      expect(axios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('scaleImageToFit', () => {
    it('應該縮放過大的圖片', () => {
      const result = scaleImageToFit(1000, 800, 370, 320);
      
      // 1000x800 縮放到符合 370x320
      // 比例: 370/1000 = 0.37, 320/800 = 0.4
      // 應該選較小的比例 0.37
      expect(result.width).toBe(370);
      expect(result.height).toBe(296); // 800 * 0.37
    });

    it('不應該放大較小的圖片', () => {
      const result = scaleImageToFit(200, 200, 370, 320);
      
      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
    });

    it('應該保持長寬比', () => {
      const result = scaleImageToFit(800, 400, 370, 320);
      
      const originalRatio = 800 / 400;
      const resultRatio = result.width / result.height;
      
      expect(resultRatio).toBeCloseTo(originalRatio, 2);
    });

    it('應該處理方形圖片', () => {
      const result = scaleImageToFit(500, 500, 370, 320);
      
      expect(result.width).toBe(320);
      expect(result.height).toBe(320);
    });

    it('應該處理極端長寬比', () => {
      // 非常寬的圖片
      const wideResult = scaleImageToFit(1000, 100, 370, 320);
      expect(wideResult.width).toBe(370);
      expect(wideResult.height).toBe(37);

      // 非常高的圖片
      const tallResult = scaleImageToFit(100, 1000, 370, 320);
      expect(tallResult.width).toBe(32);
      expect(tallResult.height).toBe(320);
    });
  });

  describe('processImage', () => {
    it('應該是導出的函數', () => {
      expect(typeof processImage).toBe('function');
    });
  });

  describe('getStickerSpecs', () => {
    it('應該返回 LINE 貼圖規格物件', () => {
      const specs = getStickerSpecs();

      expect(specs).toBeDefined();
      expect(typeof specs).toBe('object');
    });

    it('應該包含正確的格式', () => {
      const specs = getStickerSpecs();
      expect(specs.format).toBe('PNG');
    });
  });
});

