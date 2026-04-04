export interface IMemoryNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  modifiedAt?: string;
  children?: IMemoryNode[];
}

export interface IMemoryTreeResponse {
  tree: IMemoryNode[];
  stats: {
    totalFiles: number;
    totalSizeBytes: number;
    agentFiles: number;
    agentSizeBytes: number;
  };
}

export interface IMemoryFileResponse {
  path: string;
  content: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ISaveMemoryFileRequest {
  path: string;
  content: string;
}

export interface ISaveMemoryFileResponse {
  saved: boolean;
  modifiedAt: string;
}

export interface IMemorySearchResult {
  path: string;
  fileName: string;
  matches: Array<{
    line: number;
    content: string;
  }>;
}

export interface IMemorySearchResponse {
  results: IMemorySearchResult[];
}
