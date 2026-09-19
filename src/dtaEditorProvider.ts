import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';

export function getOpenStataExecutable(): string | undefined {
    // 1. User configuration
    const configPath = vscode.workspace.getConfiguration('positron-stata').get<string>('openStataPath');
    if (configPath && fs.existsSync(configPath)) {
        return configPath;
    }

    // 2. Environment variable
    const envBin = process.env['OPENSTATA_BIN'];
    if (envBin && fs.existsSync(envBin)) {
        return envBin;
    }

    // 3. Known release, debug, and standard install locations
    const binName = process.platform === 'win32' ? 'open-stata.exe' : 'open-stata';
    const candidates = [
        '/media/abhinav/WorkData/.cargo_target/release/open-stata',
        '/media/abhinav/WorkData/.cargo_target/debug/open-stata',
        path.join(os.homedir(), '.cargo', 'bin', binName),
        path.join(os.homedir(), '.local', 'bin', binName),
        path.join('/usr', 'local', 'bin', binName),
        path.join('/usr', 'bin', binName),
        path.join('/home', 'linuxbrew', '.linuxbrew', 'bin', binName),
        path.join('/opt', 'homebrew', 'bin', binName)
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // 4. Scan PATH environment variable
    const envPath = process.env['PATH'] || '';
    for (const dir of envPath.split(path.delimiter)) {
        if (!dir) continue;
        const candidate = path.join(dir, binName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

function getPythonExecutable(): string {
    const candidates = [
        '/home/linuxbrew/.linuxbrew/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python3',
        'python3'
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return 'python3';
}

/**
 * Converts a .dta file to parquet using the native open-stata Rust binary.
 */
function convertWithOpenStata(openStataBin: string, filePath: string, cachedParquetPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        // Fast path: direct convert command
        execFile(openStataBin, ['convert', filePath, cachedParquetPath], (err, _stdout, stderr) => {
            if (!err) {
                return resolve();
            }

            // Fallback command: headless Stata script command only if subcommand was unrecognized
            const isSubcommandError = stderr && (
                stderr.includes('unrecognized subcommand') ||
                stderr.includes('unexpected argument') ||
                stderr.includes("Found argument 'convert' which wasn't expected")
            );

            if (isSubcommandError) {
                execFile(
                    openStataBin,
                    ['-c', `use \`"${filePath}"', clear; save \`"${cachedParquetPath}"', replace`],
                    (err2, _stdout2, stderr2) => {
                        if (!err2) {
                            return resolve();
                        }
                        reject(new Error(stderr2 || stderr || err2.message || err.message));
                    }
                );
            } else {
                reject(new Error(stderr || err.message));
            }
        });
    });
}

/**
 * Fallback converter using Python (pandas or pyreadstat).
 */
function convertWithFallback(filePath: string, cachedParquetPath: string): Promise<void> {
    const pythonBin = getPythonExecutable();
    const pythonScript = `
import sys

src = sys.argv[1]
dst = sys.argv[2]

try:
    import pandas as pd
    df = pd.read_stata(src)
    df.to_parquet(dst, index=False)
except Exception as e_pandas:
    try:
        import pyreadstat
        df, _ = pyreadstat.read_dta(src)
        df.to_parquet(dst, index=False)
    except Exception as e_readstat:
        sys.stderr.write(f"Pandas failed: {e_pandas}\\npyreadstat failed: {e_readstat}\\n")
        sys.exit(1)
`;
    return new Promise<void>((resolve, reject) => {
        execFile(pythonBin, ['-c', pythonScript, filePath, cachedParquetPath], (err, _stdout, stderr) => {
            if (err) {
                reject(new Error(stderr || err.message));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Converts a .dta file to cached Parquet format and opens it directly in Positron's
 * native spreadsheet Data Explorer (powered by DuckDB).
 */
export async function openDtaInNativeDataExplorer(dtaUri: vscode.Uri, _context?: vscode.ExtensionContext): Promise<void> {
    const filePath = dtaUri.fsPath;
    const fileName = path.basename(filePath);
    const hash = crypto.createHash('md5').update(filePath).digest('hex').substring(0, 8);
    const datasetDir = path.join(os.tmpdir(), 'positron-stata-cache', hash);
    if (!fs.existsSync(datasetDir)) {
        fs.mkdirSync(datasetDir, { recursive: true });
    }

    const baseName = path.parse(filePath).name;
    const cachedParquetPath = path.join(datasetDir, `${baseName}.parquet`);

    // Check if cached parquet exists and is newer than .dta
    let needsConvert = true;
    if (fs.existsSync(cachedParquetPath)) {
        try {
            const dtaStat = fs.statSync(filePath);
            const parquetStat = fs.statSync(cachedParquetPath);
            if (parquetStat.size > 0 && parquetStat.mtimeMs >= dtaStat.mtimeMs) {
                needsConvert = false;
            }
        } catch {
            needsConvert = true;
        }
    }

    if (needsConvert) {
        const openStataBin = getOpenStataExecutable();
        let converted = false;
        let lastError: Error | undefined;

        if (openStataBin) {
            try {
                await convertWithOpenStata(openStataBin, filePath, cachedParquetPath);
                converted = true;
            } catch (err: any) {
                console.warn('Native open-stata conversion failed, attempting fallback:', err);
                lastError = err;
            }
        }

        if (!converted) {
            try {
                await convertWithFallback(filePath, cachedParquetPath);
                converted = true;
            } catch (err: any) {
                // Clean up partial/corrupted parquet file if left behind
                if (fs.existsSync(cachedParquetPath)) {
                    try {
                        fs.unlinkSync(cachedParquetPath);
                    } catch {}
                }
                const cause = lastError
                    ? ` (open-stata failed: ${lastError.message}; fallback failed: ${err.message})`
                    : `: ${err.message}`;
                throw new Error(`Failed to convert .dta to parquet${cause}`);
            }
        }
    }

    const parquetUri = vscode.Uri.file(cachedParquetPath);

    // Open directly using Positron's native DuckDB Data Explorer
    try {
        await vscode.commands.executeCommand(
            'vscode.openWith',
            parquetUri,
            'workbench.editor.positronDataExplorer'
        );
    } catch {
        await vscode.commands.executeCommand('vscode.open', parquetUri);
    }
}

export class DtaCustomEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public static readonly viewType = 'positron-stata.dtaViewer';

    constructor(private readonly context: vscode.ExtensionContext) {}

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new DtaCustomEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            DtaCustomEditorProvider.viewType,
            provider,
            {
                webviewOptions: { retainContextWhenHidden: false },
                supportsMultipleEditorsPerDocument: false
            }
        );
    }

    async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => {} };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const fileName = path.basename(document.uri.fsPath);
        webviewPanel.webview.html = `<!DOCTYPE html>
<html>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui,-apple-system,sans-serif;color:#888;background:#1e1e1e;">
    <div style="text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">📊</div>
        <div>Opening <strong>${fileName}</strong> in Positron Data Explorer...</div>
    </div>
</body>
</html>`;

        try {
            await openDtaInNativeDataExplorer(document.uri, this.context);
            // Delay disposal slightly to allow Positron to attach the Data Explorer editor tab seamlessly
            setTimeout(() => {
                try {
                    webviewPanel.dispose();
                } catch {
                    // Ignore if already disposed
                }
            }, 300);
        } catch (err: any) {
            webviewPanel.webview.html = `<!DOCTYPE html>
<html>
<body style="padding:24px;font-family:sans-serif;color:#f87171;background:#1e1e1e;">
    <h3>Failed to open ${fileName} in Data Explorer</h3>
    <pre>${err.message}</pre>
</body>
</html>`;
        }
    }
}
