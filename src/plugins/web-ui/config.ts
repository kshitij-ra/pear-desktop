export interface WebUIConfig {
    enabled: boolean;
    port: number;
    hostname: string;
    apiServerPort: number; // Port where the API server is running
}

export const defaultWebUIConfig: WebUIConfig = {
    enabled: false,
    port: 26539, // Web UI port
    hostname: '0.0.0.0',
    apiServerPort: 26538, // API server port
};
