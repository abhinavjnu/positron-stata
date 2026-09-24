import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { getPythonExecutable } from './runtimeManager';

/**
 * Converts a .dta file to parquet using Python (pandas or pyreadstat).
 * Reads in chunks so multi-GB files don't have to fit in memory at once.
 */
function convertDtaToParquet(filePath: string, cachedParquetPath: string): Promise<void> {
    const pythonBin = getPythonExecutable();
    const pythonScript = `
import os
import sys

src = sys.argv[1]
dst = sys.argv[2]

def convert_chunked():
    import pandas as pd
    import pyarrow as pa
    import pyarrow.parquet as pq
    writer = None
    try:
        with pd.read_stata(src, chunksize=200_000) as reader:
            for chunk in reader:
                table = pa.Table.from_pandas(chunk, preserve_index=False)
                if writer is None:
                    writer = pq.ParquetWriter(dst, table.schema)
                else:
                    # A chunk whose column is all-missing infers a different type.
                    table = table.cast(writer.schema)
                writer.write_table(table)
    finally:
        if writer is not None:
            writer.close()
    if writer is None:
        pd.read_stata(src).to_parquet(dst, index=False)

try:
    try:
        convert_chunked()
    except Exception:
        if os.path.exists(dst):
            os.remove(dst)
        import pandas as pd
        pd.read_stata(src).to_parquet(dst, index=False)
except Exception as e_pandas:
    try:
        import pyreadstat
        df, _ = pyreadstat.read_dta(src)
        df.to_parquet(dst, index=False)
    except Exception as e_readstat:
        sys.stderr.write(
            f"pandas error: {e_pandas}\\npyreadstat error: {e_readstat}\\n"
            "Viewing .dta files needs pandas and pyarrow in the configured Python "
            "(pip install pandas pyarrow).\\n"
        )
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
        try {
            await convertDtaToParquet(filePath, cachedParquetPath);
        } catch (err: any) {
            if (fs.existsSync(cachedParquetPath)) {
                try {
                    fs.unlinkSync(cachedParquetPath);
                } catch {}
            }
            throw new Error(`Failed to convert .dta file for Data Explorer: ${err.message}`);
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

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
        const fileName = escapeHtml(path.basename(document.uri.fsPath));
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
    <pre>${escapeHtml(String(err?.message ?? err))}</pre>
</body>
</html>`;
        }
    }
}
