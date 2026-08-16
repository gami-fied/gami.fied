import './env-loader.js';

export interface EnvironmentConfig {
  nodeEnv: string;
  port: number;
}

export const defaultConfig: EnvironmentConfig = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: Number(process.env['PORT']) || 3001,
};

export * from './env-loader.js';
export * from './redact.js';
export * from './validation.js';
