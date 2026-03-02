/**
 * Photo Handler Module Tests
 * 測試照片處理功能
 */

const axios = require('axios');
const { downloadLineImage, uploadToSupabase, bufferToBase64, handleUserPhoto } = require('../photo-handler');
const { getSupabaseClient } = require('../supabase-client');

// Mock dependencies
jest.mock('axios');
jest.mock('../supabase-client');
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234'
}));

describe('photo-handler.js', () => {
  let mockSupabaseClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    mockSupabaseClient = {
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn(),
        getPublicUrl: jest.fn()
      }
    };
    
    getSupabaseClient.mockReturnValue(mockSupabaseClient);
    
    // 設置環境變數
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'mock-token';
  });

  afterEach(() => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  });

  describe('downloadLineImage', () => {
    it('應該成功從 LINE 下載圖片', async () => {
      const mockImageData = Buffer.from('fake-image-data');
      axios.get.mockResolvedValue({
        data: mockImageData
      });

      const result = await downloadLineImage('message123');

      expect(axios.get).toHaveBeenCalledWith(
        'https://api-data.line.me/v2/bot/message/message123/content',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer mock-token'
          },
          responseType: 'arraybuffer',
          timeout: 30000
        })
      );
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('當 TOKEN 未設定時應該拋出錯誤', async () => {
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN;

      await expect(downloadLineImage('message123')).rejects.toThrow(
        'LINE_CHANNEL_ACCESS_TOKEN 未設定'
      );
    });

    it('當 API 錯誤時應該拋出錯誤', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(downloadLineImage('message123')).rejects.toThrow('Network error');
    });
  });

  describe('uploadToSupabase', () => {
    it('應該成功上傳圖片到 Supabase', async () => {
      const mockImageBuffer = Buffer.from('test-image');
      const mockPublicUrl = 'https://storage.supabase.co/user-photos/user123/mock-uuid-1234.jpg';

      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: { path: 'user123/mock-uuid-1234.jpg' },
        error: null
      });

      mockSupabaseClient.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: mockPublicUrl }
      });

      const result = await uploadToSupabase(mockImageBuffer, 'user123');

      expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('user-photos');
      expect(mockSupabaseClient.storage.upload).toHaveBeenCalledWith(
        'user123/mock-uuid-1234.jpg',
        mockImageBuffer,
        {
          contentType: 'image/jpeg',
          upsert: false
        }
      );
      expect(result).toEqual({
        path: 'user123/mock-uuid-1234.jpg',
        publicUrl: mockPublicUrl
      });
    });

    it('當上傳失敗時應該拋出錯誤', async () => {
      const mockImageBuffer = Buffer.from('test-image');
      const uploadError = new Error('Upload failed');

      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: null,
        error: uploadError
      });

      await expect(uploadToSupabase(mockImageBuffer, 'user123')).rejects.toThrow(uploadError);
    });
  });

  describe('bufferToBase64', () => {
    it('應該正確將 Buffer 轉換為 Base64', () => {
      const buffer = Buffer.from('Hello World');
      const result = bufferToBase64(buffer);

      expect(result).toBe('SGVsbG8gV29ybGQ=');
      expect(typeof result).toBe('string');
    });

    it('應該處理空 Buffer', () => {
      const buffer = Buffer.from('');
      const result = bufferToBase64(buffer);

      expect(result).toBe('');
    });

    it('應該處理二進制數據', () => {
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      const result = bufferToBase64(buffer);

      expect(result).toBe('SGVsbG8=');
    });
  });

  describe('handleUserPhoto', () => {
    it('應該成功處理完整的照片上傳流程', async () => {
      const mockImageData = Buffer.from('fake-image-data');
      const mockPublicUrl = 'https://storage.supabase.co/user-photos/user123/mock-uuid-1234.jpg';

      // Mock downloadLineImage
      axios.get.mockResolvedValue({
        data: mockImageData
      });

      // Mock uploadToSupabase
      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: { path: 'user123/mock-uuid-1234.jpg' },
        error: null
      });

      mockSupabaseClient.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: mockPublicUrl }
      });

      const result = await handleUserPhoto('message123', 'user123');

      expect(result).toEqual({
        success: true,
        storagePath: 'user123/mock-uuid-1234.jpg',
        publicUrl: mockPublicUrl,
        base64: mockImageData.toString('base64'),
        size: mockImageData.length
      });
    });

    it('當下載失敗時應該返回錯誤', async () => {
      axios.get.mockRejectedValue(new Error('Download failed'));

      const result = await handleUserPhoto('message123', 'user123');

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Download failed')
      });
    });

    it('當上傳失敗時應該返回錯誤', async () => {
      const mockImageData = Buffer.from('fake-image-data');

      axios.get.mockResolvedValue({
        data: mockImageData
      });

      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: null,
        error: new Error('Upload failed')
      });

      const result = await handleUserPhoto('message123', 'user123');

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Upload failed')
      });
    });
  });
});

