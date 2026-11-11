export function buildTestBillHtml(): string {
  const date = new Date().toLocaleString();
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>EasyDine test bill</title>
<style>
  * { box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html, body { width: 80mm; margin: 0; }
  body { padding: 4mm; color: #111; font: 12px/1.4 Arial, sans-serif; }
  .receipt { width: 100%; }
  h1, .center { text-align: center; }
  h1 { margin: 0; font-size: 16px; }
  .muted, .note { font-size: 10px; }
  .rule { border: 0; border-top: 1px dashed #777; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; }
  .num { text-align: right; white-space: nowrap; }
  .total { font-weight: 700; font-size: 14px; }
  .test { border: 1px solid #111; font-weight: 700; padding: 3px; }
</style>
</head>
<body>
  <main class="receipt">
    <h1>EASYDINE</h1>
    <p class="center test">TEST BILL — NOT A SALE</p>
    <p class="center muted">${date}</p>
    <hr class="rule">
    <table>
      <tbody>
        <tr><td>Sample item</td><td class="num">1 × ₹100.00</td></tr>
        <tr><td>Sample add-on</td><td class="num">1 × ₹20.00</td></tr>
      </tbody>
    </table>
    <hr class="rule">
    <table>
      <tbody>
        <tr><td>Subtotal</td><td class="num">₹120.00</td></tr>
        <tr><td>Tax (included)</td><td class="num">₹6.00</td></tr>
        <tr class="total"><td>TEST TOTAL</td><td class="num">₹120.00</td></tr>
      </tbody>
    </table>
    <hr class="rule">
    <p class="center note">Synthetic print check. No order or payment was created.</p>
  </main>
</body>
</html>`;
}
