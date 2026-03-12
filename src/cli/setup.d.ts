/**
 * OpenClaw Plugin Setup Script 类型定义
 */

declare module 'setup' {
  export interface SetupOptions {
    /** OpenClaw 安装路径 */
    openclawPath?: string;
    /** 是否跳过交互式提示 */
    silent?: boolean;
  }

  export interface SetupResult {
    /** 是否成功 */
    success: boolean;
    /** 链接路径 */
    linkPath?: string;
    /** 错误信息 */
    error?: string;
  }
}
