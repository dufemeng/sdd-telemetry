import type { ApiResponse } from '../contracts/common.contract';

export interface HttpClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class HttpClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get<TData>(path: string): Promise<ApiResponse<TData>> {
    const response = await this.fetchImpl(this.toUrl(path));
    return (await response.json()) as ApiResponse<TData>;
  }

  async post<TData, TBody>(path: string, body: TBody): Promise<ApiResponse<TData>> {
    const response = await this.fetchImpl(this.toUrl(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as ApiResponse<TData>;
  }

  private toUrl(path: string): string {
    return new URL(path, this.options.baseUrl).toString();
  }
}
