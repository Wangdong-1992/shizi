#!/usr/bin/env python
"""Convert markdown to PDF using markdown + xhtml2pdf (no GTK dependency)."""
import sys
import markdown
from xhtml2pdf import pisa

def convert(md_path, pdf_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # Markdown -> HTML
    html_body = markdown.markdown(
        md_content,
        extensions=['tables', 'fenced_code', 'toc', 'codehilite']
    )

    # Wrap in HTML with Chinese-friendly CSS
    html_full = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{
    size: A4;
    margin: 25mm 20mm 20mm 20mm;
  }}
  body {{
    font-family: "Droid Sans Fallback", "Noto Sans CJK SC", "Microsoft YaHei", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.75;
    color: #2c3e50;
    text-align: justify;
  }}
  h1 {{
    color: #1a5276;
    font-size: 22pt;
    text-align: center;
    margin: 30pt 0 20pt 0;
    page-break-before: always;
  }}
  h1:first-of-type {{
    page-break-before: avoid;
    margin-top: 0;
  }}
  h2 {{
    color: #1e8449;
    font-size: 16pt;
    border-bottom: 2px solid #1e8449;
    padding-bottom: 4pt;
    margin: 20pt 0 12pt 0;
    page-break-after: avoid;
  }}
  h3 {{
    color: #2e86c1;
    font-size: 13pt;
    margin: 14pt 0 8pt 0;
    page-break-after: avoid;
  }}
  h4 {{
    color: #5b2c6f;
    font-size: 11.5pt;
    margin: 10pt 0 6pt 0;
    page-break-after: avoid;
  }}
  p {{
    margin: 6pt 0;
    text-indent: 0;
  }}
  blockquote {{
    border-left: 3pt solid #1a5276;
    background: #f4f6f7;
    padding: 6pt 10pt;
    margin: 8pt 0;
    color: #34495e;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0;
    font-size: 9.5pt;
  }}
  th {{
    background: #1a5276;
    color: white;
    padding: 5pt 8pt;
    text-align: left;
    border: 1px solid #1a5276;
  }}
  td {{
    padding: 4pt 8pt;
    border: 1px solid #bdc3c7;
  }}
  tr:nth-child(even) {{
    background: #f4f6f7;
  }}
  code {{
    background: #f4f6f7;
    color: #c0392b;
    padding: 1pt 4pt;
    border-radius: 2pt;
    font-family: "Consolas", "Courier New", monospace;
    font-size: 9.5pt;
  }}
  pre {{
    background: #f4f6f7;
    border-left: 3pt solid #1a5276;
    padding: 8pt 10pt;
    overflow-x: auto;
    font-size: 9pt;
    line-height: 1.4;
  }}
  pre code {{
    background: transparent;
    color: #2c3e50;
    padding: 0;
  }}
  ul, ol {{
    margin: 6pt 0;
    padding-left: 24pt;
  }}
  li {{
    margin: 3pt 0;
  }}
  hr {{
    border: none;
    border-top: 1px solid #bdc3c7;
    margin: 16pt 0;
  }}
  strong {{
    color: #1a5276;
  }}
  a {{
    color: #2874a6;
    text-decoration: none;
  }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

    with open(pdf_path, 'wb') as f:
        pisa_status = pisa.CreatePDF(html_full, dest=f, encoding='utf-8')

    if pisa_status.err:
        print(f"[ERROR] PDF conversion failed: {pisa_status.err}")
        return False

    print(f"[OK] PDF generated: {pdf_path}")
    return True


if __name__ == '__main__':
    md_path = sys.argv[1]
    pdf_path = sys.argv[2]
    convert(md_path, pdf_path)
