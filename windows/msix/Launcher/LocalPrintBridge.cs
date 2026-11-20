using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace EasyDine.Launcher;

/// <summary>
/// Local print bridge for the EasyDine web app running inside this window.
///
/// A plain browser cannot list this PC's installed printers or print to a
/// named one without a dialog. This bridge lets the web page (and only the
/// page served by the configured EasyDine server) do exactly three things:
///
///   list      – names of the printers already installed in Windows
///   printRaw  – send ESC/POS bytes (base64) to ONE named printer, RAW datatype
///   printHtml – render a page in a hidden WebView2 and print it through the
///               named printer's own Windows driver (A4, or thermal printers
///               whose driver does not accept raw commands)
///
/// It never changes drivers, ports, the default printer or any Windows
/// setting, never picks a printer on its own, and never falls back to another
/// printer (an empty / unknown name is an error, not "use the default").
///
/// Honest status: "QUEUED" means the Windows print queue accepted the job.
/// It is NOT proof that paper came out — only looking at the printer is.
///
/// Protocol (window.chrome.webview.postMessage, JSON):
///   request  { channel: "easydine-print", id, type, ...args }
///   response { channel: "easydine-print", id, ok: true, result }
///          | { channel: "easydine-print", id, ok: false, code, error }
/// </summary>
internal sealed class LocalPrintBridge
{
    public const int Version = 1;
    private const string Channel = "easydine-print";
    private const int MaxRawBytes = 2 * 1024 * 1024;
    private const int MaxHtmlChars = 1_500_000; // NavigateToString caps at 2 MB
    private static readonly TimeSpan HtmlTimeout = TimeSpan.FromSeconds(30);

    private readonly CoreWebView2 _core;
    private readonly Func<string?> _serverUrl;
    private readonly IntPtr _parentWindow;
    // One job at a time: two quick clicks can never interleave bytes on paper.
    private readonly SemaphoreSlim _jobLock = new(1, 1);

    private LocalPrintBridge(CoreWebView2 core, Func<string?> serverUrl, IntPtr parentWindow)
    {
        _core = core;
        _serverUrl = serverUrl;
        _parentWindow = parentWindow;
    }

    public static void Attach(CoreWebView2 core, Func<string?> serverUrl, IntPtr parentWindow)
    {
        var bridge = new LocalPrintBridge(core, serverUrl, parentWindow);
        core.WebMessageReceived += bridge.OnWebMessage;
    }

    private async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        JsonObject? req;
        try
        {
            req = JsonNode.Parse(e.WebMessageAsJson) as JsonObject;
        }
        catch
        {
            return; // not ours
        }
        if (req is null || (string?)req["channel"] != Channel) return;
        var id = req["id"]?.ToString() ?? "";

        // Only the EasyDine server this app was pointed at may print.
        if (!IsTrustedSource(e.Source))
        {
            Reply(id, false, null, "FORBIDDEN", "This page is not allowed to use the local printers.");
            return;
        }

        try
        {
            var type = (string?)req["type"];
            switch (type)
            {
                case "hello":
                    Reply(id, true, new JsonObject
                    {
                        ["version"] = Version,
                        ["capabilities"] = new JsonArray("list", "printRaw", "printHtml"),
                    });
                    break;
                case "list":
                    Reply(id, true, new JsonObject { ["printers"] = ListPrinters() });
                    break;
                case "printRaw":
                    await HandlePrintRaw(id, req);
                    break;
                case "printHtml":
                    await HandlePrintHtml(id, req);
                    break;
                default:
                    Reply(id, false, null, "UNSUPPORTED", $"Unknown request '{type}'.");
                    break;
            }
        }
        catch (Exception ex)
        {
            Reply(id, false, null, "ERROR", ex.Message);
        }
    }

    private bool IsTrustedSource(string source)
    {
        var configured = _serverUrl();
        if (string.IsNullOrWhiteSpace(configured)) return false;
        if (!Uri.TryCreate(configured, UriKind.Absolute, out var server)) return false;
        if (!Uri.TryCreate(source, UriKind.Absolute, out var src)) return false;
        return string.Equals(src.Scheme, server.Scheme, StringComparison.OrdinalIgnoreCase)
            && string.Equals(src.Host, server.Host, StringComparison.OrdinalIgnoreCase)
            && src.Port == server.Port;
    }

    private void Reply(string id, bool ok, JsonNode? result, string? code = null, string? error = null)
    {
        var msg = new JsonObject { ["channel"] = Channel, ["id"] = id, ["ok"] = ok };
        if (ok) msg["result"] = result;
        else
        {
            msg["code"] = code ?? "ERROR";
            msg["error"] = error ?? "Unknown error";
        }
        try
        {
            _core.PostWebMessageAsJson(msg.ToJsonString());
        }
        catch
        {
            // page navigated away; nothing to tell
        }
    }

    // --- list -----------------------------------------------------------------

    private static JsonArray ListPrinters()
    {
        string? defaultName = null;
        try { defaultName = new PrinterSettings().PrinterName; } catch { /* no default set */ }
        var arr = new JsonArray();
        foreach (string name in PrinterSettings.InstalledPrinters)
        {
            arr.Add(new JsonObject
            {
                ["name"] = name,
                ["isDefault"] = string.Equals(name, defaultName, StringComparison.Ordinal),
            });
        }
        return arr;
    }

    /// <summary>Exact, case-sensitive match against installed printers. No guessing.</summary>
    private static bool IsInstalled(string name)
    {
        foreach (string installed in PrinterSettings.InstalledPrinters)
        {
            if (string.Equals(installed, name, StringComparison.Ordinal)) return true;
        }
        return false;
    }

    private static string? RequirePrinter(JsonObject req)
    {
        var name = (string?)req["printer"];
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }

    // --- printRaw ---------------------------------------------------------------

    private async Task HandlePrintRaw(string id, JsonObject req)
    {
        var printer = RequirePrinter(req);
        if (printer is null)
        {
            Reply(id, false, null, "NO_PRINTER", "No printer was chosen.");
            return;
        }
        if (!IsInstalled(printer))
        {
            Reply(id, false, null, "PRINTER_NOT_FOUND", $"\"{printer}\" is not installed on this PC.");
            return;
        }

        var chunks = new List<byte[]>();
        var total = 0;
        if (req["data"] is not JsonArray data || data.Count == 0)
        {
            Reply(id, false, null, "BAD_REQUEST", "Nothing to print.");
            return;
        }
        foreach (var node in data)
        {
            var bytes = Convert.FromBase64String((string?)node ?? "");
            total += bytes.Length;
            if (total > MaxRawBytes)
            {
                Reply(id, false, null, "BAD_REQUEST", "Print job is too large.");
                return;
            }
            chunks.Add(bytes);
        }
        var docName = Truncate((string?)req["docName"] ?? "EasyDine", 60);

        await _jobLock.WaitAsync();
        try
        {
            // Each chunk is its own spooler document (one ticket = one job).
            var queued = 0;
            foreach (var bytes in chunks)
            {
                var r = await Task.Run(() => RawPrinter.Send(printer, docName, bytes));
                if (!r.Ok)
                {
                    // Nothing queued yet = a clean failure. Anything already
                    // queued = some tickets may print: report it as unknown.
                    var code = queued == 0 && r.BytesWritten == 0 ? r.Code : "PARTIAL";
                    Reply(id, false, null, code, r.Error + (queued > 0 ? $" ({queued} of {chunks.Count} tickets were already queued.)" : ""));
                    return;
                }
                queued++;
            }
            Reply(id, true, new JsonObject { ["status"] = "QUEUED", ["jobs"] = queued });
        }
        finally
        {
            _jobLock.Release();
        }
    }

    // --- printHtml --------------------------------------------------------------

    private async Task HandlePrintHtml(string id, JsonObject req)
    {
        var printer = RequirePrinter(req);
        if (printer is null)
        {
            Reply(id, false, null, "NO_PRINTER", "No printer was chosen.");
            return;
        }
        if (!IsInstalled(printer))
        {
            Reply(id, false, null, "PRINTER_NOT_FOUND", $"\"{printer}\" is not installed on this PC.");
            return;
        }
        var pages = new List<string>();
        if (req["html"] is JsonArray arr)
        {
            foreach (var n in arr) if (!string.IsNullOrEmpty((string?)n)) pages.Add((string)n!);
        }
        else if (!string.IsNullOrEmpty((string?)req["html"]))
        {
            pages.Add((string)req["html"]!);
        }
        if (pages.Count == 0 || pages.Any(p => p.Length > MaxHtmlChars))
        {
            Reply(id, false, null, "BAD_REQUEST", pages.Count == 0 ? "Nothing to print." : "Page is too large.");
            return;
        }
        var paper = (string?)req["paper"] ?? "80mm";

        await _jobLock.WaitAsync();
        try
        {
            var queued = 0;
            foreach (var html in pages)
            {
                var (status, error) = await PrintHtmlPage(printer, html, paper);
                if (status != "QUEUED")
                {
                    var code = queued == 0 ? status : "PARTIAL";
                    Reply(id, false, null, code, error + (queued > 0 ? $" ({queued} of {pages.Count} pages were already queued.)" : ""));
                    return;
                }
                queued++;
            }
            Reply(id, true, new JsonObject { ["status"] = "QUEUED", ["jobs"] = queued });
        }
        finally
        {
            _jobLock.Release();
        }
    }

    private async Task<(string status, string error)> PrintHtmlPage(string printer, string html, string paper)
    {
        CoreWebView2Controller? controller = null;
        try
        {
            controller = await _core.Environment.CreateCoreWebView2ControllerAsync(_parentWindow);
            controller.IsVisible = false;
            controller.Bounds = new Rectangle(0, 0, paper == "A4" ? 794 : 400, 600);
            var core = controller.CoreWebView2;
            // Static page only: no scripts (the receipt's own print hook must
            // never open a dialog), no navigation away, no popups.
            core.Settings.IsScriptEnabled = false;
            core.Settings.AreDefaultScriptDialogsEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            var loaded = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var started = false;
            core.NavigationStarting += (_, a) =>
            {
                if (started) a.Cancel = true;
                started = true;
            };
            core.NewWindowRequested += (_, a) => a.Handled = true;
            core.NavigationCompleted += (_, a) => loaded.TrySetResult(a.IsSuccess);
            core.NavigateToString(html);

            var done = await Task.WhenAny(loaded.Task, Task.Delay(HtmlTimeout));
            if (done != loaded.Task || !loaded.Task.Result)
            {
                return ("FAILED", "The page could not be prepared for printing.");
            }

            var settings = _core.Environment.CreatePrintSettings();
            settings.PrinterName = printer; // never empty here: empty = default printer
            settings.ShouldPrintHeaderAndFooter = false;
            settings.ShouldPrintBackgrounds = true;
            settings.Orientation = CoreWebView2PrintOrientation.Portrait;
            settings.ScaleFactor = 1.0;
            settings.Copies = 1;
            if (paper == "A4")
            {
                settings.PageWidth = 8.27;
                settings.PageHeight = 11.69;
                settings.MarginTop = settings.MarginBottom = settings.MarginLeft = settings.MarginRight = 0.4;
            }
            else
            {
                // Roll paper: one page as tall as the ticket.
                var widthMm = paper == "58mm" ? 58.0 : 80.0;
                double heightPx = 600;
                try
                {
                    var h = await core.ExecuteScriptAsync("Math.ceil(document.documentElement.scrollHeight)");
                    if (double.TryParse(h, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v) && v > 0) heightPx = v;
                }
                catch { /* keep default */ }
                settings.PageWidth = widthMm / 25.4;
                settings.PageHeight = Math.Clamp(heightPx / 96.0 + 0.3, 2.0, 100.0);
                settings.MarginTop = settings.MarginBottom = settings.MarginLeft = settings.MarginRight = 0;
            }

            var printTask = core.PrintAsync(settings);
            var finished = await Task.WhenAny(printTask, Task.Delay(HtmlTimeout));
            if (finished != printTask)
            {
                return ("TIMEOUT", "Windows did not confirm the print job in time. It may still print.");
            }
            return printTask.Result switch
            {
                CoreWebView2PrintStatus.Succeeded => ("QUEUED", ""),
                CoreWebView2PrintStatus.PrinterUnavailable => ("PRINTER_UNAVAILABLE", $"\"{printer}\" is unavailable (offline, paused or removed)."),
                _ => ("FAILED", "Windows could not print the page."),
            };
        }
        finally
        {
            try { controller?.Close(); } catch { /* already gone */ }
        }
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    // --- Win32 RAW spooler ------------------------------------------------------

    private static class RawPrinter
    {
        public readonly record struct Result(bool Ok, string Code, string Error, int BytesWritten);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private sealed class DOCINFOW
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName = "";
            [MarshalAs(UnmanagedType.LPWStr)] public string? pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDataType = "RAW";
        }

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

        [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOW di);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool ClosePrinter(IntPtr hPrinter);

        private static string LastError() => new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message;

        public static Result Send(string printer, string docName, byte[] bytes)
        {
            if (!OpenPrinter(printer, out var h, IntPtr.Zero))
            {
                return new Result(false, "PRINTER_NOT_FOUND", $"Could not open \"{printer}\": {LastError()}", 0);
            }
            try
            {
                if (StartDocPrinter(h, 1, new DOCINFOW { pDocName = docName }) == 0)
                {
                    return new Result(false, "RAW_REJECTED",
                        $"\"{printer}\" did not accept raw printer commands ({LastError()}). Choose \"Through Windows driver\" for this printer.", 0);
                }
                try
                {
                    if (!StartPagePrinter(h)) return new Result(false, "FAILED", LastError(), 0);
                    var ok = WritePrinter(h, bytes, bytes.Length, out var written);
                    var err = ok ? "" : LastError();
                    EndPagePrinter(h);
                    if (!ok || written != bytes.Length)
                    {
                        return new Result(false, written > 0 ? "PARTIAL" : "FAILED",
                            $"Only part of the job reached \"{printer}\". {err}".Trim(), written);
                    }
                    return new Result(true, "QUEUED", "", written);
                }
                finally
                {
                    EndDocPrinter(h);
                }
            }
            finally
            {
                ClosePrinter(h);
            }
        }
    }
}
