import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

const CMD_TIMEOUT = 5000;
const FIELD_DELIMITER = '\x1f';
const RECORD_DELIMITER = '\x1e';

export interface ICommitLogEntry {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  isMerge: boolean;
}

export interface ICommitLogResult {
  head: string;
  branch: string;
  upstreamHash: string | null;
  commits: ICommitLogEntry[];
}

const parseCommits = (stdout: string): ICommitLogEntry[] => {
  return stdout
    .split(RECORD_DELIMITER)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, parents, author, email, timestampStr, ...subjectParts] = record.split(FIELD_DELIMITER);
      const parentList = parents.trim() ? parents.trim().split(/\s+/) : [];
      return {
        hash,
        shortHash: hash.slice(0, 7),
        parents: parentList,
        author,
        email,
        timestamp: parseInt(timestampStr, 10) * 1000,
        subject: subjectParts.join(FIELD_DELIMITER),
        isMerge: parentList.length > 1,
      };
    });
};

export const getCommitLog = async (cwd: string, limit = 50): Promise<ICommitLogResult> => {
  const format = `%H${FIELD_DELIMITER}%P${FIELD_DELIMITER}%an${FIELD_DELIMITER}%ae${FIELD_DELIMITER}%at${FIELD_DELIMITER}%s${RECORD_DELIMITER}`;

  const { stdout: logOut } = await execFile(
    'git',
    ['-C', cwd, 'log', `-${limit}`, `--format=${format}`],
    { timeout: CMD_TIMEOUT, maxBuffer: 2 * 1024 * 1024 },
  );

  const [head, branch, upstream] = await Promise.all([
    execFile('git', ['-C', cwd, 'rev-parse', 'HEAD'], { timeout: CMD_TIMEOUT })
      .then((r) => r.stdout.trim())
      .catch(() => ''),
    execFile('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: CMD_TIMEOUT })
      .then((r) => r.stdout.trim())
      .catch(() => ''),
    execFile('git', ['-C', cwd, 'rev-parse', '@{upstream}'], { timeout: CMD_TIMEOUT })
      .then((r) => r.stdout.trim())
      .catch(() => null),
  ]);

  return {
    head,
    branch,
    upstreamHash: upstream,
    commits: parseCommits(logOut),
  };
};
