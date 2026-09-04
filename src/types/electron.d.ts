export interface RenderJobData {
  svgCode: string;
  fps?: number;
  duration?: number;
  width?: number;
  height?: number;
  codec?: 'h264' | 'prores' | 'vp8' | 'vp9';
  outputPath?: string;
}

export interface RenderProgressData {
  progress: number;
  status: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  selectSvgFile: () => Promise<{ canceled: boolean; filePath?: string; content?: string }>;
  selectSavePath: (defaultName?: string) => Promise<{ canceled: boolean; filePath?: string }>;
  renderVideoLocal: (jobData: RenderJobData) => Promise<{ success: boolean; canceled?: boolean; outputPath?: string; fileSize?: string; error?: string }>;
  cancelVideoRender: () => Promise<{ success: boolean; canceled?: boolean }>;
  saveRenderedFile: (sourcePath: string, defaultName?: string) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  onRenderProgress: (callback: (data: RenderProgressData) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
