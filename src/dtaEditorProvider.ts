import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';

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
            const dtaMtime = fs.statSync(filePath).mtimeMs;
            const parquetMtime = fs.statSync(cachedParquetPath).mtimeMs;
            if (parquetMtime >= dtaMtime) {
                needsConvert = false;
            }
        } catch {
            needsConvert = true;
        }
    }

    if (needsConvert) {
        const pythonBin = getPythonExecutable();
        const pythonScript = `
import pandas as pd
df = pd.read_stata(r'''${filePath}''')
df.to_parquet(r'''${cachedParquetPath}''', index=False)
`;
        await new Promise<void>((resolve, reject) => {
            execFile(pythonBin, ['-c', pythonScript], (err, _stdout, stderr) => {
                if (err) {
                    reject(new Error(stderr || err.message));
                } else {
                    resolve();
                }
            });
        });
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
