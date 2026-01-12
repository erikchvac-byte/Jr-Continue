/**
 * File path parsing utilities
 */

import * as path from 'path';

export interface FileInfo {
  path: string;
  isValid: boolean;
  isSafe: boolean;
  targetPath?: string;
  confidence?: 'high' | 'medium' | 'low';
  operation?: 'create' | 'update';
}

export function parseFilePathFromTask(task: string, workingDir: string): FileInfo {
  // Simple regex to extract file paths from task descriptions
  const pathMatch = task.match(/(?:to|in|from|file:?)\s+([^\s,;]+\.[a-zA-Z0-9]+)/i);

  if (pathMatch && pathMatch[1]) {
    const filePath = pathMatch[1];
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workingDir, filePath);

    const isSafe = isPathSafe(absolutePath, workingDir);

    return {
      path: absolutePath,
      isValid: true,
      isSafe,
      targetPath: isSafe ? absolutePath : undefined,
      confidence: 'high',
      operation: 'create',
    };
  }

  return {
    path: workingDir,
    isValid: false,
    isSafe: true,
  };
}

export function isPathSafe(filePath: string, workingDir: string): boolean {
  const normalizedPath = path.normalize(filePath);
  const normalizedWorkingDir = path.normalize(workingDir);

  // Check if path is within working directory
  return normalizedPath.startsWith(normalizedWorkingDir);
}
