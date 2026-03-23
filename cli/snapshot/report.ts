import * as fs from 'fs';

interface ReportEntry {
  id: string;
  diffPercentage: number;
  passed: boolean;
  baselinePath: string;
  currentPath: string;
  diffPath?: string;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateReport(entries: ReportEntry[], outputPath: string): void {
  const rows = entries
    .map((e) => {
      const status = e.passed ? 'PASS' : 'FAIL';
      const statusColor = e.passed ? '#4CAF50' : '#F44336';
      const safeId = escapeHtml(e.id);
      const diffImg = e.diffPath
        ? `<img src="${e.id.split('/').map(encodeURIComponent).join('/')}/diff.png" width="200" />`
        : '';
      return `
        <tr>
          <td style="color: ${statusColor}; font-weight: bold;">${status}</td>
          <td>${safeId}</td>
          <td>${e.diffPercentage.toFixed(3)}%</td>
          <td><img src="${e.id.split('/').map(encodeURIComponent).join('/')}/baseline.png" width="200" /></td>
          <td><img src="${e.id.split('/').map(encodeURIComponent).join('/')}/current.png" width="200" /></td>
          <td>${diffImg}</td>
        </tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Preflight Snapshot Report</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 24px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: center; }
    th { background: #f5f5f5; }
    img { border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Preflight Snapshot Report</h1>
  <p>${new Date().toISOString()}</p>
  <table>
    <tr><th>Status</th><th>Scenario</th><th>Diff</th><th>Baseline</th><th>Current</th><th>Diff Image</th></tr>
    ${rows}
  </table>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
}
