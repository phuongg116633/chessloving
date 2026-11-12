"""Ghép các file trong src/ thành một file index.html chạy độc lập."""
import pathlib

root = pathlib.Path(__file__).parent
src = root / 'src'
shell = (src / 'shell.html').read_text(encoding='utf-8')
for name, marker in (('engine.js', '/*ENGINE*/'), ('levels.js', '/*LEVELS*/'), ('app.js', '/*APP*/')):
    shell = shell.replace(marker, (src / name).read_text(encoding='utf-8'))

head, body = shell.split('<header', 1)
page = (
    '<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<style>body{margin:0}</style>\n' + head + '</head>\n<body>\n<header' + body + '\n</body>\n</html>\n'
)
(root / 'index.html').write_text(page, encoding='utf-8')
print('index.html:', len(page), 'bytes')
