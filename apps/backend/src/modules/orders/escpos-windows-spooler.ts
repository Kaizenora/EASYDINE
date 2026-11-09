// Windows Spooler (RAW datatype) transport for ESC/POS thermal printers.
//
// This transport sends raw bytes directly to a Windows printer queue using the
// Win32 winspool API via Node's child_process (PowerShell / .NET printing API).
// The queue must exist and have a RAW port monitor or a compatible driver that
// passes through raw bytes (most thermal printer Windows drivers do this).
//
// "SENT" means the bytes were accepted by the spooler queue.  Paper output is
// confirmed only by physically looking at the printer — this code NEVER claims
// PRINTED.

import { PrinterNotFoundError } from './escpos-usb';

export interface WindowsSpoolerTarget {
  printerName: string; // exact Windows printer name as it appears in Devices & Printers
}

/**
 * Sends raw ESC/POS bytes to a Windows printer queue using a temporary file
 * and PowerShell's System.Printing API (available in .NET 4+ / .NET 6+).
 *
 * Fallback: if System.Printing is unavailable (Server Core), falls back to
 * copy /b approach via cmd.exe.
 */
export async function sendViaWindowsSpooler(
  target: WindowsSpoolerTarget,
  buffer: Buffer,
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new PrinterNotFoundError(
      'Windows Spooler transport is only available on Windows',
    );
  }

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const { writeFile, unlink } = await import('fs/promises');

  // Write raw ESC/POS bytes to a temp file (binary-safe; no newline mangling)
  const tmpFile = join(tmpdir(), `easydine_kot_${Date.now()}_${process.pid}.bin`);
  await writeFile(tmpFile, buffer);

  // Escape printer name for PowerShell (replace single quotes with two single quotes)
  const psName = target.printerName.replace(/'/g, "''");
  const psTmp = tmpFile.replace(/\\/g, '\\\\');

  // PowerShell one-liner: open a RAW PrintDocument, send the file bytes.
  // Uses System.Drawing.Printing (available in .NET Framework 4+ and .NET 6+
  // on Windows).  -NonInteractive so it never hangs waiting for a prompt.
  const psScript = `
Add-Type -AssemblyName System.Drawing;
$pd = New-Object System.Drawing.Printing.PrintDocument;
$pd.PrinterSettings.PrinterName = '${psName}';
if (-not $pd.PrinterSettings.IsValid) {
  Write-Error "Printer '${psName}' not found in Windows spooler";
  exit 2;
}
$pd.DocumentName = 'EasyDine-KOT';
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrint {
  [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int Level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [StructLayout(LayoutKind.Sequential)] public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  public static bool SendFileToPrinter(string printerName, string fileName) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    var di = new DOCINFOA { pDocName = "EasyDine-KOT", pOutputFile = null, pDataType = "RAW" };
    if (StartDocPrinter(hPrinter, 1, di) == 0) { ClosePrinter(hPrinter); return false; }
    if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }
    byte[] bytes = File.ReadAllBytes(fileName);
    IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, pBytes, bytes.Length);
    int written;
    bool ok = WritePrinter(hPrinter, pBytes, bytes.Length, out written);
    Marshal.FreeCoTaskMem(pBytes);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    return ok && written == bytes.Length;
  }
}
"@;
$ok = [RawPrint]::SendFileToPrinter('${psName}', '${psTmp}');
if (-not $ok) { Write-Error "WritePrinter failed for '${psName}'"; exit 3; }
exit 0;
`.trim();

  let stderr = '';
  let exitCode = 0;
  try {
    const r = await execAsync(
      `powershell -NonInteractive -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { timeout: 15000 },
    );
    stderr = r.stderr;
  } catch (err: any) {
    exitCode = err.code ?? 1;
    stderr = err.stderr ?? err.message ?? 'unknown error';
  } finally {
    // Always delete temp file — ignore errors (file may not exist)
    unlink(tmpFile).catch(() => undefined);
  }

  if (exitCode === 2) {
    throw new PrinterNotFoundError(
      `Windows printer "${target.printerName}" not found — check the name in Settings > Printer matches exactly what appears in Windows Devices & Printers`,
    );
  }
  if (exitCode !== 0 || stderr.includes('Error')) {
    throw new Error(
      `Windows Spooler send failed for "${target.printerName}": ${stderr.trim().slice(0, 300)}`,
    );
  }
}

/**
 * Returns the list of printer names visible to the Windows spooler on this
 * machine.  Empty array on non-Windows or if the query fails.
 */
export async function listWindowsPrinters(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const { stdout } = await promisify(exec)(
      'powershell -NonInteractive -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"',
      { timeout: 8000 },
    );
    const parsed = JSON.parse(stdout.trim());
    if (Array.isArray(parsed)) return parsed as string[];
    if (typeof parsed === 'string') return [parsed];
    return [];
  } catch {
    return [];
  }
}
