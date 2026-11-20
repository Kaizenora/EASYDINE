// EasyDine Print Helper - optional, runs on the cashier PC.
//
// Lets the EasyDine web app (opened in Chrome/Edge from its HTTPS address) print
// Accept & KOT tickets and bills straight to a printer the cashier saved in
// Settings, without the print dialog. When this helper is not running the web
// app falls back to the normal print dialog; nothing else changes.
//
// Security model (see README.md):
//  - Listens on the loopback interface only (127.0.0.1). Nothing on the LAN or
//    the internet can connect to it.
//  - Rejects requests whose Host header is not 127.0.0.1/localhost:<port>
//    (DNS-rebinding guard).
//  - A website can use it only after an explicit one-time pairing: the cashier
//    types the 6-digit code shown in this window into EasyDine Settings. The
//    pairing is bound to that website's origin; the token it receives works
//    for that origin only. Optional --allow-origin restricts which websites may
//    even ask to pair.
//  - Every request is validated. It prints only to the exact printer name it
//    is given, and only if that printer is installed right now. It never picks
//    a substitute or the Windows default printer.
//  - It does not change drivers, ports, IP addresses or the default printer.
//
// Honesty: "sent" means the Windows print queue accepted the job. It does not
// mean paper came out - a switched-off printer can accept a job and fail later.
//
// Build (no install needed; uses the C# compiler that ships with Windows):
//   build.cmd   ->  EasyDinePrintHelper.exe
// C# 5 only (that compiler's language level).

using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace EasyDine.PrintHelper
{
    internal static class Program
    {
        public const int Version = 1;
        public const int DefaultPort = 17821;

        private static int _port = DefaultPort;
        // Test mode: everything is checked, nothing is spooled. Says so in every answer.
        private static bool _dryRun;
        private static readonly List<string> AllowedOrigins = new List<string>();
        private static PairingStore _store;
        private static readonly object ConsoleLock = new object();

        private static int Main(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                if ((a == "--port" || a == "-p") && i + 1 < args.Length)
                {
                    int p;
                    if (!int.TryParse(args[++i], out p) || p < 1024 || p > 65535)
                    {
                        Console.Error.WriteLine("--port must be between 1024 and 65535.");
                        return 2;
                    }
                    _port = p;
                }
                else if (a == "--allow-origin" && i + 1 < args.Length)
                {
                    string o = Http.NormalizeOrigin(args[++i]);
                    if (o == null)
                    {
                        Console.Error.WriteLine("--allow-origin must look like https://your-easydine-site.example");
                        return 2;
                    }
                    AllowedOrigins.Add(o);
                }
                else if (a == "--dry-run")
                {
                    _dryRun = true;
                }
                else if (a == "--help" || a == "-h" || a == "/?")
                {
                    Console.WriteLine("EasyDinePrintHelper.exe [--port 17821] [--allow-origin https://your-site] ... [--dry-run]");
                    return 0;
                }
                else
                {
                    Console.Error.WriteLine("Unknown option: " + a + " (use --help)");
                    return 2;
                }
            }

            _store = PairingStore.Load();
            TcpListener listener;
            try
            {
                listener = new TcpListener(IPAddress.Loopback, _port);
                listener.Start();
            }
            catch (SocketException e)
            {
                Console.Error.WriteLine("Could not listen on 127.0.0.1:" + _port + " (" + e.Message + ").");
                Console.Error.WriteLine("Is the helper already running? Close the other window, or start with --port <number>.");
                return 1;
            }

            // No console window (started detached / by a scheduled task): no title, no keys.
            try { Console.Title = "EasyDine Print Helper"; } catch (IOException) { }
            Log("EasyDine Print Helper v" + Version + " - listening on 127.0.0.1:" + _port + " (this PC only).");
            if (_dryRun) Log("DRY RUN: requests are checked but NOTHING is sent to any printer.");
            if (AllowedOrigins.Count > 0) Log("Only these sites may pair: " + string.Join(", ", AllowedOrigins.ToArray()));
            else Log("Any site may ASK to pair; it still needs the code below. Use --allow-origin to restrict.");
            foreach (string o in _store.Origins()) Log("Paired with " + o);
            Pairing.NewCode();
            Log("Keep this window open while billing. Keys: P = new pairing code, U = unpair all, Q = quit.");

            Thread accept = new Thread(delegate ()
            {
                while (true)
                {
                    TcpClient c;
                    try { c = listener.AcceptTcpClient(); }
                    catch { return; }
                    ThreadPool.QueueUserWorkItem(delegate (object _) { Handle(c); });
                }
            });
            accept.IsBackground = true;
            accept.Start();

            if (Console.IsInputRedirected)
            {
                Thread.Sleep(Timeout.Infinite);
                return 0;
            }
            while (true)
            {
                ConsoleKeyInfo k;
                try { k = Console.ReadKey(true); }
                catch (InvalidOperationException) { Thread.Sleep(Timeout.Infinite); return 0; }
                char ch = char.ToUpperInvariant(k.KeyChar);
                if (ch == 'P') Pairing.NewCode();
                else if (ch == 'U') { _store.Clear(); Log("All pairings removed. Pair again from EasyDine Settings."); }
                else if (ch == 'Q') { listener.Stop(); return 0; }
            }
        }

        public static void Log(string line)
        {
            lock (ConsoleLock) Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + line);
        }

        // --- request handling -----------------------------------------------------

        private static void Handle(TcpClient client)
        {
            using (client)
            {
                client.ReceiveTimeout = 10000;
                client.SendTimeout = 10000;
                NetworkStream stream = client.GetStream();
                Http.Request req;
                string parseError;
                if (!Http.TryRead(stream, out req, out parseError))
                {
                    if (parseError != null) Http.Write(stream, 400, null, Json.Error("BAD_REQUEST", parseError), null);
                    return;
                }
                try
                {
                    Route(stream, req);
                }
                catch (Exception e)
                {
                    Log("Error: " + e.Message);
                    try { Http.Write(stream, 500, null, Json.Error("ERROR", "Helper error: " + e.Message), null); } catch { }
                }
            }
        }

        private static void Route(Stream s, Http.Request req)
        {
            // DNS-rebinding guard: only requests addressed to this PC's loopback.
            string host = (req.Header("host") ?? "").ToLowerInvariant();
            if (host != "127.0.0.1:" + _port && host != "localhost:" + _port)
            {
                Http.Write(s, 403, null, Json.Error("FORBIDDEN", "Wrong host."), null);
                return;
            }

            string origin = Http.NormalizeOrigin(req.Header("origin"));
            bool pairPath = req.Path == "/v1/pair";
            string token = BearerToken(req.Header("authorization"));
            bool authed = origin != null && token != null && _store.Check(origin, token);
            bool mayAskToPair = origin != null && (AllowedOrigins.Count == 0 || AllowedOrigins.Contains(origin));

            // CORS: echo the origin only when it is paired (or may pair, for /v1/pair).
            string corsOrigin = null;
            if (origin != null && (_store.IsPaired(origin) || (pairPath && mayAskToPair))) corsOrigin = origin;

            if (req.Method == "OPTIONS")
            {
                if (corsOrigin == null) { Http.Write(s, 403, null, null, null); return; }
                Dictionary<string, string> h = new Dictionary<string, string>();
                h["Access-Control-Allow-Methods"] = "GET, POST";
                h["Access-Control-Allow-Headers"] = "authorization, content-type";
                h["Access-Control-Max-Age"] = "600";
                // Older Chrome builds sent a Private Network Access preflight.
                if (req.Header("access-control-request-private-network") == "true")
                    h["Access-Control-Allow-Private-Network"] = "true";
                Http.Write(s, 204, corsOrigin, null, h);
                return;
            }

            if (pairPath && req.Method == "POST")
            {
                if (!mayAskToPair)
                {
                    Http.Write(s, 403, null, Json.Error("FORBIDDEN", "This site is not allowed to pair with the helper."), null);
                    return;
                }
                Dictionary<string, object> body = Json.ParseObject(req.Body);
                string code = body != null ? body.ContainsKey("code") ? body["code"] as string : null : null;
                string result = Pairing.TryUse(code);
                if (result != "OK")
                {
                    Http.Write(s, 403, corsOrigin, Json.Error("BAD_CODE", result), null);
                    return;
                }
                string newToken = PairingStore.NewToken();
                _store.Add(origin, newToken);
                Log("Paired with " + origin + ". (Press P for a code to pair another site.)");
                Http.Write(s, 200, corsOrigin, Json.Write(new Dictionary<string, object> {
                    { "ok", true }, { "token", newToken }, { "version", Version } }), null);
                return;
            }

            if (!authed)
            {
                // No CORS header unless paired: an unpaired site cannot even read this.
                Http.Write(s, 401, corsOrigin, Json.Error("FORBIDDEN", "Not paired. Pair this site in EasyDine Settings > Printers."), null);
                return;
            }

            if (req.Path == "/v1/hello" && req.Method == "GET")
            {
                Http.Write(s, 200, corsOrigin, Json.Write(new Dictionary<string, object> {
                    { "ok", true }, { "version", Version }, { "name", "EasyDine Print Helper" } }), null);
                return;
            }
            if (req.Path == "/v1/printers" && req.Method == "GET")
            {
                List<object> list = new List<object>();
                foreach (Printers.Info p in Printers.Installed())
                    list.Add(new Dictionary<string, object> { { "name", p.Name }, { "isDefault", p.IsDefault } });
                Http.Write(s, 200, corsOrigin, Json.Write(new Dictionary<string, object> { { "ok", true }, { "printers", list } }), null);
                return;
            }
            if (req.Path == "/v1/print-raw" && req.Method == "POST")
            {
                PrintRaw(s, corsOrigin, origin, req.Body);
                return;
            }
            if (req.Path == "/v1/unpair" && req.Method == "POST")
            {
                _store.Remove(origin);
                Log("Unpaired " + origin);
                Http.Write(s, 200, corsOrigin, Json.Write(new Dictionary<string, object> { { "ok", true } }), null);
                return;
            }
            Http.Write(s, 404, corsOrigin, Json.Error("BAD_REQUEST", "Unknown request."), null);
        }

        private static readonly object PrintLock = new object();

        private static void PrintRaw(Stream s, string cors, string origin, byte[] rawBody)
        {
            Dictionary<string, object> body = Json.ParseObject(rawBody);
            if (body == null) { Http.Write(s, 400, cors, Json.Error("BAD_REQUEST", "Body must be JSON."), null); return; }
            string printer = body.ContainsKey("printer") ? body["printer"] as string : null;
            string docName = body.ContainsKey("docName") ? body["docName"] as string : null;
            object[] data = body.ContainsKey("data") ? body["data"] as object[] : null;
            if (data == null && body.ContainsKey("data") && body["data"] is System.Collections.ArrayList)
                data = ((System.Collections.ArrayList)body["data"]).ToArray();

            if (!Validate.PrinterName(printer)) { Http.Write(s, 400, cors, Json.Error("NO_PRINTER", "No valid printer name was given."), null); return; }
            if (data == null || data.Length < 1 || data.Length > 20) { Http.Write(s, 400, cors, Json.Error("BAD_REQUEST", "Send 1 to 20 tickets."), null); return; }
            List<byte[]> jobs = new List<byte[]>();
            foreach (object d in data)
            {
                string b64 = d as string;
                byte[] bytes;
                if (b64 == null || b64.Length > 700000 || !Validate.TryBase64(b64, out bytes) || bytes.Length == 0)
                {
                    Http.Write(s, 400, cors, Json.Error("BAD_REQUEST", "A ticket is empty, too large or not base64."), null);
                    return;
                }
                jobs.Add(bytes);
            }
            docName = Validate.DocName(docName);

            // Exact installed name only - never a substitute, never the default printer.
            Printers.Info target = null;
            foreach (Printers.Info p in Printers.Installed()) if (p.Name == printer) { target = p; break; }
            if (target == null)
            {
                Log("Refused: \"" + printer + "\" is not installed.");
                Http.Write(s, 404, cors, Json.Error("PRINTER_NOT_FOUND", "\"" + printer + "\" is not installed on this PC. Re-select it in EasyDine Settings."), null);
                return;
            }

            if (_dryRun)
            {
                Log("DRY RUN: would send " + jobs.Count + " job(s) to \"" + printer + "\" for " + origin + " - nothing printed.");
                Http.Write(s, 200, cors, Json.Write(new Dictionary<string, object> {
                    { "ok", true }, { "jobs", jobs.Count }, { "warning", "Helper is in DRY RUN test mode: nothing was sent to the printer." } }), null);
                return;
            }
            string offlineNote = Printers.OfflineNote(printer);
            int done = 0;
            lock (PrintLock)
            {
                foreach (byte[] job in jobs)
                {
                    RawPrinter.Result r = RawPrinter.Send(printer, docName, job);
                    if (!r.Ok)
                    {
                        string code = done > 0 && r.Code == "FAILED" ? "PARTIAL" : r.Code;
                        Log("Print to \"" + printer + "\" failed after " + done + " job(s): " + r.Error);
                        Http.Write(s, 502, cors, Json.Write(new Dictionary<string, object> {
                            { "ok", false }, { "code", code }, { "error", r.Error }, { "jobs", done } }), null);
                        return;
                    }
                    done++;
                }
            }
            Log("Sent " + done + " job(s) to the Windows queue of \"" + printer + "\" for " + origin + (offlineNote != null ? " - WARNING: " + offlineNote : ""));
            Dictionary<string, object> ok = new Dictionary<string, object> { { "ok", true }, { "jobs", done } };
            if (offlineNote != null) ok["warning"] = offlineNote;
            Http.Write(s, 200, cors, Json.Write(ok), null);
        }

        private static string BearerToken(string header)
        {
            if (header == null || !header.StartsWith("Bearer ", StringComparison.Ordinal)) return null;
            string t = header.Substring(7).Trim();
            return Regex.IsMatch(t, "^[A-Za-z0-9_-]{32,128}$") ? t : null;
        }
    }

    // --- pairing ----------------------------------------------------------------

    internal static class Pairing
    {
        private static readonly object Lock = new object();
        private static string _code;
        private static DateTime _expires;
        private static int _attemptsLeft;

        public static void NewCode()
        {
            lock (Lock)
            {
                byte[] b = new byte[4];
                using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(b);
                _code = (BitConverter.ToUInt32(b, 0) % 1000000).ToString("D6");
                _expires = DateTime.UtcNow.AddMinutes(10);
                _attemptsLeft = 5;
            }
            Program.Log("PAIRING CODE: " + _code.Substring(0, 3) + " " + _code.Substring(3) + "   (valid 10 minutes, one use; type it in EasyDine Settings > Printers)");
        }

        /// "OK" or a reason. A code works once; 5 wrong tries burn it.
        public static string TryUse(string code)
        {
            lock (Lock)
            {
                if (_code == null) return "No pairing code is active. Press P in the helper window for a new code.";
                if (DateTime.UtcNow > _expires) { _code = null; return "The pairing code expired. Press P in the helper window for a new one."; }
                string given = code == null ? "" : Regex.Replace(code, "\\s", "");
                if (FixedEquals(given, _code)) { _code = null; return "OK"; }
                _attemptsLeft--;
                if (_attemptsLeft <= 0)
                {
                    _code = null;
                    Program.Log("Too many wrong pairing codes - code cancelled. Press P for a new one.");
                    return "Too many wrong codes. Press P in the helper window for a new one.";
                }
                return "Wrong pairing code.";
            }
        }

        private static bool FixedEquals(string a, string b)
        {
            if (a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }
    }

    internal sealed class PairingStore
    {
        // origin -> SHA-256(token), hex. Tokens themselves are never stored.
        private readonly Dictionary<string, string> _map = new Dictionary<string, string>();
        private readonly object _lock = new object();

        private static string FilePath
        {
            get
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EasyDinePrintHelper");
                Directory.CreateDirectory(dir);
                return Path.Combine(dir, "pairings.json");
            }
        }

        public static PairingStore Load()
        {
            PairingStore s = new PairingStore();
            try
            {
                if (File.Exists(FilePath))
                {
                    Dictionary<string, object> d = Json.ParseObject(File.ReadAllBytes(FilePath));
                    if (d == null) Program.Log("Saved pairings could not be read; pair again from EasyDine Settings.");
                    if (d != null)
                        foreach (KeyValuePair<string, object> kv in d)
                        {
                            string o = Http.NormalizeOrigin(kv.Key);
                            string h = kv.Value as string;
                            if (o != null && h != null && Regex.IsMatch(h, "^[0-9a-f]{64}$")) s._map[o] = h;
                        }
                }
            }
            catch (Exception e) { Program.Log("Could not read saved pairings (" + e.Message + "); pair again."); }
            return s;
        }

        private void Save()
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            foreach (KeyValuePair<string, string> kv in _map) d[kv.Key] = kv.Value;
            File.WriteAllText(FilePath, Json.Write(d), new UTF8Encoding(false));
        }

        public static string NewToken()
        {
            byte[] b = new byte[32];
            using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(b);
            return Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        private static string Hash(string token)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] h = sha.ComputeHash(Encoding.UTF8.GetBytes(token));
                StringBuilder sb = new StringBuilder();
                foreach (byte x in h) sb.Append(x.ToString("x2"));
                return sb.ToString();
            }
        }

        public void Add(string origin, string token) { lock (_lock) { _map[origin] = Hash(token); Save(); } }
        public void Remove(string origin) { lock (_lock) { _map.Remove(origin); Save(); } }
        public void Clear() { lock (_lock) { _map.Clear(); Save(); } }
        public bool IsPaired(string origin) { lock (_lock) return _map.ContainsKey(origin); }
        public string[] Origins() { lock (_lock) { string[] a = new string[_map.Count]; _map.Keys.CopyTo(a, 0); return a; } }

        public bool Check(string origin, string token)
        {
            string expected;
            lock (_lock) { if (!_map.TryGetValue(origin, out expected)) return false; }
            string got = Hash(token);
            int diff = 0;
            for (int i = 0; i < 64; i++) diff |= expected[i] ^ got[i];
            return diff == 0;
        }
    }

    // --- validation -------------------------------------------------------------

    internal static class Validate
    {
        public static bool PrinterName(string n)
        {
            if (string.IsNullOrEmpty(n) || n.Length > 256 || n.Trim().Length == 0) return false;
            foreach (char c in n) if (char.IsControl(c)) return false;
            return true;
        }

        public static string DocName(string n)
        {
            if (string.IsNullOrEmpty(n)) return "EasyDine";
            StringBuilder sb = new StringBuilder();
            foreach (char c in n) if (!char.IsControl(c)) sb.Append(c);
            string s = sb.ToString().Trim();
            if (s.Length > 100) s = s.Substring(0, 100);
            return s.Length == 0 ? "EasyDine" : s;
        }

        public static bool TryBase64(string s, out byte[] bytes)
        {
            bytes = null;
            if (!Regex.IsMatch(s, "^[A-Za-z0-9+/]*={0,2}$")) return false;
            try { bytes = Convert.FromBase64String(s); return true; } catch { return false; }
        }
    }

    // --- printers ---------------------------------------------------------------

    internal static class Printers
    {
        public sealed class Info { public string Name; public bool IsDefault; }

        public static List<Info> Installed()
        {
            List<Info> list = new List<Info>();
            string def = null;
            try { def = new PrinterSettings().PrinterName; } catch { }
            foreach (string n in PrinterSettings.InstalledPrinters)
                list.Add(new Info { Name = n, IsDefault = n == def });
            return list;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct PRINTER_INFO_2
        {
            public IntPtr pServerName, pPrinterName, pShareName, pPortName, pDriverName, pComment, pLocation, pDevMode,
                pSepFile, pPrintProcessor, pDatatype, pParameters, pSecurityDescriptor;
            public uint Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status, cJobs, AveragePPM;
        }

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
        [DllImport("winspool.drv", EntryPoint = "GetPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool GetPrinter(IntPtr h, int level, IntPtr buf, int size, out int needed);
        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool ClosePrinter(IntPtr h);

        private const uint PRINTER_ATTRIBUTE_WORK_OFFLINE = 0x400;
        private const uint PRINTER_STATUS_PAUSED = 0x1, PRINTER_STATUS_ERROR = 0x2, PRINTER_STATUS_PAPER_OUT = 0x10,
            PRINTER_STATUS_OFFLINE = 0x80, PRINTER_STATUS_NOT_AVAILABLE = 0x1000, PRINTER_STATUS_DOOR_OPEN = 0x400000;

        /// What Windows currently says about the printer, or null when nothing is flagged.
        /// Windows often does not know a USB/network printer is off, so null proves nothing.
        public static string OfflineNote(string name)
        {
            IntPtr h;
            if (!OpenPrinter(name, out h, IntPtr.Zero)) return null;
            try
            {
                int needed;
                GetPrinter(h, 2, IntPtr.Zero, 0, out needed);
                if (needed <= 0) return null;
                IntPtr buf = Marshal.AllocHGlobal(needed);
                try
                {
                    if (!GetPrinter(h, 2, buf, needed, out needed)) return null;
                    PRINTER_INFO_2 info = (PRINTER_INFO_2)Marshal.PtrToStructure(buf, typeof(PRINTER_INFO_2));
                    List<string> notes = new List<string>();
                    if ((info.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE) != 0 || (info.Status & PRINTER_STATUS_OFFLINE) != 0) notes.Add("offline");
                    if ((info.Status & PRINTER_STATUS_PAUSED) != 0) notes.Add("paused");
                    if ((info.Status & PRINTER_STATUS_ERROR) != 0) notes.Add("in error");
                    if ((info.Status & PRINTER_STATUS_PAPER_OUT) != 0) notes.Add("out of paper");
                    if ((info.Status & PRINTER_STATUS_NOT_AVAILABLE) != 0) notes.Add("not available");
                    if ((info.Status & PRINTER_STATUS_DOOR_OPEN) != 0) notes.Add("door open");
                    if (info.cJobs > 3) notes.Add(info.cJobs + " jobs waiting in the queue");
                    return notes.Count == 0 ? null : "Windows reports the printer as " + string.Join(", ", notes.ToArray()) + ".";
                }
                finally { Marshal.FreeHGlobal(buf); }
            }
            catch { return null; }
            finally { ClosePrinter(h); }
        }
    }

    internal static class RawPrinter
    {
        public sealed class Result { public bool Ok; public string Code; public string Error; }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private sealed class DOCINFOW
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName = "";
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile = null;
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

        private static string LastError() { return new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message; }

        public static Result Send(string printer, string docName, byte[] bytes)
        {
            IntPtr h;
            if (!OpenPrinter(printer, out h, IntPtr.Zero))
                return new Result { Ok = false, Code = "PRINTER_NOT_FOUND", Error = "Could not open \"" + printer + "\": " + LastError() };
            try
            {
                DOCINFOW di = new DOCINFOW();
                di.pDocName = docName;
                if (StartDocPrinter(h, 1, di) == 0)
                    return new Result { Ok = false, Code = "RAW_REJECTED", Error = "\"" + printer + "\" did not accept raw printer commands (" + LastError() + "). Use the print dialog for this printer." };
                try
                {
                    if (!StartPagePrinter(h)) return new Result { Ok = false, Code = "FAILED", Error = LastError() };
                    int written;
                    bool ok = WritePrinter(h, bytes, bytes.Length, out written);
                    string err = ok ? "" : LastError();
                    EndPagePrinter(h);
                    if (!ok || written != bytes.Length)
                        return new Result { Ok = false, Code = written > 0 ? "PARTIAL" : "FAILED", Error = ("Only part of the job reached \"" + printer + "\". " + err).Trim() };
                    return new Result { Ok = true, Code = "QUEUED", Error = "" };
                }
                finally { EndDocPrinter(h); }
            }
            finally { ClosePrinter(h); }
        }
    }

    // --- tiny HTTP/1.1 + JSON ---------------------------------------------------

    internal static class Http
    {
        public sealed class Request
        {
            public string Method;
            public string Path;
            public Dictionary<string, string> Headers = new Dictionary<string, string>();
            public byte[] Body = new byte[0];
            public string Header(string name) { string v; return Headers.TryGetValue(name, out v) ? v : null; }
        }

        private const int MaxHeaderBytes = 16 * 1024;
        private const int MaxBodyBytes = 4 * 1024 * 1024;

        public static string NormalizeOrigin(string o)
        {
            if (string.IsNullOrEmpty(o) || o == "null") return null;
            Uri u;
            if (!Uri.TryCreate(o.Trim(), UriKind.Absolute, out u)) return null;
            if (u.Scheme != "https" && u.Scheme != "http") return null;
            if (u.AbsolutePath != "/" || u.Query.Length > 0 || u.UserInfo.Length > 0) return null;
            return u.GetLeftPart(UriPartial.Authority).ToLowerInvariant();
        }

        /// false + null error = connection closed / unusable; false + error = send 400.
        public static bool TryRead(Stream s, out Request req, out string error)
        {
            req = null; error = null;
            MemoryStream head = new MemoryStream();
            int matched = 0;
            byte[] one = new byte[1];
            while (matched < 4)
            {
                int n;
                try { n = s.Read(one, 0, 1); } catch { return false; }
                if (n <= 0) return false;
                head.WriteByte(one[0]);
                if (head.Length > MaxHeaderBytes) { error = "Headers too large."; return false; }
                byte c = one[0];
                if ((matched == 0 || matched == 2) && c == '\r') matched++;
                else if ((matched == 1 || matched == 3) && c == '\n') matched++;
                else matched = c == '\r' ? 1 : 0;
            }
            string[] lines = Encoding.ASCII.GetString(head.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            if (first.Length != 3) { error = "Bad request line."; return false; }
            req = new Request();
            req.Method = first[0].ToUpperInvariant();
            string target = first[1];
            int q = target.IndexOf('?');
            req.Path = q >= 0 ? target.Substring(0, q) : target;
            for (int i = 1; i < lines.Length; i++)
            {
                int colon = lines[i].IndexOf(':');
                if (colon <= 0) continue;
                req.Headers[lines[i].Substring(0, colon).Trim().ToLowerInvariant()] = lines[i].Substring(colon + 1).Trim();
            }
            if (req.Header("transfer-encoding") != null) { error = "Chunked bodies are not supported."; return false; }
            int len = 0;
            string cl = req.Header("content-length");
            if (cl != null && (!int.TryParse(cl, out len) || len < 0)) { error = "Bad Content-Length."; return false; }
            if (len > MaxBodyBytes) { error = "Request too large."; return false; }
            req.Body = new byte[len];
            int read = 0;
            while (read < len)
            {
                int n;
                try { n = s.Read(req.Body, read, len - read); } catch { return false; }
                if (n <= 0) return false;
                read += n;
            }
            return true;
        }

        public static void Write(Stream s, int status, string corsOrigin, string json, Dictionary<string, string> extra)
        {
            byte[] body = json == null ? new byte[0] : Encoding.UTF8.GetBytes(json);
            StringBuilder h = new StringBuilder();
            h.Append("HTTP/1.1 ").Append(status).Append(' ').Append(Reason(status)).Append("\r\n");
            h.Append("Connection: close\r\n");
            h.Append("Cache-Control: no-store\r\n");
            h.Append("X-Content-Type-Options: nosniff\r\n");
            h.Append("Vary: Origin\r\n");
            if (corsOrigin != null) h.Append("Access-Control-Allow-Origin: ").Append(corsOrigin).Append("\r\n");
            if (json != null) h.Append("Content-Type: application/json; charset=utf-8\r\n");
            h.Append("Content-Length: ").Append(body.Length).Append("\r\n");
            if (extra != null) foreach (KeyValuePair<string, string> kv in extra) h.Append(kv.Key).Append(": ").Append(kv.Value).Append("\r\n");
            h.Append("\r\n");
            byte[] hb = Encoding.ASCII.GetBytes(h.ToString());
            s.Write(hb, 0, hb.Length);
            if (body.Length > 0) s.Write(body, 0, body.Length);
            s.Flush();
        }

        private static string Reason(int code)
        {
            switch (code)
            {
                case 200: return "OK";
                case 204: return "No Content";
                case 400: return "Bad Request";
                case 401: return "Unauthorized";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 502: return "Bad Gateway";
                default: return "Error";
            }
        }
    }

    internal static class Json
    {
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 };

        public static Dictionary<string, object> ParseObject(byte[] utf8)
        {
            if (utf8 == null || utf8.Length == 0) return null;
            // TrimStart: a UTF-8 BOM (e.g. a file saved by Notepad) must not lose the saved pairings.
            try { return Serializer.DeserializeObject(Encoding.UTF8.GetString(utf8).TrimStart('﻿')) as Dictionary<string, object>; }
            catch { return null; }
        }

        public static string Write(object o) { return Serializer.Serialize(o); }

        public static string Error(string code, string message)
        {
            return Write(new Dictionary<string, object> { { "ok", false }, { "code", code }, { "error", message } });
        }
    }
}
